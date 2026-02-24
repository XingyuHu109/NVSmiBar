import { cn } from './ui/utils'
import type { GpuData } from './gpu-card'
import type { ConnectionStatus } from './status-indicator'

export type MenuBarDisplayMode = 'minimal' | 'compact' | 'standard' | 'spark' | 'multi' | 'graphic'

const sparkChars = '▁▂▃▄▅▆▇█'

function sparkChar(value: number): string {
  const v = Math.max(0, Math.min(100, value))
  const idx = Math.min(Math.floor((v / 100) * 8), 7)
  return sparkChars[idx]
}

function threshold(v: number, warn: number, crit: number) {
  if (v >= crit) return 'text-red-400'
  if (v >= warn) return 'text-amber-400'
  return 'text-primary'
}

function vramGB(mib: number) {
  if (mib < 0) return '--'
  return (mib / 1024).toFixed(1)
}

function fmtVal(v: number, suffix = '') {
  return v < 0 ? '--' : `${v}${suffix}`
}

function NvIcon() {
  return (
    <svg width='13' height='10' viewBox='0 0 13 10' fill='none' className='shrink-0 opacity-90'>
      <path d='M0 0h2.5L6 7 9.5 0H12L7 10H5L0 0Z' fill='#76b900' fillOpacity='0.9' />
    </svg>
  )
}

function Sep() {
  return <span className='mx-[1px] select-none text-[11px] text-[#3a3d45]'>·</span>
}

function renderConnected(gpus: GpuData[], mode: MenuBarDisplayMode) {
  const primary = gpus[0]
  if (!primary) {
    return <span className='text-amber-400'>···</span>
  }

  const memPct = primary.memTotal > 0 ? Math.round((primary.memUsed / primary.memTotal) * 100) : 0
  const powerPct = primary.powerLimit > 0 ? Math.round((Math.max(primary.powerDraw, 0) / primary.powerLimit) * 100) : 0

  if (mode === 'minimal') {
    return <span className={threshold(primary.temp, 70, 85)}>{primary.temp}°</span>
  }
  if (mode === 'compact') {
    return (
      <>
        <span className={threshold(primary.temp, 70, 85)}>{primary.temp}°</span>
        <Sep />
        <span className={threshold(primary.util, 70, 90)}>{primary.util}%</span>
      </>
    )
  }
  if (mode === 'spark') {
    return (
      <>
        <span className={cn('text-[13px]', threshold(primary.util, 70, 90))}>{sparkChar(primary.util)}</span>
        <span className={cn('text-[13px]', threshold(memPct, 75, 90))}>{sparkChar(memPct)}</span>
        <span className={cn('text-[13px]', threshold(powerPct, 80, 95))}>{sparkChar(powerPct)}</span>
        <Sep />
        <span className={threshold(primary.temp, 70, 85)}>{primary.temp}°</span>
      </>
    )
  }
  if (mode === 'graphic') {
    return (
      <div className='flex flex-col items-end leading-none'>
        <div className='flex items-center gap-[3px] text-[10px]'>
          <span className={threshold(primary.temp, 70, 85)}>{primary.temp}°</span>
          <span className='text-[#3a3d45]'>·</span>
          <span className={threshold(primary.util, 70, 90)}>{primary.util}%</span>
        </div>
        <span className='text-[8px] text-muted-foreground'>
          {vramGB(primary.memUsed)}/{vramGB(primary.memTotal)}G
        </span>
      </div>
    )
  }
  if (mode === 'multi') {
    return (
      <>
        {gpus.map((gpu, idx) => (
          <span key={gpu.index} className='flex items-center gap-[3px]'>
            {idx > 0 && <span className='mx-[2px] text-[10px] text-[#3a3d45]'>│</span>}
            <span className='text-[10px] text-muted-foreground'>G{gpu.index}</span>
            <span className={threshold(gpu.temp, 70, 85)}>{gpu.temp}°</span>
            <span className='text-[10px] text-muted-foreground'>·</span>
            <span className={threshold(gpu.util, 70, 90)}>{gpu.util}%</span>
          </span>
        ))}
      </>
    )
  }

  return (
    <>
      <span className={threshold(primary.temp, 70, 85)}>{primary.temp}°</span>
      <Sep />
      <span className={threshold(primary.util, 70, 90)}>{primary.util}%</span>
      <Sep />
      <span className={threshold(memPct, 75, 90)}>{vramGB(primary.memUsed)}G</span>
    </>
  )
}

