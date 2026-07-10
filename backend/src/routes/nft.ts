import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { calcNftBonus, ECONOMY } from '../../shared/economy'
import { calcBeautyScore } from '../../shared/beauty'

const router = Router()
const prisma = new PrismaClient()
// ============================================================
// POST /nft/sync — подтянуть NFT из TonAPI и пересчитать бонус
// ============================================================
router.post('/sync', async (req, res) => {
  const { id } = req.tgUser
  const now = new Date()

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return res.status(404).json({ error: 'User not found' })

  if (!user.walletAddress) {
    return res.status(400).json({ error: 'No wallet connected. Connect wallet first.' })
  }

  // Проверяем кэш — не дёргаем TonAPI слишком часто
  if (user.nftCachedAt) {
    const hoursSince = (now.getTime() - user.nftCachedAt.getTime()) / 3600000
    if (hoursSince < ECONOMY.NFT_CACHE_TTL_HOURS) {
      return res.status(429).json({
        error: 'NFT cache is fresh',
        nextSyncAt: new Date(user.nftCachedAt.getTime() + ECONOMY.NFT_CACHE_TTL_HOURS * 3600000),
      })
    }
  }

  // Дёргаем TonAPI — получаем NFT из коллекции MintSim
  const COLLECTION_ADDRESS = process.env.MS_COLLECTION_ADDRESS!
  const tonApiUrl = `https://tonapi.io/v2/accounts/${user.walletAddress}/nfts?collection=${COLLECTION_ADDRESS}&limit=50`

  let nftsRaw: any[]
  try {
    const response = await fetch(tonApiUrl, {
      headers: { Authorization: `Bearer ${process.env.TON_API_KEY}` },
    })
    if (!response.ok) throw new Error(`TonAPI error: ${response.status}`)
    const data = await response.json() as { nft_items?: unknown[] }
    nftsRaw = data.nft_items ?? []
  } catch (err: any) {
    console.error('TonAPI fetch failed:', err.message)
    return res.status(502).json({ error: 'Failed to fetch NFTs from TonAPI' })
  }

  // Парсим номера из metadata NFT
  // MintSim хранит номер в attributes или name — адаптируй под реальную структуру
  const parsed = (nftsRaw as Record<string, any>[]).map((nft) => {
    const phoneNumber: string =
      nft.metadata?.attributes?.find((a: any) => a.trait_type === 'phone')?.value ??
      nft.metadata?.name ??
      ''
    const beautyScore = calcBeautyScore(phoneNumber)
    return { nftAddress: nft.address, phoneNumber, beautyScore }
  }).filter(n => n.phoneNumber.length > 0)

  // Сортируем и назначаем rank (1 = самый красивый)
  const ranked = parsed
    .sort((a, b) => b.beautyScore - a.beautyScore)
    .map((n, i) => ({ ...n, rank: i + 1 }))

  // Считаем NFT-бонус (топ-5 с диминишингом)
  const beautyScores = ranked.slice(0, 5).map(n => n.beautyScore)
  const nftBonus = calcNftBonus(beautyScores)

  // Считаем dailyBonus для каждого номера (с учётом его позиции)
  const withBonus = ranked.map((n: { nftAddress: string; phoneNumber: string; beautyScore: number; rank: number }, i: number) => ({
    ...n,
    dailyBonus: i < ECONOMY.NFT_DIMINISHING.length
      ? Math.round(n.beautyScore * ECONOMY.NFT_BEAUTY_MULTIPLIER * ECONOMY.NFT_DIMINISHING[i])
      : 0,
  }))

  // Атомарно обновляем NFT в БД и пересчитываем бонус юзера
  await prisma.$transaction([
    // Удаляем старые NFT этого юзера
    prisma.userNft.deleteMany({ where: { userId: id } }),
    // Вставляем актуальные
    ...withBonus.map(n =>
      prisma.userNft.create({
        data: {
          userId: id,
          nftAddress: n.nftAddress,
          phoneNumber: n.phoneNumber,
          beautyScore: n.beautyScore,
          dailyBonus: n.dailyBonus,
          rank: n.rank,
        },
      })
    ),
    // Обновляем юзера: новый nftBonus и время кэша
    prisma.user.update({
      where: { id },
      data: { nftBonus, nftCachedAt: now },
    }),
  ])

  return res.json({
    synced: withBonus.length,
    nftBonus,
    nfts: withBonus.map(n => ({
      phoneNumber: n.phoneNumber,
      beautyScore: n.beautyScore,
      dailyBonus: n.dailyBonus,
      rank: n.rank,
    })),
  })
})

// ============================================================
// POST /nft/connect-wallet — привязать TON-кошелёк
// ============================================================
router.post('/connect-wallet', async (req, res) => {
  const { id } = req.tgUser
  const { walletAddress } = req.body as { walletAddress: string }

  if (!walletAddress || typeof walletAddress !== 'string') {
    return res.status(400).json({ error: 'walletAddress required' })
  }

  // Базовая проверка формата TON-адреса
  if (!/^[0-9A-Za-z_\-]{48}$/.test(walletAddress)) {
    return res.status(400).json({ error: 'Invalid TON address format' })
  }

  // Проверяем что адрес не занят другим юзером
  const existing = await prisma.user.findFirst({
    where: { walletAddress, NOT: { id } },
  })
  if (existing) {
    return res.status(409).json({ error: 'Wallet already linked to another account' })
  }

  await prisma.user.update({
    where: { id },
    data: { walletAddress },
  })

  return res.json({ ok: true, walletAddress })
})

// ============================================================
// GET /nft/leaderboard — топ по красоте номеров
// ============================================================
router.get('/leaderboard', async (req, res) => {
  const top = await prisma.userNft.findMany({
    where: { rank: 1 }, // только лучший номер каждого юзера
    orderBy: { beautyScore: 'desc' },
    take: 50,
    include: {
      user: { select: { username: true, firstName: true } },
    },
  })

  return res.json(
    top.map((n: { phoneNumber: string; beautyScore: number; dailyBonus: number; user: { username: string | null; firstName: string | null } }, i: number) => ({
      position: i + 1,
      phoneNumber: maskPhone(n.phoneNumber),
      beautyScore: n.beautyScore,
      dailyBonus: n.dailyBonus,
      username: n.user.username ?? n.user.firstName ?? 'Anonymous',
    }))
  )
})

// Маскируем средние цифры: +999 63***680
function maskPhone(phone: string): string {
  if (phone.length < 8) return phone
  return phone.slice(0, -6) + '***' + phone.slice(-3)
}

export default router
