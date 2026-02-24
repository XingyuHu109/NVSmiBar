import { cn } from './ui/utils'

interface MetricBarProps {
  label: string
  value: number
  max: number
  unit?: string
  thresholds?: { warn: number; critical: number }
}

function getBarColor(percent: number, thresholds?: { warn: number; critical: number }) {
  if (!thresholds) return 'bg-primary'
  if (percent >= thresholds.critical) return 'bg-red-500'
  if (percent >= thresholds.warn) return 'bg-amber-500'
  return 'bg-primary'
}

function fmtMetric(value: number, unit?: string) {
  if (value < 0) return '--'
  return `${value}${unit ?? ''}`
}

export function MetricBar({ label, value, max, unit, thresholds }: MetricBarProps) {
  const pct = value >= 0 && max > 0 ? Math.max(0, Math.min((value / max) * 100, 100)) : 0
  const color = getBarColor(pct, thresholds)

  return (
    <div className='space-y-1'>
      <div className='flex items-baseline justify-between gap-2'>
        <span className='text-[10px] uppercase tracking-wider text-muted-foreground'>{label}</span>
        <span className='font-mono text-[11px] text-card-foreground'>
          {fmtMetric(value, unit)}
          {value >= 0 && max > 0 && <span className='text-muted-foreground'>/{max}{unit ?? ''}</span>}
        </span>
      </div>
      <div className='h-1.5 w-full rounded-full bg-secondary'>
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
