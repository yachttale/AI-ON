# 마스터 단계 도입 설계

- **작성일**: 2026-06-19
- **상태**: 설계 확정

---

## 1. 배경

접영까지 모든 ladder 단계를 완주한 학생은 "마스터반"으로 전환된다.
마스터반은 영법별 바퀴 수(50m 단위) + IM 기록을 매 수업 누적해 누적 거리와 영법별 연습 분포를 추적한다.
초보~접영 학생 화면은 현행 유지, 마스터반 학생만 별도 UI로 진입한다.

---

## 2. 마스터 분류 로직

### 현황
`currentStrokeKey` = "첫 번째 미통과 `ladder` step의 `stroke_key`".
마스터의 모든 step이 `repeatable`이라 접영 완주 후 `null` 반환 → 대시보드에 미분류.

### 수정
`lib/v2/data.ts`의 `currentStrokeKey` 계산 전체(getDashboardRaw · getDirectorRoster · 기타):

```ts
const currentStep = allSteps.find(s => s.step_kind === 'ladder' && !passed.has(s.id))
const currentStrokeKey = currentStep?.stroke_key
  ?? (passed.size > 0 ? 'master' : null)
```

- 미통과 ladder가 없고 통과 이력이 1개 이상 → `'master'`
- 통과 이력 전혀 없음 → `null` (신규 입학, 아직 미배치)

---

## 3. 마스터 학생 페이지

### 진입 조건
`/v2/student/[id]` 에서 `currentStrokeKey === 'master'` 이면 기존 사다리 뷰 대신 `MasterPanel` 렌더.

### 데이터
`getStudentMasterStats(studentId)`:
- **오늘 바퀴 수** (KST 날짜 기준): `measurements` WHERE `metric_type='laps'` AND `measured_on=today` GROUP BY `skill_step_id`
- **누적 바퀴 수** (전체 기간): 동일 GROUP BY, 날짜 필터 없음
- **IM 기록 횟수**: `measurements` WHERE `metric_type='laps'` AND `skill_step_id=IM step id`
- 영법별 step id는 커리큘럼 캐시(getCachedLadderSteps)에서 `stroke_key='master'` 필터로 추출

master 영법 목록: 자유형(`free`) · 배영(`back`) · 평영(`breast`) · 접영(`fly`) · IM

### UI (`MasterPanel`)

```
자유형    오늘 4바퀴   [−] [4] [+]   누적 1,250m
배영      오늘 2바퀴   [−] [2] [+]   누적 800m
평영      오늘 0바퀴   [−] [0] [+]   누적 350m
접영      오늘 1바퀴   [−] [1] [+]   누적 200m
─────────────────────────────────────
IM        총 12회             [기록하기]
```

- **`+`**: `logRepeatable(studentId, stepId, 'laps', 1)` (기존 서버액션 재사용)
- **`−`**: `removeLastLap(studentId, stepId)` 신규 서버액션 — 오늘 해당 step의 `measurements` 최신 1행 삭제 (오류 수정용)
- **누적거리**: 해당 영법 전체 기간 laps 합계 × 50m
- **IM [기록하기]**: 횟수 +1 (laps=1 insert). 시간 선택 입력 필드(선택사항).
- 낙관적 UI: `useOptimistic`으로 즉시 반응, 서버 반영 후 revalidate

### 서버 액션 추가 (`lib/v2/actions.ts`)
```ts
// 오늘 해당 step의 가장 최근 laps 측정 1행 삭제 (오류 수정)
export async function removeLastLap(studentId: string, stepId: string): Promise<void>
```

---

## 4. 원장 대시보드 — 6그룹

### 현황
`strokeGroups`: "영법별 진행 중 학생" 나열 (진행 중만, 완주자 제외).

### 수정
기존 `strokeGroups` 섹션을 6그룹 카드 그리드로 교체.

**그룹 정의**:
| 키 | 레이블 | 조건 |
|---|---|---|
| `beginner` | 초보 | currentStrokeKey = 'beginner' |
| `free` | 자유형 | currentStrokeKey = 'free' |
| `back` | 배영 | currentStrokeKey = 'back' |
| `breast` | 평영 | currentStrokeKey = 'breast' |
| `butterfly` | 접영 | currentStrokeKey = 'butterfly' |
| `master` | 마스터 | currentStrokeKey = 'master' |

**대시보드 UI**:
```
[초보 12명] [자유형 34명] [배영 21명]
[평영 15명] [접영 8명]   [마스터 5명]
```
각 카드 클릭 → `/v2/director/stroke/[key]`

### 드릴다운 페이지 (`/v2/director/stroke/[key]`)
- 해당 그룹 학생 목록 (이름 · 담당 강사 · 최근 통과일)
- 학생 클릭 → `/v2/student/[id]` (기존 상세 페이지)
- 데이터: `getDirectorRoster()` 결과를 `focusStrokeKey === key`로 필터 (신규 DB 쿼리 불필요)

---

## 5. 파일 구조

**수정**:
- `lib/v2/data.ts` — `currentStrokeKey` 로직, `getStudentMasterStats` 추가, `getDirectorDashboard` 6그룹 계산
- `lib/v2/actions.ts` — `removeLastLap` 추가
- `app/v2/student/[id]/page.tsx` — 마스터 분기
- `app/v2/director/page.tsx` — 6그룹 카드 UI

**신규**:
- `app/v2/student/[id]/MasterPanel.tsx` — 마스터 바퀴 + IM UI
- `app/v2/director/stroke/[key]/page.tsx` — 그룹 드릴다운

---

## 6. 마이그레이션

스키마 변경 없음. 기존 `measurements(laps)` 테이블 그대로 사용.
`removeLastLap` 액션은 RLS `assertOwns` 통과 후 DELETE.

---

## 7. 범위 외

- 마스터 학생의 6개월 추이 차트 (Phase 2)
- IM 시간 분석 (Phase 2)
- 정체 학생 감지 (Phase 2)
