// Telegram WebApp типы
declare global {
  interface Window {
    Telegram: {
      WebApp: {
        initData: string
        initDataUnsafe: {
          user?: { id: number; username?: string; first_name?: string }
        }
        ready(): void
        expand(): void
        close(): void
        HapticFeedback: {
          impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
          notificationOccurred(type: 'error' | 'success' | 'warning'): void
        }
        MainButton: {
          text: string
          show(): void
          hide(): void
          onClick(fn: () => void): void
        }
        colorScheme: 'light' | 'dark'
        themeParams: Record<string, string>
      }
    }
  }
}

export const tg = window.Telegram?.WebApp

const API_URL = import.meta.env.VITE_API_URL ?? '/api'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const initData = tg?.initData ?? ''

  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-init-data': initData,
      ...opts?.headers,
    },
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`)
  }

  return data as T
}

// ---- Типы ответов ----
export interface UserState {
  id: string
  coins: number
  coinsLifetime: number
  energy: number
  energyMax: number
  passiveRate: number
  nftBonus: number
  pendingPassive: number
  nfts: NftCard[]
  lastDailyAt: string | null
}

export interface NftCard {
  phoneNumber: string
  beautyScore: number
  dailyBonus: number
  rank: number
}

export interface TapResult {
  coinsEarned: number
  coins: number
  energy: number
  energyMax: number
}

export interface DailyResult {
  coinsReward: number
  hasTgPrize: boolean
  coins: number
  nextAt: string
}

export interface DailyStatus {
  available: boolean
  nextAt: string | null
  lastClaimedAt?: string
}

export interface BoostResult {
  coins: number
  energy: number
  energyMax: number
}

export interface NftSyncResult {
  synced: number
  nftBonus: number
  nfts: NftCard[]
}

// ---- API методы ----
export const api = {
  user: {
    me: () => request<UserState>('/user/me'),
    tap: (taps: number) =>
      request<TapResult>('/user/tap', {
        method: 'POST',
        body: JSON.stringify({ taps, clientTs: Date.now() }),
      }),
    collectPassive: () =>
      request<{ collected: number; coins: number; coinsLifetime: number }>('/user/collect-passive', { method: 'POST' }),
    boost: (type: 'energy' | 'regen') =>
      request<BoostResult>('/user/boost', {
        method: 'POST',
        body: JSON.stringify({ type }),
      }),
  },
  nft: {
    connectWallet: (walletAddress: string) =>
      request<{ ok: boolean }>('/nft/connect-wallet', {
        method: 'POST',
        body: JSON.stringify({ walletAddress }),
      }),
    sync: () => request<NftSyncResult>('/nft/sync', { method: 'POST' }),
    leaderboard: () =>
      request<Array<{ position: number; phoneNumber: string; beautyScore: number; dailyBonus: number; username: string }>>('/nft/leaderboard'),
  },
  daily: {
    claim: () => request<DailyResult>('/daily/claim', { method: 'POST' }),
    status: () => request<DailyStatus>('/daily/status'),
  },
  adsgram: {
    status: () => request<AdStatus>('/adsgram/status'),
    verify: (blockId: string) =>
      request<AdReward>('/adsgram/verify', {
        method: 'POST',
        body: JSON.stringify({ blockId }),
      }),
  },
}

export { ApiError }

// ─── Adsgram ───
export interface AdStatus {
  available: boolean
  onCooldown: boolean
  dailyLimitReached: boolean
  nextAt: string | null
  adsWatchedToday: number
  adsRemainingToday: number
  reward: { coins: number; energy: number }
}

export interface AdReward {
  coinsReward: number
  energyReward: number
  coins: number
  energy: number
  adsWatchedToday: number
  adsRemainingToday: number
}

// Добавляем в api объект

