import { calcBeautyDetailed } from './beauty'

const cases: Array<[string, number, number]> = [
  ['+999 88888888', 100, 100],
  ['+999 12345678', 95,  95],
  ['+999 12344321', 60,  94],
  ['+999 12121212', 55,  94],
  ['+999 63793680',  0,  15],
  ['+999 63030247',  0,  15],
  ['+999 11111112', 30,  60],
  ['+999 77777777', 100,100],
  ['+999 99999990', 40,  70],
  ['+999 12348765',  5,  35],
  ['+999 88881234', 10,  40],
]

let passed = 0
for (const [input, min, max] of cases) {
  const r = calcBeautyDetailed(input)
  const ok = r.total >= min && r.total <= max
  console.log(`${ok ? '✓' : '✗'} ${input.padEnd(20)} → ${String(r.total).padStart(3)} (${min}–${max})  [${Object.keys(r.components).join(', ')}]`)
  if (ok) passed++
}
console.log(`\n${passed}/${cases.length} тестов прошло`)
