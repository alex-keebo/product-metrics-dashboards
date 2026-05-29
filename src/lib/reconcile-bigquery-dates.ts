import type { Customer, ContractType, Module } from './types'
import { addDays } from './date-utils'

export interface BigQueryRange {
  first_date: string  // YYYY-MM-DD
  last_date: string   // YYYY-MM-DD
}

export interface ReconcileParams {
  org_id: string
  module: Module
  name: string
  bqRange: BigQueryRange
  subscriptRecords: Customer[]
  today: string  // YYYY-MM-DD — injected so tests are deterministic
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

export function reconcileBigQueryDates(params: ReconcileParams): Customer[] {
  const { org_id, module, name, bqRange, subscriptRecords, today } = params

  // Determine effective BQ end: null if data is recent (within 7 days of today)
  const bq_end: string | null =
    daysBetween(bqRange.last_date, today) <= 7 ? null : bqRange.last_date
  const bq_end_eff = bq_end ?? '9999-12-31'
  const bq_start = bqRange.first_date

  const make = (
    valid_from: string,
    valid_to: string | null,
    contract_type: ContractType,
    source: string
  ): Customer => ({ org_id, name, module, valid_from, valid_to, contract_type, source })

  // No Subscript records — plain trial
  if (subscriptRecords.length === 0) {
    return [make(bq_start, bq_end, 'trial', 'bigquery:trial')]
  }

  const sorted = [...subscriptRecords].sort((a, b) => a.valid_from.localeCompare(b.valid_from))
  const first_sub = sorted[0]
  const last_sub = sorted[sorted.length - 1]
  const last_sub_valid_to_eff = last_sub.valid_to ?? '9999-12-31'

  const result: Customer[] = []

  // Pre-subscript portion
  if (bq_start < first_sub.valid_from) {
    const pre_end = addDays(first_sub.valid_from, -1)
    result.push(make(bq_start, pre_end, 'trial', 'bigquery:pre-subscript'))
  }

  // Gap-fill: check each consecutive pair of Subscript records
  for (let i = 0; i < sorted.length - 1; i++) {
    const prev = sorted[i]
    const next = sorted[i + 1]
    if (!prev.valid_to) continue  // open-ended sub — no gap possible
    const gap_start = addDays(prev.valid_to, 1)
    const gap_end = addDays(next.valid_from, -1)
    if (gap_start > gap_end) continue  // adjacent records, no gap
    if (bq_start <= gap_start && bq_end_eff >= gap_end) {
      result.push(make(gap_start, gap_end, prev.contract_type, 'bigquery:gap-fill'))
    }
  }

  // Post-subscript portion
  if (bq_end_eff > last_sub_valid_to_eff) {
    if (!last_sub.valid_to) return result       // open-ended sub — can't be post-subscript
    if (last_sub.valid_to >= today) return result  // sub hasn't expired yet — BQ activity is within it
    const post_start = addDays(last_sub.valid_to, 1)
    result.push(make(post_start, bq_end, last_sub.contract_type, 'bigquery:post-subscript'))
  }

  return result
}
