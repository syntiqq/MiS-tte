import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import {
  ECONOMY,
  calcCurrentEnergy,
  calcPassiveAccrued,
} from '../../shared/economy'

const router = Router()
const prisma = new PrismaClient()

// ============================================================
// GET /user/me — получить состояние юзера (баланс, энергия, NFT)
// ============================================================
router.get('/me', async (req, res) => {
  const { id, username, firstName } = req.tgUser
  const now = new Date()

  // Upsert — создаём если первый вход
  let user = await prisma.user.upsert({
    where: { id },
    update: { lastSeen: now, username, firstName },
    create: { id, username, firstName },
    include: { nfts: { orderBy: { rank: 'asc' } } },
  })

  // Считаем актуальную энергию с учётом регена
  const currentEnergy = calcCurrentEnergy(user.energy, user.energyUpdatedAt, now)

  // Считаем накопленную пассивку (не начисляем, просто показываем)
  const pendingPassive = calcPassiveAccrued(
    user.passiveRate,
    user.nftBonus,
    user.passiveClaimedAt,
    now
  )

  return res.json({
    id: user.id,
    coins: user.coins,
    coinsLifetime: user.coinsLifetime,
    energy: currentEnergy,
    energyMax: ECONOMY.ENERGY_MAX,
    passiveRate: user.passiveRate,
    nftBonus: user.nftBonus,
    pendingPassive,
    suspicionScore: user.suspicionScore,
    nfts: (user.nfts as Array<{ phoneNumber: string; beautyScore: number; dailyBonus: number; rank: number }>).map(n => ({
      phoneNumber: n.phoneNumber,
      beautyScore: n.beautyScore,
      dailyBonus: n.dailyBonus,
      rank: n.rank,
    })),
    lastDailyAt: user.lastDailyAt,
  })
})

// ============================================================
// POST /user/tap — засчитать тапы (главный эндпоинт)
// ============================================================
router.post('/tap', async (req, res) => {
  const { id } = req.tgUser
  const now = new Date()

  const { taps, clientTs } = req.body as { taps: number; clientTs: number }

  // Валидация входа
  if (!Number.isInteger(taps) || taps < 1 || taps > ECONOMY.TAP_MAX_PER_REQUEST) {
    return res.status(400).json({ error: `taps must be 1–${ECONOMY.TAP_MAX_PER_REQUEST}` })
  }

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return res.status(404).json({ error: 'User not found' })

  // Анти-бот: проверяем минимальный интервал между запросами
  if (user.lastTapAt) {
    const msSinceLast = now.getTime() - user.lastTapAt.getTime()
    const minExpected = taps * ECONOMY.TAP_MIN_INTERVAL_MS
    if (msSinceLast < minExpected * 0.5) {
      // Подозрительно быстро — повышаем suspicion, не банить сразу
      await prisma.user.update({
        where: { id },
        data: { suspicionScore: Math.min(user.suspicionScore + 10, 100) },
      })
    }
  }

  // Считаем актуальную энергию
  const currentEnergy = calcCurrentEnergy(user.energy, user.energyUpdatedAt, now)

  // Урезаем тапы если не хватает энергии
  const energyLimit = user.suspicionScore >= ECONOMY.TAP_SUSPICION_THRESHOLD
    ? Math.floor(currentEnergy * 0.5)  // боты получают половину
    : currentEnergy
  const actualTaps = Math.min(taps, energyLimit)

  if (actualTaps <= 0) {
    return res.status(400).json({ error: 'Not enough energy', energy: currentEnergy })
  }

  const coinsEarned = actualTaps * ECONOMY.COINS_PER_TAP
  const energySpent = actualTaps * ECONOMY.ENERGY_PER_TAP
  const newEnergy = currentEnergy - energySpent

  // Атомарное обновление в транзакции
  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        coins: { increment: coinsEarned },
        coinsLifetime: { increment: coinsEarned },
        energy: newEnergy,
        energyUpdatedAt: now,
        lastTapAt: now,
        tapCount: { increment: actualTaps },
        suspicionScore: Math.max(0, user.suspicionScore - 1), // медленно снижаем при честной игре
      },
    }),
    prisma.tapSession.create({
      data: {
        userId: id,
        tapsCount: actualTaps,
        coinsEarned,
        energySpent,
        clientTs: BigInt(clientTs ?? 0),
      },
    }),
    prisma.transaction.create({
      data: {
        userId: id,
        type: 'TAP',
        amount: coinsEarned,
        balanceBefore: user.coins,
        balanceAfter: user.coins + coinsEarned,
        meta: JSON.stringify({ taps: actualTaps }),
      },
    }),
  ])

  return res.json({
    coinsEarned,
    coins: updatedUser.coins,
    energy: newEnergy,
    energyMax: ECONOMY.ENERGY_MAX,
  })
})

