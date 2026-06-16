# 수영 교육 데이터 플랫폼 — 데이터 토대 설계 (v2)

- **작성일**: 2026-06-16 (rev. 브레인스토밍 반영)
- **상태**: 설계 확정 — 구현 계획 단계로 이행
- **범위**: 데이터 모델 + 일일 수집 방식 (= 모든 상위 기능의 토대). 부모 리포트·예측·운영분석 등은 이 위에 얹는 후속 단계.

---

## 1. 배경 & 목표

어린이 수영장 10년 운영. 현재 매일 진도를 기록하지만 **단순 기록 수준**에 머물러, 부모 피드백·교육 표준화·예측으로 활용 못 함. 만들 것은 단순 진도관리가 아니라 **"수영 교육 데이터 플랫폼"**.

궁극 목표 5가지: ① 부모 피드백 자동화 ② 교육 표준화(영법=계단) ③ 성장 예측("초2·주2회면 자유형 첫 완주까지 몇 개월") ④ 강사별 성과 분석 ⑤ 운영 분석.

**핵심 질문**: 처음부터 *어떤 데이터를 어떻게 매일 수집*해야 위 5가지가 가능한가.

---

## 2. 현재 시스템 진단

**자산(재활용)**: 계단 모델이 이미 존재(`lib/curriculum.ts`, 영법별 order 1~69). 작동하는 인프라(Supabase auth/RLS, 역할 라우팅, Vercel 배포). UI 컴포넌트(StrokeRadar 등).

**문제**: ① 커리큘럼이 코드에 하드코딩 → 분석·버전관리 불가 ② `session_logs`가 출결만 → 무엇을 했는지 신호 없음 ③ 예측 변수(생년월일·성별·입문일) 누락.

---

## 3. 설계 원칙

1. **원시 이벤트를 타임스탬프로 영구 저장.** 집계값만 저장하거나 상태 덮어쓰기 금지. (나중에 ML 가능한 유일한 형태)
2. **커리큘럼을 DB로.** 코드 탈출 + 버전 관리.
3. **수업 > 기록.** 강사가 매 수업 *상세 평가*를 하면 기록이 수업을 잡아먹음. 데일리는 *한 숫자(바퀴수)*만, 정밀 측정은 *지정 체크포인트*에서만.

---

## 4. 구축 방식 결정

**기존 repo(AI-ON) 진화 + 데이터 레이어 신규 구축.** "엉망"인 건 데이터 모델뿐. 로그인·RLS·라우팅·배포는 작동하므로 재사용. StrokeRadar는 트랙 구조에 매핑, 기존 69단계는 커리큘럼 버전 1의 씨앗.

**DB**: Supabase 유지. 무료 3번째 프로젝트 제한은 **기존 프로젝트 내 v2 전용 스키마 분리**로 회피(비용 0). 모델은 어느 Postgres든 이식 가능.

---

## 5. 데이터 모델 (ERD)

```
[커리큘럼 — 표준화 기준]
curriculum_versions ──< skill_steps >── skill_tracks ──> strokes
                          (사다리)       (킥/팔/호흡/콤비)  (자유형…)

[학생 — 예측 변수]
students (birthdate, sex, enrolled_on)
   │
   ├──< sessions ───────────────────< measurements      ← 객관 지표
   │      │  (출결+템플릿+지금영법)       (바퀴수/거리/시간/스트로크)
   │      └─ template_id, focus_stroke_id
   │
   ├──< skill_progress >── skill_steps                    ← 단계 통과 + 첫 완주 이벤트
   │
   └──< media (영상+피드백)
                                       ↘ measurements 도 skill_step_id로 연결(완주 측정)

[강사 입력 편의]
profiles(강사) ──< lesson_templates ──< lesson_template_items
profiles(강사) ──< sessions, skill_progress, measurements, media
```

### 5.1 커리큘럼 (표준화)

- **`curriculum_versions`** — id · label · status(draft/active/archived) · created_at, activated_at, archived_at
- **`strokes`** — id · key(freestyle/backstroke/breaststroke/butterfly/beginner) · label · display_order · color
- **`skill_tracks`** — id · stroke_id FK · key(kick/arm/breath/combo) · label · display_order · unique(stroke_id,key)
- **`skill_steps`** — 사다리 (핵심)

| 컬럼 | 비고 |
|------|------|
| id (uuid PK) | 학생 기록이 가리키는 **불변 ID** |
| curriculum_version_id, stroke_id, track_id(null) | |
| key (text) | 안정적 의미 키. unique(version_id, key) |
| label, ladder_order(int) | 표시명 / 영법 내 위치 |
| is_first_completion (bool) | **각 영법 첫 완주 지점** (측정·예측 타깃) |
| measure_spec (text[] null) | 이 단계에서 측정할 항목: time/strokes/distance. 초보 단계는 빈 값 |
| is_active (bool) | 기본 true. **삭제 대신 false** |

### 5.2 학생 (예측 변수)

**`students`** — id · name · **birthdate(date, 나이·학년 파생)** · **sex(null, 남/여)** · **enrolled_on(date, 입문일)** · instructor_id FK · is_active · withdrawal_* (기존) · schedule(표시용) · created_at

