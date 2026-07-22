'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/components/layout/ThemeProvider'
import { WarehouseAnalysisFilters } from '@/components/filters/WarehouseAnalysisFilters'
import { WarehouseAnalysisCharts } from '@/components/charts/WarehouseAnalysisCharts'
import { formatMetricNumber, formatBytesAsGB, ChartWrapper } from '@/components/charts/TimeSeriesCharts'
import { WarehouseActivityTimeline } from '@/components/charts/WarehouseActivityTimeline'
import { WAREHOUSE_ROW_CLUSTER_NUMBER } from '@/lib/clusterIntervals'
import { DataTable, type Column } from '@/components/tables/DataTable'
import { lastNDaysRange, toDateString, formatTablePeriodLabel } from '@/lib/dates'
import type {
  ClusterActivityResponse,
  ClusterInterval,
  CompileTimeHistogramBucket,
  CompileTimeHistogramResponse,
  DataScannedHistogramBucket,
  DataScannedHistogramResponse,
  ExecutionTimeHistogramBucket,
  ExecutionTimeHistogramResponse,
  Granularity,
  SpillageHistogramBucket,
  SpillageHistogramResponse,
  WarehouseAnalysisPoint,
  WarehouseAnalysisResponse,
  WarehouseOption,
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

const BASE_TABLE_COLUMNS: Column<Record<string, unknown>>[] = [
  numberColumn('total_query_count', 'Total Queries'),
  numberColumn('execution_time_avg_ms', 'Avg Exec Time (ms)'),
  numberColumn('execution_time_p95_ms', 'P95 Exec Time (ms)'),
  numberColumn('execution_time_p99_ms', 'P99 Exec Time (ms)'),
  numberColumn('queued_query_count', 'Queued Queries'),
  numberColumn('queue_time_avg_ms', 'Avg Queue Time (ms)'),
  numberColumn('queue_time_p95_ms', 'P95 Queue Time (ms)'),
  numberColumn('queue_time_p99_ms', 'P99 Queue Time (ms)'),
  gbColumn('bytes_scanned', 'Data Scanned (GB)'),
  gbColumn('bytes_spilled_local', 'Local Spillage (GB)'),
  gbColumn('bytes_spilled_remote', 'Remote Spillage (GB)'),
  numberColumn('failed_query_count', 'Failed Queries'),
]

export default function WarehouseAnalysisPage() {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const defaultRange = lastNDaysRange(3)

  const [customers, setCustomers] = useState<{ org_id: string; name: string }[]>([])
  const [customersError, setCustomersError] = useState<FetchError | null>(null)

  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(toDateString(defaultRange.start))
  const [endDate, setEndDate] = useState(toDateString(defaultRange.end))
  const [granularity, setGranularity] = useState<Granularity>('hour')

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [warehousesError, setWarehousesError] = useState<string | null>(null)
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null)

  const [points, setPoints] = useState<WarehouseAnalysisPoint[]>([])
  const [granularityUsed, setGranularityUsed] = useState<Granularity>('day')
  const [timeseriesError, setTimeseriesError] = useState<FetchError | null>(null)
  const [loading, setLoading] = useState(false)

  const [clusterIntervals, setClusterIntervals] = useState<ClusterInterval[]>([])
  const [clusterActivityError, setClusterActivityError] = useState<FetchError | null>(null)
  const [clusterActivityLoading, setClusterActivityLoading] = useState(false)

  const [histogramBuckets, setHistogramBuckets] = useState<ExecutionTimeHistogramBucket[]>([])
  const [histogramError, setHistogramError] = useState<FetchError | null>(null)
  const [histogramLoading, setHistogramLoading] = useState(false)

  const [dataScannedHistogramBuckets, setDataScannedHistogramBuckets] = useState<DataScannedHistogramBucket[]>([])
  const [dataScannedHistogramError, setDataScannedHistogramError] = useState<FetchError | null>(null)
  const [dataScannedHistogramLoading, setDataScannedHistogramLoading] = useState(false)

  const [spillageHistogramBuckets, setSpillageHistogramBuckets] = useState<SpillageHistogramBucket[]>([])
  const [spillageHistogramError, setSpillageHistogramError] = useState<FetchError | null>(null)
  const [spillageHistogramLoading, setSpillageHistogramLoading] = useState(false)

  const [compileTimeHistogramBuckets, setCompileTimeHistogramBuckets] = useState<CompileTimeHistogramBucket[]>([])
  const [compileTimeHistogramError, setCompileTimeHistogramError] = useState<FetchError | null>(null)
  const [compileTimeHistogramLoading, setCompileTimeHistogramLoading] = useState(false)

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
    if (!selectedCustomer) {
      setWarehouses([])
      return
    }
    setWarehousesError(null)
    fetch(`/api/kwo-snowflake-warehouse-analysis/warehouses?org_id=${selectedCustomer}`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw body
        setWarehouses(body)
      })
      .catch((err) => setWarehousesError(err.error ?? String(err)))
  }, [selectedCustomer])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setPoints([])
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setTimeseriesError(null)

    const params = new URLSearchParams({
      org_id: selectedCustomer,
      warehouse_name: selectedWarehouse,
      start_date: startDate,
      end_date: endDate,
      granularity,
    })

    fetch(`/api/kwo-snowflake-warehouse-analysis/timeseries?${params}`, { signal: controller.signal })
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
  }, [selectedCustomer, selectedWarehouse, startDate, endDate, granularity])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setClusterIntervals([])
      return
    }
    const controller = new AbortController()
    setClusterActivityLoading(true)
    setClusterActivityError(null)

    const params = new URLSearchParams({
      org_id: selectedCustomer,
      warehouse_name: selectedWarehouse,
      start_date: startDate,
      end_date: endDate,
    })

    fetch(`/api/kwo-snowflake-warehouse-analysis/cluster-activity?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as ClusterActivityResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setClusterIntervals(body.intervals)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setClusterActivityError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setClusterActivityLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setHistogramBuckets([])
      return
    }
    const controller = new AbortController()
    setHistogramLoading(true)
    setHistogramError(null)

    const params = new URLSearchParams({
      org_id: selectedCustomer,
      warehouse_name: selectedWarehouse,
      start_date: startDate,
      end_date: endDate,
    })

    fetch(`/api/kwo-snowflake-warehouse-analysis/execution-time-histogram?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as ExecutionTimeHistogramResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setHistogramBuckets(body.buckets)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setHistogramError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setHistogramLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setDataScannedHistogramBuckets([])
      return
    }
    const controller = new AbortController()
    setDataScannedHistogramLoading(true)
    setDataScannedHistogramError(null)

    const params = new URLSearchParams({
      org_id: selectedCustomer,
      warehouse_name: selectedWarehouse,
      start_date: startDate,
      end_date: endDate,
    })

    fetch(`/api/kwo-snowflake-warehouse-analysis/data-scanned-histogram?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as DataScannedHistogramResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setDataScannedHistogramBuckets(body.buckets)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setDataScannedHistogramError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setDataScannedHistogramLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setSpillageHistogramBuckets([])
      return
    }
    const controller = new AbortController()
    setSpillageHistogramLoading(true)
    setSpillageHistogramError(null)

    const params = new URLSearchParams({
      org_id: selectedCustomer,
      warehouse_name: selectedWarehouse,
      start_date: startDate,
      end_date: endDate,
    })

    fetch(`/api/kwo-snowflake-warehouse-analysis/spillage-histogram?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as SpillageHistogramResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setSpillageHistogramBuckets(body.buckets)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setSpillageHistogramError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setSpillageHistogramLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setCompileTimeHistogramBuckets([])
      return
    }
    const controller = new AbortController()
    setCompileTimeHistogramLoading(true)
    setCompileTimeHistogramError(null)

    const params = new URLSearchParams({
      org_id: selectedCustomer,
      warehouse_name: selectedWarehouse,
      start_date: startDate,
      end_date: endDate,
    })

    fetch(`/api/kwo-snowflake-warehouse-analysis/compile-time-histogram?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as CompileTimeHistogramResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setCompileTimeHistogramBuckets(body.buckets)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setCompileTimeHistogramError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setCompileTimeHistogramLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate])

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
    dataScannedHistogramLoading ||
    spillageHistogramLoading ||
    compileTimeHistogramLoading

  const sectionHasData =
    points.length > 0 ||
    clusterIntervals.length > 0 ||
    histogramBuckets.length > 0 ||
    dataScannedHistogramBuckets.length > 0 ||
    spillageHistogramBuckets.length > 0 ||
    compileTimeHistogramBuckets.length > 0

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
      <h1 className="text-xl font-heading font-semibold">Snowflake Warehouse Analysis</h1>

      {customersError && <SectionError error={customersError} />}

      <WarehouseAnalysisFilters
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
      />

      {granularity === 'hour' && granularityUsed === 'day' && (
        <div className="text-xs text-muted-foreground p-2 rounded bg-muted">
          Hourly granularity supports up to a {MAX_HOUR_RANGE_DAYS}-day range — showing daily data instead.
        </div>
      )}

      {!selectedCustomer && (
        <div className="p-8 text-center text-muted-foreground text-sm">Select a Customer to view warehouse analysis.</div>
      )}

      {selectedCustomer && !selectedWarehouse && (
        <div className="p-8 text-center text-muted-foreground text-sm">Select a Warehouse to view query performance.</div>
      )}

      {selectedCustomer && selectedWarehouse && timeseriesError && <SectionError error={timeseriesError} />}

      {selectedCustomer && selectedWarehouse && !histogramLoading && histogramError && <SectionError error={histogramError} />}

      {selectedCustomer && selectedWarehouse && !dataScannedHistogramLoading && dataScannedHistogramError && (
        <SectionError error={dataScannedHistogramError} />
      )}

      {selectedCustomer && selectedWarehouse && !spillageHistogramLoading && spillageHistogramError && (
        <SectionError error={spillageHistogramError} />
      )}

      {selectedCustomer && selectedWarehouse && !compileTimeHistogramLoading && compileTimeHistogramError && (
        <SectionError error={compileTimeHistogramError} />
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
            dataScannedHistogramBuckets={dataScannedHistogramBuckets}
            spillageHistogramBuckets={spillageHistogramBuckets}
            compileTimeHistogramBuckets={compileTimeHistogramBuckets}
            loading={loading}
            histogramLoading={histogramLoading}
            dataScannedHistogramLoading={dataScannedHistogramLoading}
            spillageHistogramLoading={spillageHistogramLoading}
            compileTimeHistogramLoading={compileTimeHistogramLoading}
          />

          <ChartWrapper
            title="Cluster Activity"
            isLight={isLight}
            totals={SHOW_WAREHOUSE_ACTIVITY_METRIC ? totalsClusterActivity : undefined}
            loading={clusterActivityLoading}
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
                rangeStart={`${startDate}T00:00:00.000`}
                rangeEnd={`${endDate}T23:59:59.000`}
              />
            )}
          </ChartWrapper>

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
    </div>
  )
}
