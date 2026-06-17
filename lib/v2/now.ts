// lib/v2/now.ts — 한국 시간(KST, UTC+9) 기준 날짜/요일/시각.
// 서버(Vercel)가 UTC라 new Date()를 그냥 쓰면 한국 자정~오전9시에 날짜가 하루 늦게 계산됨.
const KST = 9 * 3600 * 1000
const kstDate = () => new Date(Date.now() + KST)  // +9h 후 getUTC*/toISOString = KST 벽시계

export function kstToday(): string { return kstDate().toISOString().slice(0, 10) }
export function kstWeekday(): number { return kstDate().getUTCDay() }   // 0=일 ~ 6=토
export function kstHour(): number { return kstDate().getUTCHours() }
export function kstDaysAgo(n: number): string {
  return new Date(Date.now() + KST - n * 864e5).toISOString().slice(0, 10)
}
// 'YYYY-MM-DD' → 오늘/어제/N일전 (KST 기준)
export function relDayLabel(dateStr: string): string {
  const today = kstToday()
  if (dateStr === today) return '오늘'
  const diff = Math.round((Date.parse(today) - Date.parse(dateStr)) / 864e5)
  if (diff === 1) return '어제'
  if (diff > 1) return `${diff}일 전`
  return dateStr.slice(5)  // 미래(예외)면 MM-DD
}
