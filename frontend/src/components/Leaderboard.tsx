import { useState, useEffect } from 'react'
import { api } from '../lib/api'

type LeaderEntry = {
  position: number
  phoneNumber: string
  beautyScore: number
  dailyBonus: number
  username: string
}

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.nft.leaderboard()
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#374151' }}>
      <div style={s.spinner} />
    </div>
  )

  if (!entries.length) return (
    <div style={s.empty}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
      <div>Лидерборд пока пуст</div>
      <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
        Подключите кошелёк с номером MintSim
      </div>
    </div>
  )

  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

  return (
    <div>
      <div style={s.header}>Топ по красоте номеров</div>
      {entries.map(e => (
        <div key={e.position} style={{
          ...s.row,
          ...(e.position <= 3 ? s.rowTop : {}),
        }}>
          <div style={s.pos}>
            {medals[e.position] ?? <span style={s.posNum}>{e.position}</span>}
          </div>
          <div style={s.info}>
            <div style={s.phone}>{e.phoneNumber}</div>
            <div style={s.username}>@{e.username}</div>
          </div>
          <div style={s.right}>
            <div style={s.score}>{e.beautyScore.toFixed(1)}%</div>
            <div style={s.bonus}>+{e.dailyBonus}/день</div>
          </div>
        </div>
      ))}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  header: {
    fontSize: 12, fontWeight: 500, color: '#52525b',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 10,
  },
  row: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px', marginBottom: 6,
    background: '#0d0d1a', border: '1px solid #1a1a2e',
    borderRadius: 12,
  },
  rowTop: {
    background: 'linear-gradient(135deg, #12112a, #1a1035)',
    border: '1px solid #2d2a50',
  },
  pos: { width: 28, textAlign: 'center', fontSize: 20, flexShrink: 0 },
  posNum: { fontSize: 14, color: '#374151', fontWeight: 600 },
  info: { flex: 1, minWidth: 0 },
  phone: { fontSize: 15, fontWeight: 500, color: '#e2e8f0', letterSpacing: 0.5 },
  username: { fontSize: 11, color: '#374151', marginTop: 2 },
  right: { textAlign: 'right', flexShrink: 0 },
  score: { fontSize: 15, fontWeight: 700, color: '#a78bfa' },
  bonus: { fontSize: 11, color: '#4ade80', marginTop: 2 },
  empty: { textAlign: 'center', padding: '40px 20px', color: '#52525b', fontSize: 14 },
  spinner: {
    width: 24, height: 24, margin: '0 auto',
    border: '2px solid #1a1a2e', borderTopColor: '#7c3aed',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
}
