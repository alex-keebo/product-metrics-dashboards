import { spawn, ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'

export type JobStatus = 'running' | 'success' | 'failed' | 'timeout'

export interface ReauthJob {
  id: string
  status: JobStatus
  started_at: number
  finished_at?: number
  stderr_tail?: string
  exit_code?: number | null
  child?: ChildProcess
  timeout_handle?: NodeJS.Timeout
}

const TIMEOUT_MS = 5 * 60 * 1000
const STDERR_TAIL_BYTES = 4000

const jobs = new Map<string, ReauthJob>()
let activeJobId: string | null = null

export function getJob(id: string): ReauthJob | undefined {
  return jobs.get(id)
}

export function getActiveJob(): ReauthJob | undefined {
  if (!activeJobId) return undefined
  const job = jobs.get(activeJobId)
  if (!job || job.status !== 'running') {
    activeJobId = null
    return undefined
  }
  return job
}

export function startReauthJob(): ReauthJob {
  const existing = getActiveJob()
  if (existing) return existing

  const id = randomUUID()
  const job: ReauthJob = {
    id,
    status: 'running',
    started_at: Date.now(),
  }
  jobs.set(id, job)
  activeJobId = id

  const child = spawn('gcloud', ['auth', 'application-default', 'login'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: process.env,
  })

  job.child = child
  let stderrBuf = ''

  child.stdout?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString('utf-8')
    if (stderrBuf.length > STDERR_TAIL_BYTES) stderrBuf = stderrBuf.slice(-STDERR_TAIL_BYTES)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString('utf-8')
    if (stderrBuf.length > STDERR_TAIL_BYTES) stderrBuf = stderrBuf.slice(-STDERR_TAIL_BYTES)
  })

  child.on('error', (err: Error) => {
    job.status = 'failed'
    job.finished_at = Date.now()
    job.stderr_tail = (stderrBuf + '\n' + err.message).trim().slice(-STDERR_TAIL_BYTES)
    if (job.timeout_handle) clearTimeout(job.timeout_handle)
    if (activeJobId === id) activeJobId = null
  })

  child.on('exit', (code) => {
    job.exit_code = code
    job.finished_at = Date.now()
    job.stderr_tail = stderrBuf.trim().slice(-STDERR_TAIL_BYTES)
    if (job.status === 'running') {
      job.status = code === 0 ? 'success' : 'failed'
    }
    if (job.timeout_handle) clearTimeout(job.timeout_handle)
    if (activeJobId === id) activeJobId = null
  })

  job.timeout_handle = setTimeout(() => {
    if (job.status === 'running') {
      job.status = 'timeout'
      job.finished_at = Date.now()
      try {
        child.kill('SIGTERM')
      } catch {
        // child already gone
      }
      if (activeJobId === id) activeJobId = null
    }
  }, TIMEOUT_MS)

  return job
}

export function serializeJob(job: ReauthJob) {
  return {
    id: job.id,
    status: job.status,
    started_at: job.started_at,
    finished_at: job.finished_at,
    stderr_tail: job.stderr_tail,
    exit_code: job.exit_code,
  }
}
