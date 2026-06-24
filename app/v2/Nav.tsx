// app/v2/Nav.tsx — 강사 탭 네비게이션(오늘 수업 / 나의 학생)
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/v2/today', label: '오늘 수업' },
  { href: '/v2/students', label: '나의 학생' },
  { href: '/v2/me', label: '나의 정보' },
]

export default function V2Nav({ isDirector = false }: { isDirector?: boolean }) {
  const pathname = usePathname()
  const tabs = isDirector ? [...TABS, { href: '/v2/director', label: '원장' }] : TABS
  return (
    <nav className="flex border-b bg-white">
      {tabs.map(t => {
        const active = pathname === t.href || (t.href === '/v2/students' && pathname.startsWith('/v2/student'))
        return (
          <Link key={t.href} href={t.href}
            className={`flex-1 text-center py-2.5 text-sm font-semibold border-b-2 ${active ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400'}`}>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
