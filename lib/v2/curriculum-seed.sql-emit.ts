// lib/v2/curriculum-seed.sql-emit.ts — 시드 행 → INSERT SQL 출력
// 실행: npx tsx lib/v2/curriculum-seed.sql-emit.ts > supabase/migrations/012_v2_curriculum_seed.sql
import { buildSeedRows } from './curriculum-seed'

function q(s: string): string { return "'" + s.replace(/'/g, "''") + "'" }

export function emitSeedSql(versionLabel: string): string {
  const { strokes, tracks, steps } = buildSeedRows(versionLabel)
  const lines: string[] = []
  lines.push(`-- 생성물: 커리큘럼 버전1 시드 (${strokes.length} 영법, ${steps.length} 단계)`)
  lines.push(`insert into curriculum_versions (label, status) values (${q(versionLabel)}, 'active');`)
  strokes.forEach(s => lines.push(
    `insert into strokes (key,label,display_order,color) values (${q(s.key)},${q(s.label)},${s.display_order},${s.color ? q(s.color) : 'null'});`))
  tracks.forEach(t => lines.push(
    `insert into skill_tracks (stroke_id,key,label,display_order) select id,${q(t.key)},${q(t.label)},${t.display_order} from strokes where key=${q(t.stroke_key)};`))
  steps.forEach(st => lines.push(
    `insert into skill_steps (curriculum_version_id,stroke_id,track_id,key,label,ladder_order,is_first_completion,measure_spec,step_kind) ` +
    `select (select id from curriculum_versions where label=${q(versionLabel)}), ` +
    `(select id from strokes where key=${q(st.stroke_key)}), ` +
    `(select id from skill_tracks where key=${q(st.track_key)} and stroke_id=(select id from strokes where key=${q(st.stroke_key)})), ` +
    `${q(st.key)},${q(st.label)},${st.ladder_order},${st.is_first_completion}, ` +
    `array[${st.measure_spec.map(q).join(',')}]::text[],${q(st.step_kind)};`))
  return lines.join('\n')
}

// CLI 실행 전용 파일(다른 곳에서 import하지 않음) — 실행 시 곧바로 시드 SQL 출력
process.stdout.write(emitSeedSql('v1 - 2026 기본') + '\n')
