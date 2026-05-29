'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Customer, ContractType, Module } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncLog {
  steps: string[]
  added: number
  updated: number
  error?: string
}

type SortKey = keyof Customer
type SortDir = 'asc' | 'desc'

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTRACT_TYPES: ContractType[] = ['trial', 'lost_trial', 'subscription', 'consumption', 'churn', 'internal']
const MODULES: { value: Module; label: string }[] = [
  { value: 'kwo-databricks', label: 'KWO Databricks' },
  { value: 'kwo-snowflake', label: 'KWO Snowflake' },
]

const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  trial: 'Trial',
  lost_trial: 'Lost Trial',
  subscription: 'Subscription',
  consumption: 'Consumption',
  churn: 'Churn',
  internal: 'Internal',
}

const CONTRACT_TYPE_CLASSES: Record<ContractType, string> = {
  trial: 'bg-primary/10 text-primary dark:bg-primary/20',
  lost_trial: 'bg-muted text-muted-foreground',
  subscription: 'bg-success/10 text-success dark:bg-success/20',
  consumption: 'bg-secondary text-secondary-foreground',
  churn: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
  internal: 'bg-accent/10 text-accent-foreground dark:bg-accent/20',
}

const MODULE_LABELS: Record<string, string> = {
  'kwo-databricks': 'Databricks',
  'kwo-snowflake': 'Snowflake',
}

const SOURCE_LABELS: Record<string, string> = {
  'subscript': 'Subscript',
  'bigquery:trial': 'BigQuery trial',
  'bigquery:pre-subscript': 'BigQuery pre-subscription',
  'bigquery:post-subscript': 'BigQuery post-subscription',
  'bigquery:gap-fill': 'BigQuery gap fill',
}

const EMPTY_FORM: Omit<Customer, never> = {
  org_id: '',
  name: '',
  module: 'kwo-databricks',
  valid_from: '',
  valid_to: null,
  contract_type: 'trial',
}

// ─── Components ───────────────────────────────────────────────────────────────

function ContractBadge({ type }: { type: ContractType }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', CONTRACT_TYPE_CLASSES[type])}>
      {CONTRACT_TYPE_LABELS[type]}
    </span>
  )
}

function ModuleBadge({ module }: { module: Module }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
      {MODULE_LABELS[module] ?? module}
    </span>
  )
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/30'
      )}
    >
      {children}
    </button>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  title: string
  onClose: () => void
  onSave: (data: Partial<Customer>) => Promise<void>
  initial: Partial<Customer>
  isNew?: boolean
}

