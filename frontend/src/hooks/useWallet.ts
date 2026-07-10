import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react'
import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'synced' | 'error'

export function useWallet(onSynced?: () => void) {
  const [tonConnectUI] = useTonConnectUI()
  const wallet = useTonWallet()
  const [status, setStatus] = useState<WalletStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const [nftBonus, setNftBonus] = useState<number>(0)

  // Когда кошелёк подключился — сразу коннектим на бэке и синкаем NFT
  useEffect(() => {
    if (!wallet) {
      setStatus('disconnected')
      return
    }

    const address = wallet.account.address
    setStatus('connecting')
    setError(null)

    ;(async () => {
      try {
        // 1. Привязываем адрес к юзеру
        await api.nft.connectWallet(address)

        // 2. Синкаем NFT с TonAPI
        setStatus('syncing')
        const result = await api.nft.sync()
        setNftBonus(result.nftBonus)
        setStatus('synced')
        onSynced?.()
      } catch (e: any) {
        // Если кэш свежий — это не ошибка, просто уже синкнуто
        if (e.status === 429) {
          setStatus('synced')
          onSynced?.()
        } else {
          setError(e.message)
          setStatus('error')
        }
      }
    })()
  }, [wallet?.account.address])

  const connect = useCallback(() => {
    tonConnectUI.openModal()
  }, [tonConnectUI])

  const disconnect = useCallback(() => {
    tonConnectUI.disconnect()
  }, [tonConnectUI])

  const resync = useCallback(async () => {
    if (!wallet) return
    setStatus('syncing')
    setError(null)
    try {
      const result = await api.nft.sync()
      setNftBonus(result.nftBonus)
      setStatus('synced')
      onSynced?.()
    } catch (e: any) {
      setError(e.message)
      setStatus('error')
    }
  }, [wallet])

  return {
    wallet,
    status,
    error,
    nftBonus,
    connect,
    disconnect,
    resync,
    address: wallet?.account.address ?? null,
  }
}
