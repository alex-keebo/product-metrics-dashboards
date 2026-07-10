const LABEL_RE = /^(\d{2})-Q([1-4])$/

/** Keebo's fiscal year starts February 1. Returns e.g. "26-Q2". */
export function currentFiscalQuarterLabel(today: Date = new Date()): string {
  const calendarMonth = today.getUTCMonth() + 1 // 1-12
  const calendarYear = today.getUTCFullYear()
  const monthIndex = (calendarMonth - 2 + 12) % 12 // 0-11, Feb = 0
  const fiscalYear = calendarMonth >= 2 ? calendarYear : calendarYear - 1
  const quarter = Math.floor(monthIndex / 3) + 1 // 1-4
  return `${String(fiscalYear % 100).padStart(2, '0')}-Q${quarter}`
}

/** Rolls a fiscal-quarter label forward by one quarter, e.g. "26-Q4" -> "27-Q1". */
export function nextFiscalQuarterLabel(label: string): string {
  const match = LABEL_RE.exec(label)
  if (!match) throw new Error(`Invalid fiscal quarter label: ${label}`)
  let year = Number(match[1])
  let quarter = Number(match[2])
  quarter += 1
  if (quarter > 4) {
    quarter = 1
    year += 1
  }
  return `${String(year).padStart(2, '0')}-Q${quarter}`
}

/**
 * Current fiscal quarter + the next `count` quarters + "Future".
 * Recomputed from `today` on every call so the window slides forward automatically.
 */
export function quarterWindow(today: Date = new Date(), count = 6): string[] {
  const labels: string[] = [currentFiscalQuarterLabel(today)]
  for (let i = 0; i < count; i++) {
    labels.push(nextFiscalQuarterLabel(labels[labels.length - 1]))
  }
  labels.push('Future')
  return labels
}

/** Rolls a fiscal-quarter label backward by one quarter, e.g. "26-Q1" -> "25-Q4". */
export function previousFiscalQuarterLabel(label: string): string {
  const match = LABEL_RE.exec(label)
  if (!match) throw new Error(`Invalid fiscal quarter label: ${label}`)
  const year = Number(match[1])
  const quarter = Number(match[2])
  if (quarter === 1) return `${String((year - 1 + 100) % 100).padStart(2, '0')}-Q4`
  return `${String(year).padStart(2, '0')}-Q${quarter - 1}`
}
