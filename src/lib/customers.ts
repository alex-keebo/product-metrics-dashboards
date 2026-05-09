import fs from 'fs'
import path from 'path'
import { Customer, ContractType, CustomerPeriod } from './types'

let _cache: Customer[] | null = null

export function loadCustomers(): Customer[] {
  if (_cache) return _cache
  const filePath = path.join(process.cwd(), 'data', 'customers.json')
  const raw = fs.readFileSync(filePath, 'utf-8')
  _cache = JSON.parse(raw) as Customer[]
  return _cache
}

export function getCustomersForContractTypes(
  contractTypes: ContractType[],
  dateStart: string,
  dateEnd: string
): CustomerPeriod[] {
  const customers = loadCustomers()
  const results: CustomerPeriod[] = []

  for (const c of customers) {
    if (!contractTypes.includes(c.contract_type)) continue

    // Check overlap between customer contract period and selected date range
    const periodStart = c.valid_from
    const periodEnd = c.valid_to ?? '9999-12-31'

    if (periodStart > dateEnd || periodEnd < dateStart) continue

    // Clamp to the selected date range
    const clampedStart = periodStart < dateStart ? dateStart : periodStart
    const clampedEnd = periodEnd > dateEnd ? dateEnd : periodEnd

    results.push({
      org_id: c.org_id,
      name: c.name,
      contract_type: c.contract_type,
      period_start: clampedStart,
      period_end: clampedEnd,
    })
  }

  return results
}

export function getOrgIdsForContractTypes(
  contractTypes: ContractType[],
  dateStart: string,
  dateEnd: string
): string[] {
  const periods = getCustomersForContractTypes(contractTypes, dateStart, dateEnd)
  return [...new Set(periods.map((p) => p.org_id))]
}

export function getCustomerNameMap(): Map<string, string> {
  const customers = loadCustomers()
  const map = new Map<string, string>()
  for (const c of customers) {
    if (!map.has(c.org_id)) map.set(c.org_id, c.name)
  }
  return map
}

export function getContractPeriodsForOrg(
  orgId: string,
  dateStart: string,
  dateEnd: string
): CustomerPeriod[] {
  const customers = loadCustomers()
  const results: CustomerPeriod[] = []
  for (const c of customers) {
    if (c.org_id !== orgId) continue
    const periodEnd = c.valid_to ?? '9999-12-31'
    if (c.valid_from > dateEnd || periodEnd < dateStart) continue
    results.push({
      org_id: c.org_id,
      name: c.name,
      contract_type: c.contract_type,
      period_start: c.valid_from < dateStart ? dateStart : c.valid_from,
      period_end: periodEnd > dateEnd ? dateEnd : periodEnd,
    })
  }
  return results
}

export function getContractTypeForOrgInPeriod(
  orgId: string,
  date: string
): ContractType | null {
  const customers = loadCustomers()
  for (const c of customers) {
    if (c.org_id !== orgId) continue
    const end = c.valid_to ?? '9999-12-31'
    if (c.valid_from <= date && end >= date) return c.contract_type
  }
  return null
}

// Returns the most recent contract type overlapping [dateStart, dateEnd].
// Used when a single date lookup would miss contracts starting mid-period.
export function getContractTypeForOrgInRange(
  orgId: string,
  dateStart: string,
  dateEnd: string
): ContractType | null {
  const customers = loadCustomers()
  let best: { valid_from: string; contract_type: ContractType } | null = null
  for (const c of customers) {
    if (c.org_id !== orgId) continue
    const end = c.valid_to ?? '9999-12-31'
    if (c.valid_from > dateEnd || end < dateStart) continue
    if (!best || c.valid_from > best.valid_from) {
      best = { valid_from: c.valid_from, contract_type: c.contract_type }
    }
  }
  return best?.contract_type ?? null
}
