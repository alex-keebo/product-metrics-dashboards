import { NextRequest, NextResponse } from 'next/server'
import { getJob, serializeJob } from '@/lib/reauth-jobs'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params
  const job = getJob(jobId)
  if (!job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }
  return NextResponse.json(serializeJob(job))
}
