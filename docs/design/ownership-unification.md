# 설계: 소유권(유효 담당강사) 모델 단일화 — `is_owner`

작성: 2026-06-29 | Architect 에이전트 분석·설계 기반

## 문제
동일한 '유효 담당강사' 4중 OR 규칙이 두 곳에 이중 구현 → 동기화 실패 시 데이터 누수/기능 고장 위험.
- TS: `assertOwns` (`lib/v2/actions.ts:17-31`) — 4중 OR
- RLS: `011` + 격차 패치 `025/027/029/030` 5개에 같은 식 복붙 분산

판정 기준(canonical, 4중): ①원장 ②고정담당(`students.instructor_id`) ③요일배정(`student_day_instructors`, 요일무관) ④오늘(KST) 보강 세션(`sessions`)

## 해결
4중 OR을 DB 함수 `is_owner(p_student_id uuid)` 하나로 고정. RLS·앱이 같은 규칙 공유.
- `security definer` + `set search_path=public`: RLS 정책 내 호출 시 함수↔정책 무한 재귀 차단 (기존 `is_director()` 선례)
- `stable`: 트랜잭션 내 불변 → 플래너 최적화
- 새 인덱스 불필요 (PK·기존 unique 인덱스로 커버)

## 적용 범위
- 대상: `skill_progress`(SELECT/INSERT/UPDATE/DELETE), `measurements`(SELECT/INSERT/DELETE — 앱이 UPDATE 안 함)
- 제외: `sessions` 정책(`024`) — 보강 null 워크플로라 student-소유권과 의미 다름

## 점진 이행 (B→A, 운영 DB)
| 단계 | 파일 | 내용 | 안전성 |
|------|------|------|--------|
| 1 | `034_v2_is_owner_function.sql` | 함수만 추가 | 동작 무변화. 검증: is_owner vs legacy mismatch=0 |
| 2 | `035_v2_owner_policies_parallel.sql` | `v2` 정책 7개 병행 | 권한 불변 (다중정책 OR결합, 구∪is_owner=is_owner) |
| 3 | `036_v2_drop_legacy_owner_policies.sql` | 구 정책 7개 DROP | 여기서 처음 단독. 앞 검증 전제 |
| 4 | 코드 (미적용) | `assertOwns`→`rpc('is_owner')` 위임 | DB가 진실이라 늦어도 안전 |

실행 순서: `034` → (TS 배포 가능) → `035` → `036`. 각 단계 검증 쿼리는 SQL 파일 주석에 포함.

## 4단계 TS 변경안 (DB 적용 후 진행 — 아직 미적용)
```ts
// lib/v2/actions.ts
async function assertOwns(supabase, _userId: string, studentId: string) {
  const { data, error } = await supabase.rpc('is_owner', { p_student_id: studentId })
  if (error) throw error
  if (data !== true) throw new Error('Forbidden')
}
```
- `assertOwnsForDate`(`actions.ts:290-299`)도 위임 권장 — 현재 ③을 날짜 요일로 한정해 RLS(요일무관)와 이미 불일치. `is_owner`로 통일 시 해소(RLS 허용 범위 내이므로 권한 확대 아님). `validateRecordDate` 2일 제한은 유지.
- RLS 강제 후 `assertOwns`는 보안 경계 → UX 가드로 역할 변경(친절한 에러). 유지가 옳음.

## 롤백
- `034`: `drop function if exists public.is_owner(uuid);`
- `035`: v2 정책 7개 개별 drop
- `036`: 실행 전 `pg_policies` 백업 → 필요 시 025/027/029/030 CREATE POLICY 원문 재실행
- TS: 이전 커밋 revert

## 성능
현행도 동일하게 per-row 4중 OR 평가 중 → **회귀 아님, 사실상 중립**. 현 규모(베타 10강사) 문제 없음.

## 정정 사항
초기 분석은 "3중 OR"이라 했으나 코드 재확인 결과 **4중 OR**(원장 포함). `agents/swimming-domain.md`가 죽은 v1 파일을 가리키는 문제는 별도 후속(분석 보고서 3순위).
