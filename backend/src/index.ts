import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { telegramAuth, rateLimit } from './middleware/telegram-auth'
import userRouter from './routes/user'
import nftRouter from './routes/nft'
import dailyRouter from './routes/daily'
import adsgramRouter from './routes/adsgram'

const app = express()
const PORT = process.env.PORT ?? 3001

// ---- Security headers ----
app.use(helmet())

// ---- CORS: только Telegram Mini App + локал ----
app.use(cors({
  origin: [
    'https://web.telegram.org',
    'https://t.me',
    process.env.FRONTEND_URL ?? 'http://localhost:3000',
  ],
  credentials: true,
}))

app.use(express.json({ limit: '50kb' })) // не принимаем огромные тела

// ---- Health check (без auth) ----
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

// ---- Все защищённые роуты требуют Telegram auth ----
app.use('/api', telegramAuth, rateLimit(10)) // макс 10 req/сек на юзера

app.use('/api/user', userRouter)
app.use('/api/nft', nftRouter)
app.use('/api/daily', dailyRouter)
app.use('/api/adsgram', adsgramRouter)

// ---- 404 ----
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// ---- Global error handler ----
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`MintSim Tapper backend running on :${PORT}`)
})

export default app
