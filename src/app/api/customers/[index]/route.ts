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

// Update editable fields on a row (valid_from, valid_to, contract_type only)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ index: string }> }) {
  try {
    const { index } = await params
    const idx = parseInt(index, 10)
    const customers = load()

    if (isNaN(idx) || idx < 0 || idx >= customers.length) {
      return NextResponse.json({ error: 'Invalid index' }, { status: 400 })
    }

    const body = (await req.json()) as Partial<Pick<Customer, 'valid_from' | 'valid_to' | 'contract_type' | 'name'>>
    const current = customers[idx]

    customers[idx] = {
      ...current,
      ...(body.valid_from !== undefined && { valid_from: body.valid_from }),
      ...(body.valid_to !== undefined && { valid_to: body.valid_to }),
      ...(body.contract_type !== undefined && { contract_type: body.contract_type }),
      ...(body.name !== undefined && { name: body.name }),
    }

    save(customers)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ index: string }> }) {
  try {
    const { index } = await params
    const idx = parseInt(index, 10)
    const customers = load()

    if (isNaN(idx) || idx < 0 || idx >= customers.length) {
      return NextResponse.json({ error: 'Invalid index' }, { status: 400 })
    }

    customers.splice(idx, 1)
    save(customers)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
