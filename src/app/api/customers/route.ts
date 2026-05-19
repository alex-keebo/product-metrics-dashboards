import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { Customer } from '@/lib/types'

const CUSTOMERS_PATH = path.join(process.cwd(), 'data', 'customers.json')

function load(): Customer[] {
  return JSON.parse(fs.readFileSync(CUSTOMERS_PATH, 'utf-8')) as Customer[]
}

function save(customers: Customer[]): void {
  fs.writeFileSync(CUSTOMERS_PATH, JSON.stringify(customers, null, 2) + '\n', 'utf-8')
}

export async function GET() {
  try {
    return NextResponse.json(load())
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Add a new row
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Omit<Customer, never>
    if (!body.org_id || !body.module || !body.valid_from || !body.contract_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const customers = load()
    customers.push(body as Customer)
    save(customers)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
