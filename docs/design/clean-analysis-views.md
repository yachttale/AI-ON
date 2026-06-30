# 설계: 분석 전용 정제 뷰 `v_clean_progress` / `v_clean_laps`

작성: 2026-06-30 | Architect 에이전트 설계 기반 | 마이그레이션 `037`

## 문제 (AI 분석 왜곡원 2개)
1. **baseline 편향**: `skill_progress.source='baseline'` 통과는 등록 시 일괄 입력 → `passed_at` 몰림 → 시계열 지표 왜곡. 분석 함수마다 수동 배제(`analytics-data.ts:305/325/587-589`).
2. **laps 다형성**: `measurements`의 laps가 (a) `skill_step_id=null` 당일 총 바퀴수(1행, value=총량) vs (b) 마스터 단계(value=1 × N행) 두 의미. 모르면 거리 2배 오류. 레인 길이 `*50` 하드코딩 산재(`:277/:394`).

## 핵심 결정: 일반 VIEW + `security_invoker=on` (MV 아님)
- MV는 RLS 우회 → 모든 강사가 전체 학생 진도 열람 = 보안 위반. 진도/측정은 학생별 민감 데이터.
- `security_invoker=on`이면 호출자 권한 실행 → 하부 `is_owner` RLS(034~036) 그대로 적용 → **강사 격리 자동 보존**.
- `022` MV가 허용됐던 건 비민감 집계(current_stroke)였기 때문.

## `v_clean_progress`
- 행 전부 유지 + `is_baseline`/`date_is_trustworthy` 플래그
- `days_since_prev_observed`: baseline을 **순서에서 빼고** observed-only 윈도우(LAG)로 계산 → 더미가 시계열 오염 안 함. baseline 행은 NULL
- `step_key_snapshot`/`ladder_order_snapshot` **폴백** → 단계 시프트(020)에도 라벨/순서 보존
- `step_kind` 노출 → 소비자가 ladder/counter/single 분리

## `v_clean_laps`
- `lap_scope`: `daily_total`(skill_step_id=null) vs `step` 분리. **둘 합산 금지**(이중계산)
- `SUM(value)`를 두 경로 공통 척도로 고정 (당일총량=value, 단계=value 1의 N행 합)
- 거리 = `laps * pool_lane_m()`, **IM(`track_key='im'`) 제외**
- `pool_lane_m()` IMMUTABLE 함수 = 레인 길이 단일 출처(50m)

## baseline: 배제 아닌 플래그
통과 사실은 진실, 날짜만 비신뢰 → 정제를 "날짜 차원"에만 국한. 배제하면 진도% 과소집계.

## 마이그레이션 / 롤백
- `037_v2_clean_analysis_views.sql` — 함수 + 2개 뷰 + grant. 순수 추가
- 롤백: `drop view`/`drop function` → 데이터 손실 0
- 새 인덱스 불필요 (기존 인덱스가 윈도우/집계 커버)

## 후속 소비 측 전환 (이번 범위 밖, analytics-data.ts)
- `getStudentDashboard` 거리(`:275-279`) → `v_clean_laps where lap_scope='daily_total'` (2× 오류 제거)
- baseline 수동 배제(`:305/325/587`) → `v_clean_progress where is_baseline=false`
- `getStudentMasterStats`(`:367-398`) → `v_clean_laps where lap_scope='step' and stroke_key='master'`, IM은 `is_im`
- 레인 길이 `*50` → `pool_lane_m()`
- 상위 빌딩블록: "직전 영법 완주 후 경과일"은 `v_stroke_completion`(후속)으로 얹기
