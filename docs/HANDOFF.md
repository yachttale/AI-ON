# UP²U(어푸) — 작업 인계 / 할 일

> 수영 진도관리 프로그램. 외부 강사 10명 테스터 베타 단계.
> 마지막 정리: 2026-06-25 · 최신 커밋 `c0559b1`

---

## ✅ 효띠가 먼저 해야 할 것 (Supabase SQL Editor 적용)

코드는 모두 배포돼 있지만, **RLS·테이블 변경은 Supabase SQL Editor에서 직접 실행**해야 반영됩니다.
아래 마이그레이션을 **순서대로** 한 번씩 실행하세요. 모두 `drop ... if exists` / `if not exists` 구조라 **여러 번 실행해도 안전**합니다.

| 파일 | 내용 | 상태 |
|---|---|---|
| `024_v2_session_makeup_rls.sql` | 보강 세션 RLS | 적용 추정 |
| `025_v2_progress_measure_makeup_rls.sql` | (027이 포함 — 027만 실행하면 됨) | 생략 가능 |
| `026_v2_profiles_role_lock.sql` | **권한 상승 차단**(강사가 role 변경 못하게) | ⚠️ 확인 필요 |
| `027_v2_progress_measure_assigned_rls.sql` | 진도/측정 쓰기 권한(요일배정·보강 강사) | ✅ 적용됨 |
| `029_v2_skill_progress_update_policy.sql` | UPDATE 정책(기준배치·과거날짜 완주 upsert 보호) | ⚠️ 확인 필요 |
| `030_v2_progress_measure_select_rls.sql` | 진도/측정 **조회** 권한 | ✅ 적용됨 |
| `031_v2_object_pickup_single.sql` | '물건 줍기'를 체크 항목으로 전환 | ⚠️ 미적용 |
| `032_v2_instructor_certifications.sql` | 강사 자격증 테이블('나의 정보') | ⚠️ 미적용 |

**정리하면 지금 실행할 것: `026`, `029`, `031`, `032`** (나머지는 적용됨/포함됨)

### 그 밖의 1회성 정리 (선택)
- 진단용 임시 함수 제거: `drop function if exists public.debug_whoami();`

### 이미 완료한 설정
- Supabase Auth → 공개 회원가입 **OFF** ✅ (외부인 가입 차단)
- 테스터 계정은 운영자가 Authentication → Users → Add user 로 수동 발급

---

## 🐛 이번 세션에 해결한 것 (참고)

- **진도 통과 에러(강사들)** — 근본 원인은 RLS가 강사 권한을 INSERT/UPDATE/DELETE/**SELECT** 4가지로 각각 다 열어줘야 하는데 단계적으로 누락돼 있었음. 027(쓰기)+029(수정)+030(조회)로 통일. 권한 기준: 원장 ∪ 고정담당 ∪ 요일배정(요일무관) ∪ 오늘 보강.
- 진도 통과를 upsert(ON CONFLICT) → "미통과 단계만 일반 INSERT"로 변경(중복/UPDATE 정책 회피).
- 마스터 판정·오늘 카드 표시·이름 클릭 대시보드 이동·마스터 바퀴 디바운스 저장.
- 보안: 권한 상승 차단(026), 공개가입 OFF.
- 에러를 풀페이지 대신 **화면에 인라인 표시**(테스터 운영용으로 유지).

## 🆕 이번 세션에 추가한 기능

- **브랜딩**: 스타키즈 → **UP²U(어푸)** (로그인·탭 title·PWA). ⚠️ 단 `app/v2/layout.tsx` 헤더의 "AI-ON" 텍스트는 **아직 안 바꿈**.
- 강사 사용 가이드 PDF (`docs/guide/` — 화면 목업 포함, 연속 흐름).
- '물건 줍기' → 체크 항목(진도 무관, 체크 시 기록).
- 학생 상세 **기록 성장 그래프**(측정 단계 추이, 모든 영법).
- 강사 **'나의 정보' 탭**(`/v2/me`) — 지도 효율 포트폴리오(영법별 완성 평균 출석 수업 수, 입문~수료 평균, 담당/마스터 수, 영법 분포) + 자격증.

---

## 📋 다음에 이어서 할 작업

1. **알람(푸시 알림)** — 별도 설계 필요. 예: "오늘 미입력 학생 N명" 저녁 알림.
   - PWA 웹푸시. iOS는 "홈 화면 추가" 시에만 동작(애플 정책).
   - 구현: 서비스워커 + 푸시 구독 저장 + 발송 스케줄(Supabase cron 또는 Vercel cron).
   - 시작 시 brainstorming 부터.
2. **헤더 브랜딩 정리** — `app/v2/layout.tsx`의 "AI-ON" → "UP²U".
3. **포트폴리오/성장 그래프 데이터 검증** — 운영에 세션·측정 기록이 쌓인 뒤 평균값이 합리적인지 확인(현재는 표본 부족 가능).
4. (테스터 피드백 반영) — 모집·운영하며 들어오는 수정 요청.

---

## 🔧 개발 메모

- 검증 루틴: `npx tsc --noEmit` + `npx vitest run` (현재 13파일·73테스트 통과).
- 가이드 PDF 재생성: `docs/guide/`에서 Edge headless — `msedge --headless --no-pdf-header-footer --print-to-pdf=out.pdf "file:///.../UP2U-사용가이드.html"` (한글 출력 경로는 ASCII로).
- RLS 디버깅 팁: 권한 문제는 INSERT/UPDATE/DELETE/SELECT 정책을 **각각** 확인. `pg_policies`로 조회.
