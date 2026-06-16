import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getKSTDateString(offsetDays = 0): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  if (offsetDays !== 0) kst.setUTCDate(kst.getUTCDate() - offsetDays)
  return kst.toISOString().split('T')[0]
}

export function getKSTDay(offsetDays = 0): number {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  if (offsetDays !== 0) kst.setUTCDate(kst.getUTCDate() - offsetDays)
  return kst.getUTCDay()
}

export function getKSTMonthStart(): string {
  return `${getKSTDateString().slice(0, 7)}-01`
}
