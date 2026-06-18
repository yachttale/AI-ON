// app/kiosk/layout.tsx — 키오스크 전체화면 레이아웃 (헤더/네비 없음, 큰 글씨, 잠금)
export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-sky-50 text-slate-900 select-none touch-manipulation">
      <div className="mx-auto max-w-2xl p-4">{children}</div>
    </div>
  )
}
