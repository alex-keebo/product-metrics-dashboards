import { BigQuery } from '@google-cloud/bigquery'

const bigquery = new BigQuery({
  projectId: process.env.BIGQUERY_PROJECT_ID,
})

export const DATASET = process.env.BIGQUERY_DATASET ?? 'k3o_dbx_gold_tf'
export const BRONZE_DATASET = process.env.BIGQUERY_BRONZE_DATASET ?? 'k3o_dbx_bronze_tf'
export const PROJECT = process.env.BIGQUERY_PROJECT_ID ?? 'keebo-portal'
export const LOCATION = process.env.BIGQUERY_LOCATION ?? 'us-central1'

export async function runQuery<T>(query: string, params: Record<string, unknown>): Promise<T[]> {
  const [rows] = await bigquery.query({
    query,
    params,
    location: LOCATION,
    types: {
      org_ids: ['STRING'],
    },
  })
  return rows as T[]
}

let _orgIdsWithDataCache: Set<string> | null = null

export async function getOrgIdsWithData(): Promise<Set<string>> {
  if (_orgIdsWithDataCache) return _orgIdsWithDataCache
  const query = `SELECT DISTINCT org_id FROM \`${PROJECT}.${DATASET}.savings_history_tf\``
  const [rows] = await bigquery.query({ query, location: LOCATION })
  _orgIdsWithDataCache = new Set((rows as { org_id: string }[]).map((r) => r.org_id))
  return _orgIdsWithDataCache
}

export async function getDataAsOf(): Promise<string> {
  const query = `
    SELECT FORMAT_DATE('%Y-%m-%d', MAX(date)) AS max_date
    FROM \`${PROJECT}.${DATASET}.savings_history_tf\`
  `
  const [rows] = await bigquery.query({ query, location: LOCATION })
  return (rows[0] as { max_date: string }).max_date
}
