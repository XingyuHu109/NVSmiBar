import { cn } from './ui/utils'

export type ConnectionStatus = 'idle' | 'connecting' | 'live' | 'stale' | 'error'

const statusConfig: Record<ConnectionStatus, { label: string; dotClass: string; textClass: string; bgTint: string }> = {
  idle: {
    label: 'Idle',
    dotClass: 'bg-muted-foreground',
    textClass: 'text-muted-foreground',
    bgTint: 'bg-muted/50 border-border',
  },
  connecting: {
    label: 'Connecting',
    dotClass: 'bg-amber-500 animate-pulse',
    textClass: 'text-amber-400',
    bgTint: 'bg-amber-500/10 border-amber-500/30',
  },
  live: {
    label: 'Live',
    dotClass: 'bg-primary',
    textClass: 'text-primary',
    bgTint: 'bg-primary/10 border-primary/30',
  },
  stale: {
    label: 'Stale',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-400',
    bgTint: 'bg-amber-500/10 border-amber-500/30',
  },
  error: {
    label: 'Error',
    dotClass: 'bg-red-500',
    textClass: 'text-red-400',
    bgTint: 'bg-red-500/10 border-red-500/30',
  },
}

export function StatusIndicator({ status }: { status: ConnectionStatus }) {
  const config = statusConfig[status]
  return (
    <div className='flex items-center gap-1.5'>
      {status === 'live' ? (
        <div className='relative h-2 w-2'>
          <div className={cn('absolute inset-0 rounded-full', config.dotClass, 'animate-ping-dot opacity-75')} />
          <div className={cn('absolute inset-0 rounded-full', config.dotClass)} />
        </div>
      ) : (
        <div className={cn('h-2 w-2 rounded-full', config.dotClass)} />
      )}
      <span className={cn('text-[10px] uppercase tracking-wider', config.textClass)}>{config.label}</span>
    </div>
  )
}

export function StatusBadge({ status }: { status: ConnectionStatus }) {
  const config = statusConfig[status]
  return (
    <div className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5', config.bgTint)}>
      {status === 'live' ? (
        <div className='relative h-1.5 w-1.5'>
          <div className={cn('absolute inset-0 rounded-full', config.dotClass, 'animate-ping-dot opacity-75')} />
          <div className={cn('absolute inset-0 rounded-full', config.dotClass)} />
        </div>
      ) : (
        <div className={cn('h-1.5 w-1.5 rounded-full', config.dotClass)} />
      )}
      <span className={cn('text-[9px] font-medium uppercase tracking-wider', config.textClass)}>{config.label}</span>
    </div>
  )
}
