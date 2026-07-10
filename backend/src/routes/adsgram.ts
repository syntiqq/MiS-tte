import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { createHmac } from 'crypto'

const router = Router()
const prisma = new PrismaClient()

// Награды за просмотр рекламы
const AD_REWARDS = {
  coins: 200,          // монет за просмотр
  energy: 100,         // бонусная энергия (опционально, можно 0)
} as const

const AD_COOLDOWN_MINUTES = 30   // раз в 30 минут можно смотреть рекламу
const AD_MAX_PER_DAY = 10        // не более 10 просмотров в день

// ============================================================
// POST /adsgram/verify — засчитать просмотр рекламы
//
// Adsgram на клиенте вызывает show(), при успехе даёт callback.
// Клиент шлёт нам userId + подпись от Adsgram для верификации.
// ============================================================
router.post('/verify', async (req, res) => {
  const { id } = req.tgUser
  const { blockId, userId: adsgramUserId } = req.body as {
    blockId?: string
    userId?: string
  }

  // Базовая проверка: userId из Adsgram должен совпадать с нашим tgUser
  // Adsgram передаёт Telegram user_id как строку
  if (adsgramUserId && adsgramUserId !== id) {
    return res.status(403).json({ error: 'User ID mismatch' })
  }

  const now = new Date()
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return res.status(404).json({ error: 'User not found' })

  // Проверяем кулдаун между просмотрами
  const lastAd = await prisma.transaction.findFirst({
    where: { userId: id, type: 'ADSGRAM' },
    orderBy: { createdAt: 'desc' },
  })

  if (lastAd) {
    const msSince = now.getTime() - lastAd.createdAt.getTime()
    const cooldownMs = AD_COOLDOWN_MINUTES * 60 * 1000
    if (msSince < cooldownMs) {
      const nextAt = new Date(lastAd.createdAt.getTime() + cooldownMs)
      return res.status(429).json({
        error: 'Ad cooldown active',
        nextAt,
        secondsLeft: Math.ceil((cooldownMs - msSince) / 1000),
      })
    }
  }

  // Проверяем дневной лимит
  const todayStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
  ))
  const todayAds = await prisma.transaction.count({
    where: { userId: id, type: 'ADSGRAM', createdAt: { gte: todayStart } },
  })

  if (todayAds >= AD_MAX_PER_DAY) {
    return res.status(429).json({
      error: 'Daily ad limit reached',
      limit: AD_MAX_PER_DAY,
      nextAt: new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
      )),
    })
  }

  // Начисляем награду
  const coinsReward = AD_REWARDS.coins
  const energyReward = AD_REWARDS.energy

  const currentEnergy = Math.min(user.energy + energyReward, 500)

  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        coins: { increment: coinsReward },
        coinsLifetime: { increment: coinsReward },
        energy: currentEnergy,
      },
    }),
    prisma.transaction.create({
      data: {
        userId: id,
        type: 'ADSGRAM',
        amount: coinsReward,
        balanceBefore: user.coins,
        balanceAfter: user.coins + coinsReward,
        meta: JSON.stringify({ blockId, energyReward, adsWatchedToday: todayAds + 1 }),
      },
    }),
  ])

  return res.json({
    coinsReward,
    energyReward,
    coins: updatedUser.coins,
    energy: currentEnergy,
    adsWatchedToday: todayAds + 1,
    adsRemainingToday: AD_MAX_PER_DAY - todayAds - 1,
  })
})

// ============================================================
// GET /adsgram/status — можно ли смотреть рекламу прямо сейчас
// ============================================================
router.get('/status', async (req, res) => {
  const { id } = req.tgUser
  const now = new Date()

  const lastAd = await prisma.transaction.findFirst({
    where: { userId: id, type: 'ADSGRAM' },
    orderBy: { createdAt: 'desc' },
  })

  const todayStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
  ))
  const todayAds = await prisma.transaction.count({
    where: { userId: id, type: 'ADSGRAM', createdAt: { gte: todayStart } },
  })

  const cooldownMs = AD_COOLDOWN_MINUTES * 60 * 1000
  const msSinceLast = lastAd ? now.getTime() - lastAd.createdAt.getTime() : Infinity
  const onCooldown = msSinceLast < cooldownMs
  const dailyLimitReached = todayAds >= AD_MAX_PER_DAY

  return res.json({
    available: !onCooldown && !dailyLimitReached,
    onCooldown,
    dailyLimitReached,
    nextAt: onCooldown && lastAd
      ? new Date(lastAd.createdAt.getTime() + cooldownMs)
      : null,
    adsWatchedToday: todayAds,
    adsRemainingToday: Math.max(0, AD_MAX_PER_DAY - todayAds),
    reward: { coins: AD_REWARDS.coins, energy: AD_REWARDS.energy },
  })
})

export default router
