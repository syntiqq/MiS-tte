import { TonConnectUIProvider } from '@tonconnect/ui-react'
import { useState, useEffect } from 'react'
import { tg, api } from './lib/api'
import { useUser, useTapper } from './hooks/useUser'
import { WalletConnect } from './components/WalletConnect'
import { DailyBonus } from './components/DailyBonus'
import { Leaderboard } from './components/Leaderboard'
import { AdsgramButton } from './components/AdsgramButton'
import { ECONOMY } from '@shared/economy'

const MANIFEST_URL = `${window.location.origin}/tonconnect-manifest.json`

type Tab = 'tap' | 'nft' | 'top'

export default function App() {
  useEffect(() => {
    tg?.ready()
    tg?.expand()
  }, [])

  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
      <Main />
    </TonConnectUIProvider>
  )
}

function Main() {
  const { user, setUser, loading, error, reload } = useUser()
  const { tap, floats } = useTapper(user, setUser)
  const [tab, setTab] = useState<Tab>('tap')
  const [collecting, setCollecting] = useState(false)

  const collectPassive = async () => {
    if (collecting || !user || user.pendingPassive <= 0) return
    setCollecting(true)
    try {
      const data = await api.user.collectPassive()
      tg?.HapticFeedback.notificationOccurred('success')
      setUser(prev => prev ? { ...prev, coins: data.coins, pendingPassive: 0, coinsLifetime: data.coinsLifetime } : prev)
    } finally {
      setCollecting(false)
    }
  }

  const buyBoost = async (type: 'energy' | 'regen') => {
    try {
      const data = await api.user.boost(type)
      tg?.HapticFeedback.notificationOccurred('success')
      setUser(prev => prev ? { ...prev, coins: data.coins, energy: data.energy } : prev)
    } catch (e: any) {
      tg?.HapticFeedback.notificationOccurred('error')
    }
  }

  if (loading) return <Splash />
  if (error || !user) return <ErrorScreen onRetry={reload} />

  const energyPct = Math.min((user.energy / user.energyMax) * 100, 100)
  const isLowEnergy = user.energy < user.energyMax * 0.2

  return (
    <div style={s.root}>
      {/* Шапка */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.coinsSmall}>МОНЕТЫ</div>
          <div style={s.coins}>{user.coins.toLocaleString()}</div>
        </div>
        <div style={s.headerRight}>
          <div style={s.coinsSmall} >ЗА ВСЁ ВРЕМЯ</div>
          <div style={{ ...s.coins, fontSize: 16, color: '#a78bfa' }}>
            {user.coinsLifetime.toLocaleString()}
          </div>
        </div>
      </header>

      {/* Пассивка */}
      {user.pendingPassive >= 60 && (
        <button onClick={collectPassive} disabled={collecting} style={s.passiveBar}>
          <span>💰</span>
          <span>Собрать пассивку</span>
          <span style={s.passiveAmount}>+{user.pendingPassive.toLocaleString()}</span>
        </button>
      )}

      {/* Табы */}
      <nav style={s.tabs}>
        {(['tap', 'nft', 'top'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            ...s.tab,
            ...(tab === t ? s.tabActive : {}),
          }}>
            {t === 'tap' ? '👆 Тап' : t === 'nft' ? '📱 Номера' : '🏆 Топ'}
          </button>
        ))}
      </nav>

      {/* ─────── ЭКРАН ТАП ─────── */}
      {tab === 'tap' && (
        <div style={s.tapScreen}>

          {/* Ежедневный бонус */}
          <DailyBonus onClaimed={coins => setUser(prev => prev ? {
            ...prev,
            coins: prev.coins + coins,
            coinsLifetime: prev.coinsLifetime + coins,
          } : prev)} />

          <AdsgramButton
            blockId={import.meta.env.VITE_ADSGRAM_BLOCK_ID ?? "YOUR_BLOCK_ID"}
            onRewarded={(coins, energy) => setUser(prev => prev ? {
              ...prev,
              coins: prev.coins + coins,
              coinsLifetime: prev.coinsLifetime + coins,
              energy: Math.min(prev.energy + energy, prev.energyMax),
            } : prev)}
          />

          {/* Кнопка тапа */}
          <div style={s.tapWrap}>
            <div style={s.tapGlow} />
            <button
              onPointerDown={tap}
              style={{
                ...s.tapBtn,
                opacity: user.energy <= 0 ? 0.35 : 1,
                transform: user.energy <= 0 ? 'scale(0.96)' : undefined,
              }}
            >
              🍃
            </button>

            {/* Floating +1 */}
            {floats.map(f => (
              <div key={f.id} style={{ ...s.float, left: f.x, top: f.y }}>+1</div>
            ))}
          </div>

          {/* Энергия */}
          <div style={s.energyWrap}>
            <div style={s.energyRow}>
              <span style={{ ...s.energyLabel, color: isLowEnergy ? '#f87171' : '#64748b' }}>
                ⚡ Энергия
              </span>
              <span style={s.energyVal}>{user.energy} / {user.energyMax}</span>
            </div>
            <div style={s.energyTrack}>
              <div style={{
                ...s.energyFill,
                width: `${energyPct}%`,
                background: isLowEnergy
                  ? 'linear-gradient(90deg, #7f1d1d, #ef4444)'
                  : 'linear-gradient(90deg, #4c1d95, #7c3aed)',
              }} />
            </div>
          </div>

          {/* Бусты */}
          <div style={s.boosts}>
            <button onClick={() => buyBoost('energy')} style={s.boostBtn}>
              <span style={s.boostIcon}>⚡</span>
              <span style={s.boostName}>Энергия</span>
              <span style={s.boostCost}>{ECONOMY.BOOST_ENERGY_COST}</span>
            </button>
            <button onClick={() => buyBoost('regen')} style={s.boostBtn}>
              <span style={s.boostIcon}>🔄</span>
              <span style={s.boostName}>Реген</span>
              <span style={s.boostCost}>{ECONOMY.BOOST_REGEN_COST}</span>
            </button>
          </div>

          {/* Ставки */}
          <div style={s.rates}>
            <span>📈 {user.passiveRate} мон/час</span>
            {user.nftBonus > 0 && <span>📱 +{user.nftBonus} мон/день (NFT)</span>}
          </div>
        </div>
      )}

      {/* ─────── ЭКРАН НОМЕРА ─────── */}
      {tab === 'nft' && (
        <div>
          <WalletConnect onSynced={reload} />

          {user.nfts.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={s.sectionLabel}>Ваши номера MintSim</div>
              {user.nfts.map(nft => (
                <div key={nft.rank} style={{
                  ...s.nftCard,
                  ...(nft.rank === 1 ? s.nftCardBest : {}),
                }}>
                  <div style={s.nftPhone}>{nft.phoneNumber}</div>
                  <div style={s.nftMeta}>
                    <span style={s.nftBeauty}>✨ {nft.beautyScore.toFixed(1)}% красоты</span>
                    <span style={s.nftBonus}>+{nft.dailyBonus}/день</span>
                  </div>
                  {nft.rank === 1 && <div style={s.bestBadge}>🌟 Лучший</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────── ЛИДЕРБОРД ─────── */}
      {tab === 'top' && <Leaderboard />}
    </div>
  )
}

function Splash() {
  return (
    <div style={{ ...s.root, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ fontSize: 48 }}>🍃</div>
      <div style={{ fontSize: 14, color: '#374151' }}>Загрузка...</div>
    </div>
  )
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ ...s.root, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
      <div style={{ fontSize: 36 }}>⚠️</div>
      <div style={{ fontSize: 14, color: '#f87171', textAlign: 'center' }}>
        Не удалось загрузить данные.<br />Откройте через Telegram.
      </div>
      <button onClick={onRetry} style={{ padding: '10px 24px', background: '#1e1e35', border: '1px solid #2d2a50', borderRadius: 10, color: '#a78bfa', cursor: 'pointer' }}>
        Повторить
      </button>
    </div>
  )
}

// ─── Стили ───
const s: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui,-apple-system,sans-serif', padding: '12px 14px', boxSizing: 'border-box' },
  header: { display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#0d0d1e', border: '1px solid #1a1a2e', borderRadius: 16, marginBottom: 10 },
  headerLeft: {},
  headerRight: { textAlign: 'right' },
  coinsSmall: { fontSize: 10, fontWeight: 600, color: '#374151', letterSpacing: '0.08em', marginBottom: 3 },
  coins: { fontSize: 26, fontWeight: 700, letterSpacing: -0.5 },

  passiveBar: { width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'linear-gradient(135deg, #1a1030, #12122a)', border: '1px solid #3730a3', borderRadius: 12, color: '#c4b5fd', fontSize: 14, cursor: 'pointer', marginBottom: 10 },
  passiveAmount: { marginLeft: 'auto', fontWeight: 700, color: '#a78bfa' },

  tabs: { display: 'flex', gap: 6, marginBottom: 14 },
  tab: { flex: 1, padding: '9px 4px', background: '#0d0d1a', border: '1px solid #1a1a2e', borderRadius: 10, color: '#374151', fontSize: 13, cursor: 'pointer' },
  tabActive: { background: '#12112a', border: '1px solid #3730a3', color: '#a78bfa', fontWeight: 600 },

  tapScreen: { display: 'flex', flexDirection: 'column', gap: 14 },
  tapWrap: { position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', height: 180 },
  tapGlow: { position: 'absolute', width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)', pointerEvents: 'none' },
  tapBtn: { width: 148, height: 148, borderRadius: '50%', fontSize: 64, background: 'radial-gradient(circle at 40% 35%, #1e1a40, #0d0a20)', border: '2px solid #2d2060', cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, transition: 'opacity 0.2s, transform 0.1s', boxShadow: '0 0 30px rgba(124,58,237,0.2), inset 0 1px 0 rgba(255,255,255,0.05)' },
  float: { position: 'absolute', fontSize: 18, fontWeight: 700, color: '#a78bfa', pointerEvents: 'none', animation: 'floatUp 0.8s ease-out forwards', zIndex: 10 },

  energyWrap: {},
  energyRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 },
  energyLabel: { fontSize: 13 },
  energyVal: { fontSize: 13, fontWeight: 600 },
  energyTrack: { height: 6, background: '#0d0d1a', borderRadius: 3, overflow: 'hidden' },
  energyFill: { height: '100%', borderRadius: 3, transition: 'width 0.4s ease' },

  boosts: { display: 'flex', gap: 8 },
  boostBtn: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '10px 6px', background: '#0d0d1a', border: '1px solid #1a1a2e', borderRadius: 12, cursor: 'pointer', color: '#fff' },
  boostIcon: { fontSize: 20 },
  boostName: { fontSize: 12, color: '#64748b' },
  boostCost: { fontSize: 11, color: '#7c3aed', fontWeight: 600 },

  rates: { display: 'flex', justifyContent: 'center', gap: 16, fontSize: 12, color: '#374151' },

  sectionLabel: { fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 },
  nftCard: { background: '#0d0d1a', border: '1px solid #1a1a2e', borderRadius: 14, padding: '12px 16px', marginBottom: 8, position: 'relative' },
  nftCardBest: { background: 'linear-gradient(135deg, #12112a, #1a1035)', border: '1px solid #2d2a50' },
  nftPhone: { fontSize: 18, fontWeight: 600, letterSpacing: 1, marginBottom: 6 },
  nftMeta: { display: 'flex', justifyContent: 'space-between' },
  nftBeauty: { fontSize: 13, color: '#a78bfa' },
  nftBonus: { fontSize: 13, color: '#4ade80', fontWeight: 600 },
  bestBadge: { position: 'absolute', top: 10, right: 12, fontSize: 12 },
}