// ============================================================
// POST /user/collect-passive — собрать накопленную пассивку
// ============================================================
router.post('/collect-passive', async (req, res) => {
  const { id } = req.tgUser
  const now = new Date()

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return res.status(404).json({ error: 'User not found' })

  // Минимальный интервал между сборами
  const minIntervalMs = ECONOMY.PASSIVE_COLLECT_INTERVAL * 60 * 1000
  if (user.passiveClaimedAt && now.getTime() - user.passiveClaimedAt.getTime() < minIntervalMs) {
    const nextAt = new Date(user.passiveClaimedAt.getTime() + minIntervalMs)
    return res.status(429).json({ error: 'Too soon', nextCollectAt: nextAt })
  }

  const accrued = calcPassiveAccrued(user.passiveRate, user.nftBonus, user.passiveClaimedAt, now)

  if (accrued <= 0) {
    return res.status(400).json({ error: 'Nothing to collect yet' })
  }

  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        coins: { increment: accrued },
        coinsLifetime: { increment: accrued },
        passiveClaimedAt: now,
      },
    }),
    prisma.transaction.create({
      data: {
        userId: id,
        type: 'PASSIVE',
        amount: accrued,
        balanceBefore: user.coins,
        balanceAfter: user.coins + accrued,
        meta: JSON.stringify({ hours: ((now.getTime() - user.passiveClaimedAt.getTime()) / 3600000).toFixed(2) }),
      },
    }),
  ])

  return res.json({
    collected: accrued,
    coins: updatedUser.coins,
    coinsLifetime: updatedUser.coinsLifetime,
  })
})

// ============================================================
// POST /user/boost — купить буст за монеты
// ============================================================
router.post('/boost', async (req, res) => {
  const { id } = req.tgUser
  const now = new Date()

  const { type } = req.body as { type: 'energy' | 'regen' }

  const COSTS: Record<string, number> = {
    energy: ECONOMY.BOOST_ENERGY_COST,
    regen: ECONOMY.BOOST_REGEN_COST,
  }

  const cost = COSTS[type]
  if (!cost) return res.status(400).json({ error: 'Unknown boost type' })

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return res.status(404).json({ error: 'User not found' })

  if (user.coins < cost) {
    return res.status(400).json({ error: 'Not enough coins', need: cost, have: user.coins })
  }

  const currentEnergy = calcCurrentEnergy(user.energy, user.energyUpdatedAt, now)

  let newEnergy = currentEnergy
  if (type === 'energy') {
    newEnergy = Math.min(currentEnergy + ECONOMY.ENERGY_MAX, ECONOMY.ENERGY_MAX)
  }
  // regen boost — сохраняем в meta, применяется при следующем calcCurrentEnergy
  // (упрощение: для MVP просто добавляем 150 единиц энергии как эффект)
  if (type === 'regen') {
    newEnergy = Math.min(currentEnergy + 150, ECONOMY.ENERGY_MAX)
  }

  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        coins: { decrement: cost },
        energy: newEnergy,
        energyUpdatedAt: now,
      },
    }),
    prisma.transaction.create({
      data: {
        userId: id,
        type: 'BOOST_' + type.toUpperCase(),
        amount: -cost,
        balanceBefore: user.coins,
        balanceAfter: user.coins - cost,
        meta: JSON.stringify({ type, energyBefore: currentEnergy, energyAfter: newEnergy }),
      },
    }),
  ])

  return res.json({
    coins: updatedUser.coins,
    energy: newEnergy,
    energyMax: ECONOMY.ENERGY_MAX,
  })
})

export default router
