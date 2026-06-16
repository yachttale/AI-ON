-- ============================================================
-- 001_schema_improvements.sql
-- Supabase 대시보드 > SQL Editor 에서 순서대로 실행하세요.
-- ============================================================

-- ── 1. session_logs: 결석 사유 컬럼 추가 ────────────────────
ALTER TABLE session_logs
  ADD COLUMN IF NOT EXISTS absence_reason TEXT
    CHECK (absence_reason IN ('입원', '아파서', '다른일정', '여행', '기타'));

-- ── 2. session_logs: 중복 방지 UNIQUE 제약 ─────────────────
-- 같은 학생의 같은 날 기록이 두 개 이상 생기지 않도록 방지합니다.
-- 이미 중복 데이터가 있으면 먼저 정리 후 실행하세요.
ALTER TABLE session_logs
  DROP CONSTRAINT IF EXISTS session_logs_student_date_unique;

ALTER TABLE session_logs
  ADD CONSTRAINT session_logs_student_date_unique
    UNIQUE (student_id, session_date);

-- ── 3. 인덱스: 자주 쓰는 조회 패턴 최적화 ─────────────────
CREATE INDEX IF NOT EXISTS idx_session_logs_student_date
  ON session_logs (student_id, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_session_logs_date
  ON session_logs (session_date DESC);

CREATE INDEX IF NOT EXISTS idx_swim_distances_student_date
  ON swim_distances (student_id, logged_date DESC);

-- ── 4. RLS: swim_distances 권한 ──────────────────────────────

-- 강사: 자기 담당 학생 거리 조회 (MasterSwimTracker load()에서 사용)
-- 이 정책이 없으면 INSERT는 성공해도 SELECT가 차단되어 누적 거리가 0으로 표시됨
CREATE POLICY "instructor_can_read_swim_distances"
  ON swim_distances
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students
      WHERE students.id = swim_distances.student_id
        AND students.instructor_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );

-- 강사: 자기 담당 학생 거리 기록 삭제 (취소 버튼)
CREATE POLICY "instructor_can_delete_swim_distances"
  ON swim_distances
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students
      WHERE students.id = swim_distances.student_id
        AND students.instructor_id = auth.uid()
    )
  );

-- 강사/원장: 거리 입력
CREATE POLICY "instructor_can_insert_swim_distances"
  ON swim_distances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('instructor', 'director')
    )
  );

-- 원장: 전체 마스터 학생 거리 조회 (대시보드용, 위 instructor 정책과 OR 합산)
CREATE POLICY "director_can_read_swim_distances"
  ON swim_distances
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );

-- ── 5. RLS: session_logs 강사 권한 제한 ─────────────────────
-- 강사는 자기 담당 학생의 기록만 INSERT/UPDATE 가능합니다.
CREATE POLICY IF NOT EXISTS "instructor_insert_own_students"
  ON session_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    instructor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director'
    )
  );

CREATE POLICY IF NOT EXISTS "instructor_update_own_records"
  ON session_logs
  FOR UPDATE
  TO authenticated
  USING (
    instructor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director'
    )
  );

-- ── 6. RLS: session_logs 원장 전체 읽기 ─────────────────────
CREATE POLICY IF NOT EXISTS "director_can_read_all_session_logs"
  ON session_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'director'
    )
    OR instructor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM students
      WHERE students.id = session_logs.student_id
        AND students.instructor_id = auth.uid()
    )
  );
