import { ChevronDown, ChevronUp, Cpu, Fan, MemoryStick, Thermometer, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'

import { MetricBar } from './metric-bar'
import { cn } from './ui/utils'

export interface GpuData {
  index: number
  name: string
  util: number
  temp: number
  memUsed: number
  memTotal: number
  fanSpeed: number
  powerDraw: number
  powerLimit: number
  driverVersion?: string
  cudaVersion?: string
}

function tempColor(temp: number) {
  if (temp < 0) return 'text-muted-foreground'
  if (temp >= 85) return 'text-red-400'
  if (temp >= 70) return 'text-amber-400'
  return 'text-primary'
}

function tempBg(temp: number) {
  if (temp < 0) return 'bg-muted/50 text-muted-foreground'
  if (temp >= 85) return 'bg-red-500/15 text-red-400'
  if (temp >= 70) return 'bg-amber-500/15 text-amber-400'
  return 'bg-primary/15 text-primary'
}

function utilColor(util: number) {
  if (util < 0) return 'text-muted-foreground'
  if (util >= 90) return 'text-red-400'
  if (util >= 70) return 'text-amber-400'
  return 'text-primary'
}

function utilBg(util: number) {
  if (util < 0) return 'bg-muted/50 text-muted-foreground'
  if (util >= 90) return 'bg-red-500/15 text-red-400'
  if (util >= 70) return 'bg-amber-500/15 text-amber-400'
  return 'bg-primary/15 text-primary'
}

function asPercent(value: number, total: number) {
  if (value < 0 || total <= 0) return 0
  return Math.round((value / total) * 100)
}

function fmtVal(v: number, suffix = '') {
  return v < 0 ? '--' : `${v}${suffix}`
}

export function GpuCard({ gpu }: { gpu: GpuData }) {
  const [expanded, setExpanded] = useState(true)
  const memPercent = useMemo(() => asPercent(gpu.memUsed, gpu.memTotal), [gpu.memUsed, gpu.memTotal])
  const shortName = gpu.name.replace(/^NVIDIA\s+/i, '')

  return (
    <div className='overflow-hidden rounded-lg border bg-card'>
      <button
        className='flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accent/50'
        onClick={() => setExpanded(prev => !prev)}
      >
        <div className='flex min-w-0 items-center gap-2'>
          <div className='h-2 w-2 shrink-0 rounded-full bg-primary' />
          <p className='truncate text-xs font-medium text-card-foreground'>GPU {gpu.index}: {shortName}</p>
        </div>
        <div className='flex items-center gap-1.5'>
          <span className={cn('rounded-full px-1.5 py-0.5 font-mono text-[10px]', tempBg(gpu.temp))}>
            {fmtVal(gpu.temp, '°')}
          </span>
          <span className={cn('rounded-full px-1.5 py-0.5 font-mono text-[10px]', utilBg(gpu.util))}>
            {fmtVal(gpu.util, '%')}
          </span>
          {expanded ? <ChevronUp className='ml-1 h-3.5 w-3.5 text-muted-foreground' /> : <ChevronDown className='ml-1 h-3.5 w-3.5 text-muted-foreground' />}
        </div>
      </button>

      {expanded && (
        <div className='space-y-2.5 border-t px-3 py-3'>
          <div className='grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]'>
            <div className='flex items-center gap-1.5'>
              <Thermometer className={cn('h-3.5 w-3.5', tempColor(gpu.temp))} />
              <span className='text-muted-foreground'>Temp</span>
              <span className={cn('ml-auto font-mono', tempColor(gpu.temp))}>{fmtVal(gpu.temp, '°C')}</span>
            </div>
            <div className='flex items-center gap-1.5'>
              <Fan className='h-3.5 w-3.5 text-muted-foreground' />
              <span className='text-muted-foreground'>Fan</span>
              <span className='ml-auto font-mono'>{fmtVal(gpu.fanSpeed, '%')}</span>
            </div>
            <div className='flex items-center gap-1.5'>
              <Zap className='h-3.5 w-3.5 text-amber-400' />
              <span className='text-muted-foreground'>Power</span>
              <span className='ml-auto font-mono'>
                {fmtVal(gpu.powerDraw)}
                <span className='text-muted-foreground'>/{fmtVal(gpu.powerLimit)} W</span>
              </span>
            </div>
            <div className='flex items-center gap-1.5'>
              <MemoryStick className='h-3.5 w-3.5 text-blue-400' />
              <span className='text-muted-foreground'>VRAM</span>
              <span className='ml-auto font-mono'>
                {fmtVal(gpu.memUsed)}
                <span className='text-muted-foreground'>/{fmtVal(gpu.memTotal)} MiB</span>
              </span>
            </div>
          </div>

          <div className='space-y-2'>
            <MetricBar label='GPU Utilization' value={gpu.util} max={100} unit='%' thresholds={{ warn: 70, critical: 90 }} />
            <MetricBar label='VRAM' value={gpu.memUsed} max={gpu.memTotal} unit=' MiB' thresholds={{ warn: 75, critical: 90 }} />
            <MetricBar label='Power' value={gpu.powerDraw} max={gpu.powerLimit} unit='W' thresholds={{ warn: 80, critical: 95 }} />
          </div>

          {(gpu.driverVersion || gpu.cudaVersion) && (
            <div className='flex items-center gap-3 border-t pt-2 text-[10px] text-muted-foreground'>
              {gpu.driverVersion && <span>Driver {gpu.driverVersion}</span>}
              {gpu.cudaVersion && <span>CUDA {gpu.cudaVersion}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
