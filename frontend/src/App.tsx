import { useState, useEffect, useCallback, useRef } from 'react'
import { EventsOn } from '../wailsjs/runtime/runtime'
import { SetHost, HideWindow, UpdateTrayTitle, Quit } from '../wailsjs/go/main/App'

interface GPU {
  index: number
  name: string
  util: number
  temp: number
  memUsed: number
  memTotal: number
}

type Status = 'idle' | 'connecting' | 'ok' | 'error'

interface Settings {
  showModel: boolean
  showUtil: boolean
  showTemp: boolean
  showVram: boolean
}

const DEFAULT_SETTINGS: Settings = {
  showModel: false,
  showUtil: true,
  showTemp: true,
  showVram: false,
}

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem('nvSmiSettings')
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
  } catch {}
  return DEFAULT_SETTINGS
}

function abbreviateModel(name: string): string {
  return name.replace(/^NVIDIA\s+/i, '').split(' ')[0] || 'GPU'
}

function formatTrayTitle(gpus: GPU[], s: Settings): string {
  if (gpus.length === 0) return 'GPU'
  const count = gpus.length
  const util  = Math.max(...gpus.map(g => g.util))
  const temp  = Math.max(...gpus.map(g => g.temp))
  const used  = gpus.reduce((a, g) => a + g.memUsed,  0)
  const total = gpus.reduce((a, g) => a + g.memTotal, 0)

  const prefix = s.showModel
    ? (count > 1 ? `${count}×${abbreviateModel(gpus[0].name)}` : abbreviateModel(gpus[0].name))
    : (count > 1 ? `${count}×GPU` : 'GPU')

  const parts = [prefix]
  if (s.showUtil) parts.push(`${util}%`)
  if (s.showTemp) parts.push(`${temp}°`)
  if (s.showVram) {
    const usedG  = Math.round(used  / 1024)
    const totalG = Math.round(total / 1024)
    parts.push(`${usedG}/${totalG}G`)
  }
  return parts.join(' ')
}

function StatusBadge({ status }: { status: Status }) {
  const configs = {
    idle:       { dot: 'bg-neutral-500', text: 'text-neutral-400', label: 'Idle' },
    connecting: { dot: 'bg-amber-400',   text: 'text-amber-400',   label: 'Connecting' },
    ok:         { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'Live' },
    error:      { dot: 'bg-red-500',     text: 'text-red-400',     label: 'Error' },
  }
  const c = configs[status]
  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium ${c.text}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

function GPUCard({ gpu }: { gpu: GPU }) {
  const utilColor = gpu.util > 90 ? 'text-amber-400' : 'text-slate-300'
  const tempColor = gpu.temp > 80  ? 'text-red-400'   : 'text-slate-300'
  const memPct = gpu.memTotal > 0 ? (gpu.memUsed / gpu.memTotal) * 100 : 0
  const memColor = memPct > 90 ? 'text-amber-400' : 'text-slate-300'

  return (
    <div className="bg-[#1e1e2e] border border-white/10 rounded-lg p-3 space-y-2">
      <div className="text-xs text-slate-400 font-mono truncate">
        [{gpu.index}] {gpu.name}
      </div>
      <div className="flex items-center gap-4 text-xs font-mono">
        <span>
          UTIL <span className={`font-bold ${utilColor}`}>{gpu.util}%</span>
        </span>
        <span>
          TEMP <span className={`font-bold ${tempColor}`}>{gpu.temp}°C</span>
        </span>
        <span>
          MEM <span className={`font-bold ${memColor}`}>{gpu.memUsed}</span>
          <span className="text-slate-500">/{gpu.memTotal}</span>
        </span>
      </div>
      <div className="w-full bg-white/10 rounded-full h-1">
        <div
          className={`h-1 rounded-full transition-all ${gpu.util > 90 ? 'bg-amber-400' : 'bg-emerald-500'}`}
          style={{ width: `${gpu.util}%` }}
        />
      </div>
    </div>
  )
}

export default function App() {
  const [gpus, setGpus] = useState<GPU[]>([])
  const [error, setError] = useState<string>('')
  const [status, setStatus] = useState<Status>('idle')
  const [host, setHostState] = useState<string>(
    () => localStorage.getItem('nvSmiHost') ?? ''
  )
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const settingsRef = useRef(settings)

  useEffect(() => {
    settingsRef.current = settings
    localStorage.setItem('nvSmiSettings', JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    const offData = EventsOn('gpu:data', (data: GPU[]) => {
      setGpus(data)
      setError('')
      setStatus('ok')
      UpdateTrayTitle(formatTrayTitle(data, settingsRef.current))
    })
    const offError = EventsOn('gpu:error', (msg: string) => {
      setError(msg)
      setStatus('error')
    })
    return () => {
      offData()
      offError()
    }
  }, [])

  const handleHostChange = useCallback((newHost: string) => {
    setHostState(newHost)
    localStorage.setItem('nvSmiHost', newHost)
    SetHost(newHost)
    if (newHost.trim()) {
      setStatus('connecting')
      setGpus([])
      setError('')
    } else {
      setStatus('idle')
      setGpus([])
      setError('')
    }
  }, [])

  // Sync stored host to backend on mount
  useEffect(() => {
    if (host) {
      SetHost(host)
      setStatus('connecting')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSetting = useCallback((key: keyof Settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  return (
    <div className="flex flex-col h-screen bg-[#1a1a2e] text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <span className="text-sm font-semibold tracking-wide">NVSmiBar</span>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <button
            onClick={() => HideWindow()}
            className="text-slate-500 hover:text-slate-300 transition-colors text-base leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-white/10"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* GPU list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {status === 'idle' && (
          <div className="flex items-center justify-center h-full text-slate-500 text-xs">
            Enter an SSH host below to start monitoring
          </div>
        )}

        {status === 'connecting' && gpus.length === 0 && error === '' && (
          <div className="flex items-center justify-center h-full text-slate-500 text-xs">
            Connecting...
          </div>
        )}

        {status === 'error' && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
            <p className="text-red-400 font-mono text-xs break-all">{error}</p>
          </div>
        )}

        {gpus.map((gpu) => (
          <GPUCard key={gpu.index} gpu={gpu} />
        ))}
      </div>

      {/* SSH Host input */}
      <div className="flex-shrink-0 border-t border-white/10 px-3 py-3 space-y-1">
        <label className="text-[10px] uppercase tracking-widest text-slate-500">SSH Host</label>
        <input
          type="text"
          value={host}
          onChange={(e) => handleHostChange(e.target.value)}
          placeholder="user@node01"
          spellCheck={false}
          className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
        />
      </div>

      {/* Settings panel */}
      <div className="flex-shrink-0 border-t border-white/10 px-3 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-widest text-slate-500">⚙ Menu Bar Display</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
          {([
            { key: 'showUtil',  label: 'Util %' },
            { key: 'showTemp',  label: 'Temp °' },
            { key: 'showVram',  label: 'VRAM' },
            { key: 'showModel', label: 'Model' },
          ] as { key: keyof Settings; label: string }[]).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={() => toggleSetting(key)}
                className="w-3 h-3 rounded accent-emerald-500 cursor-pointer"
              />
              <span className="text-xs text-slate-400">{label}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => Quit()}
            className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
          >
            Quit
          </button>
        </div>
      </div>
    </div>
  )
}
