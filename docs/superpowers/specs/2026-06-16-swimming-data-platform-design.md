# 수영 교육 데이터 플랫폼 — 데이터 토대 설계 (v2)

- **작성일**: 2026-06-16
- **상태**: 설계 확정 대기 (브레인스토밍 산출물)
- **범위**: 데이터 모델 + 일일 수집 방식 (= 모든 상위 기능의 토대). 부모 리포트·예측·운영분석 등은 이 위에 얹는 후속 단계.

---

## 1. 배경 & 목표

어린이 수영장 10년 운영. 현재 강사들이 매일 진도를 기록하지만 **단순 기록 수준**에 머물러 있고, 데이터를 부모 피드백·교육 표준화·예측으로 활용하지 못함.

만들고자 하는 것은 단순 진도관리가 아니라 **"수영 교육 데이터 플랫폼"**. 궁극 목표 5가지:

1. **부모 피드백 자동화** — 매월 AI가 성장 리포트 작성 (영역별 성장, 정체, 완성 예상 시기, 다음 과제)
2. **교육 표준화** — 강사마다 다른 기준을 통일. 영법을 세부 단계(약 100단계)로 정의. "영법 = 계단, 아이 = 계단을 오르는 사람"
3. **예측 시스템** — "초2·주2회면 자유형 완성까지 평균 몇 개월" 같은 질문에 데이터로 답
4. **강사별 교육 성과 분석**
5. **수영장 전체 운영 분석**

**핵심 질문**: 위 5가지가 가능하려면 *처음부터 어떤 데이터를 어떻게 매일 수집*해야 하는가.

---

## 2. 현재 시스템 진단

현재 repo(AI-ON)의 스키마/코드 분석 결과:

**자산 (재활용)**
- "계단" 모델이 이미 존재: `lib/curriculum.ts`에 영법별 사다리(초보→자유형→배영→평영→접영→마스터, 전역 order 1~69).
- 작동하는 인프라: Supabase auth, RLS, 역할 라우팅(director/instructor), Vercel 배포.
- UI 컴포넌트: StrokeRadar(7축 레이더), StageBoard, SessionForm 등.

**문제 (이대로면 예측·표준화 불가)**
1. **커리큘럼이 코드에 하드코딩** — `skill_key`가 TS 상수를 가리키는 문자열. 단계 추가/재정렬 시 과거 기록이 깨지고, "2학년 24단계 통과율" 같은 분석 쿼리 불가.
2. **`session_logs`가 출결만 기록** (코드 주석: `출결만 - 단순화`) — 오늘 무엇을 연습했는지 신호 없음. = 원장이 우려한 "오늘 자유형 했다 정도로는 활용 불가" 지점.
3. **예측 변수 누락** — 생년월일·나이, 성별, 수영 시작일, 주당 횟수(구조화)가 없거나 free text.

---

## 3. 설계 원칙

1. **원시 이벤트를 타임스탬프로 영구 저장.** 집계값만 저장하거나 상태를 덮어쓰지 않는다. (나중에 ML이 가능한 유일한 형태)
2. **커리큘럼을 DB로.** 코드 하드코딩 탈출 + 버전 관리.
3. **모든 수업이 "무엇을 연습했는지"와 연결.** 출결 단독 기록 폐기.

---

## 4. 구축 방식 결정

**결정: 기존 repo(AI-ON)를 진화시키되, 데이터 레이어는 새 스키마로 재구축.**

근거:
- "엉망"인 것은 데이터 모델이지 앱 전체가 아님. 갈아엎을 대상은 데이터 레이어 하나.
- 로그인·RLS·역할 라우팅·배포는 이미 작동 — 새 repo로 가면 이 인프라를 재구축하는 비용만 발생하고 비전에 이득 없음.
- StrokeRadar는 새 트랙 구조에 그대로 매핑. 기존 69단계는 새 커리큘럼 **버전 1의 씨앗**으로 재활용.

**DB 호스팅**: Supabase 유지 (auth·RLS 투자 보존). 무료 3번째 프로젝트 제한은 **기존 프로젝트 내 v2 전용 스키마 분리**로 회피, 비용 0. v1 운영과 v2 공존. *(최종 호스팅 확정은 후속 결정 — 모델은 어느 Postgres든 이식 가능)*

---

## 5. 데이터 모델 (ERD)

```
[커리큘럼 — 표준화의 기준]
curriculum_versions ──< skill_steps >── skill_tracks ──> strokes
                          (100단계)      (킥/팔/호흡/콤비)  (자유형…)

[학생 — 예측 변수 포함]
students (birthdate, sex, enrolled_on)
   │
   ├──< sessions >──< session_skills >── skill_steps      ← 일일 모멘텀(하이브리드)
   │      (출결)        (오늘 연습+숙련도)
   │
   ├──< skill_progress >── skill_steps                     ← 마일스톤 통과 이벤트(사다리)
   │      (통과일+난이도+어느 수업)
   │
   └──< distance_logs                                      ← 마스터반 거리

profiles(강사) ──< sessions, session_skills, skill_progress
parent_reports (Phase 2) ──> students
```

