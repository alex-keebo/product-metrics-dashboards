const BASE_URL = 'https://api.subscript.com/v1'

export interface SubscriptCustomer {
  id: string
  name: string
  metadata: {
    org_id?: string
    product?: string
  }
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface SubscriptUsageSubscription {
  id: string
  customer_id: string
  start_date: string
  end_date: string | null
  pricing_plan_id: string
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface SubscriptPricingPlan {
  id: string
  name: string
  event_name: string
}

interface PaginatedResponse<T> {
  data: T[]
  metadata: {
    totalCount: number
    maxPage: number
    hasMore: boolean
    currentPage: number
  }
}

function apiKey(): string {
  const key = process.env.SUBSCRIPT_API_KEY
  if (!key) throw new Error('SUBSCRIPT_API_KEY is not set')
  return key
}

function authHeaders(): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    api_key: apiKey(),
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Subscript API ${res.status} at ${path}: ${body}`)
  }
  return res.json() as Promise<T>
}

export async function getAllCustomers(): Promise<SubscriptCustomer[]> {
  const PAGE_SIZE = 1000
  const customers: SubscriptCustomer[] = []
  let page = 1

  while (true) {
    console.log(`[subscript] fetching customers page ${page}…`)
    const res = await getJson<PaginatedResponse<SubscriptCustomer>>(
      `/customers?limit=${PAGE_SIZE}&page=${page}`
    )
    console.log(`[subscript] customers page ${page}: got ${res.data.length} records`)
    customers.push(...res.data)
    if (res.data.length < PAGE_SIZE) break
    page++
  }

  return customers
}

// Fetches ALL usage subscriptions across all customers (Subscript does not support
// server-side filtering by customer — filter client-side after fetching).
export async function getAllUsageSubscriptions(): Promise<SubscriptUsageSubscription[]> {
  const subscriptions: SubscriptUsageSubscription[] = []
  let page = 1

  while (true) {
    const res = await getJson<PaginatedResponse<SubscriptUsageSubscription>>(
      `/usage-subscriptions?pagination[limit]=100&pagination[page]=${page}`
    )
    subscriptions.push(...res.data)
    if (!res.metadata.hasMore) break
    page++
  }

  return subscriptions
}

export async function getPricingPlans(): Promise<SubscriptPricingPlan[]> {
  const res = await getJson<PaginatedResponse<SubscriptPricingPlan>>('/pricing-plans')
  return res.data
}

export async function getPricingPlan(id: string): Promise<SubscriptPricingPlan> {
  return getJson<SubscriptPricingPlan>(`/pricing-plans/${id}`)
}
