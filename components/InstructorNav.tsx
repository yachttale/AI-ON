'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function InstructorNav() {
  const pathname = usePathname()
  const isToday = pathname === '/instructor/today' || pathname.startsWith('/instructor/student')
  const isDashboard = pathname === '/instructor/dashboard'
  const isRoster = pathname === '/instructor/roster'

  return (
    <nav className="flex sticky top-[53px] z-10 border-b border-gray-200">
      <Link
        href="/instructor/today"
        className={`flex-1 text-center py-2.5 text-sm font-medium transition-colors ${
          isToday ? 'bg-sky-500 text-white' : 'bg-white text-gray-400 hover:text-gray-600'
        }`}
      >
        오늘 수업
      </Link>
      <Link
        href="/instructor/dashboard"
        className={`flex-1 text-center py-2.5 text-sm font-medium transition-colors ${
          isDashboard ? 'bg-sky-500 text-white' : 'bg-white text-gray-400 hover:text-gray-600'
        }`}
      >
        내 학생
      </Link>
      <Link
        href="/instructor/roster"
        className={`flex-1 text-center py-2.5 text-sm font-medium transition-colors ${
          isRoster ? 'bg-sky-500 text-white' : 'bg-white text-gray-400 hover:text-gray-600'
        }`}
      >
        반 관리
      </Link>
    </nav>
  )
}