### 5.1 커리큘럼 (표준화)

**`curriculum_versions`** — 100단계 체계의 버전
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK | |
| label | text | 예: "v1 - 2026 기본" |
| status | text | draft / active / archived |
| created_at, activated_at, archived_at | timestamptz | |

**`strokes`** — 영법
| id uuid PK · key text unique (freestyle/backstroke/breaststroke/butterfly/beginner/master) · label · display_order int · color text |

**`skill_tracks`** — 영법 내 영역(레이더 축)
| id uuid PK · stroke_id FK · key text (kick/arm/breath/combo…) · label · display_order int · unique(stroke_id, key) |

**`skill_steps`** — **100단계 사다리** (핵심)
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK | 학생 기록이 가리키는 **불변 ID** |
| curriculum_version_id | FK | |
| stroke_id | FK | |
| track_id | FK null | 트랙 태그(킥/팔/호흡/콤비) |
| key | text | 안정적 의미 키. 예: `freestyle.combo.25m`. unique(version_id, key) |
| label | text | 화면 표시명 |
| ladder_order | int | 영법 내 사다리 위치 |
| is_milestone | bool | 마일스톤(통과 이벤트 대상) vs 미시 단계 |
| is_completion | bool | 영법 완성 지점 (예측 타깃) |
| is_active | bool | 기본 true. **삭제 대신 false 처리** |
| created_at | timestamptz | |

### 5.2 학생 (예측 변수 포함)

**`students`**
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK | |
| name | text | |
| birthdate | date | **나이·학년 파생용** (학년 텍스트보다 정확) |
| sex | text null | '남'/'여' — 남녀 차이 분석 |
| enrolled_on | date | **수영 시작일(입문 시기)** — created_at과 구분 |
| instructor_id | FK | |
| is_active | bool | |
| withdrawal_status, withdrawal_requested_by, withdrawal_note | | 기존 퇴원 워크플로우 유지 |
| schedule | text | 표시용 유지 (주당 횟수는 출석에서 파생) |
| created_at | timestamptz | |

### 5.3 수업 & 일일 연습 (하이브리드)

**`sessions`** — 수업 1회(출결)
| id uuid PK · session_date date · student_id FK · instructor_id FK · attendance text(출석/지각/결석) · absence_reason text null · memo text null · created_at · **unique(student_id, session_date)** |

**`session_skills`** — **일일 모멘텀 신호** (신규)
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK | |
| session_id | FK (on delete cascade) | |
| skill_step_id | FK | 오늘 연습한 단계 |
| quality | text null | 5단계: 어려워함/조금어려워함/중간/조금쉽게/쉽게해결 |
| is_focus | bool | 오늘의 주력 단계 |
| note | text null | |
| created_at | timestamptz | |

→ 한 수업에 여러 행 가능(2~3단계 연습). 단계 내 진전·정체 감지·리포트 디테일의 원천.

### 5.4 마일스톤 (단계 통과 이벤트)

**`skill_progress`** — 사다리의 뼈대 (현 skill_checkpoints 진화)
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK | |
| student_id | FK (on delete cascade) | |
| skill_step_id | FK | |
| status | text | 기본 passed (향후 in_progress 확장 여지) |
| difficulty | text null | 통과 시 난이도 |
| passed_at | date | |
| source_session_id | FK null | 어느 수업에서 통과 |
| instructor_id | FK null | |
| step_key_snapshot | text | **통과 시점의 key 스냅샷** (버전 안정성) |
| ladder_order_snapshot | int | **통과 시점의 위치 스냅샷** (과거 속도 불변) |
| note | text null | |
| created_at | timestamptz | |
| | | **unique(student_id, skill_step_id)** |

### 5.5 기타

**`distance_logs`** (마스터반) — id · student_id FK · instructor_id FK · logged_date date · distance_meters int · note · created_at

**`parent_reports`** (Phase 2 예약) — id · student_id FK · period_start/end date · generated_at · content jsonb · status (draft/approved/sent) · approved_by FK · created_at

**`curriculum_step_map`** (대규모 개편 시에만) — id · from_step_id FK · to_step_id FK · relation (same/merged/split) · note. 버전 간 비교용.

---

## 6. 핵심 메커니즘

### 6.1 하이브리드 일일 수집
- 매 수업: `session`(출결) + `session_skills`(오늘 연습 단계 + 숙련도). → 단계 내 진전·정체 포착.
- 단계 통과 시: `skill_progress` 이벤트 1건. → 사다리 전진(예측·표준화).

### 6.2 사다리 + 트랙
- `skill_steps`의 `ladder_order` = 하나의 진행 사다리(계단). `track_id` = 영역(킥/팔/호흡/콤비).
- 하나의 진행 숫자도 나오고, 트랙별로 쪼개 레이더·"다음 달 집중 과제: 호흡" 리포트도 가능.

