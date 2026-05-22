import { describe, it, expect } from 'vitest'
import { computeRangeTotalsFromPoints } from '../kpi'
import type { TimeSeriesPoint } from '../types'

function makePoint(overrides: Partial<TimeSeriesPoint> = {}): TimeSeriesPoint {
  return {
    period_label: '2024-01-01',
    period_label_display: 'Jan 1',
    period_start: '2024-01-01',
    period_end: '2024-01-07',
    org_id: 'org1',
    name: 'Org 1',
    contract_type: 'subscription',
    savings_dbus: 0,
    savings_pct: 0,
    total_spend_dbus: 0,
    paused_spend_dbus: 0,
    warehouses: 0,
    query_volume: 0,
    auto_stop_events: 0,
    resizing_events: 0,
    ...overrides,
  }
}

describe('computeRangeTotalsFromPoints', () => {
  it('returns zeros for empty points array', () => {
    const result = computeRangeTotalsFromPoints([], 0)
    expect(result.savings_dbus).toBe(0)
    expect(result.savings_pct).toBe(0)
    expect(result.warehouses).toBe(0)
  })

  it('sums savings_dbus across all points', () => {
    const points = [
      makePoint({ savings_dbus: 100, total_spend_dbus: 300, paused_spend_dbus: 0 }),
      makePoint({ savings_dbus: 200, total_spend_dbus: 500, paused_spend_dbus: 0 }),
    ]
    expect(computeRangeTotalsFromPoints(points, 0).savings_dbus).toBe(300)
  })

  it('re-aggregates savings_pct from sums, not by averaging per-period pcts', () => {
    // Period 1: savings=100, optimized_actual=200 → gross=300 → 33.3%
    // Period 2: savings=100, optimized_actual=900 → gross=1000 → 10%
    // Naive average: (33.3 + 10) / 2 = 21.65%  — WRONG
    // Correct: total_savings=200, total_gross=1300 → 15.38%
    const points = [
      makePoint({ org_id: 'org1', savings_dbus: 100, total_spend_dbus: 200, paused_spend_dbus: 0 }),
      makePoint({ org_id: 'org2', savings_dbus: 100, total_spend_dbus: 900, paused_spend_dbus: 0 }),
    ]
    expect(computeRangeTotalsFromPoints(points, 0).savings_pct).toBeCloseTo(15.38, 1)
  })

  it('excludes paused spend from gross when computing savings_pct', () => {
    // optimized_actual = total_spend - paused_spend = 1000 - 200 = 800
    // gross = 800 + 200 (savings) = 1000
    // savings_pct = 200/1000 * 100 = 20%
    const points = [
      makePoint({ savings_dbus: 200, total_spend_dbus: 1000, paused_spend_dbus: 200 }),
    ]
    expect(computeRangeTotalsFromPoints(points, 0).savings_pct).toBeCloseTo(20, 1)
  })

  it('returns 0 savings_pct when gross spend is zero', () => {
    const points = [makePoint({ savings_dbus: 0, total_spend_dbus: 0, paused_spend_dbus: 0 })]
    expect(computeRangeTotalsFromPoints(points, 0).savings_pct).toBe(0)
  })

  it('uses the passed-in warehouses count directly', () => {
    const points = [makePoint({ warehouses: 3 }), makePoint({ warehouses: 5 })]
    expect(computeRangeTotalsFromPoints(points, 7).warehouses).toBe(7)
  })

  it('sums query_volume, auto_stop_events, resizing_events', () => {
    const points = [
      makePoint({ query_volume: 100, auto_stop_events: 10, resizing_events: 5 }),
      makePoint({ query_volume: 200, auto_stop_events: 20, resizing_events: 8 }),
    ]
    const result = computeRangeTotalsFromPoints(points, 0)
    expect(result.query_volume).toBe(300)
    expect(result.auto_stop_events).toBe(30)
    expect(result.resizing_events).toBe(13)
  })

  it('sums total_spend_dbus and paused_spend_dbus', () => {
    const points = [
      makePoint({ total_spend_dbus: 500, paused_spend_dbus: 50 }),
      makePoint({ total_spend_dbus: 800, paused_spend_dbus: 100 }),
    ]
    const result = computeRangeTotalsFromPoints(points, 0)
    expect(result.total_spend_dbus).toBe(1300)
    expect(result.paused_spend_dbus).toBe(150)
  })
})
