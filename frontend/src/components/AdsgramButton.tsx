import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { tg } from '../lib/api'

// ─── Типы Adsgram SDK ───
declare global {
  interface Window {
    Adsgram?: {
      init(config: { blockId: string; debug?: boolean }): AdsgramController
    }
  }
}

interface AdsgramController {
  show(): Promise<AdsgramResult>
  destroy(): void
}

interface AdsgramResult {
  done: boolean
  description?: string
  state?: 'load' | 'render' | 'playing' | 'destroy'
  error?: boolean
}

// ─── Статус от бэкенда ───
interface AdStatus {
  available: boolean
  onCooldown: boolean
  dailyLimitReached: boolean
  nextAt: string | null
  adsWatchedToday: number
  adsRemainingToday: number
  reward: { coins: number; energy: number }
}

interface Props {
  blockId: string                                       // ID из кабинета Adsgram
  onRewarded: (coins: number, energy: number) => void  // колбэк после успешного просмотра
}

export function AdsgramButton({ blockId, onRewarded }: Props) {
  const [status, setStatus] = useState<AdStatus | null>(null)
  const [watching, setWatching] = useState(false)
  const [timeLeft, setTimeLeft] = useState('')
  const controllerRef = useRef<AdsgramController | null>(null)

  // Загружаем статус при монтировании
  const loadStatus = useCallback(async () => {
    try {
      const s = await api.adsgram.status()
      setStatus(s)
    } catch { /* тихо игнорируем — компонент просто не покажется */ }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Инициализируем Adsgram SDK
  useEffect(() => {
    if (!window.Adsgram) return
    try {
      controllerRef.current = window.Adsgram.init({
        blockId,
        debug: import.meta.env.DEV,
      })
    } catch (e) {
      console.warn('Adsgram init failed:', e)
    }
    return () => {
      controllerRef.current?.destroy()
    }
  }, [blockId])

  // Обратный отсчёт кулдауна
  useEffect(() => {
    if (!status?.nextAt) { setTimeLeft(''); return }
    const update = () => {
      const diff = new Date(status.nextAt!).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft(''); loadStatus(); return }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${m}:${String(s).padStart(2, '0')}`)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [status?.nextAt, loadStatus])

  const watchAd = useCallback(async () => {
    if (watching || !status?.available) return
    if (!controllerRef.current) {
      console.warn('Adsgram controller not ready')
      return
    }

    setWatching(true)
    tg?.HapticFeedback.impactOccurred('medium')

    try {
      const result = await controllerRef.current.show()

      if (!result.done) {
        // Юзер закрыл рекламу досрочно — не награждаем
        tg?.HapticFeedback.notificationOccurred('warning')
        setWatching(false)
        return
      }

      // Реклама досмотрена — верифицируем на сервере
      const reward = await api.adsgram.verify(blockId)
      tg?.HapticFeedback.notificationOccurred('success')
      onRewarded(reward.coinsReward, reward.energyReward)

      // Обновляем статус (теперь на кулдауне)
      await loadStatus()
    } catch (e: any) {
      tg?.HapticFeedback.notificationOccurred('error')
      console.error('Ad error:', e)
    } finally {
      setWatching(false)
    }
  }, [watching, status?.available, blockId, onRewarded, loadStatus])

  // Компонент не рендерим если статус не загружен или лимит исчерпан
  if (!status) return null
  if (status.dailyLimitReached) return (
    <div style={s.limitReached}>
      📺 Реклама на сегодня закончилась · {status.adsWatchedToday}/{status.adsWatchedToday + status.adsRemainingToday}
    </div>
  )

  return (
    <button
      onClick={watchAd}
      disabled={!status.available || watching}
      style={{
        ...s.btn,
        ...(status.available && !watching ? s.btnActive : s.btnDisabled),
      }}
    >
      {watching ? (
        <span style={s.inner}>
          <span style={s.spinner} /> Смотрим рекламу...
        </span>
      ) : status.onCooldown ? (
        <span style={s.inner}>
          <span style={s.icon}>📺</span>
          <span>
            <span style={s.label}>Реклама</span>
            <span style={s.sub}>через {timeLeft}</span>
          </span>
          <span style={s.reward}>+{status.reward.coins} 🪙</span>
        </span>
      ) : (
        <span style={s.inner}>
          <span style={s.icon}>▶️</span>
          <span>
            <span style={s.label}>Смотреть рекламу</span>
            <span style={s.sub}>осталось {status.adsRemainingToday} раз</span>
          </span>
          <span style={s.reward}>+{status.reward.coins} 🪙</span>
        </span>
      )}
    </button>
  )
}

// ─── Расширяем api клиент ───
// (добавляем в lib/api.ts отдельно через augmentation)
declare module '../lib/api' {
  interface ApiClient {
    adsgram: {
      status(): Promise<AdStatus>
      verify(blockId: string): Promise<{ coinsReward: number; energyReward: number; coins: number; energy: number }>
    }
  }
}

const s: Record<string, React.CSSProperties> = {
  btn: {
    width: '100%', border: 'none', borderRadius: 14,
    cursor: 'pointer', padding: '11px 14px',
    transition: 'opacity 0.15s',
  },
  btnActive: {
    background: 'linear-gradient(135deg, #1e3a5f, #1a4480)',
    border: '1px solid #1d4ed8',
  },
  btnDisabled: {
    background: '#0d0d1a',
    border: '1px solid #1a1a2e',
    opacity: 0.7,
    cursor: 'default',
  },
  inner: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  icon: { fontSize: 20, flexShrink: 0 },
  label: { display: 'block', fontSize: 14, fontWeight: 600, color: '#e2e8f0', textAlign: 'left' },
  sub: { display: 'block', fontSize: 11, color: '#64748b', textAlign: 'left', marginTop: 1 },
  reward: { marginLeft: 'auto', fontSize: 15, fontWeight: 700, color: '#60a5fa', flexShrink: 0 },
  spinner: {
    display: 'inline-block', width: 14, height: 14,
    border: '2px solid #1e3a5f', borderTopColor: '#60a5fa',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
    flexShrink: 0,
  },
  limitReached: {
    fontSize: 12, color: '#374151', textAlign: 'center',
    padding: '8px', background: '#0d0d1a',
    border: '1px solid #1a1a2e', borderRadius: 10,
  },
}
