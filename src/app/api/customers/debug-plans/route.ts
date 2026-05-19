import { NextResponse } from 'next/server'

export async function GET() {
  const key = process.env.SUBSCRIPT_API_KEY
  if (!key) return NextResponse.json({ error: 'SUBSCRIPT_API_KEY not set' }, { status: 500 })

  const res = await fetch('https://api.subscript.com/v1/pricing-plans', {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', api_key: key },
  })
  const raw = await res.json()
  return NextResponse.json(raw)
}