export function MenuBarItem({
  gpus,
  status,
  mode = 'standard',
  active = false,
}: {
  gpus: GpuData[]
  status: ConnectionStatus
  mode?: MenuBarDisplayMode
  active?: boolean
}) {
  return (
    <div
      className={cn(
        'inline-flex h-[22px] cursor-default items-center justify-center rounded-[4px] px-[8px] font-mono text-[12px] leading-none',
        active ? 'bg-white/15' : 'hover:bg-white/10',
      )}
    >
      <div className='flex items-center gap-[5px]'>
        <NvIcon />
        {status === 'idle' && <span className='text-muted-foreground'>NVSmiBar</span>}
        {status === 'connecting' && <span className='animate-pulse text-amber-400'>···</span>}
        {status === 'error' && <span className='text-red-400'>⚠ ERR</span>}
        {(status === 'live' || status === 'stale') && renderConnected(gpus, mode)}
      </div>
    </div>
  )
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = value >= 0 && max > 0 ? Math.max(0, Math.min((value / max) * 100, 100)) : 0
  return (
    <div className='flex items-center gap-2'>
      <span className='w-10 text-[10px] text-muted-foreground'>{label}</span>
      <div className='h-[5px] flex-1 rounded-full bg-secondary'>
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className='w-8 text-right font-mono text-[10px] tabular-nums text-card-foreground'>
        {value >= 0 ? `${Math.round(pct)}%` : '--'}
      </span>
    </div>
  )
}

function barColor(pct: number, warn: number, crit: number) {
  if (pct >= crit) return 'bg-red-500'
  if (pct >= warn) return 'bg-amber-500'
  return 'bg-primary'
}

