import { useEffect, useMemo, useState } from 'react'
import { EventsOn } from '../wailsjs/runtime/runtime'
import {
  CheckForUpdate,
  DoUpdate,
  HideWindow,
  Quit,
  RetryConnection,
  SetConnection,
  TestConnection,
  UpdateTrayData,
  UpdateTrayTitle,
} from '../wailsjs/go/main/App'

import { GpuCard, type GpuData } from './components/gpu-card'
import { formatTrayTitle, type MenuBarDisplayMode } from './components/menu-bar-item'
import { StatusBadge, type ConnectionStatus } from './components/status-indicator'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { ScrollArea } from './components/ui/scroll-area'
import { cn } from './components/ui/utils'
import { AlertTriangle, Download, Loader2, MonitorDot, Server, Settings, X } from 'lucide-react'

type ProfileSource = 'manual' | 'ssh_config'
type LastTestStatus = 'success' | 'failed' | 'never'

interface ConnectionProfile {
  id: string
  name: string
  target: string
  port: number
  source: ProfileSource
  lastUsedAt: number | null
  lastTestStatus: LastTestStatus
  lastErrorCode?: string
  lastErrorMessage?: string
}

interface ConnectionMeta {
  status: ConnectionStatus
  lastSuccessTs: number
  consecutiveFailures: number
  nextRetryInSec: number
  errorCode: string
  errorMessage: string
  activeTarget: string
  activePort: number
}

interface UpdateInfo {
  available: boolean
  latest: string
  url: string
}

const STORAGE_VERSION = '2'
const STORAGE_VERSION_KEY = 'nvSmiStorageVersion'
const STORAGE_CONNECTIONS_KEY = 'nvSmiV2Connections'
const STORAGE_ACTIVE_CONNECTION_ID_KEY = 'nvSmiV2ActiveConnectionId'
const STORAGE_DISPLAY_MODE_KEY = 'nvSmiV2DisplayMode'

const MODE_OPTIONS: { id: MenuBarDisplayMode; label: string; description: string }[] = [
  { id: 'graphic', label: 'Rich', description: 'Stacked two-line: temp + util on top, VRAM below.' },
  { id: 'minimal', label: 'Minimal', description: 'Temp only.' },
  { id: 'compact', label: 'Compact', description: 'Temp + util.' },
  { id: 'standard', label: 'Standard', description: 'Temp + util + VRAM.' },
  { id: 'spark', label: 'Spark', description: 'Compact spark bars.' },
  { id: 'multi', label: 'Multi GPU', description: 'All GPUs side by side.' },
]

const EMPTY_META: ConnectionMeta = {
  status: 'idle',
  lastSuccessTs: 0,
  consecutiveFailures: 0,
  nextRetryInSec: 0,
  errorCode: '',
  errorMessage: '',
  activeTarget: '',
  activePort: 0,
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    if (!value) return fallback
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function migrateStorage() {
  if (localStorage.getItem(STORAGE_VERSION_KEY) === STORAGE_VERSION) return

  localStorage.removeItem('nvSmiHost')
  localStorage.removeItem('nvSmiSettings')
  localStorage.removeItem(STORAGE_CONNECTIONS_KEY)
  localStorage.removeItem(STORAGE_ACTIVE_CONNECTION_ID_KEY)
  localStorage.removeItem(STORAGE_DISPLAY_MODE_KEY)

  localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION)
}

