/**
 * MintSim Beauty Score Algorithm v2
 *
 * Принимает телефонный номер в любом формате (+999 637 93680, 79991234567 и т.д.)
 * Возвращает число от 0 до 100.
 */

export interface BeautyBreakdown {
  total: number
  components: Record<string, number>
  digits: string
}

export function calcBeautyScore(raw: string): number {
  return calcBeautyDetailed(raw).total
}

export function calcBeautyDetailed(raw: string): BeautyBreakdown {
  const digits = extractDigits(raw)
  const components: Record<string, number> = {}

  // ─── Абсолютные паттерны — возвращаем фиксированный балл напрямую ───

  // Все одинаковые: 88888888 → 100
  if (new Set(digits).size === 1) {
    return { total: 100, components: { PERFECT: 100 }, digits }
  }

  // Полная последовательность: 12345678 → 95
  if (isFullSequence(digits)) {
    return { total: 95, components: { FULL_SEQUENCE: 95 }, digits }
  }

  // ─── Компонентный расчёт для всего остального ───
  let score = 0
  const add = (name: string, pts: number) => {
    components[name] = pts
    score += pts
  }

  // Палиндром: 12344321 → 65
  if (isPalindrome(digits)) add("PALINDROME", 80)

  // Зеркальные половины (не полный палиндром): 1234-4321 уже учтён выше
  if (!isPalindrome(digits) && isMirrorHalves(digits)) add('MIRROR_HALVES', 40)

  // Повторяющийся блок
  const block = longestRepeatBlock(digits)
  if (block === 4) add('REPEAT_BLOCK_4', 55)
  else if (block === 3) add('REPEAT_BLOCK_3', 50)
  else if (block === 2) add('REPEAT_BLOCK_2', 60)

  // Частота цифр
  const maxFreq = getMaxFrequency(digits)
  if (maxFreq >= 7) add('SEVEN_SAME', 75)
  else if (maxFreq >= 6) add('SIX_SAME', 45)
  else if (maxFreq >= 5) add('FIVE_SAME', 28)
  else if (maxFreq >= 4) add('FOUR_SAME', 14)

  // Последовательности подряд
  const seq = longestSequence(digits)
  if (seq >= 7) add('SEQ_7', 55)
  else if (seq >= 6) add('SEQ_6', 38)
  else if (seq >= 5) add('SEQ_5', 22)
  else if (seq >= 4) add('SEQ_4', 11)
  else if (seq >= 3) add('SEQ_3', 4)

  // Монотонный номер (строго возр/убыв, но не циклическая последовательность)
  if (isStrictAscending(digits)) add('ASCENDING_ALL', 18)
  else if (isStrictDescending(digits)) add('DESCENDING_ALL', 18)

  // Паттерны в конце
  if (digits.endsWith('000')) add('ROUND_000', 10)
  else if (digits.endsWith('00')) add('ROUND_00', 4)

  const last3 = digits.slice(-3)
  const last2 = digits.slice(-2)
  if (new Set(last3).size === 1 && !digits.endsWith('000')) add('TRIPLE_END', 10)
  else if (new Set(last2).size === 1 && !digits.endsWith('00')) add('DOUBLE_END', 5)

  // Повторяющаяся пара пар в конце (XXYY или XYXY)
  if (last2[0] === last2[1] && digits.slice(-4, -2) === last2) add('REPEAT_PAIR', 12)

  // Базовый минимум для любого номера с хоть каким-то паттерном
  if (score === 0) {
    // Совсем случайный — считаем минимальный балл по уникальности
    const uniqueCount = new Set(digits).size
    // 10 уникальных цифр (все разные) = 0, 5 уникальных = ~3, 2 уникальных = ~7
    const base = Math.max(0, Math.round((10 - uniqueCount) * 0.8))
    if (base > 0) add('BASE', base)
  }

  // ─── Нормализация: score → 0–94 (95+ зарезервированы для абсолютных) ───
  // Практический максимум при лучшем из компонентных: REPEAT_BLOCK_2=60 + SIX_SAME=45 + SEQ_6=38 = ~143
  const MAX_COMPONENT = 143
  const normalized = Math.round((Math.min(score, MAX_COMPONENT) / MAX_COMPONENT) * 94)
  const total = Math.max(0, Math.min(normalized, 94))

  return { total, components, digits }
}

// ─── Вспомогательные функции ───

function extractDigits(raw: string): string {
  const all = raw.replace(/\D/g, '')
  // Последние 8 цифр = локальная часть без кода страны (+999) и кода сети (6 digits prefix)
  return all.length >= 8 ? all.slice(-8) : all.padStart(8, '0')
}

function isPalindrome(d: string): boolean {
  return d === d.split('').reverse().join('')
}

function isMirrorHalves(d: string): boolean {
  const half = Math.floor(d.length / 2)
  const left = d.slice(0, half)
  const right = d.slice(d.length - half)
  return left === right.split('').reverse().join('')
}

function isFullSequence(d: string): boolean {
  if (d.length < 6) return false
  let asc = true, desc = true
  for (let i = 1; i < d.length; i++) {
    if ((parseInt(d[i]) - parseInt(d[i - 1]) + 10) % 10 !== 1) asc = false
    if ((parseInt(d[i - 1]) - parseInt(d[i]) + 10) % 10 !== 1) desc = false
  }
  return asc || desc
}

function longestSequence(d: string): number {
  let max = 1, cur = 1
  for (let i = 1; i < d.length; i++) {
    const diff = parseInt(d[i]) - parseInt(d[i - 1])
    if (diff === 1 || diff === -1) { cur++; max = Math.max(max, cur) }
    else cur = 1
  }
  return max
}

function getMaxFrequency(d: string): number {
  const freq: Record<string, number> = {}
  for (const c of d) freq[c] = (freq[c] ?? 0) + 1
  return Math.max(...Object.values(freq))
}

function longestRepeatBlock(d: string): number {
  for (let len = 4; len >= 2; len--) {
    if (d.length % len !== 0) continue
    const block = d.slice(0, len)
    if (d === block.repeat(d.length / len)) return len
  }
  return 0
}

function isStrictAscending(d: string): boolean {
  for (let i = 1; i < d.length; i++)
    if (parseInt(d[i]) <= parseInt(d[i - 1])) return false
  return true
}

function isStrictDescending(d: string): boolean {
  for (let i = 1; i < d.length; i++)
    if (parseInt(d[i]) >= parseInt(d[i - 1])) return false
  return true
}

// Тесты запускаются отдельно: npx tsx shared/beauty.test.ts
