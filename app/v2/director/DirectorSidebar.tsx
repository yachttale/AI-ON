'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Users, GraduationCap, MessageSquare,
  Search, LogOut, ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/v2/director', label: '아이들 현황', icon: LayoutDashboard, exact: true },
  { href: '/v2/director/instructors', label: '강사 현황', icon: GraduationCap, exact: false },
  { href: '/v2/director/students', label: '전체 학생', icon: Users, exact: false },
  { href: '/v2/director/feedback', label: '학부모 피드백', icon: MessageSquare, exact: false },
]

export default function DirectorSidebar({ name }: { name: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-56 flex flex-col shrink-0 border-r border-white/10 bg-[#13132a]">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-white/10">
        <p className="text-base font-bold text-white tracking-wide">AI-ON</p>
        <p className="text-xs text-white/40 mt-0.5">원장 대시보드</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-teal-500/20 text-teal-300'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <Icon size={16} className={active ? 'text-teal-400' : ''} />
              {label}
              {active && <ChevronRight size={14} className="ml-auto text-teal-400/60" />}
            </Link>
          )
        })}
      </nav>

      {/* User + Logout */}
      <div className="px-4 py-4 border-t border-white/10 space-y-3">
        <div className="flex items-center gap-2.5 px-2">
          <div className="w-7 h-7 rounded-full bg-teal-500/30 flex items-center justify-center text-xs font-bold text-teal-300">
            {name.slice(0, 1)}
          </div>
          <span className="text-sm text-white/70 truncate">{name}</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
        >
          <LogOut size={15} />
          로그아웃
        </button>
      </div>
    </aside>
  )
}
