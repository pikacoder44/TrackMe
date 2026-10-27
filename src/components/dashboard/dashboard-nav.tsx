'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavLinkItem {
  href: string
  label: string
}

interface DashboardNavProps {
  userRole?: string
}

export function DashboardNav({ userRole }: DashboardNavProps) {
  const pathname = usePathname()

  const links: NavLinkItem[] = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/timesheets', label: 'Timesheets' },
    { href: '/dashboard/analytics', label: 'Analytics' },
  ]

  if (userRole && ['owner', 'admin', 'manager'].includes(userRole)) {
    links.push({ href: '/dashboard/approvals', label: 'Approvals' })
  }

  return (
    <nav className="space-y-1 text-sm font-medium">
      {links.map((link) => {
        const isActive =
          link.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(link.href)

        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch={true}
            className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              isActive
                ? 'bg-muted text-foreground font-semibold'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
