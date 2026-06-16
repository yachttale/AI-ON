# AI-ON v2 — 재개 가이드 (이어서 작업하기)

> 컴퓨터를 끄고 다시 시작할 때, Claude에게 **"AI-ON v2 이어서 하자"**라고 하면 이 문서로 정확히 재개됩니다.
> (다른 컴퓨터면 먼저 `git pull` 후 `feat/v2-data-platform` 브랜치 체크아웃 → 이 문서를 읽으면 됨.)

## 한 줄 요약
수영 교육 데이터 플랫폼 v2의 **데이터 토대(Plan 1) 코드 완료·검증·푸시 완료**. 다음은 커리큘럼 확정 → 시드 생성 → DB 적용.

## 브랜치
`feat/v2-data-platform` (GitHub 푸시됨)

## 완료됨 ✅
- 설계 스펙: `docs/superpowers/specs/2026-06-16-swimming-data-platform-design.md`
- 구현 계획: `docs/superpowers/plans/2026-06-16-v2-data-foundation.md`
- 코드: `supabase/migrations/010_v2_schema.sql`, `011_v2_rls.sql`, `types/v2.ts`, `lib/v2/{metrics,curriculum-seed,curriculum-seed.sql-emit,data}.ts`
- 검증: vitest 13개 통과, tsc 클린, `npm install` 완료

## 다음 할 일 (순서) ⏳
1. **커리큘럼 확정** — 구글시트 "AI-ON 영법 단계표 v1 (초안)" 편집 (id `1JPRbVu5Psi0ApiQGorznCrBlc2fqx5Ny8nZL9mmZe-Q`). 대/중/소 + 측정 + 첫완주.
2. **시드 생성** — Claude가 시트 읽어 `supabase/migrations/012_v2_curriculum_seed.sql` 생성 (매핑: `lib/v2/curriculum-seed.ts`).
3. **DB 준비** — 기존 진도관리 Supabase 프로젝트 재활용: 1주 테스트 테이블 drop, `.env.local` 생성(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). 로컬 Supabase/Docker 없음.
4. **마이그레이션 적용** — Supabase SQL Editor에 `010` → `011` → `012` 순서로 실행.
5. **기존생 온보딩** — `재원생 DB.xlsx`로 베이스라인 배치 + `enrolled_on` 백필 (로컬만, 깃 금지).
6. **Plan 2** — 강사 일일 입력 UX (Next 16. `node_modules/next/dist/docs` 없으니 실제 API 확인 필요).

## 핵심 결정
- **수집**: 체크포인트 기반. 데일리=출결+바퀴수(한 숫자), 정밀측정=각 영법 첫 완주. **매 수업 상세기록 금지**(수업>기록).
- **영상**: 월 1회(기존 관행), 피드백=데이터 자동초안 + 강사 특이사항만.
- **cold-start**: 과거 데이터 없음(1주 테스트뿐) → 베이스라인 배치 + `skill_progress.source` 플래그. 향후 데이터는 기존생도 1급(`observed`).
- **DB**: Supabase 기존 프로젝트 재활용(무료). public 스키마.
- **환경**: Next 16.2.9 / React 19 / vitest 4. 테스트는 순수함수만(DB 통합 테스트 하네스 없음).

## ⚠️ 주의
- `재원생 DB.xlsx` = 실제 아동 PII → `.gitignore`됨(`*.xlsx`). **절대 커밋/푸시 금지.**