### 5.3 수업 (데일리 — 가볍게)

**`sessions`** — 수업 1회

| 컬럼 | 비고 |
|------|------|
| id, session_date, student_id FK, instructor_id FK | |
| attendance (출석/지각/결석), absence_reason(null) | |
| template_id FK(null) | 오늘 쓴 기본패턴 |
| focus_stroke_id FK(null) | 오늘의 "지금영법" |
| memo(null), created_at | |
| | **unique(student_id, session_date)** |

> 데일리 정밀 스킬평가 테이블(session_skills)은 **두지 않음** — 수업을 잡아먹으므로. 데일리 신호는 아래 `measurements`의 바퀴수 한 줄.

### 5.4 객관 지표 (통합)

**`measurements`** — 모든 객관 수치를 한 테이블로 (append-only)

| 컬럼 | 비고 |
|------|------|
| id (uuid PK) | |
| student_id FK | |
| metric_type (text) | laps / distance_m / time_sec / stroke_count |
| value (numeric), unit (text) | |
| measured_on (date) | |
| session_id FK(null) | 데일리 측정(바퀴수)의 출처 |
| skill_step_id FK(null) | 체크포인트 측정(완주 시간·스트로크)의 대상 영법 단계 |
| instructor_id FK(null), note(null), created_at | |

- **데일리**: `metric_type=laps` 한 줄 (1바퀴=50m → distance_m 파생). 워밍업+지금영법 바퀴 합산 가능.
- **체크포인트**: 각 영법 첫 완주 시 `time_sec`·`stroke_count` 저장. **새 영법 첫 완주 시 이전 영법들 재측정**(같은 metric, 새 measured_on) → 영법별 성장 곡선.
- (기존 swim_distances를 흡수.)

### 5.5 단계 진행 (사다리 이벤트)

**`skill_progress`** — id · student_id FK(cascade) · skill_step_id FK · status(passed) · **source(observed/baseline)** · difficulty(null) · passed_at(date) · source_session_id FK(null) · instructor_id FK(null) · **step_key_snapshot, ladder_order_snapshot**(버전 안정성) · note · created_at · **unique(student_id, skill_step_id)**

### 5.6 영상 + 피드백

**`media`** — id · student_id FK · captured_on(date) · storage_path(Supabase Storage) · type(video) · skill_step_id FK(null) · **feedback_draft(text, 데이터 자동생성)** · **feedback_final(text, 강사 특이사항 추가)** · sent_to_parent_at(null) · created_at

### 5.7 수업 템플릿 (입력 편의 + 표준화)

- **`lesson_templates`** — id · instructor_id FK · name(예: "기본패턴 A") · is_active · is_studio_standard(bool, 원장 승격) · created_at
- **`lesson_template_items`** — id · template_id FK · seq(int) · stroke_id FK(null) · label(예: "자유형 발차기") · default_laps(int)

### 5.8 후속 예약

- **`parent_reports`** (Phase 2) — id · student_id · period · generated_at · content(jsonb) · status(draft/approved/sent) · approved_by
- **`curriculum_step_map`** (대규모 개편 시) — from_step_id · to_step_id · relation(same/merged/split)

---

## 6. 핵심 메커니즘

### 6.1 수집 모델 (수업 > 기록)
| 무엇 | 언제 | 부담 |
|------|------|------|
| 출결 | 매 수업 | 탭 |
| 기본패턴 선택 | 매 수업 | 1탭 (템플릿) |
| 바퀴수(거리) | 매 수업 | 한 숫자 |
| 단계 통과 | 통과 순간(이벤트) | 탭 1번 |
| 첫 완주 시간·스트로크 | 각 영법 첫 완주 시 | 측정 입력 |
| 이전 영법 재측정 | 새 영법 첫 완주 시 + 월 1회 영상일 | 측정 입력 |
| 영상 + 피드백 | 월 1회(기존) | 피드백 초안 검토만 |

### 6.2 50분 3등분 입력
1단계 **기본패턴**(템플릿 선택) → 2단계 **지금영법**(사다리 위치 자동, 통과 시 탭) → 3단계 **바퀴수**(거리). 합 ≈ 3탭.

### 6.3 사다리 + 트랙
`skill_steps.ladder_order`=계단, `track_id`=영역(킥/팔/호흡/콤비). 하나의 진행 숫자 + 트랙별 레이더·"다음 달 집중: 호흡" 리포트.

### 6.4 커리큘럼 편집 안정성
원장이 100단계를 나중에 자유롭게 재정의해도 안 깨짐: ① 기록은 단계 **불변 ID** 참조 ② 삭제 대신 **보관** ③ 통과 시점 **스냅샷** 저장. 추가/이름변경/순서변경=안전, 삭제=보관, 분할/병합=`curriculum_step_map`. **출시 전 100단계 완벽화 금지** — 현 69단계 확장 초안을 버전1로 시작, 사용하며 보강. 원장용 **관리자 편집 화면** 제공(삭제는 자동 보관).

---

## 7. 성장 속도 측정 & 예측

