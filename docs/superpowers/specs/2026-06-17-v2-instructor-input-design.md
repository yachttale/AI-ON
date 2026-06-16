# Plan 2 설계 — v2 강사 베이스라인 배치 + 일일 입력

작성일: 2026-06-17 · 브랜치: `feat/v2-data-platform`
선행: Plan 1(데이터 토대) 완료 — 스키마 010·011, 커리큘럼 시드 012(7영법/28트랙/144단계), 학생 cold-start 시드(163명, 로컬), `lib/v2/{data,metrics,curriculum-seed}.ts`.
상위 스펙: `docs/superpowers/specs/2026-06-16-swimming-data-platform-design.md` (로드맵 3~5에 해당).

## 1. 목적 & 범위

강사가 **매 수업 최소 탭으로** 출결·진도·바퀴수를 남기고, 출시 시점 기존생 163명의 **현재 위치(베이스라인)**를 1회 배치한다. 이로써 데이터 0년차가 시작되고 이후 모든 리포트·예측의 입력이 쌓인다.

**포함**: ① 베이스라인 배치 화면 ② 오늘 수업(출결+바퀴수) ③ 학생 진도 입력(ladder 통과 + counter + repeatable, 측정 인라인).
**제외(다음 플랜)**: 템플릿 CRUD(로드맵4), 본격 재측정·월영상 흐름(로드맵5), 관리자 커리큘럼 편집(로드맵6), 부모 리포트/예측(Phase 2).

## 2. 확정 결정사항

- **베이스라인 모델**: 영법별 현재 칸 1개 선택 → 그 영법 내 `ladder` 단계 중 선택칸 이하 전부 `skill_progress(source='baseline')` 일괄 통과. counter/repeatable·다른 영법은 자동 통과 대상 아님. 재진입 시 수정 모드.
- **아키텍처**: 서버 컴포넌트(조회 via `lib/v2/data.ts`) + 클라이언트 섬(인터랙션) + 서버 액션(쓰기). Next.js 16.2.9 / React 19.2.4.
- **라우팅**: v2 전용 신규 라우트로 구축. v1(`app/instructor/*`, `session_logs` 등)은 **미수정** — v2 스키마 적용 시 v1 테이블이 사라져 자연 은퇴.
- **연결**: 원장이 `.env.local`(gitignore)에 `NEXT_PUBLIC_SUPABASE_URL`+`NEXT_PUBLIC_SUPABASE_ANON_KEY` 주입 → `next dev`로 실 DB 검증. 마이그레이션(010~013)은 SQL Editor 적용.
- **append-only 유지**(상위 스펙 10장): 모든 입력은 이벤트 적재, 누적/상태는 집계로 도출. 상태 덮어쓰기 금지(출결만 upsert).

## 3. 화면

### 3.1 오늘 수업 `(/today)`
- 서버 조회: 로그인 강사의 `is_active` 담당 학생 중, 오늘 요일·시간이 `students.schedule`('월6시/수6시' 형식)에 포함된 학생. 파싱은 기존 `lib/schedule`의 `getTodayEntries` 재사용(v2 schedule 동일 포맷).
- 카드: 이름·학년·시간 / `출·지·결` 출결 버튼 / `바퀴수` 한 숫자 입력 / `진도 →` 링크.
- 템플릿 강제 없음(보강·테스트일도 자유 입력). 진도/바퀴수를 먼저 입력하면 당일 session이 `attendance='출석'` 기본으로 자동 생성되고, 강사가 지각·결석으로 바꿀 수 있다(입력=등원으로 간주).

### 3.2 학생 진도 `(/student/[id])`
- 영법별 사다리 표시 + **현재 위치 자동 프리필**(아직 통과 안 한 첫 ladder 단계).
- 단계 컨트롤은 `step_kind`별 분기(§4.2):
  - ladder: `[통과]` 탭. 그 단계 `measure_spec`에 시간/스트로크가 있으면 통과 시 인라인 선택 입력.
  - counter: `[연습 +1]`(현재 누적 표시) + `[완성]`.
  - repeatable: `[▲ ▼ 바퀴]`/`[+거리]` + 6회마다 시간 입력 프롬프트.
- 트랙별(킥/팔/호흡/콤비) 그룹 헤더로 가독성.

### 3.3 베이스라인 배치 `(/student/[id]/baseline)`
- 영법(자유형·배영·평영·접영 등)마다 ladder 단계 목록 + 도달 칸 선택(라디오/슬라이더 느낌). 선택칸 이하 자동 통과 미리보기.
- 저장 시 §4.2 `setBaseline`. 학생당 1회 안내, 이미 baseline 있으면 현재 선택 프리필 + 수정.

## 4. 데이터 모델

### 4.1 스키마 변경 (최소)
- `measurements.metric_type` CHECK에 **`'attempt'` 추가** (010 수정). counter 연습 적재용. 그 외 변경 없음 — 기존 `measurements`/`skill_progress`/`sessions`로 전부 흡수.
- (Plan 1에서 이미 추가됨: `skill_steps.step_kind`, `students.phone`.)

### 4.2 step_kind별 저장 규칙

| 종류 | 입력 | 저장 |
|---|---|---|
| ladder | 통과(+측정) | `skill_progress`(source='observed') 1행, 스냅샷(step_key/ladder_order), measure_spec 있으면 `measurements`(time_sec/stroke_count, skill_step_id, session_id) |
| baseline 일괄 | 영법 선택칸 이하 | `skill_progress`(source='baseline', passed_at=오늘) 다수, unique(student,step)로 중복 무해 |
| counter | 연습 / 완성 | 연습=`measurements('attempt',1, skill_step_id, session_id)`, 완성=`skill_progress`(observed) 통과. "몇 회 만에"=attempt 행 집계로 도출(별도 컬럼 불필요) |
| repeatable | 바퀴/거리 / 주기 시간 | `measurements('laps' 또는 'distance_m', value, skill_step_id, session_id)` 반복, 시간=`measurements('time_sec', skill_step_id)`. 통과 개념 없음 |
| 일일 총 바퀴수 | 오늘수업 카드 | `measurements('laps', value, skill_step_id=null, session_id)` (특정 단계 아닌 세션 총량) |