export function MenuBarDropdownPopup({
  gpus,
  status,
}: {
  gpus: GpuData[]
  status: ConnectionStatus
}) {
  if (status === 'idle') {
    return (
      <div className='w-[280px] rounded-lg border border-white/10 bg-[rgba(22,22,26,0.97)] p-4 shadow-[0_12px_48px_rgba(0,0,0,0.7)]'>
        <p className='text-center text-xs text-muted-foreground'>No connection active</p>
      </div>
    )
  }

  if (status === 'connecting') {
    return (
      <div className='w-[280px] rounded-lg border border-white/10 bg-[rgba(22,22,26,0.97)] p-4 shadow-[0_12px_48px_rgba(0,0,0,0.7)]'>
        <p className='text-center text-xs text-amber-400 animate-pulse'>Connecting...</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className='w-[280px] rounded-lg border border-white/10 bg-[rgba(22,22,26,0.97)] p-4 shadow-[0_12px_48px_rgba(0,0,0,0.7)]'>
        <p className='text-center text-xs text-red-400'>Connection error</p>
      </div>
    )
  }

  const primary = gpus[0]
  if (!primary) {
    return (
      <div className='w-[280px] rounded-lg border border-white/10 bg-[rgba(22,22,26,0.97)] p-4 shadow-[0_12px_48px_rgba(0,0,0,0.7)]'>
        <p className='text-center text-xs text-muted-foreground animate-pulse'>Waiting for data...</p>
      </div>
    )
  }

  const shortName = primary.name.replace(/^NVIDIA\s+/i, '')
  const memPct = primary.memTotal > 0 ? Math.round((primary.memUsed / primary.memTotal) * 100) : 0
  const powerPct = primary.powerLimit > 0 ? Math.round((Math.max(primary.powerDraw, 0) / primary.powerLimit) * 100) : 0

  return (
    <div className='w-[280px] overflow-hidden rounded-lg border border-white/10 bg-[rgba(22,22,26,0.97)] shadow-[0_12px_48px_rgba(0,0,0,0.7)]'>
      {/* Header */}
      <div className='flex items-center gap-2 px-3 py-2'>
        <div className='relative h-2 w-2 shrink-0'>
          {status === 'live' && <div className='absolute inset-0 rounded-full bg-primary animate-ping-dot opacity-75' />}
          <div className={cn('absolute inset-0 rounded-full', status === 'live' ? 'bg-primary' : 'bg-amber-500')} />
        </div>
        <span className='truncate text-xs font-medium text-card-foreground'>{shortName}</span>
        {gpus.length > 1 && (
          <span className='shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary'>
            +{gpus.length - 1} more
          </span>
        )}
      </div>

      {/* Large metrics */}
      <div className='flex items-end justify-between px-3 pt-1 pb-2'>
        <div>
          <span className={cn('text-[30px] font-medium leading-none tabular-nums', threshold(primary.temp, 70, 85))}>
            {fmtVal(primary.temp, '°')}
          </span>
          <p className='mt-0.5 text-[10px] text-muted-foreground'>Temperature</p>
        </div>
        <div className='text-right'>
          <span className={cn('text-[20px] font-medium leading-none tabular-nums', threshold(primary.util, 70, 90))}>
            {fmtVal(primary.util, '%')}
          </span>
          <p className='mt-0.5 text-[10px] text-muted-foreground'>GPU Util</p>
        </div>
      </div>

      {/* Stat bars */}
      <div className='space-y-1.5 px-3 pb-3 pt-1'>
        <MiniBar label='GPU' value={primary.util} max={100} color={barColor(primary.util, 70, 90)} />
        <MiniBar label='VRAM' value={primary.memUsed} max={primary.memTotal} color={barColor(memPct, 75, 90)} />
        <MiniBar label='Power' value={primary.powerDraw} max={primary.powerLimit} color={barColor(powerPct, 80, 95)} />
        <MiniBar label='Fan' value={primary.fanSpeed} max={100} color='bg-muted-foreground' />
      </div>

      {/* Footer */}
      {(primary.driverVersion || primary.cudaVersion) && (
        <div className='border-t border-white/5 px-3 py-1.5 text-[10px] text-muted-foreground'>
          {[primary.driverVersion && `Driver ${primary.driverVersion}`, primary.cudaVersion && `CUDA ${primary.cudaVersion}`]
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
    </div>
  )
}

export function formatTrayTitle(
  gpus: GpuData[],
  status: ConnectionStatus,
  mode: MenuBarDisplayMode = 'standard',
): string {
  if (status === 'idle') return 'NVSmiBar'
  if (status === 'connecting') return 'NV ···'
  if (status === 'error') return 'NV ⚠'
  const g = gpus[0]
  if (!g) return 'NV ···'

  const memPct = g.memTotal > 0 ? Math.round((g.memUsed / g.memTotal) * 100) : 0
  const powerPct = g.powerLimit > 0 ? Math.round((Math.max(g.powerDraw, 0) / g.powerLimit) * 100) : 0

  let value = ''
  switch (mode) {
    case 'minimal':
      value = `${g.temp}°`
      break
    case 'compact':
      value = `${g.temp}° · ${g.util}%`
      break
    case 'standard':
      value = `${g.temp}° · ${g.util}% · ${vramGB(g.memUsed)}G`
      break
    case 'spark':
      value = `${sparkChar(g.util)}${sparkChar(memPct)}${sparkChar(powerPct)} ${g.temp}°`
      break
    case 'multi':
      value = gpus.map(gpu => `G${gpu.index}:${gpu.temp}°·${gpu.util}%`).join(' │ ')
      break
    case 'graphic':
      value = `${g.temp}° · ${g.util}% | ${vramGB(g.memUsed)}/${vramGB(g.memTotal)}G`
      break
  }

  if (status === 'stale') {
    return `${value} !`
  }
  return value
}
