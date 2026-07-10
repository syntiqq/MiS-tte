import { useState, useEffect } from 'react'
import { api, DailyStatus } from '../lib/api'
import { tg } from '../lib/api'

interface Props {
  onClaimed: (coins: number) => void
}

export function DailyBonus({ onClaimed }: Props) {
  const [status, setStatus] = useState<DailyStatus | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [result, setResult] = useState<{ coins: number; prize: boolean } | null>(null)
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    api.daily.status().then(setStatus).catch(() => {})
  }, [])

  // Обратный отсчёт до следующего бонуса
  useEffect(() => {
    if (!status?.nextAt) return
    const update = () => {
      const diff = new Date(status.nextAt!).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft(''); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${h}ч ${m}м ${s}с`)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [status?.nextAt])

  const claim = async () => {
    if (claiming) return
    setClaiming(true)
    try {
      const data = await api.daily.claim()
      tg?.HapticFeedback.notificationOccurred('success')
      setResult({ coins: data.coinsReward, prize: data.hasTgPrize })
      setStatus({ available: false, nextAt: data.nextAt })
      onClaimed(data.coinsReward)
    } catch (e: any) {
      tg?.HapticFeedback.notificationOccurred('error')
    } finally {
      setClaiming(false)
    }
  }

  if (!status) return null

  return (
    <div style={s.wrap}>
      {result ? (
        // Результат после клейма
        <div style={s.result}>
          <div style={s.resultIcon}>{result.prize ? '🎰' : '🎁'}</div>
          <div style={s.resultCoins}>+{result.coins.toLocaleString()}</div>
          <div style={s.resultLabel}>
            {result.prize ? '🏆 Поздравляем! Вы выиграли приз!' : 'монет получено'}
          </div>
          {timeLeft && <div style={s.nextLabel}>Следующий бонус через: {timeLeft}</div>}
        </div>
      ) : status.available ? (
        // Кнопка клейма
        <button onClick={claim} disabled={claiming} style={s.claimBtn}>
          {claiming ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <span style={s.spinner} /> Крутим рулетку...
            </span>
          ) : (
            '🎰 Забрать ежедневный бонус'
          )}
        </button>
      ) : (
        // Уже забрал сегодня
        <div style={s.waiting}>
          <span style={{ color: '#52525b' }}>⏰ Следующий бонус через</span>
          <span style={s.timer}>{timeLeft || '...'}</span>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { marginBottom: 10 },
  claimBtn: {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #92400e, #b45309)',
    border: 'none',
    borderRadius: 14,
    color: '#fef3c7',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: 0.3,
  },
  result: {
    background: 'linear-gradient(135deg, #0f1a10, #0a1f12)',
    border: '1px solid #166534',
    borderRadius: 14,
    padding: '16px',
    textAlign: 'center',
  },
  resultIcon: { fontSize: 32, marginBottom: 6 },
  resultCoins: { fontSize: 28, fontWeight: 700, color: '#4ade80' },
  resultLabel: { fontSize: 13, color: '#86efac', marginTop: 4 },
  nextLabel: { fontSize: 12, color: '#374151', marginTop: 10 },
  waiting: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#0d0d1a',
    border: '1px solid #1a1a2e',
    borderRadius: 12,
    padding: '12px 16px',
    fontSize: 13,
  },
  timer: { color: '#6366f1', fontVariantNumeric: 'tabular-nums', fontWeight: 600 },
  spinner: {
    display: 'inline-block', width: 14, height: 14,
    border: '2px solid #78350f', borderTopColor: '#fcd34d',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
}