function CustomerModal({ title, onClose, onSave, initial, isNew }: ModalProps) {
  const [form, setForm] = useState<Partial<Customer>>({ ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof Customer>(key: K, val: Customer[K]) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  async function handleSave() {
    if (!form.valid_from) { setError('Valid From is required'); return }
    if (!form.contract_type) { setError('Contract Type is required'); return }
    if (isNew && (!form.org_id?.trim() || !form.name?.trim() || !form.module)) {
      setError('Org ID, Name, and Module are required'); return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(form)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {isNew && (
            <>
              <Field label="Org ID">
                <input
                  className={inputCls}
                  value={form.org_id ?? ''}
                  onChange={(e) => set('org_id', e.target.value)}
                  placeholder="e.g. ac934"
                />
              </Field>
              <Field label="Name">
                <input
                  className={inputCls}
                  value={form.name ?? ''}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Customer name"
                />
              </Field>
              <Field label="Module">
                <select className={inputCls} value={form.module ?? 'kwo-databricks'} onChange={(e) => set('module', e.target.value as Module)}>
                  {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
            </>
          )}
          {!isNew && (
            <Field label="Name">
              <input
                className={inputCls}
                value={form.name ?? ''}
                onChange={(e) => set('name', e.target.value)}
              />
            </Field>
          )}
          <Field label="Contract Type">
            <select className={inputCls} value={form.contract_type ?? 'trial'} onChange={(e) => set('contract_type', e.target.value as ContractType)}>
              {CONTRACT_TYPES.map((t) => <option key={t} value={t}>{CONTRACT_TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
          <Field label="Valid From">
            <input
              type="date"
              className={inputCls}
              value={form.valid_from ?? ''}
              onChange={(e) => set('valid_from', e.target.value)}
            />
          </Field>
          <Field label="Valid To">
            <div className="flex items-center gap-2">
              <input
                type="date"
                className={cn(inputCls, 'flex-1')}
                value={form.valid_to ?? ''}
                onChange={(e) => set('valid_to', e.target.value || null)}
              />
              {form.valid_to && (
                <button onClick={() => set('valid_to', null)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Leave blank for active/open-ended contracts</p>
          </Field>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState<Set<Module>>(new Set())
  const [contractFilter, setContractFilter] = useState<Set<ContractType>>(new Set())
  const [filterDate, setFilterDate] = useState('')

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Modals
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  // Sync
  const [syncing, setSyncing] = useState(false)
  const [syncLog, setSyncLog] = useState<SyncLog | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/customers', { cache: 'no-store' })
      if (!res.ok) throw new Error(await res.text())
      setCustomers(await res.json())
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Filtering + sorting ──────────────────────────────────────────────────────

  const filtered = customers
    .map((c, i) => ({ ...c, _idx: i }))
    .filter((c) => {
      if (moduleFilter.size > 0 && !moduleFilter.has(c.module)) return false
      if (contractFilter.size > 0) {
        if (filterDate) {
          // Date-aware: customer must have been the selected contract type on this date
          const inRange = c.valid_from <= filterDate && (c.valid_to === null || c.valid_to >= filterDate)
          if (!inRange || !contractFilter.has(c.contract_type)) return false
        } else {
          if (!contractFilter.has(c.contract_type)) return false
        }
      } else if (filterDate) {
        // Date without contract filter: show all rows active on that date
        if (!(c.valid_from <= filterDate && (c.valid_to === null || c.valid_to >= filterDate))) return false
      }
      if (search) {
        const q = search.toLowerCase()
        if (!c.name.toLowerCase().includes(q) && !c.org_id.toLowerCase().includes(q)) return false
      }
      return true
    })
    .sort((a, b) => {
      const av = a[sortKey as keyof Customer] ?? ''
      const bv = b[sortKey as keyof Customer] ?? ''
      const cmp = String(av).localeCompare(String(bv))
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp
      for (const tk of ['name', 'org_id', 'valid_from'] as SortKey[]) {
        if (tk === sortKey) continue
        const tc = String(a[tk] ?? '').localeCompare(String(b[tk] ?? ''))
        if (tc !== 0) return tc
      }
      return 0
    })

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  function toggleModule(m: Module) {
    setModuleFilter((s) => { const n = new Set(s); n.has(m) ? n.delete(m) : n.add(m); return n })
  }

  function toggleContract(c: ContractType) {
    setContractFilter((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n })
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleEdit(idx: number, data: Partial<Customer>) {
    const res = await fetch(`/api/customers/${idx}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(await res.text())
    await load()
  }

  async function handleDelete(idx: number) {
    if (!confirm('Delete this row?')) return
    const res = await fetch(`/api/customers/${idx}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    await load()
  }

  async function handleAdd(data: Partial<Customer>) {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(await res.text())
    await load()
  }

  async function handleSync() {
    setSyncing(true)
    setSyncLog(null)
    try {
      const res = await fetch('/api/customers/sync', { method: 'POST' })
      const log: SyncLog = await res.json()
      setSyncLog(log)
      if (!log.error) await load()
    } catch (e) {
      setSyncLog({ steps: [], added: 0, updated: 0, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setSyncing(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const editCustomer = editIdx !== null ? customers[editIdx] : null

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground font-heading">Customers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Loading…' : `${customers.length} rows`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddModal(true)}>
            <Plus size={14} />
            Add Row
          </Button>
          <Button size="sm" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw size={14} />}
            {syncing ? 'Syncing…' : 'Sync'}
          </Button>
        </div>
      </div>

      {/* Sync status panel */}
      {syncLog && (
        <div className={cn(
          'rounded-lg border p-4 text-sm flex flex-col gap-2',
          syncLog.error
            ? 'border-destructive/30 bg-destructive/5'
            : 'border-border bg-card'
        )}>
          <div className="flex items-center justify-between">
            <span className={cn('font-medium', syncLog.error ? 'text-destructive' : 'text-foreground')}>
              {syncLog.error ? 'Sync failed' : `Sync complete — ${syncLog.added} added, ${syncLog.updated} updated`}
            </span>
            <button onClick={() => setSyncLog(null)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={14} />
            </button>
          </div>
          {syncLog.error && (
            <p className="text-destructive/80 text-xs">{syncLog.error}</p>
          )}
          {syncLog.steps.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {syncLog.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search name or org ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors w-52"
        />
        <div className="flex items-center gap-1.5">
          {MODULES.map((m) => (
            <FilterPill key={m.value} active={moduleFilter.has(m.value)} onClick={() => toggleModule(m.value)}>
              {m.label}
            </FilterPill>
          ))}
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-1.5">
          {CONTRACT_TYPES.map((t) => (
            <FilterPill key={t} active={contractFilter.has(t)} onClick={() => toggleContract(t)}>
              {CONTRACT_TYPE_LABELS[t]}
            </FilterPill>
          ))}
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">As of</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
          />
          {filterDate && (
            <button onClick={() => setFilterDate('')} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={13} />
            </button>
          )}
        </div>
        {(moduleFilter.size > 0 || contractFilter.size > 0 || search || filterDate) && (
          <button
            onClick={() => { setModuleFilter(new Set()); setContractFilter(new Set()); setSearch(''); setFilterDate('') }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loadError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : (
        <div className="bg-white dark:bg-card rounded-[20px] shadow-[0px_5px_15px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-0">
              <thead>
                <tr style={{ height: 48 }}>
                  {([
                    { key: 'name', label: 'Customer' },
                    { key: 'module', label: 'Module' },
                    { key: 'contract_type', label: 'Contract Type' },
                    { key: 'valid_from', label: 'Valid From' },
                    { key: 'valid_to', label: 'Valid To' },
                    { key: 'source', label: 'Source' },
                  ] as { key: SortKey; label: string }[]).map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin inline-block" />
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No rows match the current filters
                    </td>
                  </tr>
                )}
                {!loading && filtered.map((c, i) => (
                  <tr
                    key={c._idx}
                    style={{ height: 52 }}
                    className={cn(
                      'transition-colors group',
                      i % 2 === 0
                        ? 'bg-[#F5F5F5] dark:bg-secondary/40'
                        : 'bg-white dark:bg-transparent hover:bg-[#F5F5F5]/60 dark:hover:bg-secondary/20'
                    )}
                  >
                    <td className="px-4 text-sm rounded-l-[5px]">
                      <div className="font-medium text-foreground leading-tight">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.org_id}</div>
                    </td>
                    <td className="px-4">
                      <ModuleBadge module={c.module} />
                    </td>
                    <td className="px-4">
                      <ContractBadge type={c.contract_type} />
                    </td>
                    <td className="px-4 text-sm text-foreground tabular-nums">{c.valid_from}</td>
                    <td className="px-4 text-sm text-foreground tabular-nums">{c.valid_to ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 text-sm text-foreground">
                      {c.source && SOURCE_LABELS[c.source] ? SOURCE_LABELS[c.source] : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 rounded-r-[5px]">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditIdx(c._idx)}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(c._idx)}
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
            {filtered.length} of {customers.length} rows
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editCustomer && editIdx !== null && (
        <CustomerModal
          title="Edit Row"
          initial={editCustomer}
          onClose={() => setEditIdx(null)}
          onSave={(data) => handleEdit(editIdx, data)}
        />
      )}

      {/* Add modal */}
      {showAddModal && (
        <CustomerModal
          title="Add Row"
          initial={EMPTY_FORM}
          onClose={() => setShowAddModal(false)}
          onSave={handleAdd}
          isNew
        />
      )}
    </div>
  )
}
