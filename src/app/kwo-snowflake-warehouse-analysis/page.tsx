'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/components/layout/ThemeProvider'
import { WarehouseAnalysisFilters } from '@/components/filters/WarehouseAnalysisFilters'
import { WarehouseAnalysisCharts } from '@/components/charts/WarehouseAnalysisCharts'
import {
  formatMetricNumber,
  formatDecimalNumber,
  formatBytesAsGB,
  ChartWrapper,
  UsageChart,
  SpendDistributionChart,
} from '@/components/charts/TimeSeriesCharts'
import { WarehouseActivityTimeline } from '@/components/charts/WarehouseActivityTimeline'
import { WAREHOUSE_ROW_CLUSTER_NUMBER } from '@/lib/clusterIntervals'
import { DataTable, type Column } from '@/components/tables/DataTable'
import { lastNDaysRange, toDateString, formatTablePeriodLabel } from '@/lib/dates'
import type {
  ClusterActivityResponse,
  ClusterInterval,
  FilterGroup,
  Granularity,
  HistogramBucket,
  HistogramResponse,
  QueryTypeMetricRow,
  QueryTypeMetricResponse,
  WarehouseAnalysisPoint,
  WarehouseAnalysisResponse,
  WarehouseOption,
  WarehouseSizeInterval,
  WarehouseSpendResponse,
  WarehouseUsagePoint,
  WarehouseUsageResponse,
} from '@/lib/types'

const MAX_HOUR_RANGE_DAYS = 14

// Code-only toggle for the overall-metric shown top-right on the Cluster Activity chart. Not user-facing.
const SHOW_WAREHOUSE_ACTIVITY_METRIC = true

interface FetchError {
  message: string
  code?: string
}

function SectionError({ error }: { error: FetchError }) {
  if (error.code === 'ADC_UNAUTHENTICATED') {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex items-center justify-between gap-4 flex-wrap">
        <span>BigQuery credentials are missing or expired.</span>
        <Link
          href="/settings"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1 text-xs font-medium"
        >
          Re-authenticate
        </Link>
      </div>
    )
  }
  return <div className="p-4 rounded border border-destructive text-destructive text-sm">{error.message}</div>
}

const numberColumn = (key: string, label: string): Column<Record<string, unknown>> => ({
  key,
  label,
  align: 'right',
  format: (v) => formatMetricNumber(Number(v)),
})

const gbColumn = (key: string, label: string): Column<Record<string, unknown>> => ({
  key,
  label,
  align: 'right',
  format: (v) => formatBytesAsGB(Number(v)),
})

const decimalColumn = (key: string, label: string): Column<Record<string, unknown>> => ({
  key,
  label,
  align: 'right',
  format: (v) => formatDecimalNumber(Number(v)),
})

const BASE_TABLE_COLUMNS: Column<Record<string, unknown>>[] = [
  numberColumn('total_query_count', 'Total Queries'),
  numberColumn('execution_time_avg_ms', 'Avg Exec Time (ms)'),
  numberColumn('execution_time_p95_ms', 'P95 Exec Time (ms)'),
  numberColumn('execution_time_p99_ms', 'P99 Exec Time (ms)'),
  numberColumn('execution_time_max_ms', 'Max Exec Time (ms)'),
  numberColumn('queued_query_count', 'Queued Queries'),
  numberColumn('queue_time_avg_ms', 'Avg Queue Time (ms)'),
  numberColumn('queue_time_p95_ms', 'P95 Queue Time (ms)'),
  numberColumn('queue_time_p99_ms', 'P99 Queue Time (ms)'),
  numberColumn('queue_time_max_ms', 'Max Queue Time (ms)'),
  decimalColumn('concurrent_queries_per_cluster_max', 'Max Concurrency per Cluster'),
  decimalColumn('concurrent_queries_max', 'Max Concurrency'),
  gbColumn('bytes_scanned', 'Data Scanned (GB)'),
  gbColumn('bytes_spilled_local', 'Local Spillage (GB)'),
  gbColumn('bytes_spilled_remote', 'Remote Spillage (GB)'),
  decimalColumn('credits_used', 'Credits Used'),
  numberColumn('failed_query_count', 'Failed Queries'),
]

