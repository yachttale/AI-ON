# AI-ON v2 — 재개 가이드 (이어서 작업하기)

> 컴퓨터를 끄고 다시 시작할 때, Claude에게 **"AI-ON v2 이어서 하자"**라고 하면 이 문서로 정확히 재개됩니다.
> **다른 컴퓨터에서 처음 시작**할 때는 아래 "다른 컴퓨터에서 처음 켤 때" 절차를 먼저 따르세요.

## 한 줄 요약 (2026-06-17 기준)
데이터 토대(Plan 1) **+ 커리큘럼 시드 + 재원생 cold-start 스크립트 완료**. Plan 2(강사 일일 입력) **설계 스펙까지 완료·커밋**. 다음은 스펙 검토 후 **구현 플랜(writing-plans) → 코딩**.

## 브랜치 / 원격
`feat/v2-data-platform` · origin = github.com/yachttale/AI-ON (푸시됨)

---

## 다른 컴퓨터에서 처음 켤 때 (중요) 🖥️
깃에 **없는** 것들이 있어 클론만으론 부족합니다:
1. `git clone` 후 `git checkout feat/v2-data-platform && git pull`
2. **`npm install`** — `node_modules`는 깃에 없음 (Next 16.2.9 / React 19 / vitest 4)
3. **`.env.local` 생성** — 깃에 없음(`.env*` ignore). 내용:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<Supabase 프로젝트 URL>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
   (Supabase 대시보드 → Project Settings → API 에서 복사)
4. **`재원생 DB.xlsx` 수동 복사** — 실제 아동 PII라 `*.xlsx` ignore → 깃에 **없음**. cold-start 이어가려면 이 파일을 레포 루트에 직접 가져와야 함. (그 후 `python scripts/emit_students_seed.py > supabase/seed-local/013_students_coldstart.sql` 로 재생성)
5. 검증: `npx vitest run __tests__/v2/` (16개 통과), `npx tsc --noEmit`

---

## 완료됨 ✅
**Plan 1 — 데이터 토대**
- 설계: `docs/superpowers/specs/2026-06-16-swimming-data-platform-design.md`
- 계획: `docs/superpowers/plans/2026-06-16-v2-data-foundation.md`
- 스키마: `supabase/migrations/010_v2_schema.sql`(+`step_kind`, +`students.phone`, +`measurements.metric_type 'attempt'`는 **Plan 2에서 추가 예정**), `011_v2_rls.sql`
- 타입/로직/데이터접근: `types/v2.ts`, `lib/v2/{metrics,curriculum-seed,curriculum-seed.sql-emit,data}.ts`

**커리큘럼 시드 (확정 시트 → DB)**
- 소스: `lib/v2/curriculum-v1-sheet.ts` (원장 확정 시트 구조화, **v1의 `lib/curriculum.ts`와 분리** — v1 UI 건드리지 말 것)
- 출력: `supabase/migrations/012_v2_curriculum_seed.sql` (7영법 / 28트랙 / **144단계**)
- `step_kind`: ladder(통과형) / counter(턴·스타트·잠영25M) / repeatable(50m바퀴·마스터거리)
- 첫완주(O) 9개, 측정/첫완주는 시트 명시 컬럼 그대로. 라벨 원문 보존(오타 '콤비네에션' 포함).

**재원생 cold-start (163명)**
- 스크립트(PII 없음, 커밋됨): `scripts/emit_students_seed.py`
- 출력(PII, **gitignore·로컬전용**): `supabase/seed-local/013_students_coldstart.sql`
- 매핑: 이름→name, 입학일→enrolled_on, 수업시간→schedule, 휴대전화→phone, is_active=true
- ⚠️ 명단에 **기능(skill) 수준 데이터 없음** → 기능 베이스라인은 강사가 첫 관찰로 입력(Plan 2).

**Plan 2 — 강사 일일 입력 (설계만 완료)**
- 스펙: `docs/superpowers/specs/2026-06-17-v2-instructor-input-design.md` ← **다음 세션 시작점**

## 다음 할 일 (순서) ⏳
1. **(원장)** Plan 2 스펙 검토 → OK 또는 수정.
2. **구현 플랜 작성** — `writing-plans` 스킬로 `docs/superpowers/plans/2026-06-17-*.md` 생성. (브레인스토밍의 다음 단계가 여기였음)
3. **코딩 전 게이트**: `node_modules/next/dist/docs/`(존재함)에서 Next 16 서버액션·`revalidatePath`·`'use server'` 규약 실독 (AGENTS.md 지시).
4. **마이그레이션 적용 (원장, SQL Editor)** — 기존 진도관리 Supabase 프로젝트 재활용, 1주 테스트 테이블 drop 후 `010`→`011`→`012`→`seed-local/013` 순서. (010에 'attempt' 추가분 반영 후) 검증: `skill_steps`=144, `students`=163.
5. **Plan 2 구현** — 화면3(오늘수업/학생진도/베이스라인) + 서버액션. 실 DB 스모크는 `.env.local`+`next dev`.

## Plan 2 핵심 설계 (요약)
- 아키텍처: **서버컴포넌트 + 클라이언트 섬 + 서버액션** (v1처럼 전부 client 금지).
- 라우팅: **v2 신규 라우트**, v1(`app/instructor/*`, `session_logs`)은 미수정(스키마 적용 시 자연 은퇴).
- 베이스라인: **영법별 현재 칸 선택 → 이하 ladder 자동 `source='baseline'`** (counter/repeatable·타 영법 제외).
- 저장: ladder=`skill_progress`, counter 연습=`measurements('attempt')`·완성=`skill_progress`, repeatable=`measurements('laps'/'distance_m'/'time_sec')`. **append-only**, 출결만 upsert.
- session 자동생성 시 `attendance='출석'` 기본(입력=등원). `sessions` unique(student,date).
- 제외(다음 플랜): 템플릿 CRUD, 본격 재측정, 관리자 커리큘럼 편집, 부모리포트/예측.

## 변치 않는 핵심 결정
- **수집**: 체크포인트 기반. 데일리=출결+바퀴수(한 숫자). 매 수업 상세기록 금지(수업>기록).
- **영상**: 월 1회, 피드백=데이터 자동초안 + 강사 특이사항.
- **cold-start**: 과거 데이터 없음 → 베이스라인 + `source` 플래그. 향후 데이터는 기존생도 1급(`observed`).
- **DB**: Supabase 기존 프로젝트 재활용(무료). 로컬 Supabase/Docker 없음 → SQL은 SQL Editor 수동 적용. 테스트는 순수함수만.
- **환경**: Next **16.2.9** / React 19 / vitest 4. (이전 메모의 "next docs 없음"은 오류 — `node_modules/next/dist/docs/` **존재함**.)

## ⚠️ 절대 주의 (PII)
- `재원생 DB.xlsx`, `supabase/seed-local/**` = 실제 아동 실명·연락처 → gitignore됨. **절대 커밋/푸시 금지.** 다른 컴퓨터엔 수동 복사.
