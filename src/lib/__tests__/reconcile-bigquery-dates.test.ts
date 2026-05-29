import { describe, it, expect } from 'vitest'
import { reconcileBigQueryDates } from '../reconcile-bigquery-dates'
import type { Customer } from '../types'

const TODAY = '2026-05-29'

function sub(
  valid_from: string,
  valid_to: string | null,
  contract_type: Customer['contract_type'] = 'consumption'
): Customer {
  return {
    org_id: 'org1',
    name: 'Test Org',
    module: 'kwo-snowflake',
    valid_from,
    valid_to,
    contract_type,
    source: 'subscript',
  }
}

function bq(first_date: string, last_date: string) {
  return { first_date, last_date }
}

describe('reconcileBigQueryDates — no Subscript records', () => {
  it('returns a single trial record', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-01-01', '2026-05-28'),
      subscriptRecords: [],
      today: TODAY,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      contract_type: 'trial',
      source: 'bigquery:trial',
      valid_from: '2023-01-01',
      valid_to: null,  // last_date is recent
    })
  })

  it('sets valid_to when last_date is stale (>7 days old)', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-01-01', '2024-01-01'),
      subscriptRecords: [],
      today: TODAY,
    })
    expect(result[0].valid_to).toBe('2024-01-01')
  })
})

describe('reconcileBigQueryDates — pre-subscript', () => {
  it('BQ starts before Subscript, ends before Subscript end → trial truncated at sub start - 1', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-01-01', '2023-06-01'),
      subscriptRecords: [sub('2023-08-21', '2026-08-20')],
      today: TODAY,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      contract_type: 'trial',
      source: 'bigquery:pre-subscript',
      valid_from: '2023-01-01',
      valid_to: '2023-08-20',  // sub.valid_from - 1
    })
  })
})

describe('reconcileBigQueryDates — entirely inside', () => {
  it('BQ range fully inside Subscript → no records emitted', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-10-25', '2024-01-01'),
      subscriptRecords: [sub('2023-08-21', '2026-08-20')],
      today: TODAY,
    })
    expect(result).toHaveLength(0)
  })
})

describe('reconcileBigQueryDates — straddles', () => {
  it('BQ starts before and ends after all Subscript ranges → trial + post-sub', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-01-01', '2024-01-01'),
      subscriptRecords: [sub('2023-03-01', '2023-09-30', 'subscription')],
      today: TODAY,
    })
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      contract_type: 'trial',
      source: 'bigquery:pre-subscript',
      valid_from: '2023-01-01',
      valid_to: '2023-02-28',
    })
    expect(result[1]).toMatchObject({
      contract_type: 'subscription',  // inherited from last sub
      source: 'bigquery:post-subscript',
      valid_from: '2023-10-01',
      valid_to: '2024-01-01',
    })
  })
})

describe('reconcileBigQueryDates — starts inside, ends after', () => {
  it('BQ valid_from inside Subscript range, valid_to beyond → single post-sub record', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-10-01', '2024-06-01'),
      subscriptRecords: [sub('2023-08-21', '2023-12-31', 'consumption')],
      today: TODAY,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      contract_type: 'consumption',
      source: 'bigquery:post-subscript',
      valid_from: '2024-01-01',
      valid_to: '2024-06-01',
    })
  })
})

describe('reconcileBigQueryDates — entirely after', () => {
  it('BQ starts after all Subscript ranges → single post-sub record from sub_end + 1', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2024-03-01', '2026-05-28'),
      subscriptRecords: [sub('2023-01-01', '2024-01-31', 'subscription')],
      today: TODAY,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      contract_type: 'subscription',
      source: 'bigquery:post-subscript',
      valid_from: '2024-02-01',  // sub.valid_to + 1
      valid_to: null,            // last_date is recent
    })
  })
})

describe('reconcileBigQueryDates — gap-fill', () => {
  it('BQ spans gap between two Subscript records → trial + gap-fill records', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2022-12-01', '2024-11-30'),
      subscriptRecords: [
        sub('2023-01-01', '2023-06-30', 'subscription'),
        sub('2023-09-01', '2024-12-31', 'subscription'),
      ],
      today: TODAY,
    })
    // pre-subscript trial + gap-fill; no post-sub (BQ ends inside last sub)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      contract_type: 'trial',
      source: 'bigquery:pre-subscript',
      valid_from: '2022-12-01',
      valid_to: '2022-12-31',
    })
    expect(result[1]).toMatchObject({
      contract_type: 'subscription',
      source: 'bigquery:gap-fill',
      valid_from: '2023-07-01',
      valid_to: '2023-08-31',
    })
  })

  it('BQ does not span gap (ends before gap end) → no gap-fill', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2022-12-01', '2023-07-15'),
      subscriptRecords: [
        sub('2023-01-01', '2023-06-30', 'subscription'),
        sub('2023-09-01', '2024-12-31', 'subscription'),
      ],
      today: TODAY,
    })
    // BQ ends 2023-07-15, gap ends 2023-08-31 — BQ doesn't span the full gap
    const gapFill = result.find((r) => r.source === 'bigquery:gap-fill')
    expect(gapFill).toBeUndefined()
  })

  it('open-ended Subscript record (valid_to null) produces no gap after it', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2022-12-01', '2026-05-28'),
      subscriptRecords: [
        sub('2023-01-01', null, 'subscription'),  // open-ended
      ],
      today: TODAY,
    })
    // BQ before sub → pre-subscript trial; no post-sub (open-ended sub covers everything)
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('bigquery:pre-subscript')
  })
})

describe('reconcileBigQueryDates — active threshold', () => {
  it('last_date exactly 7 days before today → valid_to null (still active)', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-01-01', '2026-05-22'),  // 7 days before TODAY
      subscriptRecords: [],
      today: TODAY,
    })
    expect(result[0].valid_to).toBeNull()
  })

  it('last_date 8 days before today → valid_to set to last_date', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-01-01', '2026-05-21'),  // 8 days before TODAY
      subscriptRecords: [],
      today: TODAY,
    })
    expect(result[0].valid_to).toBe('2026-05-21')
  })
})
