'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQueryVolumeSetting } from '@/lib/settings'

type AdcStatus =
  | { state: 'valid'; type: 'authorized_user' | 'service_account'; expires_at?: string }
  | { state: 'expired'; type: 'authorized_user' | 'service_account'; reason: string }
  | { state: 'missing'; reason: string }
  | { state: 'service_account'; source: 'env' | 'adc_file'; reason: string }
  | { state: 'error'; reason: string }

interface StatusResponse {
  adc: AdcStatus
  gcloud_available: boolean
  can_reauthenticate: boolean
}

type JobStatus = 'running' | 'success' | 'failed' | 'timeout'

interface JobResponse {
  id: string
  status: JobStatus
  started_at: number
  finished_at?: number
  stderr_tail?: string
  exit_code?: number | null
}

const POLL_INTERVAL_MS = 1500

function StatusIcon({ status }: { status: AdcStatus }) {
  if (status.state === 'valid') return <CheckCircle2 className="size-5 text-emerald-500" />
  if (status.state === 'service_account') return <AlertCircle className="size-5 text-amber-500" />
  return <XCircle className="size-5 text-destructive" />
}

function statusLine(status: AdcStatus): string {
  switch (status.state) {
    case 'valid':
      return status.type === 'service_account'
        ? 'Authenticated (service account)'
        : `Authenticated${status.expires_at ? ` — token valid until ${new Date(status.expires_at).toLocaleTimeString()}` : ''}`
    case 'expired':
      return 'Credentials expired'
    case 'missing':
      return 'Not authenticated'
    case 'service_account':
      return 'Service account credentials'
    case 'error':
      return 'Could not check credentials'
  }
}

export default function SettingsPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [job, setJob] = useState<JobResponse | null>(null)
  const [starting, setStarting] = useState(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true)
    setStatusError(null)
    try {
      const res = await fetch('/api/settings/status', { cache: 'no-store' })
      if (!res.ok) throw new Error(await res.text())
      setStatus(await res.json())
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : String(e))
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const pollJob = useCallback(
    (jobId: string) => {
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/settings/reauthenticate/${jobId}`, { cache: 'no-store' })
          if (!res.ok) {
            stopPolling()
            return
          }
          const data: JobResponse = await res.json()
          setJob(data)
          if (data.status !== 'running') {
            stopPolling()
            fetchStatus()
          }
        } catch {
          // transient — keep polling
        }
      }, POLL_INTERVAL_MS)
    },
    [stopPolling, fetchStatus],
  )

  const startReauth = useCallback(async () => {
    setStarting(true)
    setJob(null)
    try {
      const res = await fetch('/api/settings/reauthenticate', { method: 'POST' })
      const data: JobResponse | { error: string } = await res.json()
      if (!res.ok || !('id' in data)) {
        setJob({
          id: 'error',
          status: 'failed',
          started_at: Date.now(),
          finished_at: Date.now(),
          stderr_tail: 'error' in data ? data.error : 'Failed to start',
        })
        return
      }
      setJob(data)
      if (data.status === 'running') pollJob(data.id)
      else fetchStatus()
    } catch (e) {
      setJob({
        id: 'error',
        status: 'failed',
        started_at: Date.now(),
        finished_at: Date.now(),
        stderr_tail: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setStarting(false)
    }
  }, [pollJob, fetchStatus])

  const { enabled: queryVolumeEnabled, setEnabled: setQueryVolumeEnabled } = useQueryVolumeSetting()

  const adc = status?.adc
  const isRunning = job?.status === 'running' || starting

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground font-heading">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">App-level settings and admin actions.</p>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Data Collection</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Controls which optional (expensive) queries run when loading dashboards.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-foreground">Query Volume (KWO for Snowflake)</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Counts queries run through Keebo-managed warehouses per period. Disabled by default — can significantly slow down Time Series loads.
            </div>
          </div>
          <button
            role="switch"
            aria-checked={queryVolumeEnabled}
            onClick={() => setQueryVolumeEnabled(!queryVolumeEnabled)}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
              queryVolumeEnabled ? 'bg-primary' : 'bg-muted-foreground/30',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm transition-transform',
                queryVolumeEnabled ? 'translate-x-4' : 'translate-x-0',
              )}
            />
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Authentication</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Google Cloud Application Default Credentials used by BigQuery.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchStatus} disabled={statusLoading}>
            <RefreshCw className={cn('size-3.5', statusLoading && 'animate-spin')} />
            Re-check
          </Button>
        </div>

        {statusLoading && !status ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="size-4 animate-spin" />
            Checking credentials…
          </div>
        ) : statusError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {statusError}
          </div>
        ) : adc ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <StatusIcon status={adc} />
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{statusLine(adc)}</div>
                {adc.state !== 'valid' && (
                  <div className="text-xs text-muted-foreground mt-0.5">{adc.reason}</div>
                )}
              </div>
            </div>

            {!status?.gcloud_available && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <code>gcloud</code> CLI not found on PATH. Install it (e.g.{' '}
                <code>brew install --cask google-cloud-sdk</code>) to re-authenticate from here.
              </div>
            )}

            {status?.can_reauthenticate && (
              <div className="flex flex-col gap-2 pt-1">
                <div>
                  <Button onClick={startReauth} disabled={isRunning}>
                    {isRunning ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Waiting for browser…
                      </>
                    ) : (
                      'Re-authenticate with Google Cloud'
                    )}
                  </Button>
                </div>

                {job && (
                  <div className="text-xs text-muted-foreground">
                    {job.status === 'running' && (
                      <span>
                        A browser tab should have opened — complete the Google sign-in there. This
                        may take up to 5 minutes.
                      </span>
                    )}
                    {job.status === 'success' && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Re-authentication succeeded.
                      </span>
                    )}
                    {(job.status === 'failed' || job.status === 'timeout') && (
                      <div className="flex flex-col gap-1">
                        <span className="text-destructive">
                          Re-authentication {job.status === 'timeout' ? 'timed out' : 'failed'}
                          {typeof job.exit_code === 'number' ? ` (exit ${job.exit_code})` : ''}.
                        </span>
                        {job.stderr_tail && (
                          <pre className="rounded bg-muted px-2 py-1 text-[11px] whitespace-pre-wrap break-words max-h-40 overflow-auto">
                            {job.stderr_tail}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  )
}