export default function WarehouseAnalysisPage() {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const defaultRange = lastNDaysRange(7)

  const [customers, setCustomers] = useState<{ org_id: string; name: string }[]>([])
  const [customersError, setCustomersError] = useState<FetchError | null>(null)

  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(toDateString(defaultRange.start))
  const [endDate, setEndDate] = useState(toDateString(defaultRange.end))
  const [granularity, setGranularity] = useState<Granularity>('day')

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [warehousesError, setWarehousesError] = useState<string | null>(null)
  const [selectedOverviewWarehouses, setSelectedOverviewWarehouses] = useState<string[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null)
  const [selectedClusterWarehouse, setSelectedClusterWarehouse] = useState<string | null>(null)

  const [appliedFilter, setAppliedFilter] = useState<FilterGroup>({ id: 'root', match: 'AND', conditions: [] })

  const [activeTab, setActiveTab] = useState<'overview' | 'query' | 'cluster'>('overview')

  const [points, setPoints] = useState<WarehouseAnalysisPoint[]>([])
  const [granularityUsed, setGranularityUsed] = useState<Granularity>('day')
  const [timeseriesError, setTimeseriesError] = useState<FetchError | null>(null)
  const [loading, setLoading] = useState(false)

  const [overviewPoints, setOverviewPoints] = useState<WarehouseUsagePoint[]>([])
  const [overviewTimeseriesError, setOverviewTimeseriesError] = useState<FetchError | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)

  const [spendPoints, setSpendPoints] = useState<{ warehouse_name: string; credits_used: number }[]>([])
  const [spendError, setSpendError] = useState<FetchError | null>(null)
  const [spendLoading, setSpendLoading] = useState(false)

  const [clusterIntervals, setClusterIntervals] = useState<ClusterInterval[]>([])
  const [sizeIntervals, setSizeIntervals] = useState<WarehouseSizeInterval[]>([])
  const [clusterActivityError, setClusterActivityError] = useState<FetchError | null>(null)
  const [clusterActivityLoading, setClusterActivityLoading] = useState(false)

  const [histogramBuckets, setHistogramBuckets] = useState<HistogramBucket[]>([])
  const [histogramError, setHistogramError] = useState<FetchError | null>(null)
  const [histogramLoading, setHistogramLoading] = useState(false)

  const [latencyHistogramBuckets, setLatencyHistogramBuckets] = useState<HistogramBucket[]>([])
  const [latencyHistogramError, setLatencyHistogramError] = useState<FetchError | null>(null)
  const [latencyHistogramLoading, setLatencyHistogramLoading] = useState(false)

  const [dataScannedHistogramBuckets, setDataScannedHistogramBuckets] = useState<HistogramBucket[]>([])
  const [dataScannedHistogramError, setDataScannedHistogramError] = useState<FetchError | null>(null)
  const [dataScannedHistogramLoading, setDataScannedHistogramLoading] = useState(false)

  const [spillageHistogramBuckets, setSpillageHistogramBuckets] = useState<HistogramBucket[]>([])
  const [spillageHistogramError, setSpillageHistogramError] = useState<FetchError | null>(null)
  const [spillageHistogramLoading, setSpillageHistogramLoading] = useState(false)

  const [compileTimeHistogramBuckets, setCompileTimeHistogramBuckets] = useState<HistogramBucket[]>([])
  const [compileTimeHistogramError, setCompileTimeHistogramError] = useState<FetchError | null>(null)
  const [compileTimeHistogramLoading, setCompileTimeHistogramLoading] = useState(false)

  const [executionTimeByTypeRows, setExecutionTimeByTypeRows] = useState<QueryTypeMetricRow[]>([])
  const [executionTimeByTypeError, setExecutionTimeByTypeError] = useState<FetchError | null>(null)
  const [executionTimeByTypeLoading, setExecutionTimeByTypeLoading] = useState(false)

  const [dataScannedByTypeRows, setDataScannedByTypeRows] = useState<QueryTypeMetricRow[]>([])
  const [dataScannedByTypeError, setDataScannedByTypeError] = useState<FetchError | null>(null)
  const [dataScannedByTypeLoading, setDataScannedByTypeLoading] = useState(false)

  const [spillageByTypeRows, setSpillageByTypeRows] = useState<QueryTypeMetricRow[]>([])
  const [spillageByTypeError, setSpillageByTypeError] = useState<FetchError | null>(null)
  const [spillageByTypeLoading, setSpillageByTypeLoading] = useState(false)

  const [failedQueriesByTypeRows, setFailedQueriesByTypeRows] = useState<QueryTypeMetricRow[]>([])
  const [failedQueriesByTypeError, setFailedQueriesByTypeError] = useState<FetchError | null>(null)
  const [failedQueriesByTypeLoading, setFailedQueriesByTypeLoading] = useState(false)

  useEffect(() => {
    fetch('/api/kwo-snowflake-warehouse-analysis/customers')
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw body
        setCustomers(body)
      })
      .catch((err) => setCustomersError({ message: err.error ?? String(err), code: err.code }))
  }, [])

  useEffect(() => {
    setSelectedOverviewWarehouses([])
    setSelectedWarehouse(null)
    setSelectedClusterWarehouse(null)
    if (!selectedCustomer) {
      setWarehouses([])
      return
    }
    setWarehousesError(null)
    fetch(`/api/kwo-snowflake-warehouse-analysis/warehouses?org_id=${selectedCustomer}`)
      .then(async (res) => {
        const body = (await res.json()) as WarehouseOption[]
        if (!res.ok) throw body
        setWarehouses(body)
        setSelectedOverviewWarehouses(body.map((w) => w.warehouse_name))
      })
      .catch((err) => setWarehousesError(err.error ?? String(err)))
  }, [selectedCustomer])

  useEffect(() => {
    if (!selectedCustomer) {
      setOverviewPoints([])
      return
    }
    const controller = new AbortController()
    setOverviewLoading(true)
    setOverviewTimeseriesError(null)

    fetch('/api/kwo-snowflake-warehouse-analysis/usage-by-period', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: selectedCustomer,
        warehouse_names: selectedOverviewWarehouses,
        start_date: startDate,
        end_date: endDate,
        granularity,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as WarehouseUsageResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setOverviewPoints(body.points)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setOverviewTimeseriesError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setOverviewLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedOverviewWarehouses, startDate, endDate, granularity])

  useEffect(() => {
    if (!selectedCustomer) {
      setSpendPoints([])
      return
    }
    const controller = new AbortController()
    setSpendLoading(true)
    setSpendError(null)

    fetch('/api/kwo-snowflake-warehouse-analysis/spend-by-warehouse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: selectedCustomer,
        warehouse_names: selectedOverviewWarehouses,
        start_date: startDate,
        end_date: endDate,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as WarehouseSpendResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setSpendPoints(body.points)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setSpendError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setSpendLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedOverviewWarehouses, startDate, endDate])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setPoints([])
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setTimeseriesError(null)

    fetch('/api/kwo-snowflake-warehouse-analysis/timeseries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: selectedCustomer,
        warehouse_names: [selectedWarehouse],
        start_date: startDate,
        end_date: endDate,
        granularity,
        filter_conditions: appliedFilter,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as WarehouseAnalysisResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setPoints(body.points)
        setGranularityUsed(body.granularity_used)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setTimeseriesError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate, granularity, appliedFilter])

  useEffect(() => {
    if (!selectedCustomer || !selectedClusterWarehouse) {
      setClusterIntervals([])
      setSizeIntervals([])
      return
    }
    const controller = new AbortController()
    setClusterActivityLoading(true)
    setClusterActivityError(null)

    const params = new URLSearchParams({
      org_id: selectedCustomer,
      warehouse_name: selectedClusterWarehouse,
      start_date: startDate,
      end_date: endDate,
    })

    fetch(`/api/kwo-snowflake-warehouse-analysis/cluster-activity?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as ClusterActivityResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setClusterIntervals(body.intervals)
        setSizeIntervals(body.sizeIntervals ?? [])
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setClusterActivityError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setClusterActivityLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedClusterWarehouse, startDate, endDate])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setHistogramBuckets([])
      return
    }
    const controller = new AbortController()
    setHistogramLoading(true)
    setHistogramError(null)

    fetch('/api/kwo-snowflake-warehouse-analysis/execution-time-histogram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: selectedCustomer,
        warehouse_names: [selectedWarehouse],
        start_date: startDate,
        end_date: endDate,
        filter_conditions: appliedFilter,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as HistogramResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setHistogramBuckets(body.buckets)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setHistogramError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setHistogramLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate, appliedFilter])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setLatencyHistogramBuckets([])
      return
    }
    const controller = new AbortController()
    setLatencyHistogramLoading(true)
    setLatencyHistogramError(null)

    fetch('/api/kwo-snowflake-warehouse-analysis/latency-histogram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: selectedCustomer,
        warehouse_names: [selectedWarehouse],
        start_date: startDate,
        end_date: endDate,
        filter_conditions: appliedFilter,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as HistogramResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setLatencyHistogramBuckets(body.buckets)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setLatencyHistogramError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setLatencyHistogramLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate, appliedFilter])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setDataScannedHistogramBuckets([])
      return
    }
    const controller = new AbortController()
    setDataScannedHistogramLoading(true)
    setDataScannedHistogramError(null)

    fetch('/api/kwo-snowflake-warehouse-analysis/data-scanned-histogram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: selectedCustomer,
        warehouse_names: [selectedWarehouse],
        start_date: startDate,
        end_date: endDate,
        filter_conditions: appliedFilter,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as HistogramResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setDataScannedHistogramBuckets(body.buckets)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setDataScannedHistogramError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setDataScannedHistogramLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate, appliedFilter])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setSpillageHistogramBuckets([])
      return
    }
    const controller = new AbortController()
    setSpillageHistogramLoading(true)
    setSpillageHistogramError(null)

    fetch('/api/kwo-snowflake-warehouse-analysis/spillage-histogram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: selectedCustomer,
        warehouse_names: [selectedWarehouse],
        start_date: startDate,
        end_date: endDate,
        filter_conditions: appliedFilter,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as HistogramResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setSpillageHistogramBuckets(body.buckets)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setSpillageHistogramError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setSpillageHistogramLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate, appliedFilter])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setCompileTimeHistogramBuckets([])
      return
    }
    const controller = new AbortController()
    setCompileTimeHistogramLoading(true)
    setCompileTimeHistogramError(null)

    fetch('/api/kwo-snowflake-warehouse-analysis/compile-time-histogram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: selectedCustomer,
        warehouse_names: [selectedWarehouse],
        start_date: startDate,
        end_date: endDate,
        filter_conditions: appliedFilter,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as HistogramResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setCompileTimeHistogramBuckets(body.buckets)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setCompileTimeHistogramError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setCompileTimeHistogramLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate, appliedFilter])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setExecutionTimeByTypeRows([])
      return
    }
    const controller = new AbortController()
    setExecutionTimeByTypeLoading(true)
    setExecutionTimeByTypeError(null)

    fetch('/api/kwo-snowflake-warehouse-analysis/execution-time-by-query-type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: selectedCustomer,
        warehouse_names: [selectedWarehouse],
        start_date: startDate,
        end_date: endDate,
        filter_conditions: appliedFilter,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as QueryTypeMetricResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setExecutionTimeByTypeRows(body.rows)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setExecutionTimeByTypeError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setExecutionTimeByTypeLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate, appliedFilter])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setDataScannedByTypeRows([])
      return
    }
    const controller = new AbortController()
    setDataScannedByTypeLoading(true)
    setDataScannedByTypeError(null)

    fetch('/api/kwo-snowflake-warehouse-analysis/data-scanned-by-query-type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: selectedCustomer,
        warehouse_names: [selectedWarehouse],
        start_date: startDate,
        end_date: endDate,
        filter_conditions: appliedFilter,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as QueryTypeMetricResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setDataScannedByTypeRows(body.rows)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setDataScannedByTypeError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setDataScannedByTypeLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate, appliedFilter])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setSpillageByTypeRows([])
      return
    }
    const controller = new AbortController()
    setSpillageByTypeLoading(true)
    setSpillageByTypeError(null)

    fetch('/api/kwo-snowflake-warehouse-analysis/spillage-by-query-type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: selectedCustomer,
        warehouse_names: [selectedWarehouse],
        start_date: startDate,
        end_date: endDate,
        filter_conditions: appliedFilter,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as QueryTypeMetricResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setSpillageByTypeRows(body.rows)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setSpillageByTypeError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setSpillageByTypeLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate, appliedFilter])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setFailedQueriesByTypeRows([])
      return
    }
    const controller = new AbortController()
    setFailedQueriesByTypeLoading(true)
    setFailedQueriesByTypeError(null)

    fetch('/api/kwo-snowflake-warehouse-analysis/failed-queries-by-query-type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: selectedCustomer,
        warehouse_names: [selectedWarehouse],
        start_date: startDate,
        end_date: endDate,
        filter_conditions: appliedFilter,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as QueryTypeMetricResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setFailedQueriesByTypeRows(body.rows)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setFailedQueriesByTypeError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setFailedQueriesByTypeLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate, appliedFilter])

  const periodColumn: Column<Record<string, unknown>> = useMemo(
    () => ({
      key: 'period_label',
      label: 'Period',
      nowrap: true,
      format: (v) => formatTablePeriodLabel(String(v), granularityUsed),
    }),
    [granularityUsed]
  )

  const tableColumns = useMemo(() => [periodColumn, ...BASE_TABLE_COLUMNS], [periodColumn])

  const sectionLoading =
    loading ||
    clusterActivityLoading ||
    histogramLoading ||
    latencyHistogramLoading ||
    dataScannedHistogramLoading ||
    spillageHistogramLoading ||
    compileTimeHistogramLoading ||
    executionTimeByTypeLoading ||
    dataScannedByTypeLoading ||
    spillageByTypeLoading ||
    failedQueriesByTypeLoading

  const sectionHasData =
    points.length > 0 ||
    clusterIntervals.length > 0 ||
    histogramBuckets.length > 0 ||
    latencyHistogramBuckets.length > 0 ||
    dataScannedHistogramBuckets.length > 0 ||
    spillageHistogramBuckets.length > 0 ||
    compileTimeHistogramBuckets.length > 0 ||
    executionTimeByTypeRows.length > 0 ||
    dataScannedByTypeRows.length > 0 ||
    spillageByTypeRows.length > 0 ||
    failedQueriesByTypeRows.length > 0

  const totalsClusterActivity = useMemo(() => {
    const realClusters = clusterIntervals.filter((i) => i.cluster_number !== WAREHOUSE_ROW_CLUSTER_NUMBER)
    const warehouseCycleCount = clusterIntervals.filter(
      (i) => i.cluster_number === WAREHOUSE_ROW_CLUSTER_NUMBER && !i.truncated_end
    ).length
    return [
      { label: 'Total Clusters', value: formatMetricNumber(new Set(realClusters.map((i) => i.cluster_number)).size) },
      { label: 'Warehouse Cycle Count', value: formatMetricNumber(warehouseCycleCount) },
    ]
  }, [clusterIntervals])

  const tableRows = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        total_query_count: Object.values(p.query_volume_by_type).reduce((sum, v) => sum + v, 0),
        failed_query_count: Object.values(p.failed_query_count_by_error).reduce((sum, v) => sum + v, 0),
      })),
    [points]
  )

  return (
    <div className="p-6 flex flex-col gap-4">
      <h1 className="text-xl font-heading font-semibold">Snowflake Analysis</h1>

      {customersError && <SectionError error={customersError} />}

      {activeTab === 'overview' && (
        <WarehouseAnalysisFilters
          variant="overview"
          customers={customers}
          selectedCustomer={selectedCustomer}
          onCustomerChange={setSelectedCustomer}
          startDate={startDate}
          endDate={endDate}
          onRangeChange={(start, end) => {
            setStartDate(start)
            setEndDate(end)
          }}
          granularity={granularity}
          onGranularityChange={setGranularity}
          warehouses={warehouses}
          selectedWarehouses={selectedOverviewWarehouses}
          onWarehousesChange={setSelectedOverviewWarehouses}
          warehousesDisabled={!selectedCustomer}
          warehousesError={warehousesError}
        />
      )}

      {activeTab === 'query' && (
        <WarehouseAnalysisFilters
          variant="query"
          customers={customers}
          selectedCustomer={selectedCustomer}
          onCustomerChange={setSelectedCustomer}
          startDate={startDate}
          endDate={endDate}
          onRangeChange={(start, end) => {
            setStartDate(start)
            setEndDate(end)
          }}
          granularity={granularity}
          onGranularityChange={setGranularity}
          warehouses={warehouses}
          selectedWarehouse={selectedWarehouse}
          onWarehouseChange={setSelectedWarehouse}
          warehousesDisabled={!selectedCustomer}
          warehousesError={warehousesError}
          appliedFilter={appliedFilter}
          onFilterApply={setAppliedFilter}
        />
      )}

      {activeTab === 'cluster' && (
        <WarehouseAnalysisFilters
          variant="cluster"
          customers={customers}
          selectedCustomer={selectedCustomer}
          onCustomerChange={setSelectedCustomer}
          startDate={startDate}
          endDate={endDate}
          onRangeChange={(start, end) => {
            setStartDate(start)
            setEndDate(end)
          }}
          warehouses={warehouses}
          selectedWarehouse={selectedClusterWarehouse}
          onWarehouseChange={setSelectedClusterWarehouse}
          warehousesDisabled={!selectedCustomer}
          warehousesError={warehousesError}
        />
      )}

      {granularity === 'hour' && granularityUsed === 'day' && (
        <div className="text-xs text-muted-foreground p-2 rounded bg-muted">
          Hourly granularity supports up to a {MAX_HOUR_RANGE_DAYS}-day range — showing daily data instead.
        </div>
      )}

      <div className="flex gap-4 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-1 pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'overview'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedWarehouse((prev) => prev ?? selectedClusterWarehouse)
            setActiveTab('query')
          }}
          className={`px-1 pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'query'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Warehouse analysis
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedClusterWarehouse((prev) => prev ?? selectedWarehouse)
            setActiveTab('cluster')
          }}
          className={`px-1 pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'cluster'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Cluster Activity
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
          {!selectedCustomer && (
            <div className="p-8 text-center text-muted-foreground text-sm">Select a Customer to view an overview.</div>
          )}

          {selectedCustomer && overviewTimeseriesError && <SectionError error={overviewTimeseriesError} />}
          {selectedCustomer && spendError && <SectionError error={spendError} />}

          {selectedCustomer && (
            <>
              <UsageChart points={overviewPoints} loading={overviewLoading} />
              <SpendDistributionChart points={spendPoints} loading={spendLoading} />
            </>
          )}
        </>
      )}

      {activeTab === 'query' && (
        <>
          {!selectedCustomer && (
            <div className="p-8 text-center text-muted-foreground text-sm">Select a Customer to view warehouse analysis.</div>
          )}

          {selectedCustomer && !selectedWarehouse && (
            <div className="p-8 text-center text-muted-foreground text-sm">Select a Warehouse to view query performance.</div>
          )}

          {selectedCustomer && selectedWarehouse && timeseriesError && <SectionError error={timeseriesError} />}

          {selectedCustomer && selectedWarehouse && !histogramLoading && histogramError && <SectionError error={histogramError} />}

          {selectedCustomer && selectedWarehouse && !latencyHistogramLoading && latencyHistogramError && (
            <SectionError error={latencyHistogramError} />
          )}

          {selectedCustomer && selectedWarehouse && !dataScannedHistogramLoading && dataScannedHistogramError && (
            <SectionError error={dataScannedHistogramError} />
          )}

          {selectedCustomer && selectedWarehouse && !spillageHistogramLoading && spillageHistogramError && (
            <SectionError error={spillageHistogramError} />
          )}

          {selectedCustomer && selectedWarehouse && !compileTimeHistogramLoading && compileTimeHistogramError && (
            <SectionError error={compileTimeHistogramError} />
          )}

          {selectedCustomer && selectedWarehouse && !executionTimeByTypeLoading && executionTimeByTypeError && (
            <SectionError error={executionTimeByTypeError} />
          )}

          {selectedCustomer && selectedWarehouse && !dataScannedByTypeLoading && dataScannedByTypeError && (
            <SectionError error={dataScannedByTypeError} />
          )}

          {selectedCustomer && selectedWarehouse && !spillageByTypeLoading && spillageByTypeError && (
            <SectionError error={spillageByTypeError} />
          )}

          {selectedCustomer && selectedWarehouse && !failedQueriesByTypeLoading && failedQueriesByTypeError && (
            <SectionError error={failedQueriesByTypeError} />
          )}

          {selectedCustomer && selectedWarehouse && !timeseriesError && !sectionLoading && !sectionHasData && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No query history for this warehouse in the selected range.
            </div>
          )}

          {selectedCustomer && selectedWarehouse && !timeseriesError && (sectionLoading || sectionHasData) && (
            <>
              <WarehouseAnalysisCharts
                points={points}
                histogramBuckets={histogramBuckets}
                latencyHistogramBuckets={latencyHistogramBuckets}
                dataScannedHistogramBuckets={dataScannedHistogramBuckets}
                spillageHistogramBuckets={spillageHistogramBuckets}
                compileTimeHistogramBuckets={compileTimeHistogramBuckets}
                executionTimeByTypeRows={executionTimeByTypeRows}
                dataScannedByTypeRows={dataScannedByTypeRows}
                spillageByTypeRows={spillageByTypeRows}
                failedQueriesByTypeRows={failedQueriesByTypeRows}
                loading={loading}
                histogramLoading={histogramLoading}
                latencyHistogramLoading={latencyHistogramLoading}
                dataScannedHistogramLoading={dataScannedHistogramLoading}
                spillageHistogramLoading={spillageHistogramLoading}
                compileTimeHistogramLoading={compileTimeHistogramLoading}
                executionTimeByTypeLoading={executionTimeByTypeLoading}
                dataScannedByTypeLoading={dataScannedByTypeLoading}
                spillageByTypeLoading={spillageByTypeLoading}
                failedQueriesByTypeLoading={failedQueriesByTypeLoading}
              />

              {loading ? (
                <div className="animate-pulse rounded-lg h-40 bg-muted" />
              ) : (
                <DataTable
                  columns={tableColumns}
                  rows={tableRows as unknown as Record<string, unknown>[]}
                  defaultSortKey="period_label"
                  defaultSortDir="asc"
                  csvFilename="warehouse_analysis.csv"
                />
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'cluster' && (
        <>
          {!selectedCustomer && (
            <div className="p-8 text-center text-muted-foreground text-sm">Select a Customer to view cluster activity.</div>
          )}

          {selectedCustomer && !selectedClusterWarehouse && (
            <div className="p-8 text-center text-muted-foreground text-sm">Select a Warehouse to view cluster activity.</div>
          )}

          {selectedCustomer && selectedClusterWarehouse && (
            <ChartWrapper
              title="Cluster Activity"
              isLight={isLight}
              totals={SHOW_WAREHOUSE_ACTIVITY_METRIC ? totalsClusterActivity : undefined}
              loading={clusterActivityLoading}
              notApplicable={appliedFilter.conditions.length > 0}
            >
              {clusterActivityError ? (
                <SectionError error={clusterActivityError} />
              ) : clusterIntervals.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No cluster activity for this warehouse in the selected range.
                </div>
              ) : (
                <WarehouseActivityTimeline
                  intervals={clusterIntervals}
                  sizeIntervals={sizeIntervals}
                  rangeStart={`${startDate}T00:00:00.000`}
                  rangeEnd={`${endDate}T23:59:59.000`}
                />
              )}
            </ChartWrapper>
          )}
        </>
      )}
    </div>
  )
}
