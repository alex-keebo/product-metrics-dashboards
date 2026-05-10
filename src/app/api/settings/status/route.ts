import { NextResponse } from 'next/server'
import { getAdcStatus } from '@/lib/bigquery'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

async function hasGcloud(): Promise<boolean> {
  try {
    await execFileAsync(process.platform === 'win32' ? 'where' : 'which', ['gcloud'])
    return true
  } catch {
    return false
  }
}

export async function GET() {
  const [adc, gcloud] = await Promise.all([getAdcStatus(), hasGcloud()])
  const canReauthenticate =
    gcloud &&
    !process.env.GOOGLE_APPLICATION_CREDENTIALS &&
    (adc.state === 'valid' || adc.state === 'expired' || adc.state === 'missing') &&
    !(adc.state === 'valid' && adc.type === 'service_account')

  return NextResponse.json({
    adc,
    gcloud_available: gcloud,
    can_reauthenticate: canReauthenticate,
  })
}
