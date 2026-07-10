import { describe, it, expect } from 'vitest'
import { currentFiscalQuarterLabel, nextFiscalQuarterLabel, previousFiscalQuarterLabel, quarterWindow } from '../fiscal-quarter'

describe('currentFiscalQuarterLabel', () => {
  it('2026-07-08 (July, FY starts Feb) -> 26-Q2', () => {
    expect(currentFiscalQuarterLabel(new Date('2026-07-08T12:00:00Z'))).toBe('26-Q2')
  })

  it('2027-01-15 (January belongs to prior fiscal year Q4) -> 26-Q4', () => {
    expect(currentFiscalQuarterLabel(new Date('2027-01-15T12:00:00Z'))).toBe('26-Q4')
  })

  it('2026-02-01 (fiscal year start) -> 26-Q1', () => {
    expect(currentFiscalQuarterLabel(new Date('2026-02-01T12:00:00Z'))).toBe('26-Q1')
  })

  it('2026-01-31 (day before fiscal year start) -> 25-Q4', () => {
    expect(currentFiscalQuarterLabel(new Date('2026-01-31T12:00:00Z'))).toBe('25-Q4')
  })
})

describe('nextFiscalQuarterLabel', () => {
  it('rolls Q1 -> Q2 within the same fiscal year', () => {
    expect(nextFiscalQuarterLabel('26-Q1')).toBe('26-Q2')
  })

  it('rolls Q4 -> next fiscal year Q1', () => {
    expect(nextFiscalQuarterLabel('26-Q4')).toBe('27-Q1')
  })

  it('throws on a malformed label', () => {
    expect(() => nextFiscalQuarterLabel('Future')).toThrow()
  })
})

describe('quarterWindow', () => {
  it('returns current + next 6 quarters + Future for 2026-07-08', () => {
    expect(quarterWindow(new Date('2026-07-08T12:00:00Z'))).toEqual([
      '26-Q2', '26-Q3', '26-Q4', '27-Q1', '27-Q2', '27-Q3', '27-Q4', 'Future',
    ])
  })

  it('supports a smaller count', () => {
    expect(quarterWindow(new Date('2026-07-08T12:00:00Z'), 2)).toEqual([
      '26-Q2', '26-Q3', '26-Q4', 'Future',
    ])
  })
})

describe('previousFiscalQuarterLabel', () => {
  it('rolls Q2 -> Q1 within the same fiscal year', () => {
    expect(previousFiscalQuarterLabel('26-Q2')).toBe('26-Q1')
  })

  it('rolls Q1 -> previous fiscal year Q4', () => {
    expect(previousFiscalQuarterLabel('26-Q1')).toBe('25-Q4')
  })

  it('throws on a malformed label', () => {
    expect(() => previousFiscalQuarterLabel('Future')).toThrow()
  })
})
