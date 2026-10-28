'use client'

import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Clock, Activity, Coffee, TrendingUp, Monitor } from 'lucide-react'

export interface AppUsageEntry {
  app: string
  category: string
  productivity: 'Productive' | 'Neutral' | 'Non-productive' | 'Unset'
  activityPct: number
  inactivePct: number
  seconds: number
}

interface AppUsageTableProps {
  entries: AppUsageEntry[]
  totalTrackedSeconds: number
  activeSeconds: number
  idleSeconds: number
}

const PRODUCTIVITY_STYLES: Record<
  AppUsageEntry['productivity'],
  { label: string; bg: string; text: string }
> = {
  Productive: { label: 'Productive', bg: 'bg-emerald-500/15', text: 'text-emerald-600' },
  Neutral: { label: 'Neutral', bg: 'bg-violet-500/15', text: 'text-violet-600' },
  'Non-productive': { label: 'Non-productive', bg: 'bg-rose-500/15', text: 'text-rose-600' },
  Unset: { label: 'Unset', bg: 'bg-muted', text: 'text-muted-foreground' },
}

const BAR_COLORS: Record<AppUsageEntry['productivity'], string> = {
  Productive: '#10b981',
  Neutral: '#8b5cf6',
  'Non-productive': '#f43f5e',
  Unset: '#94a3b8',
}

const APP_ICONS: Record<string, string> = {
  'Visual Studio Code': '💙',
  'VS Code': '💙',
  Discord: '🎮',
  ChatGPT: '🤖',
  Claude: '🔮',
  'Google Chrome': '🌐',
  Chrome: '🌐',
  Firefox: '🦊',
  Slack: '💬',
  Figma: '🎨',
  Notion: '📝',
  Terminal: '⬛',
  Spotify: '🎵',
  YouTube: '📺',
  GitHub: '🐙',
  'GitHub Desktop': '🐙',
  Gmail: '📧',
  'Google Meet': '📹',
  Zoom: '📹',
  Excel: '📊',
  Word: '📄',
  Default: '🖥️',
}

function formatHHMM(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

function getAppIcon(app: string) {
  return APP_ICONS[app] ?? APP_ICONS.Default
}

export function AppUsageTable({
  entries,
  totalTrackedSeconds,
  activeSeconds,
  idleSeconds,
}: AppUsageTableProps) {
  const [tab, setTab] = useState<'overview' | 'chart'>('overview')
  const [filter, setFilter] = useState<AppUsageEntry['productivity'] | 'All'>('All')

  const productivityScore = useMemo(() => {
    const total = entries.reduce((s, e) => s + e.seconds, 0)
    const productive = entries
      .filter((e) => e.productivity === 'Productive')
      .reduce((s, e) => s + e.seconds, 0)
    return total === 0 ? 0 : Math.round((productive / total) * 100)
  }, [entries])

  const idlePct = totalTrackedSeconds > 0 ? Math.round((idleSeconds / totalTrackedSeconds) * 100) : 0

  const filtered = filter === 'All' ? entries : entries.filter((e) => e.productivity === filter)

  const chartData = entries
    .slice()
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 8)
    .map((e) => ({
      name: e.app.length > 14 ? e.app.slice(0, 14) + '…' : e.app,
      minutes: Math.round(e.seconds / 60),
      productivity: e.productivity,
    }))

  const filters: (AppUsageEntry['productivity'] | 'All')[] = [
    'All',
    'Productive',
    'Neutral',
    'Non-productive',
    'Unset',
  ]

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">App &amp; Website Usage</CardTitle>
            <CardDescription>Real-time activity breakdown for this session</CardDescription>
          </div>
          {/* Tab toggle */}
          <div className="flex gap-1 p-0.5 bg-muted rounded-lg text-sm">
            {(['overview', 'chart'] as const).map((t) => (
              <button
                key={t}
                id={`usage-tab-${t}`}
                onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-md font-medium capitalize transition-colors ${
                  tab === t ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                }`}
              >
                {t === 'overview' ? 'Overview' : 'Chart'}
              </button>
            ))}
          </div>
        </div>

        {/* Summary metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {[
            {
              label: 'Total Tracked',
              value: formatHHMM(totalTrackedSeconds),
              icon: Clock,
              color: 'text-blue-500',
            },
            {
              label: 'Active Working',
              value: formatHHMM(activeSeconds),
              icon: Activity,
              color: 'text-emerald-500',
            },
            {
              label: 'Idle / Break %',
              value: `${idlePct}%`,
              icon: Coffee,
              color: 'text-amber-500',
            },
            {
              label: 'Productivity',
              value: `${productivityScore}%`,
              icon: TrendingUp,
              color: 'text-violet-500',
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-muted/40 rounded-lg p-3 flex items-center gap-2.5">
              <Icon className={`w-4 h-4 shrink-0 ${color}`} />
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide truncate">
                  {label}
                </p>
                <p className="text-lg font-bold font-mono leading-none mt-0.5">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Productivity filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f}
              id={`usage-filter-${f.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1 rounded-full font-medium border transition-colors ${
                filter === f
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-border text-muted-foreground hover:border-foreground/40'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Overview tab — table */}
        {tab === 'overview' && (
          <>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <Monitor className="w-8 h-8 opacity-30" />
                <p className="text-sm">No activity recorded yet for this session.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-2 px-2">
                        App / Website
                      </th>
                      <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-2 px-2">
                        Category
                      </th>
                      <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-2 px-2">
                        Productivity
                      </th>
                      <th className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-2 px-2">
                        Activity %
                      </th>
                      <th className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-2 px-2">
                        Inactive %
                      </th>
                      <th className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-2 px-2">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filtered.map((entry) => {
                      const ps = PRODUCTIVITY_STYLES[entry.productivity]
                      return (
                        <tr key={entry.app} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base leading-none" aria-hidden>
                                {getAppIcon(entry.app)}
                              </span>
                              <span className="font-medium truncate max-w-[140px]">{entry.app}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-muted-foreground">{entry.category}</td>
                          <td className="py-2.5 px-2">
                            <span
                              className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${ps.bg} ${ps.text}`}
                            >
                              {ps.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="w-14 bg-muted rounded-full h-1.5 hidden sm:block">
                                <div
                                  className="bg-emerald-500 rounded-full h-1.5"
                                  style={{ width: `${entry.activityPct}%` }}
                                />
                              </div>
                              <span className="font-mono text-xs">{entry.activityPct}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-xs text-muted-foreground">
                            {entry.inactivePct}%
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-semibold">
                            {formatHHMM(entry.seconds)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Chart tab */}
        {tab === 'chart' && (
          <div className="h-56">
            {chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                <Monitor className="w-8 h-8 opacity-30" />
                <p className="text-sm">No data to chart yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    unit="m"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={90}
                  />
                  <Tooltip
                    formatter={(v) => [`${v ?? 0}m`, 'Time']}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid hsl(var(--border))',
                    }}
                  />
                  <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={BAR_COLORS[entry.productivity as AppUsageEntry['productivity']]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
