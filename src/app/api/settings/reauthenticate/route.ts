import { NextResponse } from 'next/server'
import { startReauthJob, serializeJob } from '@/lib/reauth-jobs'

export async function POST() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return NextResponse.json(
      {
        error:
          'GOOGLE_APPLICATION_CREDENTIALS is set; refusing to overwrite a service-account-based ADC with user OAuth.',
      },
      { status: 409 },
    )
  }
  const job = startReauthJob()
  return NextResponse.json(serializeJob(job))
}
