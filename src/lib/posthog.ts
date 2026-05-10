const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID!

export async function hogql(query: string): Promise<Record<string, unknown>[]> {
  const url = `https://us.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
    next: { revalidate: 3600 },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PostHog query failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as { results: unknown[][]; columns: string[] }
  return data.results.map((row) =>
    Object.fromEntries(data.columns.map((col, i) => [col, row[i]]))
  )
}
