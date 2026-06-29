# 프로젝트 분석 리포트 — AI Team 구조 도입 기준

작성일: 2026-06-29

---

## 1. 현재 구조 요약

```
app/
  v2/
    director/     # 원장 대시보드
    student/      # 학생 상세
    students/     # 학생 목록
    today/        # 오늘 수업
    me/           # 내 정보 (푸시 알림 설정 포함)
  api/            # Next.js API Routes
  auth/           # 인증
  kiosk/          # 키오스크 모드
components/
  ui/             # shadcn/ui 컴포넌트
  v2/             # 앱 전용 컴포넌트
  LogoutButton.tsx
lib/
  curriculum.ts   # 수영 커리큘럼 상수
  schedule.ts     # 일정 유틸
  supabase/       # client.ts, server.ts
  utils.ts
  v2/             # v2 전용 유틸
types/
  database.ts     # Supabase 자동생성 타입
  v2.ts           # 앱 전용 타입
```

---

## 2. 역할 분리가 명확한 부분 (잘 된 것)

### `lib/curriculum.ts` — Swimming Domain 전담 영역
수영 커리큘럼 상수가 코드에서 분리되어 있음. Swimming Domain Agent가 이 파일을 통해 도메인 규칙을 독립적으로 관리할 수 있다.

### `lib/supabase/` — Backend 전담 영역
`client.ts` (브라우저), `server.ts` (서버) 분리가 명확. Backend Agent가 단일 진입점으로 DB를 다룬다.

### `app/v2/` 라우팅 — Frontend 전담 영역
역할별 디렉토리(director, student, me)가 잘 구분되어 있어 Frontend Agent가 영역을 파악하기 쉽다.

### `types/` 중앙화 — 전체 공통
`database.ts`와 `v2.ts`로 타입이 중앙관리됨. Agent 간 계약 역할을 한다.

---

## 3. 유지보수성이 좋아질 부분 (Agent 도입 효과)

### 도메인 규칙의 코드 침투
`curriculum.ts` 외에도 컴포넌트 내부에 수영 관련 로직이 직접 작성된 경우가 있을 수 있음. Swimming Domain Agent가 도메인 규칙을 검토하고, 로직을 `lib/curriculum.ts`나 별도 domain 파일로 분리하면 수영 규칙 변경 시 한 곳만 수정하면 된다.

### Server/Client Component 경계
App Router에서 `"use client"` 경계 관리가 복잡해질 수 있음. Frontend Agent가 전담하면 이 경계를 일관되게 유지할 수 있다.

### SQL 마이그레이션 추적
현재 마이그레이션 SQL은 `supabase/` 폴더와 HANDOFF.md에 분산 관리됨. Backend Agent + Knowledge Manager 조합으로 SQL 변경 이력을 체계적으로 기록하면 "어떤 SQL을 언제 실행했는가" 추적이 쉬워진다.

---

## 4. 개선 가능한 부분 (현재 구조에서)

### `lib/v2/` 정리
`lib/v2/` 내부 파일이 어떤 역할인지 명확하지 않음. Architect Agent가 이 폴더를 검토하고 backend 유틸 vs frontend 유틸을 분리하면 좋다.

### 타입 동기화 자동화
`types/database.ts`는 Supabase 스키마 변경 시 수동 업데이트가 필요함. Backend Agent가 DB 변경 시 항상 타입도 함께 업데이트하는 원칙을 강제하면 타입-DB 불일치 버그가 줄어든다.

### 키오스크 모드 문서화 부재
`app/kiosk/`가 존재하지만 별도 문서가 없음. Knowledge Manager Agent가 이 기능의 사용 조건과 접근 방식을 wiki에 기록하면 유지보수가 쉬워진다.

### 웹푸시 로직 분산
푸시 알림 로직이 `scripts/`, `public/sw.js`, `app/v2/me/PushToggle.tsx`에 분산됨. Backend Agent 주도로 이 흐름을 문서화하면 향후 알림 기능 확장이 쉬워진다.

---

## 5. AI 분석 데이터 관점 (현재 방향: up2u)

현재 목표("AI가 잘 분석할 수 있는 DB 구축")에 맞게 다음 데이터 필드가 중요하다:

| 테이블 | 필요 데이터 |
|--------|------------|
| 진도 기록 | `recorded_at`, `instructor_id`, `student_id`, `lesson_step` |
| 출결 | `date`, `attended`, `reason` |
| 강사 패턴 | `instructor_id`, `action_type`, `context` |

Backend + Swimming Domain Agent 협업으로 이 필드들을 체계적으로 설계하면 AI 분석 단계에서 별도 데이터 정제 작업이 줄어든다.

---

## 6. 추천 첫 작업

AI Team 구조 도입 후 다음 작업 순서를 추천한다:

1. **Swimming Domain** → `lib/curriculum.ts` 리뷰 및 누락 상수 추가
2. **Architect** → `lib/v2/` 내부 정리 설계
3. **Backend** → 웹푸시 흐름 문서화 + 타입 동기화 원칙 적용
4. **Knowledge Manager** → 키오스크 기능 wiki 저장