function createProfileId() {
  return `conn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function formatRelative(ts: number | null): string {
  if (!ts) return 'never'
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export default function App() {
  migrateStorage()

  const [gpus, setGpus] = useState<GpuData[]>([])
  const [connMeta, setConnMeta] = useState<ConnectionMeta>(EMPTY_META)
  const [inlineError, setInlineError] = useState('')

  const [connections, setConnections] = useState<ConnectionProfile[]>(() => readJson(STORAGE_CONNECTIONS_KEY, []))
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(() => localStorage.getItem(STORAGE_ACTIVE_CONNECTION_ID_KEY))

  const [displayMode, setDisplayMode] = useState<MenuBarDisplayMode>(() => {
    const saved = localStorage.getItem(STORAGE_DISPLAY_MODE_KEY)
    return (saved as MenuBarDisplayMode) || 'graphic'
  })

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'updating' | 'done' | 'opened'>('idle')

  // Mini view state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [miniHostInput, setMiniHostInput] = useState('')
  const [isMiniConnecting, setIsMiniConnecting] = useState(false)
  const [updateCheckStatus, setUpdateCheckStatus] = useState<'idle' | 'checking' | 'done'>('idle')

  const [, forceClock] = useState(0)

  const activeConnection = useMemo(
    () => connections.find(connection => connection.id === activeConnectionId) ?? null,
    [connections, activeConnectionId],
  )

  const hasConnections = connections.length > 0

  useEffect(() => {
    const tick = setInterval(() => forceClock(n => n + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_CONNECTIONS_KEY, JSON.stringify(connections))
  }, [connections])

  useEffect(() => {
    if (activeConnectionId) {
      localStorage.setItem(STORAGE_ACTIVE_CONNECTION_ID_KEY, activeConnectionId)
    } else {
      localStorage.removeItem(STORAGE_ACTIVE_CONNECTION_ID_KEY)
    }
  }, [activeConnectionId])

  useEffect(() => {
    localStorage.setItem(STORAGE_DISPLAY_MODE_KEY, displayMode)
  }, [displayMode])

  useEffect(() => {
    const offData = EventsOn('gpu:data', (payload: GpuData[]) => {
      setGpus(payload)
      setInlineError('')
      if (activeConnectionId) {
        setConnections(prev =>
          prev.map(profile =>
            profile.id === activeConnectionId
              ? {
                  ...profile,
                  lastUsedAt: Date.now(),
                  lastTestStatus: 'success',
                  lastErrorCode: '',
                  lastErrorMessage: '',
                }
              : profile,
          ),
        )
      }
    })

    const offError = EventsOn('gpu:error', (message: string) => {
      setInlineError(message)
      if (activeConnectionId) {
        setConnections(prev =>
          prev.map(profile =>
            profile.id === activeConnectionId
              ? {
                  ...profile,
                  lastTestStatus: 'failed',
                  lastErrorCode: profile.lastErrorCode ?? '',
                  lastErrorMessage: message,
                }
              : profile,
          ),
        )
      }
    })

    const offMeta = EventsOn('gpu:conn_meta', (meta: ConnectionMeta) => {
      setConnMeta(meta)
    })

    const offUpdate = EventsOn('update:status', (status: string) => {
      if (status === 'updating' || status === 'done' || status === 'opened' || status === 'idle') {
        setUpdateStatus(status)
      }
    })

    return () => {
      offData()
      offError()
      offMeta()
      offUpdate()
    }
  }, [activeConnectionId])

  useEffect(() => {
    CheckForUpdate().then(info => {
      if (info?.available) {
        setUpdateInfo({ available: true, latest: info.latest, url: info.url })
      }
    })
  }, [])

  useEffect(() => {
    const status = connMeta.status || 'idle'
    if (displayMode === 'graphic' && gpus.length > 0 && (status === 'live' || status === 'stale')) {
      const g = gpus[0]
      UpdateTrayData(g.temp, g.util, g.memUsed, g.memTotal, status)
    } else if (displayMode === 'graphic') {
      UpdateTrayData(0, 0, 0, 0, status)
    } else {
      UpdateTrayTitle(formatTrayTitle(gpus, status, displayMode))
    }
  }, [gpus, connMeta.status, displayMode])

  useEffect(() => {
    if (!activeConnection) {
      SetConnection('', 0)
      setConnMeta(EMPTY_META)
      return
    }

    setConnMeta(prev => ({
      ...prev,
      status: 'connecting',
      activeTarget: activeConnection.target,
      activePort: activeConnection.port,
    }))
    setInlineError('')
    setGpus([])
    SetConnection(activeConnection.target, activeConnection.port)
  }, [activeConnection?.id, activeConnection?.target, activeConnection?.port])

  // Sync miniHostInput with active connection
  useEffect(() => {
    if (activeConnection) {
      const port = activeConnection.port || 22
      setMiniHostInput(port === 22 ? activeConnection.target : `${activeConnection.target}:${port}`)
    }
  }, [activeConnection?.id])

  async function handleMiniConnect() {
    const raw = miniHostInput.trim()
    if (!raw) return

    let target: string
    let port: number

    const lastColon = raw.lastIndexOf(':')
    if (lastColon > 0 && lastColon < raw.length - 1) {
      const portStr = raw.slice(lastColon + 1)
      const parsed = Number(portStr)
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) {
        target = raw.slice(0, lastColon)
        port = parsed
      } else {
        target = raw
        port = 22
      }
    } else {
      target = raw
      port = 22
    }

    // Check if profile with same target exists
    const existing = connections.find(c => c.target === target && c.port === port)
    if (existing) {
      setActiveConnectionId(existing.id)
      setSettingsOpen(false)
      return
    }

    setIsMiniConnecting(true)
    try {
      const result = await TestConnection(target, port)
      const profileId = createProfileId()
      const profile: ConnectionProfile = {
        id: profileId,
        name: target,
        target,
        port,
        source: 'manual',
        lastUsedAt: result.success ? Date.now() : null,
        lastTestStatus: result.success ? 'success' : 'failed',
        lastErrorCode: result.success ? '' : result.code,
        lastErrorMessage: result.success ? '' : result.message,
      }
      setConnections(prev => [profile, ...prev])
      if (result.success) {
        setActiveConnectionId(profileId)
        setSettingsOpen(false)
      }
    } finally {
      setIsMiniConnecting(false)
    }
  }

  async function handleCheckUpdate() {
    setUpdateCheckStatus('checking')
    try {
      const info = await CheckForUpdate()
      if (info?.available) {
        setUpdateInfo({ available: true, latest: info.latest, url: info.url })
      }
      setUpdateCheckStatus('done')
    } catch {
      setUpdateCheckStatus('done')
    }
  }

  function handleDelete(profileId: string) {
    setConnections(prev => prev.filter(profile => profile.id !== profileId))
    if (activeConnectionId === profileId) {
      setActiveConnectionId(null)
      setGpus([])
      setConnMeta(EMPTY_META)
    }
  }

  function staleHint() {
    if (!connMeta.lastSuccessTs) return ''
    const elapsed = Math.max(0, Math.floor(Date.now() / 1000 - connMeta.lastSuccessTs))
    return `${elapsed}s ago`
  }

  return (
    <div className='flex h-screen flex-col bg-background text-foreground'>
      {/* Header with drag region */}
      <header className='drag-region flex items-center justify-between border-b px-3 py-2'>
        <div className='flex items-center gap-2'>
          <MonitorDot className='h-3.5 w-3.5 text-primary' />
          <span className='text-xs font-semibold tracking-tight'>NVSmiBar</span>
          <StatusBadge status={connMeta.status} />
        </div>
        <div className='no-drag flex items-center gap-1'>
          <button
            className='rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
            onClick={() => setSettingsOpen(prev => !prev)}
          >
            <Settings className={cn('h-3.5 w-3.5 transition-transform duration-200', settingsOpen && 'rotate-90')} />
          </button>
          <button
            className='rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
            onClick={() => HideWindow()}
          >
            <X className='h-3.5 w-3.5' />
          </button>
        </div>
      </header>

      {/* Collapsible settings panel */}
      <div
        className={cn(
          'border-b transition-all duration-300 ease-in-out',
          settingsOpen ? 'max-h-[260px] overflow-y-auto border-border' : 'max-h-0 overflow-hidden border-transparent',
        )}
      >
        <div className='space-y-2.5 px-3 py-2.5'>
          {/* Host input */}
          <div className='space-y-1'>
            <label className='text-[10px] uppercase tracking-wider text-muted-foreground'>Remote Host</label>
            <div className='flex gap-1.5'>
              <div className='relative flex-1'>
                <Server className='absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground' />
                <Input
                  className='h-7 pl-7 text-xs'
                  placeholder='user@host or alias'
                  value={miniHostInput}
                  onChange={e => setMiniHostInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleMiniConnect()}
                />
              </div>
              <Button size='sm' className='h-7 px-3 text-xs' onClick={handleMiniConnect} disabled={isMiniConnecting || !miniHostInput.trim()}>
                {isMiniConnecting ? <Loader2 className='h-3 w-3 animate-spin' /> : 'Connect'}
              </Button>
            </div>
          </div>

          {/* Saved connections list */}
          {hasConnections && (
            <div className='space-y-0.5'>
              <label className='text-[10px] uppercase tracking-wider text-muted-foreground'>Saved</label>
              {connections.map(profile => (
                <div key={profile.id} className='flex items-center gap-1'>
                  <button
                    className={cn(
                      'flex min-w-0 flex-1 items-center rounded px-2 py-1 text-left text-xs',
                      activeConnectionId === profile.id
                        ? 'bg-primary/15 text-primary'
                        : 'text-foreground hover:bg-accent',
                    )}
                    onClick={() => setActiveConnectionId(profile.id)}
                  >
                    <span className='truncate'>
                      {profile.name}{profile.port !== 22 ? `:${profile.port}` : ''}
                    </span>
                  </button>
                  <button
                    className='shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground'
                    onClick={e => { e.stopPropagation(); handleDelete(profile.id) }}
                  >
                    <X className='h-3 w-3' />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Display mode pills */}
          <div className='space-y-1'>
            <label className='text-[10px] uppercase tracking-wider text-muted-foreground'>Menu Bar</label>
            <div className='flex flex-wrap gap-1'>
              {MODE_OPTIONS.map(option => (
                <button
                  key={option.id}
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors',
                    displayMode === option.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-accent',
                  )}
                  onClick={() => setDisplayMode(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Update / Quit row */}
          <div className='flex items-center gap-1.5'>
            {updateInfo ? (
              <Button variant='secondary' size='sm' className='h-6 text-[10px]' onClick={() => DoUpdate(updateInfo.url)} disabled={updateStatus === 'updating'}>
                <Download className='h-3 w-3' />
                {updateStatus === 'updating' ? 'Updating...' : `Download ${updateInfo.latest}`}
              </Button>
            ) : (
              <Button
                variant='ghost'
                size='sm'
                className='h-6 text-[10px]'
                onClick={handleCheckUpdate}
                disabled={updateCheckStatus === 'checking'}
              >
                {updateCheckStatus === 'checking' ? (
                  <><Loader2 className='h-3 w-3 animate-spin' /> Checking...</>
                ) : updateCheckStatus === 'done' ? (
                  'Up to date'
                ) : (
                  'Check update'
                )}
              </Button>
            )}
            <div className='flex-1' />
            <Button variant='ghost' size='sm' className='h-6 text-[10px] text-red-400 hover:text-red-300' onClick={() => Quit()}>
              Quit
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <ScrollArea className='flex-1'>
        <div className='space-y-2 p-3'>
          {/* Error banner */}
          {(connMeta.status === 'error' && (inlineError || connMeta.errorMessage)) && (
            <div className='flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-2 text-[11px] text-red-300'>
              <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
              <div>
                <p>{connMeta.errorMessage || inlineError}</p>
                <button className='mt-1 text-red-400 underline underline-offset-2 hover:text-red-300' onClick={() => RetryConnection()}>
                  Retry now
                </button>
              </div>
            </div>
          )}

          {/* Stale banner */}
          {connMeta.status === 'stale' && (
            <div className='rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-[11px] text-amber-300'>
              <p>Using last known data from {staleHint()}.</p>
              {connMeta.nextRetryInSec > 0 && <p>Retrying in {connMeta.nextRetryInSec}s.</p>}
            </div>
          )}

          {/* Idle empty state */}
          {connMeta.status === 'idle' && gpus.length === 0 && (
            <div className='flex flex-col items-center gap-3 rounded-md border border-dashed px-3 py-8'>
              <div className='flex h-10 w-10 items-center justify-center rounded-full bg-muted'>
                <Server className='h-5 w-5 text-muted-foreground' />
              </div>
              <div className='text-center'>
                <p className='text-xs font-medium text-card-foreground'>No host configured</p>
                <p className='mt-0.5 text-[11px] text-muted-foreground'>Connect to a remote server to monitor GPUs</p>
              </div>
              <Button size='sm' className='h-7 text-xs' onClick={() => setSettingsOpen(true)}>
                <Settings className='h-3 w-3' /> Configure Host
              </Button>
            </div>
          )}

          {/* Connecting state */}
          {connMeta.status === 'connecting' && gpus.length === 0 && (
            <div className='flex flex-col items-center gap-2 px-3 py-8'>
              <Loader2 className='h-6 w-6 animate-spin text-primary' />
              <p className='text-xs text-muted-foreground'>Connecting to {connMeta.activeTarget || '...'}...</p>
            </div>
          )}

          {/* GPU cards */}
          {gpus.map(gpu => (
            <GpuCard key={gpu.index} gpu={gpu} />
          ))}

          {/* Footer info when GPUs present */}
          {gpus.length > 0 && (
            <div className='flex items-center justify-between pt-1 text-[10px] text-muted-foreground'>
              <span>
                {gpus[0]?.driverVersion && `Driver ${gpus[0].driverVersion}`}
                {gpus[0]?.driverVersion && gpus[0]?.cudaVersion && ' · '}
                {gpus[0]?.cudaVersion && `CUDA ${gpus[0].cudaVersion}`}
              </span>
              <span>Updated {connMeta.lastSuccessTs ? formatRelative(connMeta.lastSuccessTs * 1000) : 'never'}</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <footer className='flex items-center justify-between border-t px-3 py-1.5 text-[10px] text-muted-foreground'>
        <span>{activeConnection ? `Host: ${activeConnection.target}` : 'Not connected'}</span>
        <span>{gpus.length > 0 ? `${gpus.length} GPU${gpus.length > 1 ? 's' : ''}` : ''}</span>
      </footer>
    </div>
  )
}
