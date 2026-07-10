import { useWallet } from '../hooks/useWallet'

interface Props {
  onSynced: () => void
}

export function WalletConnect({ onSynced }: Props) {
  const { wallet, status, error, connect, disconnect, resync, address } = useWallet(onSynced)

  const shortAddr = address
    ? address.slice(0, 6) + '…' + address.slice(-4)
    : null

  return (
    <div style={s.wrap}>
      {!wallet ? (
        <div style={s.card}>
          <div style={s.icon}>💎</div>
          <div style={s.title}>Подключите кошелёк</div>
          <div style={s.sub}>
            Чтобы получать бонус от номеров MintSim — подключите TON-кошелёк
          </div>
          <button onClick={connect} style={s.btn}>
            Подключить кошелёк
          </button>
        </div>
      ) : (
        <div style={s.connected}>
          <div style={s.addrRow}>
            <span style={s.dot} />
            <span style={s.addr}>{shortAddr}</span>
            <button onClick={disconnect} style={s.disconnectBtn}>Отключить</button>
          </div>

          {status === 'syncing' && (
            <div style={s.statusRow}>
              <span style={s.spinner} />
              Загружаем номера...
            </div>
          )}
          {status === 'synced' && (
            <div style={{ ...s.statusRow, color: '#4ade80' }}>
              ✓ Номера загружены
              <button onClick={resync} style={s.resyncBtn}>Обновить</button>
            </div>
          )}
          {status === 'error' && (
            <div style={{ ...s.statusRow, color: '#f87171' }}>
              ⚠ {error}
              <button onClick={resync} style={s.resyncBtn}>Повторить</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { padding: '0 0 8px' },
  card: {
    background: 'linear-gradient(135deg, #12122a, #1a1030)',
    border: '1px solid #2d2a50',
    borderRadius: 16,
    padding: '24px 20px',
    textAlign: 'center',
  },
  icon: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 },
  sub: { fontSize: 13, color: '#64748b', lineHeight: 1.5, marginBottom: 20 },
  btn: {
    width: '100%',
    padding: '13px',
    background: 'linear-gradient(135deg, #5b21b6, #7c3aed)',
    border: 'none',
    borderRadius: 12,
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  connected: {
    background: '#0f0f1e',
    border: '1px solid #1e1e3a',
    borderRadius: 12,
    padding: '10px 14px',
  },
  addrRow: { display: 'flex', alignItems: 'center', gap: 8 },
  dot: {
    width: 8, height: 8, borderRadius: '50%',
    background: '#4ade80', flexShrink: 0,
  },
  addr: { fontSize: 13, color: '#a1a1aa', flex: 1, fontFamily: 'monospace' },
  disconnectBtn: {
    fontSize: 11, color: '#52525b', background: 'none',
    border: 'none', cursor: 'pointer', padding: '2px 4px',
  },
  statusRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, color: '#64748b', marginTop: 8,
  },
  spinner: {
    display: 'inline-block', width: 12, height: 12,
    border: '2px solid #334155', borderTopColor: '#7c3aed',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  resyncBtn: {
    marginLeft: 'auto', fontSize: 11, color: '#7c3aed',
    background: 'none', border: 'none', cursor: 'pointer',
  },
}
