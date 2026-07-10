import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { ECONOMY } from '../../shared/economy'

const router = Router()
const prisma = new PrismaClient()

// ============================================================
// POST /daily/claim — забрать ежедневный бонус (рулетка)
// ============================================================
router.post('/claim', async (req, res) => {
  const { id } = req.tgUser
  const now = new Date()

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return res.status(404).json({ error: 'User not found' })

  // Проверяем что ещё не брали сегодня
  if (user.lastDailyAt) {
    const lastDate = user.lastDailyAt
    const isSameDay =
      lastDate.getUTCFullYear() === now.getUTCFullYear() &&
      lastDate.getUTCMonth() === now.getUTCMonth() &&
      lastDate.getUTCDate() === now.getUTCDate()

    if (isSameDay) {
      const nextAt = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
      ))
      return res.status(429).json({ error: 'Already claimed today', nextAt })
    }
  }

  // Определяем текущий месяц для пула призов
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

  // Upsert пула призов месяца
  const pool = await prisma.dailyPrizePool.upsert({
    where: { month },
    update: {},
    create: { month, totalPrizes: ECONOMY.DAILY_PRIZES_PER_MONTH, givenPrizes: 0 },
  })

  // Проверяем шанс TG-приза (только если в пуле ещё есть)
  const prizesLeft = pool.totalPrizes - pool.givenPrizes
  const rollForPrize = prizesLeft > 0 && Math.random() < ECONOMY.DAILY_TG_PRIZE_CHANCE

  let coinsReward = 0
  let hasTgPrize = false

  if (rollForPrize) {
    // Выиграл TG-приз — атомарно уменьшаем пул
    const updated = await prisma.dailyPrizePool.updateMany({
      where: { month, givenPrizes: { lt: pool.totalPrizes } }, // двойная проверка гонки
      data: { givenPrizes: { increment: 1 } },
    })

    if (updated.count > 0) {
      hasTgPrize = true
      // Минимальные монеты при выигрыше приза
      coinsReward = ECONOMY.DAILY_COINS_MIN
    }
  }

  if (!hasTgPrize) {
    // Обычная рулетка: случайное число монет в диапазоне
    coinsReward = Math.floor(
      ECONOMY.DAILY_COINS_MIN +
      Math.random() * (ECONOMY.DAILY_COINS_MAX - ECONOMY.DAILY_COINS_MIN)
    )
  }

  // Начисляем монеты
  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        coins: { increment: coinsReward },
        coinsLifetime: { increment: coinsReward },
        lastDailyAt: now,
      },
    }),
    prisma.transaction.create({
      data: {
        userId: id,
        type: 'DAILY',
        amount: coinsReward,
        balanceBefore: user.coins,
        balanceAfter: user.coins + coinsReward,
        meta: JSON.stringify({ hasTgPrize, month }),
      },
    }),
  ])

  // Если выиграл TG-приз — уведомляем через бота (отдельный воркер/очередь)
  if (hasTgPrize) {
    await notifyTgPrize(id, user.username)
  }

  return res.json({
    coinsReward,
    hasTgPrize,
    coins: updatedUser.coins,
    nextAt: new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
    )),
  })
})

// ============================================================
// GET /daily/status — когда следующий бонус
// ============================================================
router.get('/status', async (req, res) => {
  const { id } = req.tgUser
  const now = new Date()

  const user = await prisma.user.findUnique({
    where: { id },
    select: { lastDailyAt: true },
  })

  if (!user?.lastDailyAt) {
    return res.json({ available: true, nextAt: null })
  }

  const nextAt = new Date(Date.UTC(
    user.lastDailyAt.getUTCFullYear(),
    user.lastDailyAt.getUTCMonth(),
    user.lastDailyAt.getUTCDate() + 1
  ))

  return res.json({
    available: now >= nextAt,
    nextAt,
    lastClaimedAt: user.lastDailyAt,
  })
})

// ============================================================
// Внутренняя функция — уведомление о TG-призе через бота
// ============================================================
async function notifyTgPrize(userId: string, username?: string | null) {
  try {
    const botToken = process.env.BOT_TOKEN
    const msg = `🎉 @${username ?? 'Anonymous'} выиграл приз в ежедневной рулетке MintSim Tapper!`

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: userId,
        text: '🎰 Поздравляем! Вы выиграли приз — звёзды Telegram! Мы свяжемся с вами в ближайшее время.',
      }),
    })
  } catch (err) {
    console.error('Failed to notify TG prize:', err)
    // Не фейлим запрос — приз уже записан, уведомление некритично
  }
}

export default router
