// ============================================================
// MintSim Tapper — Economy Constants v1.0
// Менять только здесь, нигде больше
// ============================================================

export const ECONOMY = {
  // --- Пассивный доход ---
  BASE_PASSIVE_RATE: 60,          // монет/час без NFT
  PASSIVE_COLLECT_INTERVAL: 60,   // минут — минимальный интервал сбора (антиспам)

  // --- NFT-бонус ---
  NFT_BEAUTY_MULTIPLIER: 5,       // 1% красоты = 5 монет/день
  NFT_DIMINISHING: [1, 0.5, 0.25, 0.125, 0.0625] as const, // топ-5 коэффициенты
  NFT_BONUS_CAP: 500,             // максимум монет/день от NFT (даже у кита)
  NFT_CACHE_TTL_HOURS: 4,         // как часто обновляем данные с TonAPI

  // --- Энергия ---
  ENERGY_MAX: 500,                // максимум энергии
  ENERGY_REGEN_PER_HOUR: 50,      // реген в час
  ENERGY_PER_TAP: 1,              // расход на тап
  COINS_PER_TAP: 1,               // монет за тап

  // --- Анти-бот: лимиты тапов ---
  TAP_MAX_PER_REQUEST: 50,        // максимум тапов в одном запросе
  TAP_MIN_INTERVAL_MS: 100,       // минимальный интервал между тапами (мс)
  TAP_SUSPICION_THRESHOLD: 70,    // suspicionScore выше — урезаем лимит энергии

  // --- Синки ---
  BOOST_ENERGY_COST: 600,         // монет за +500 энергии сразу
  BOOST_REGEN_COST: 200,          // монет за реген ×3 на 1 час
  UNLOCK_SLOT_6_COST: 5000,       // монет за разблокировку 6-го NFT-слота

  // --- Ежедневный бонус ---
  DAILY_COINS_MIN: 500,           // минимум монет из рулетки
  DAILY_COINS_MAX: 2000,          // максимум монет (без приза TG)
  DAILY_TG_PRIZE_CHANCE: 0.01,    // 1% шанс выиграть звезды/Stars TG
  DAILY_PRIZES_PER_MONTH: 10,     // фиксированный пул TG-призов в месяц

  // --- Тиры минта (в нано-TON для точности) ---
  MINT_TIERS: [
    { upTo: 100,  priceNano: 100_000_000 },   // 0.1 TON
    { upTo: 500,  priceNano: 250_000_000 },   // 0.25 TON
    { upTo: 2000, priceNano: 500_000_000 },   // 0.5 TON
    { upTo: Infinity, priceNano: 1_000_000_000 }, // 1.0 TON
  ],
} as const

// ============================================================
// Утилиты — используются и на бэке, и потенциально на фронте
// ============================================================

/**
 * Считает суммарный NFT-бонус монет/день для набора номеров.
 * Принимает массив % красоты, сортирует по убыванию, применяет диминишинг и кап.
 */
export function calcNftBonus(beautyScores: number[]): number {
  const sorted = [...beautyScores].sort((a, b) => b - a)
  const top5 = sorted.slice(0, ECONOMY.NFT_DIMINISHING.length)

  const raw = top5.reduce((sum, score, i) => {
    const base = score * ECONOMY.NFT_BEAUTY_MULTIPLIER
    return sum + base * ECONOMY.NFT_DIMINISHING[i]
  }, 0)

  return Math.min(Math.round(raw), ECONOMY.NFT_BONUS_CAP)
}

/**
 * Считает накопленный пассивный доход с момента последнего сбора.
 * Используется на сервере при клейме и при подтяжке данных.
 */
export function calcPassiveAccrued(
  ratePerHour: number,
  nftBonusPerDay: number,
  sinceDate: Date,
  now: Date = new Date()
): number {
  const hours = (now.getTime() - sinceDate.getTime()) / 1000 / 3600
  const fromBase = ratePerHour * hours
  const fromNft = (nftBonusPerDay / 24) * hours
  return Math.floor(fromBase + fromNft)
}

/**
 * Считает текущую энергию с учётом времени с последнего обновления.
 */
export function calcCurrentEnergy(
  storedEnergy: number,
  updatedAt: Date,
  now: Date = new Date()
): number {
  const hours = (now.getTime() - updatedAt.getTime()) / 1000 / 3600
  const regen = Math.floor(hours * ECONOMY.ENERGY_REGEN_PER_HOUR)
  return Math.min(storedEnergy + regen, ECONOMY.ENERGY_MAX)
}

/**
 * Возвращает цену минта в нано-TON по текущему общему счётчику NFT.
 */
export function getMintPriceNano(totalMinted: number): number {
  for (const tier of ECONOMY.MINT_TIERS) {
    if (totalMinted < tier.upTo) return tier.priceNano
  }
  return ECONOMY.MINT_TIERS[ECONOMY.MINT_TIERS.length - 1].priceNano
}
