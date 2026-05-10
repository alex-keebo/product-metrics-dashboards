import { BigQuery } from '@google-cloud/bigquery'
import { GoogleAuth } from 'google-auth-library'
import fs from 'fs'
import os from 'os'
import path from 'path'

const bigquery = new BigQuery({
  projectId: process.env.BIGQUERY_PROJECT_ID,
})

export const DATASET = process.env.BIGQUERY_DATASET ?? 'k3o_dbx_gold_tf'
export const BRONZE_DATASET = process.env.BIGQUERY_BRONZE_DATASET ?? 'k3o_dbx_bronze_tf'
export const SILVER_DATASET = process.env.BIGQUERY_SILVER_DATASET ?? 'k3o_dbx_silver_tf'
export const PROJECT = process.env.BIGQUERY_PROJECT_ID ?? 'keebo-portal'
export const LOCATION = process.env.BIGQUERY_LOCATION ?? 'us-central1'

export class AdcAuthError extends Error {
  code = 'ADC_UNAUTHENTICATED' as const
  constructor(message: string, public cause?: unknown) {
    super(message)
    this.name = 'AdcAuthError'
  }
}

const ADC_ERROR_PATTERNS = [
  /could not load the default credentials/i,
  /invalid_grant/i,
  /UNAUTHENTICATED/,
  /reauth(?:entication)? required/i,
  /request had invalid authentication credentials/i,
  /expected oauth 2 access token/i,
]

export function isAdcAuthError(err: unknown): boolean {
  if (!err) return false
  const msg = err instanceof Error ? err.message : String(err)
  if (ADC_ERROR_PATTERNS.some((re) => re.test(msg))) return true
  const code = (err as { code?: number | string })?.code
  if (code === 401 || code === '401') return true
  return false
}

export async function runQuery<T>(query: string, params: Record<string, unknown>): Promise<T[]> {
  try {
    const [rows] = await bigquery.query({
      query,
      params,
      location: LOCATION,
      types: {
        org_ids: ['STRING'],
      },
    })
    return rows as T[]
  } catch (err) {
    if (isAdcAuthError(err)) {
      throw new AdcAuthError(err instanceof Error ? err.message : String(err), err)
    }
    throw err
  }
}

let _orgIdsWithDataCache: Set<string> | null = null

export async function getOrgIdsWithData(): Promise<Set<string>> {
  if (_orgIdsWithDataCache) return _orgIdsWithDataCache
  try {
    const query = `SELECT DISTINCT org_id FROM \`${PROJECT}.${DATASET}.savings_history_tf\``
    const [rows] = await bigquery.query({ query, location: LOCATION })
    _orgIdsWithDataCache = new Set((rows as { org_id: string }[]).map((r) => r.org_id))
    return _orgIdsWithDataCache
  } catch (err) {
    if (isAdcAuthError(err)) {
      throw new AdcAuthError(err instanceof Error ? err.message : String(err), err)
    }
    throw err
  }
}

export async function getDataAsOf(): Promise<string> {
  try {
    const query = `
      SELECT FORMAT_DATE('%Y-%m-%d', MAX(date)) AS max_date
      FROM \`${PROJECT}.${DATASET}.savings_history_tf\`
    `
    const [rows] = await bigquery.query({ query, location: LOCATION })
    return (rows[0] as { max_date: string }).max_date
  } catch (err) {
    if (isAdcAuthError(err)) {
      throw new AdcAuthError(err instanceof Error ? err.message : String(err), err)
    }
    throw err
  }
}

export type AdcStatus =
  | { state: 'valid'; type: 'authorized_user' | 'service_account'; expires_at?: string }
  | { state: 'expired'; type: 'authorized_user' | 'service_account'; reason: string }
  | { state: 'missing'; reason: string }
  | { state: 'service_account'; source: 'env' | 'adc_file'; reason: string }
  | { state: 'error'; reason: string }

interface AdcFileShape {
  type?: string
  client_id?: string
  client_secret?: string
  refresh_token?: string
}

function adcFilePath(): string {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json')
  }
  return path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json')
}

function readAdcFile(): { path: string; data: AdcFileShape } | null {
  const p = adcFilePath()
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    return { path: p, data: JSON.parse(raw) as AdcFileShape }
  } catch {
    return null
  }
}

export async function getAdcStatus(): Promise<AdcStatus> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const file = readAdcFile()
    const fileType = file?.data.type
    if (fileType === 'service_account') {
      return {
        state: 'service_account',
        source: 'env',
        reason: `GOOGLE_APPLICATION_CREDENTIALS points to a service account key. Re-authenticate by rotating the key in GCP IAM, not here.`,
      }
    }
  }

  const file = readAdcFile()
  if (!file) {
    return {
      state: 'missing',
      reason: 'No Application Default Credentials found. Run `gcloud auth application-default login` to set them up.',
    }
  }
  if (file.data.type === 'service_account') {
    return {
      state: 'service_account',
      source: 'adc_file',
      reason: 'ADC is configured with a service account. Re-authenticate by rotating the key in GCP IAM, not here.',
    }
  }

  try {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
    const client = await auth.getClient()
    const token = await client.getAccessToken()
    if (!token || !token.token) {
      return { state: 'expired', type: 'authorized_user', reason: 'Could not obtain an access token.' }
    }
    const expiry = (client as unknown as { credentials?: { expiry_date?: number } }).credentials?.expiry_date
    return {
      state: 'valid',
      type: file.data.type === 'service_account' ? 'service_account' : 'authorized_user',
      expires_at: expiry ? new Date(expiry).toISOString() : undefined,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (isAdcAuthError(err)) {
      return { state: 'expired', type: 'authorized_user', reason: msg }
    }
    return { state: 'error', reason: msg }
  }
}
