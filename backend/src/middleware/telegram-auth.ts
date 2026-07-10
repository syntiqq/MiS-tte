import { createHmac, createHash } from 'crypto'
import type { Request, Response, NextFunction } from 'express'

// Расширяем Request — после middleware гарантированно есть tgUser
declare global {
  namespace Express {
    interface Request {
      tgUser: {
        id: string
        username?: string
        firstName?: string
      }
    }
  }
}

/**
 * Валидирует Telegram WebApp initData по официальному алгоритму.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function telegramAuth(req: Request, res: Response, next: NextFunction) {
  const initData = req.headers['x-telegram-init-data'] as string | undefined

  if (!initData) {
    return res.status(401).json({ error: 'Missing Telegram initData' })
  }

  try {
    const parsed = new URLSearchParams(initData)
    const hash = parsed.get('hash')
    if (!hash) return res.status(401).json({ error: 'Missing hash' })

    // Строим data-check-string: все поля кроме hash, отсортированные по ключу
    parsed.delete('hash')
    const dataCheckString = Array.from(parsed.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')

    // HMAC-SHA256: key = HMAC("WebAppData", botToken), data = dataCheckString
    const secretKey = createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN!)
      .digest()

    const expectedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex')

    if (expectedHash !== hash) {
      return res.status(401).json({ error: 'Invalid signature' })
    }

    // Проверяем что данные не протухли (1 час)
    const authDate = parseInt(parsed.get('auth_date') ?? '0', 10)
    const age = Date.now() / 1000 - authDate
    if (age > 3600) {
      return res.status(401).json({ error: 'initData expired' })
    }

    // Парсим user
    const userJson = parsed.get('user')
    if (!userJson) return res.status(401).json({ error: 'No user in initData' })

    const user = JSON.parse(userJson)
    req.tgUser = {
      id: String(user.id),
      username: user.username,
      firstName: user.first_name,
    }

    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid initData format' })
  }
}

/**
 * Rate limiter простой — в памяти, для прода заменить на Redis.
 * Ограничивает N запросов в секунду на userId.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(maxPerSecond: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.tgUser?.id
    if (!userId) return next()

    const now = Date.now()
    const entry = rateLimitMap.get(userId)

    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(userId, { count: 1, resetAt: now + 1000 })
      return next()
    }

    entry.count++
    if (entry.count > maxPerSecond) {
      return res.status(429).json({ error: 'Too many requests' })
    }

    next()
  }
}