### 6.3 커리큘럼 버전 관리 & 단계 편집 안정성

**원장이 나중에 100단계를 자유롭게 다시 정의해도 기존 데이터는 깨지지 않는다.** 보장 규칙:

1. 학생 기록은 단계의 **불변 ID**를 참조 (순서·이름이 아님).
2. 단계는 **삭제하지 않고 보관**(`is_active=false`) → FK 연결 유지.
3. 통과 시점의 key·위치를 **스냅샷**으로 저장 → 과거 평가 기준 항상 복원, 과거 속도 불변.

| 나중 작업 | 결과 |
|-----------|------|
| 단계 추가 / 이름 변경 / 순서 변경 | ✅ 안전 |
| 단계 삭제 | ✅ 보관 처리 (과거 기록 유지, 신규에겐 숨김) |
| 단계 분할/병합 (대규모 개편) | ✅ 안전. 단 버전 간 비교 시 `curriculum_step_map` 필요 (측정 자를 바꾸는 본질적 비용) |

**운영 권장**: 출시 전 100단계를 완벽히 짜려 하지 말 것. 현 69단계 확장 초안을 **버전 1**로 띄우고 데이터 수집 시작 → 사용하며 버전 2,3으로 보강. 구조가 변화를 흡수.
**관리자 화면**: 원장이 개발자 없이 단계 추가/수정/순서변경 (삭제는 자동 보관). 로드맵 포함.

---

## 7. 성장 속도 측정 & 예측

- **거시 속도** = `skill_progress`에서 활동 월당 통과 단계 수 (전체 + 트랙별). → "이번 달 자유형 12→18단계".
- **미시 모멘텀** = `session_skills` 숙련도 추세. → 한 단계 정체 중에도 개선 포착 + **정체 감지**.
- **예측** = `enrolled_on`부터 `is_completion` 마일스톤까지 기간을 나이·성별·실제 주당횟수·학년·선행영법별 코호트 집계. 데이터 축적 시 **"초2·주2회 → 평균 N개월"** 자동 산출.
- **주당 횟수** = 별도 입력 없이 **실제 출석 이벤트에서 계산** (계획이 아닌 진실).

---

## 8. 강사 입력 UX & 데이터 품질

- 오늘 연습 단계를 학생의 **현재 사다리 위치로 자동 프리필** → 평소 탭 1번.
- 숙련도 5단계 탭 + "통과!" 토글 → **총 3~4탭**.
- **단계 건너뛰기 방지**(N+1 미통과 시 N+2 통과 차단, 트랙별 설정) → 데이터 정합성.

---

## 9. 부모 리포트 (Phase 2)

위 데이터만으로 리포트 재료(영역별 성장·정체·완성 예측·다음 과제) **전부 확보**. 생성/승인/발송 워크플로우(`parent_reports`)는 토대 위 별도 단계로 분리.

---

## 10. ML / 예측 대비

모든 데이터가 (학생 + 타임스탬프 이벤트)로 join 가능 → 나중에 *(학생, 주차)별 1행 + 변수 + 획득 단계 수* 패널 데이터를 **스키마 변경 없이** 추출. 이것이 ML 준비의 핵심 속성. 전제: append-only 이벤트, 상태 덮어쓰기 금지.

---

## 11. 범위 & 단계 분리

5대 목표는 모두 **하나의 데이터 토대** 위에 얹힘. 따라서:

- **Phase 1 (이 스펙)**: 데이터 토대 — 새 스키마, 커리큘럼 DB화 + 버전 관리, 하이브리드 입력 UX, 관리자 단계 편집.
- **Phase 2~**: 부모 리포트 자동화 / 성장 예측 / 강사 성과 분석 / 운영 분석 — 각각 자체 스펙·계획·구현 사이클.

---

## 12. 로드맵 개요

(상세 구현 계획은 writing-plans 단계에서 작성)

1. 새 스키마 마이그레이션 + RLS (Supabase v2 스키마 분리)
2. 커리큘럼 DB 시드 (현 69단계 → 버전 1) + 타입/데이터접근 레이어
3. 강사 일일 입력 UX (프리필 + 3~4탭, session + session_skills + skill_progress)
4. 관리자 커리큘럼 편집 화면 (추가/수정/순서/보관)
5. 진도·속도 조회 화면 (사다리 + 트랙 레이더 재활용)
6. (Phase 2) 부모 리포트 → 예측 → 운영분석

---

## 13. 후속 결정 (미해결)

- **DB 호스팅 최종 확정**: Supabase 동일 프로젝트 내 스키마 분리(권장) vs 별도 프로젝트(Pro 유료) vs Neon. 모델은 이식 가능하므로 구현 착수 전 확정.
- **100단계 실제 내용**: 버전 1 초안을 현 69단계에서 어디까지 확장할지 — 출시 후 반복 정의 (구조가 흡수).
- **레이더 축 정의**: 기존 7축(턴·스타트 포함)을 트랙 구조에 어떻게 정렬할지.
