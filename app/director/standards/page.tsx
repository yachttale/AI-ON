import { CURRICULUM } from '@/lib/curriculum'

export default function StandardsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-800">커리큘럼 기준표</h2>
      {CURRICULUM.map(sec => (
        <div key={sec.key}>
          <h3 className="text-sm font-bold mb-2" style={{ color: sec.color }}>{sec.label}</h3>
          <div className="space-y-1">
            {sec.groups.flatMap(g => g.steps).map((step, i) => (
              <div key={step.key} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-gray-100">
                <span className="text-xs text-gray-300 w-6 text-right">{i + 1}</span>
                <span className="text-sm text-gray-700">{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