- 모든 쓰기는 해당 일자의 `sessions` 행에 연결. session이 없을 때 첫 입력이 측정/진도면 `attendance='출석'` 기본으로 session 자동 생성(`measurements.session_id`·`skill_progress.source_session_id`는 nullable이라 미연결도 무해하나, 일관성 위해 생성·연결을 기본으로). `sessions` unique(student_id, session_date).

## 5. 데이터 접근 & 서버 액션

### 5.1 조회 (`lib/v2/data.ts` 확장, 서버)
- `getTodayStudents(instructorId, date)` — 담당·활성·오늘스케줄 학생 + 당일 session/출결/바퀴수.
- `getStrokeLadders(studentId)` — 영법별 ladder/counter/repeatable 단계 + 통과/누적 상태(프리필·베이스라인 미리보기 공용).
- 기존 `getActiveCurriculumSteps`, `getStudentPassedStepIds`, `getStudentLadderPosition` 재사용.

### 5.2 쓰기 (`lib/v2/actions.ts`, `'use server'`)
- `markAttendance(studentId, date, attendance)` → `sessions` upsert.
- `setLaps(studentId, date, laps)` → 당일 session 보장 후 `measurements('laps', step=null)`.
- `passStep(studentId, stepId, { difficulty?, time?, strokes? })` → `skill_progress` + 선택 `measurements`.
- `addAttempt(studentId, stepId)` / `completeCounter(studentId, stepId, { difficulty? })`.
- `logRepeatable(studentId, stepId, { metric, value })`.
- `setBaseline(studentId, perStroke: { strokeId, uptoLadderOrder }[])` → 영법별 ladder 단계 일괄 baseline.
- 각 액션은 `revalidatePath`로 해당 화면 갱신(Next 16 규약은 구현 전 `node_modules/next/dist/docs`에서 확인).

### 5.3 순수 로직 분리 (테스트 용이)
- `lib/v2/baseline.ts` — `expandBaselineSteps(strokeLadders, perStroke)`: 선택칸 → 통과시킬 step_id 목록(ladder만).
- `lib/v2/today.ts` — 오늘 학생 필터(스케줄 파싱 위임), 카드 표시 모델 구성.
- counter 누적/완성 회수 도출 등 집계 헬퍼.

## 6. 컴포넌트 분해

- 서버 페이지: `today/page.tsx`, `student/[id]/page.tsx`, `student/[id]/baseline/page.tsx`.
- 클라이언트 섬(각 1책임, 서버액션 호출):
  - `AttendanceButtons` — 출/지/결
  - `LapsInput` — 한 숫자 입력(디바운스 저장)
  - `StepControl` — `step_kind`로 통과/카운터/반복 컨트롤 분기 + 측정 인라인
  - `BaselineLadder` — 영법별 선택 + 미리보기 + 저장
- 공유 표시: 영법/트랙 그룹 헤더, 사다리 진행바.

## 7. 인증 / 권한

- 기존 Supabase auth 재사용(`app/login`, `lib/supabase/{server,client}`). 강사 로그인 → `auth.users.id` = `profiles.id`.
- 학생 소유: `students.instructor_id`. RLS(011)로 강사=본인 학생만 read/write. 서버 액션도 `auth.getUser()`로 소유 확인.
- 원장(role='director')은 별도(이번 범위 밖, 추후).

## 8. 에러 & 엣지

- 당일 session 부재 시 입력 → 액션 내부에서 session 보장(`attendance='출석'` 기본 upsert) 후 진행.
- 출결 변경은 덮어쓰기(상태형, 예외적 upsert). 진도/측정/연습은 append.
- 베이스라인 재진입: 기존 baseline 통과 반영해 프리필. 칸 낮추기(되돌리기)는 이번 범위에서 막고(추후), 올리기만 추가 통과.
- 동시성: unique(student,step)·unique(student,date)로 중복 안전.
- 미인증/타 강사 학생 접근 → 차단.

## 9. 테스트 (vitest, 순수 로직 우선)

- `expandBaselineSteps`: 영법별 선택칸 → 통과 step_id(ladder만, counter/repeatable 제외, 영법 경계 준수).
- 오늘 학생 필터: 다양한 schedule 포맷(`월6시`, `월6시/수6시`, `금6시/토10시`).
- counter 누적/완성 회수 도출, repeatable 집계.
- 사다리 프리필(첫 미통과 ladder).
- 서버 액션은 얇게 유지하고 로직을 순수 함수로 뽑아 단위 테스트. DB 연동은 `.env.local` 확보 후 수동 스모크.

## 10. 구현 전 확인 (게이트)

1. **Next 16 규약 실독**: `node_modules/next/dist/docs/`(존재 확인됨)에서 서버 액션·`revalidatePath`·`'use server'`·동적 라우트 규약 확인 후 코드 작성(AGENTS.md 지시).
2. **`.env.local`**: 원장이 URL+anon key 주입(=`next dev` 검증 가능 시점).
3. **마이그레이션 적용**: 010(‘attempt’ 추가 반영)·011·012·013을 SQL Editor 적용 — 이게 돼야 실 DB 스모크 가능.
