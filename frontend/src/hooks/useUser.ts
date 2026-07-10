import { useState, useEffect, useCallback, useRef } from 'react'
import { api, UserState, tg } from '../lib/api'
import { ECONOMY } from '@shared/economy'

export function useUser() {
  const [user, setUser] = useState<UserState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api.user.me()
      setUser(data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Локальный реген энергии — обновляем каждые 10 сек,
  // синхронизируемся с сервером каждые 30 сек
  useEffect(() => {
    if (!user) return

    const regenInterval = setInterval(() => {
      setUser(prev => {
        if (!prev) return prev
        // ~50 ед/час = 0.83/мин = 0.138/10с
        const delta = Math.floor(ECONOMY.ENERGY_REGEN_PER_HOUR / 360)
        const newEnergy = Math.min(prev.energy + delta, prev.energyMax)
        return newEnergy !== prev.energy ? { ...prev, energy: newEnergy } : prev
      })
    }, 10_000)

    const syncInterval = setInterval(load, 30_000)

    return () => {
      clearInterval(regenInterval)
      clearInterval(syncInterval)
    }
  }, [!!user, load])

  return { user, setUser, loading, error, reload: load }
}

// ---- Хук тапов с батчингом и haptic ----
export function useTapper(
  user: UserState | null,
  setUser: React.Dispatch<React.SetStateAction<UserState | null>>
) {
  const pendingTaps = useRef(0)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFlushing = useRef(false)

  const [floats, setFloats] = useState<Array<{ id: number; x: number; y: number }>>([])

  const flush = useCallback(async () => {
    if (isFlushing.current || pendingTaps.current <= 0) return
    isFlushing.current = true
    const toSend = pendingTaps.current
    pendingTaps.current = 0

    try {
      const data = await api.user.tap(toSend)
      // Серверные данные — источник правды
      setUser(prev => prev ? { ...prev, coins: data.coins, energy: data.energy } : prev)
    } catch {
      // При ошибке возвращаем тапы (UI уже обновлён оптимистично — оставляем как есть)
    } finally {
      isFlushing.current = false
    }
  }, [setUser])

  const tap = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!user || user.energy <= 0) {
      tg?.HapticFeedback.notificationOccurred('error')
      return
    }

    // Haptic
    tg?.HapticFeedback.impactOccurred('light')

    // Оптимистичное обновление
    setUser(prev => {
      if (!prev || prev.energy <= 0) return prev
      return {
        ...prev,
        coins: prev.coins + ECONOMY.COINS_PER_TAP,
        coinsLifetime: prev.coinsLifetime + ECONOMY.COINS_PER_TAP,
        energy: prev.energy - ECONOMY.ENERGY_PER_TAP,
      }
    })

    // Floating +1
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const id = Date.now() + Math.random()
    const x = e.clientX - rect.left + (Math.random() - 0.5) * 40
    const y = e.clientY - rect.top - 10
    setFloats(prev => [...prev.slice(-10), { id, x, y }]) // не больше 10 одновременно
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 800)

    // Батч
    pendingTaps.current++
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(flush, 350)
  }, [user, setUser, flush])

  return { tap, floats }
}
