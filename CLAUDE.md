# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication Style
- Use the `caveman` skill by default for all responses in this repo (ultra-compressed, token-efficient communication).

## Token Economy
- Never re-read a file just edited/written by Edit/Write to "confirm" the change — the tool errors on failure and the harness tracks current file state. Trust the result.
- Before a full-file Read, check if you already have the needed content in context from earlier this session; only re-read if the file may have changed outside your own edits.
- Prefer `grep`/Explore-agent lookups over a full Read when you only need to confirm a symbol/string exists or find its location.
- For large files, use Read's `offset`/`limit` to pull only the section you need instead of the whole file.
- When dispatching subagents, pass along relevant file excerpts already in context instead of telling the agent to go re-read the same file from scratch.
- Prefer fewer, longer-lived sessions over many short ones on the same feature — each new session pays a full re-read cost for files touched in prior sessions.

## Workflow Orchestration

### 1. Plan Mode Default
- Brainstorm, grill me, and enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 4. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 5. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: After ANY correction from the user, or catching yourself making a mistake, add the pattern and a rule to prevent recurrence under `## Lessons` below (see Self-learning) — not a separate file, so it's always loaded into context.

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **Reuse Existing Components**: Always use existing components (charts, tables, KPIs, dropdowns, filters, etc.) instead of building parallel one-off implementations. Before writing a new chart/table/KPI/dropdown, search for an existing one that fits. If none exists, STOP and ask the user for confirmation before creating a new component — never create new UI components silently.

## Design System

All colors must come from the Keebo palette (mapped to CSS variables in `src/app/globals.css`) — **never introduce colors not in this palette, and never hardcode hex values in component files.** Full palette reference: [docs/design-system.md](docs/design-system.md).

## Project Overview

This is a **product metrics dashboard** for Keebo's internal use. It aggregates KPIs from BigQuery and PostHog into a single web application with multiple dashboards across Keebo's product lines.

### Dashboards

1. **KWO for Snowflake** — Keebo Warehouse Optimization metrics for the Snowflake product
2. **KWO for Databricks** — Keebo Warehouse Optimization metrics for the Databricks product
3. **PostHog dashboards** — Multiple views of PostHog product analytics data

### Data Sources

- **BigQuery** — primary store for product KPIs; all warehouse optimization metrics are queried from here. Project/table/schema reference for both KWO products: [docs/bigquery-schema.md](docs/bigquery-schema.md)
- **PostHog** — product analytics; accessed via the PostHog REST API (no BigQuery export)

## Tech Stack (to be finalized)

Stack decisions have not been made yet. When implementing, prefer:
- A framework with good BigQuery client support (e.g. Next.js + Node, or Python/FastAPI backend)
- Environment variables for all credentials (`GOOGLE_APPLICATION_CREDENTIALS` or `BIGQUERY_SERVICE_ACCOUNT_JSON`, `POSTHOG_API_KEY`, etc.)
- No credentials committed to the repo

## Development Setup

```bash
# First-time setup
gcloud auth application-default login
cp .env.local.example .env.local   # values are already correct for keebo-portal

# Run locally
npm run dev        # starts at http://localhost:4000

# Type check
npx tsc --noEmit

# Lint
npm run lint
```

## KWO for Databricks Dashboard — Spec

Full detailed specification (filters, KPIs, layout, tech stack) in [docs/design_specs.md](docs/design_specs.md). BigQuery tables and KPI query logic in [docs/bigquery-schema.md](docs/bigquery-schema.md).

Customer contract data lives in `data/customers.json` (not BigQuery) — see the `customers.json` schema in [docs/design_specs.md](docs/design_specs.md) for the record format and contract-type transition rules.

### Architecture Notes

- Backend should abstract data fetching behind a thin API layer so dashboards are not tightly coupled to BigQuery query logic
- Each dashboard should be a self-contained module/route with its own data-fetching and visualization components
- PostHog data is fetched via the PostHog REST API — there is no BigQuery export

## Self-learning
When I correct you, or you catch yourself making a mistake: before continuing,
add the lesson as a one-line rule under ## Lessons, so it never happens again.

## Lessons
- BigQuery `NUMERIC`/`BIGNUMERIC` columns (e.g. `CREDITS_USED` on `warehouse_metering_history_tf`) come back from `@google-cloud/bigquery` as non-plain-number wrapper objects (only `.toString()`/`.toJSON()`, no safe `.valueOf()`) — always wrap with `Number(...)` in API routes before returning, or they serialize as strings and silently break downstream arithmetic (NaN totals). Confirm column type via `bq show --format=prettyjson` rather than assuming — `INTEGER`/`INT64` columns return plain numbers and don't need this.
- Recharts `<Line>` elements default to `isAnimationActive={true}`, which animates the stroke path length computed at mount; if `ResponsiveContainer` resizes shortly after (layout settling, scrollbar appearing), the stroke stays at the stale shorter length while dots (rendered independently, unaffected) still show at every data point — this looks like "line renders fine for part of the range then breaks into disconnected dots." Fix: `isAnimationActive={false}` on the `<Line>`. Apply to any new multi-series line chart in this codebase.
- Jira Product Discovery "interval" fields (schema `jira.polaris:interval`, e.g. `customfield_10063`/`10062`/`10892` — target/actual delivery & start dates) silently return zero results with JQL relational operators (`>=`, `<=`, date functions); only `is EMPTY`/`is not EMPTY` work reliably. Filter date ranges in application code after fetching, not in JQL.
