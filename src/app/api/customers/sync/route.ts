import { NextResponse } from 'next/server'
import { syncCustomers } from '@/lib/sync-customers'

export async function POST() {
  try {
    const log = await syncCustomers()
    return NextResponse.json(log)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ steps: [], added: 0, updated: 0, error: message }, { status: 500 })
  }
}
