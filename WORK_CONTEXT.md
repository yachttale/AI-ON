# 스타키즈 수영 관리 시스템 - 작업 컨텍스트

## 프로젝트 기본 정보

- **GitHub**: https://github.com/yachttale/starkids-swim
- **스택**: Next.js 14 App Router · Supabase · TypeScript · Tailwind CSS · shadcn/ui
- **배포**: Vercel (GitHub 푸시 → 자동 배포)

---

## Supabase 설정

- `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 설정됨
- 마이그레이션은 **Supabase SQL Editor에서 직접 실행** (supabase CLI 미사용)

### 실행된 마이그레이션 (순서대로)
| 파일 | 내용 |
|------|------|
| `001_schema.sql` | 기본 테이블 스키마 + RLS 정책 |
| `001_schema_improvements.sql` | 스키마 개선 |
| `002_seed.sql` | 기초 시드 데이터 |
| `003_students_seed.sql` | 학생 시드 데이터 |
| `004_assign_instructors.sql` | 강사 배정 |
| `005_planned_makeups.sql` | 보강 스케줄 |
| `006_withdrawal.sql` | 퇴원 워크플로우 (RPC 함수 6개 포함) |

### DB 테이블 목록
- `profiles` — 사용자 (role: instructor / director)
- `students` — 학생 (withdrawal_status, withdrawal_requested_by, withdrawal_note 컬럼 추가됨)
- `session_logs` — 수업 기록 (출결 + 영법/단계/상태)
- `curriculum_standards` — 기준표
- `completion_records` — 완성 기록 (25m 기록 등)
- `swim_distances` — 수영 거리 기록 (마스터반용)
- `planned_makeups` — 보강 예약

---

## 역할별 라우트 구조

```
/director/*   → app/director/layout.tsx  (role=director 체크, 아니면 /instructor/today로 redirect)
/instructor/* → app/instructor/layout.tsx (role=instructor 체크)
```

---

## 핵심 파일 맵

### 원장 (Director)
| 파일 | 역할 |
|------|------|
| `app/director/dashboard/page.tsx` | 대시보드 (StageBoard, 정체학생, 진도현황) |
| `app/director/students/page.tsx` | 학생 목록 + 퇴원 승인/거절 + 복귀 처리 |
| `app/director/student/[id]/page.tsx` | **학생 상세** (7축 레이더, 통계 카드, 진도 바) |
| `app/director/student/[id]/report/page.tsx` | 부모님 리포트 (인쇄용) |
| `app/director/student/[id]/certificate/page.tsx` | 완성 증명서 |
| `app/director/analytics/page.tsx` | 분석 페이지 |

### 강사 (Instructor)
| 파일 | 역할 |
|------|------|
| `app/instructor/today/page.tsx` | 오늘 수업 입력 |
| `app/instructor/dashboard/page.tsx` | 내 학생 현황 |
| `app/instructor/roster/page.tsx` | 반 관리 (신규배정 + 퇴원신청) |
| `app/instructor/student/[id]/page.tsx` | 학생 상세 (강사용) |

### 컴포넌트
| 파일 | 역할 |
|------|------|
| `components/StrokeRadar.tsx` | 7축 레이더 차트 (자유형·배영·평영·접영·사이드턴·플립턴·스타트) |
| `components/StageBoard.tsx` | 단계별 현황 보드 |
| `components/StudentProgressList.tsx` | 학생 진도 목록 (basePath prop으로 링크 경로 설정) |
| `components/LogTimeline.tsx` | 수업 기록 타임라인 |
| `components/MasterSwimTracker.tsx` | 마스터반 수영거리 트래커 |
| `components/SessionForm.tsx` | 수업 기록 입력 폼 |
| `components/InstructorNav.tsx` | 강사 하단 탭 네비게이션 |

### 라이브러리
| 파일 | 역할 |
|------|------|
| `lib/curriculum.ts` | 영법/단계 정의 (STROKES, STAGES, getPriorStrokeBonus) |
| `lib/schedule.ts` | 수업 스케줄 파싱 (parseSchedule, getTodayEntries) |
| `lib/supabase/client.ts` | 클라이언트 컴포넌트용 Supabase |
| `lib/supabase/server.ts` | 서버 컴포넌트용 Supabase |
| `types/database.ts` | TS 타입 정의 (Student, SessionLog 등) |

---

## 커리큘럼 구조

```typescript
STROKES = ['초급', '자유형', '배영', '평영', '접영', '마스터']

// 각 영법 5단계
자유형/배영: ['발차기', '팔돌리기', '콤비네이션', '완주', '숙달']
평영: ['발차기', '팔동작', '콤비네이션', '완주', '숙달']
접영: ['돌핀킥', '팔동작', '콤비네이션', '완주', '숙달']
마스터: ['200m', '400m', '800m', '1600m']
```

---

## 퇴원 워크플로우

```
강사 → "퇴원 신청" → withdrawal_status = 'pending'
원장 → "승인" → is_active = false, withdrawal_status = 'approved'
원장 → "거절" → withdrawal_status = null (원상복구)
원장 → "복귀" → is_active = true, withdrawal_status = null (기존 데이터 연결)
```

**RPC 함수 목록** (`SECURITY DEFINER`, Supabase SQL Editor에서 생성됨):
- `request_withdrawal(p_student_id, p_note?)`
- `cancel_withdrawal_request(p_student_id)`
- `approve_withdrawal(p_student_id)`
- `reject_withdrawal(p_student_id)`
- `readmit_student(p_student_id, p_instructor_id?)`
- `assign_student_to_me(p_student_id)` — 강사가 미배정 학생 자기 반으로 배정

---

## 중요 버그 및 해결법

### FK 중복 이슈 (학생 상세 404)
- **원인**: `006_withdrawal.sql`이 `students.withdrawal_requested_by → profiles.id` FK를 추가해서
  `students → profiles` FK가 2개 (`instructor_id`, `withdrawal_requested_by`)가 됨
- **증상**: `select('*, profiles(name)')` 시 Supabase가 어느 FK를 써야 할지 몰라 쿼리 실패 → `notFound()` → 404
- **해결**: FK를 명시적으로 지정
  ```typescript
  // ❌ 이렇게 하면 FK 중복 에러
  .select('*, profiles(name)')
  // ✅ 이렇게 해야 함
  .select('*, profiles!instructor_id(name)')
  ```
- **적용된 파일**:
  - `app/director/student/[id]/page.tsx`
  - `app/director/student/[id]/report/page.tsx`
  - `app/director/students/page.tsx`

---

## 버전 표시

헤더 오른쪽에 빌드 커밋 해시 표시 (`#abc1234` 형태).
- `next.config.ts`에서 `execSync('git rev-parse --short HEAD')`로 빌드 시 주입
- `NEXT_PUBLIC_BUILD_ID` 환경변수로 전달
- `app/director/layout.tsx`, `app/instructor/layout.tsx`에서 표시

---

## 다음 작업 예정

- [ ] 분석 페이지 고도화 (개인 vs 평균 그래프, 학년별, 강사별 비교)
- [ ] 부모님 PDF 리포트 (월말 출력용)
- [ ] 강사 개인 학생 상세페이지도 동일 스타일로 업데이트 검토

---

## 빌드 / 배포

```bash
npm run build   # 로컬 빌드 확인
git add ...
git commit -m "..."
git push        # → Vercel 자동 배포
```

> 헤더의 `#커밋해시`로 배포 반영 여부 확인 가능
