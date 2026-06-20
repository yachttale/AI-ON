-- 021_v2_perf_indexes.sql — 전역/날짜 단독 조회 성능 인덱스
-- 동작/스키마 변경 없음(인덱스 추가만). 누적 데이터에서 풀스캔 → 인덱스 스캔으로 전환.
-- 적용: Supabase SQL Editor. 010~020 이후.

-- 오늘 수업/원장 대시보드: sessions 를 session_date 단독으로 조회
--   (기존 인덱스는 (student_id, session_date) 선두 컬럼이 student_id 라 날짜 단독 조회는 못 탐)
create index if not exists idx_sessions_date on public.sessions(session_date);

-- 오늘 바퀴수: measurements 를 measured_on + metric_type 으로 조회(학생 필터 없음)
create index if not exists idx_measurements_date_metric on public.measurements(measured_on, metric_type);

-- 대시보드/통계/시간표: skill_progress 를 source='observed' + passed_at 로 전역 조회
create index if not exists idx_skill_progress_source_passed on public.skill_progress(source, passed_at);
