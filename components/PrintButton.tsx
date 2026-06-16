'use client'

interface Props {
  label?: string
  className?: string
}

export default function PrintButton({ label = '인쇄 / PDF', className }: Props) {
  return (
    <button
      onClick={() => window.print()}
      className={className ?? 'px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-semibold transition-colors'}
    >
      {label}
    </button>
  )
}
