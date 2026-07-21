'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTheme } from './ThemeProvider'
import { Moon, Sun, Settings as SettingsIcon } from 'lucide-react'

const nav = [
  {
    group: 'Warehouse Optimization',
    items: [
      { label: 'KWO for Databricks', href: '/kwo-databricks' },
      { label: 'KWO for Snowflake', href: '/kwo-snowflake' },
      { label: 'Snowflake Warehouse Analysis', href: '/kwo-snowflake-warehouse-analysis' },
    ],
  },
  {
    group: 'UI Usage Telemetry',
    items: [
      { label: 'Platform Usage', href: '/platform-usage' },
      { label: 'Feature Analytics', href: '/feature-analytics' },
    ],
  },
  {
    group: 'Product Planning',
    items: [
      { label: 'PM Board', href: '/product-planning/pm-board' },
      { label: 'Delivery Timeline', href: '/product-planning/delivery-timeline' },
    ],
  },
  {
    group: 'Platform',
    items: [
      { label: 'Customers', href: '/platform/customers' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()

  return (
    <aside
      className="h-full bg-sidebar border-r border-sidebar-border flex flex-col py-6 px-3 shrink-0"
      style={{ width: 266 }}
    >
      <div className="text-sidebar-foreground font-semibold text-sm px-3 mb-6 tracking-wide font-heading">KEEBO</div>
      <nav className="flex flex-col gap-6 flex-1 overflow-y-auto">
        {nav.map((section) => (
          <div key={section.group}>
            <div className="text-sidebar-foreground/50 text-xs font-medium tracking-wider px-3 mb-1">
              {section.group}
            </div>
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'block px-3 py-1.5 rounded text-sm transition-colors',
                  pathname === item.href
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60'
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border pt-4 mt-4 flex flex-col gap-0.5">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-2 w-full px-3 py-1.5 rounded text-sm transition-colors',
            pathname === '/settings'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
              : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
          )}
        >
          <SettingsIcon size={15} />
          Settings
        </Link>
        <button
          onClick={toggle}
          className="flex items-center gap-2 w-full px-3 py-1.5 rounded text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </aside>
  )
}
