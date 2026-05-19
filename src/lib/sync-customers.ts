import fs from 'fs'
import path from 'path'
import { BigQuery } from '@google-cloud/bigquery'
import { Customer, ContractType, Module } from './types'
import {
  getAllCustomers,
  getAllUsageSubscriptions,
  getPricingPlans,
  getPricingPlan,
  SubscriptCustomer,
  SubscriptUsageSubscription,
  SubscriptPricingPlan,
} from './subscript'
import { PROJECT, DATASET, SNF_DATASET, LOCATION } from './bigquery'

export interface SyncLog {
  steps: string[]
  added: number
  updated: number
  error?: string
}

const CUSTOMERS_PATH = path.join(process.cwd(), 'data', 'customers.json')

// Pricing plan event_name → contract_type
// FLAT_* = flat-rate subscription; DBX_SQL = Databricks subscription fee
// ENTERPRISE/STANDARD/BUSINESS_CRITICAL = consumption (usage-based)
function contractTypeFromPlan(eventName: string): ContractType | null {
  if (!eventName) return null
  if (eventName.startsWith('FLAT_') || eventName === 'DBX_SQL') return 'subscription'
  if (/^(ENTERPRISE|STANDARD|BUSINESS_CRITICAL)(_|$)/i.test(eventName)) return 'consumption'
  return null
}

function moduleFromPlan(eventName: string): Module {
  return eventName === 'DBX_SQL' ? 'kwo-databricks' : 'kwo-snowflake'
}

// Subscript stores org_ids as "<org_id>-000" — strip the suffix
function normalizeOrgId(raw: string): string {
  return raw.replace(/-\d{3}$/, '')
}