- **데일리 거리**: 바퀴수 누적 = 훈련량·지구력 곡선 (완주 사이 공백을 메움). 초보는 0 → 단계 게이팅 자동.
- **완주 시간 곡선**: 각 영법 첫 완주 + 이후 재측정 → 영법별 시간 단축 추세.
- **예측 타깃**: `enrolled_on` → 각 영법 첫 완주(`is_first_completion`)까지 기간. 나이·성별·실제 주당횟수·학년·선행영법별 코호트 집계 → "초2·주2회 → 자유형 첫 완주 평균 N개월".
- **정체 감지**: 체크포인트 도달 *시점 간격*을 코호트 평균과 비교 → "이 아이 B단계까지 평소 2개월인데 4개월째".
- **주당 횟수**: 별도 입력 없이 출석 이벤트에서 계산.

---

## 8. 강사 입력 UX & 데이터 품질

- 지금영법은 학생 **사다리 위치 자동 프리필**, 기본패턴은 **템플릿 1탭** → 평소 ≈ 3탭.
- 템플릿 기본 바퀴수는 기본값, **실제값 조정 가능**. 템플릿은 **선택(건너뛰기 가능)** — 보강·테스트일에 안 막힘.
- 단계 건너뛰기 방지(트랙별 설정) → 정합성.

---

## 9. 부모 리포트 & 피드백 (Phase 2, 데이터 준비됨)

**피드백 = 데이터 기반 자동 초안 + 강사 특이사항만.** 강사 전담 시 편차가 커서 독이 되므로. 자동 초안 품질 = 모으는 객관 데이터(바퀴수·거리·완주 시간·단계)의 함수. `media.feedback_draft`(자동) → `feedback_final`(강사 보강) → 부모 전송. 위 데이터만으로 재료 전부 확보.

---

## 10. ML / 예측 대비

모든 데이터가 (학생 + 타임스탬프 이벤트)로 join 가능 → *(학생, 주차)별 1행 + 변수 + 거리·통과수* 패널을 **스키마 변경 없이** 추출. 전제: append-only, 상태 덮어쓰기 금지.

---

## 11. 범위 & 단계 분리

- **Phase 1 (이 스펙)**: 데이터 토대 — 새 스키마, 커리큘럼 DB+버전, 템플릿 기반 3등분 입력, 바퀴수·완주 측정, 영상+피드백 저장, 관리자 단계 편집.
- **Phase 2~**: 부모 리포트 자동화 / 성장 예측 / 강사 성과 / 운영 분석 — 각자 스펙·계획·구현 사이클.

**기존생 온보딩 & 향후 데이터의 의미 (cold-start):** 출시 시 재원생 100%가 중도합류(과거 데이터 없음 — 1주 테스트 + 그전 기억·영상뿐). 마이그레이션 불필요, 데이터 0년차로 새 출발.
- **베이스라인**: 강사가 현재 사다리 위치를 1회 입력 → `skill_progress.source='baseline'`. 이 플래그가 제외하는 건 **"첫 학습 시점" 속도 계산 단 하나**(날짜 미신뢰).
- **향후 데이터는 기존생에게도 100% 의미 있음 (핵심 요구사항)**: ① 현재 진행 영법의 첫 완주까지 실날짜 기록 ② 데일리 바퀴수=거리·지구력 곡선 ③ **이미 완성한 영법도 재측정**(베이스라인일 + 월 영상일)으로 시간·효율 개선 곡선 ④ 50m·100m·마스터 상위 마일스톤. → 베이스라인일 측정값(오늘 날짜)은 1급 `observed` 데이터이자 개선 곡선의 출발점. 기존생도 1개월차부터 의미 있는 리포트 가능.

---

## 12. 로드맵 개요 (상세는 구현 계획에서)

1. 새 스키마 마이그레이션 + RLS (Supabase v2 스키마)
2. 커리큘럼 DB 시드(현 69단계 → 버전1) + 타입/데이터접근 레이어
3. 강사 일일 입력: 3등분(템플릿·지금영법·바퀴수) + 출결 + 단계 통과
4. 수업 템플릿 CRUD (강사) + 원장 표준 승격
5. 첫 완주 측정 + 재측정 흐름 (시간·스트로크)
6. 관리자 커리큘럼 편집 화면 (추가/수정/순서/보관)
7. 영상 업로드 + 피드백 초안/최종 (Storage)
8. 진도·속도 조회 (사다리 + 트랙 레이더 재활용)
9. (Phase 2) 리포트 → 예측 → 운영분석

---

## 13. 후속 결정 (미해결)

- **주1회 학생 재측정 밀도**: 완주 텀이 길다. 데일리 바퀴수 + 월 1회 영상일 측정으로 보완 검토 중.
- ~~DB 호스팅~~ **결정됨**: 기존 진도관리 Supabase 프로젝트 재활용(1주 테스트 데이터 drop) → v2를 `public`에 신규. 무료 유지, 스키마분리 friction 없음.
- **100단계 실제 내용**: 버전1 초안 범위 — 출시 후 반복 정의.
- **레이더 축 ↔ 트랙 정렬**: 기존 7축(턴·스타트 포함)을 트랙에 어떻게 매핑할지.