function toDateString(d: string | null | undefined): string | null {
  if (!d || d.trim() === '') return null
  // Subscript dates are already YYYY-MM-DD
  return d.slice(0, 10)
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function loadCustomers(): Customer[] {
  const raw = fs.readFileSync(CUSTOMERS_PATH, 'utf-8')
  return JSON.parse(raw) as Customer[]
}

function saveCustomers(customers: Customer[]): void {
  fs.writeFileSync(CUSTOMERS_PATH, JSON.stringify(customers, null, 2) + '\n', 'utf-8')
}

interface OrgDateRange {
  org_id: string
  first_date: string
  last_date: string
}

async function getDbxSavingsDates(): Promise<OrgDateRange[]> {
  const bq = new BigQuery({ projectId: PROJECT })
  const query = `
    SELECT
      org_id,
      FORMAT_DATE('%Y-%m-%d', MIN(date)) AS first_date,
      FORMAT_DATE('%Y-%m-%d', MAX(date)) AS last_date
    FROM \`${PROJECT}.${DATASET}.savings_history_tf\`
    GROUP BY org_id
  `
  const [rows] = await bq.query({ query, location: LOCATION })
  return rows as OrgDateRange[]
}

async function getSnfSavingsDates(): Promise<OrgDateRange[]> {
  const bq = new BigQuery({ projectId: PROJECT })
  const query = `
    SELECT
      org_id,
      FORMAT_DATE('%Y-%m-%d', MIN(DATE(ts_hour))) AS first_date,
      FORMAT_DATE('%Y-%m-%d', MAX(DATE(ts_hour))) AS last_date
    FROM \`${PROJECT}.${SNF_DATASET}.sql_estimated_costs\`
    GROUP BY org_id
  `
  const [rows] = await bq.query({ query, location: LOCATION })
  return rows as OrgDateRange[]
}

export async function syncCustomers(): Promise<SyncLog> {
  const log: SyncLog = { steps: [], added: 0, updated: 0 }

  // ── Step 1: load current state ──────────────────────────────────────────────
  const customers = loadCustomers()
  log.steps.push(`Loaded ${customers.length} existing rows from customers.json`)

  // ── Step 2: fetch Subscript data ────────────────────────────────────────────
  log.steps.push('Fetching pricing plans from Subscript…')
  console.log('[sync] fetching pricing plans…')
  const plans = await getPricingPlans()
  const planMap = new Map<string, SubscriptPricingPlan>(plans.map((p) => [p.id, p]))
  log.steps.push(`Fetched ${plans.length} pricing plans`)
  console.log(`[sync] fetched ${plans.length} pricing plans`)

  log.steps.push('Fetching customers from Subscript…')
  console.log('[sync] fetching customers…')
  const subscriptCustomers = await getAllCustomers()
  const orgCustomers = subscriptCustomers.filter((c) => c.metadata?.org_id)
  log.steps.push(`Fetched ${subscriptCustomers.length} Subscript customers (${orgCustomers.length} with org_id)`)
  console.log(`[sync] fetched ${subscriptCustomers.length} customers (${orgCustomers.length} with org_id)`)

  // ── Step 3: fetch all subscriptions, group by customer_id ───────────────────
  log.steps.push('Fetching all usage subscriptions from Subscript…')
  console.log('[sync] fetching usage subscriptions…')
  const allSubs = await getAllUsageSubscriptions()
  log.steps.push(`Fetched ${allSubs.length} usage subscriptions`)
  console.log(`[sync] fetched ${allSubs.length} usage subscriptions`)

  // Back-fill any plan IDs referenced by subscriptions but missing from the active plans list
  // (archived plans won't appear in the /pricing-plans list endpoint)
  const missingPlanIds = [...new Set(allSubs.map((s) => s.pricing_plan_id))].filter(
    (id) => !planMap.has(id)
  )
  if (missingPlanIds.length > 0) {
    log.steps.push(`Fetching ${missingPlanIds.length} archived/missing plans individually…`)
    const results = await Promise.allSettled(missingPlanIds.map((id) => getPricingPlan(id)))
    let fetched = 0
    for (const result of results) {
      if (result.status === 'fulfilled') {
        planMap.set(result.value.id, result.value)
        fetched++
      }
    }
    log.steps.push(`Fetched ${fetched} of ${missingPlanIds.length} missing plans`)
  }

  // Map Subscript customer id → org_id
  const customerIdToOrgId = new Map<string, string>(
    orgCustomers.map((c) => [c.id, normalizeOrgId(c.metadata.org_id!)])
  )
  const customerIdToName = new Map<string, string>(
    orgCustomers.map((c) => [c.id, c.name])
  )

  // Group subscriptions by customer_id (client-side filter — API returns all)
  const subsByCustomerId = new Map<string, SubscriptUsageSubscription[]>()
  for (const sub of allSubs) {
    const list = subsByCustomerId.get(sub.customer_id) ?? []
    list.push(sub)
    subsByCustomerId.set(sub.customer_id, list)
  }

  // Drop all existing subscription/consumption/churn rows for orgs known to
  // Subscript — we'll re-add them cleanly from the authoritative source
  const subscriptOrgIdSet = new Set(customerIdToOrgId.values())
  const before = customers.length
  const kept = customers.filter(
    (c) =>
      !subscriptOrgIdSet.has(c.org_id) ||
      (c.contract_type !== 'subscription' && c.contract_type !== 'consumption' && c.contract_type !== 'churn')
  )
  customers.length = 0
  customers.push(...kept)
  const dropped = before - customers.length
  if (dropped > 0) log.steps.push(`Removed ${dropped} stale subscription/consumption/churn rows`)

  // Re-add from Subscript
  let subsAdded = 0
  for (const [customerId, subs] of subsByCustomerId) {
    const orgId = customerIdToOrgId.get(customerId)
    if (!orgId) continue
    const name = customerIdToName.get(customerId) ?? orgId

    for (const sub of subs) {
      const plan = planMap.get(sub.pricing_plan_id)
      if (!plan) continue

      const contractType = contractTypeFromPlan(plan.event_name)
      if (!contractType) continue

      const module = moduleFromPlan(plan.event_name)
      const validFrom = toDateString(sub.start_date)
      const validTo = toDateString(sub.end_date)
      if (!validFrom) continue

      // Use existing name if already present in customers.json, otherwise use Subscript name
      const existingName = customers.find((c) => c.org_id === orgId)?.name ?? name

      customers.push({ org_id: orgId, name: existingName, module, valid_from: validFrom, valid_to: validTo, contract_type: contractType })
      subsAdded++
    }
  }

  log.steps.push(`Added ${subsAdded} subscription/consumption rows from Subscript`)

  // ── Step 4: BigQuery — Databricks trial dates ────────────────────────────────
  log.steps.push('Querying BigQuery for Databricks savings dates…')
  console.log('[sync] querying BigQuery for Databricks savings dates…')
  const dbxDates = await getDbxSavingsDates()
  const dbxOrgIds = new Set(dbxDates.map((r) => r.org_id))
  log.steps.push(`Found ${dbxDates.length} Databricks orgs in BigQuery`)

  applyTrialDates(customers, dbxDates, 'kwo-databricks', log)

  console.log(`[sync] Databricks: ${dbxDates.length} orgs`)

  // ── Step 5: BigQuery — Snowflake trial dates ─────────────────────────────────
  log.steps.push('Querying BigQuery for Snowflake savings dates…')
  console.log('[sync] querying BigQuery for Snowflake savings dates…')
  const snfDates = await getSnfSavingsDates()
  const snfOrgIds = new Set(snfDates.map((r) => r.org_id))
  log.steps.push(`Found ${snfDates.length} Snowflake orgs in BigQuery`)

  console.log(`[sync] Snowflake: ${snfDates.length} orgs`)
  applyTrialDates(customers, snfDates, 'kwo-snowflake', log)

  // ── Step 6: close trial → subscription transitions ───────────────────────────
  for (const c of customers) {
    if (c.contract_type !== 'trial') continue
    // Reset corrupted valid_to so we can re-evaluate below
    if (c.valid_to !== null && c.valid_to < c.valid_from) c.valid_to = null
    if (c.valid_to !== null) continue

    // Find the earliest subscription/consumption row for this org+module
    const firstSub = customers
      .filter(
        (r) =>
          r.org_id === c.org_id &&
          r.module === c.module &&
          (r.contract_type === 'subscription' || r.contract_type === 'consumption')
      )
      .sort((a, b) => a.valid_from.localeCompare(b.valid_from))[0]

    if (firstSub) {
      const candidateTo = addDays(firstSub.valid_from, -1)
      if (candidateTo >= c.valid_from) {
        c.valid_to = candidateTo
        log.updated++
      }
    }
  }

  // ── Step 7: lost trial detection ─────────────────────────────────────────────
  const syncDate = today()
  for (const c of customers) {
    if (c.contract_type !== 'trial' || c.valid_to !== null) continue

    const inBigQuery =
      c.module === 'kwo-databricks' ? dbxOrgIds.has(c.org_id) : snfOrgIds.has(c.org_id)
    const inSubscript = subscriptOrgIdSet.has(c.org_id)

    if (!inBigQuery && !inSubscript) {
      const candidateTo = addDays(syncDate, -1)
      if (candidateTo >= c.valid_from) {
        c.valid_to = candidateTo
        c.contract_type = 'lost_trial'
        log.updated++
      }
    }
  }

  // ── Step 8: churn detection ───────────────────────────────────────────────────
  for (const c of customers) {
    if (c.contract_type !== 'subscription' && c.contract_type !== 'consumption') continue
    if (!c.valid_to || c.valid_to >= syncDate) continue

    // Is there a newer subscription/consumption row for the same org+module?
    const hasNewer = customers.some(
      (r) =>
        r.org_id === c.org_id &&
        r.module === c.module &&
        r.valid_from > c.valid_from &&
        (r.contract_type === 'subscription' || r.contract_type === 'consumption')
    )

    if (!hasNewer) {
      c.contract_type = 'churn'
      log.updated++
    }
  }

  // ── Step 9: persist ───────────────────────────────────────────────────────────
  saveCustomers(customers)
  log.steps.push(
    `Sync complete — ${log.added} rows added, ${log.updated} rows updated, ${customers.length} total rows`
  )

  return log
}

function applyTrialDates(
  customers: Customer[],
  dates: OrgDateRange[],
  module: Module,
  log: SyncLog
): void {
  for (const { org_id, first_date } of dates) {
    const trialIdx = customers.findIndex(
      (c) =>
        c.org_id === org_id &&
        c.module === module &&
        (c.contract_type === 'trial' || c.contract_type === 'lost_trial')
    )

    if (trialIdx >= 0) continue // already tracked — trial valid_from is never overwritten

    // New trial
    customers.push({
      org_id,
      name: org_id, // placeholder — user can edit via UI
      module,
      valid_from: first_date,
      valid_to: null,
      contract_type: 'trial',
    })
    log.added++
  }
}
