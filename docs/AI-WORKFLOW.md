# AI Team Workflow — starkids-swim (UP²U)

## Agent 별 사용 시점

### Architect
- 새 기능을 만들기 **전** — "이걸 어떻게 설계할까?"
- DB 스키마를 추가/변경할 때
- 기존 구조를 리팩토링해야 할 때
- 두 Agent 간 역할 경계가 애매할 때
- **예시**: "출결 기록 기능을 추가하고 싶어" → Architect에게 먼저

### Swimming Domain
- 수영 커리큘럼 규칙이 바뀔 때
- 새로운 진도 단계/레벨을 정의할 때
- 강사·학생·반 관계에서 비즈니스 규칙이 필요할 때
- **예시**: "자유형 3단계 기준을 바꾸고 싶어" → Swimming Domain에게

### Backend
- Supabase 쿼리 작성·수정
- API Route 구현
- RLS 정책 설정
- SQL 마이그레이션 스크립트 작성
- 알림 로직, 인증 처리
- **예시**: "학생 진도 저장 API 만들어줘" → Backend에게

### Frontend
- 페이지·컴포넌트 UI 구현
- 기존 화면 수정
- 모바일 반응형 처리
- 로딩·에러 상태 UX
- **예시**: "진도 입력 화면 모바일에서 불편해" → Frontend에게

### Knowledge Manager
- 세션 작업이 끝난 후 "저장해줘" 명령 시
- 에러를 발견하고 기록이 필요할 때
- 프로젝트 방향 변경 시 Compass 업데이트
- **예시**: "이번 작업 두뇌 저장소에 저장해줘" → Knowledge Manager에게

---

## 기능 개발 권장 순서

```
1. Architect
   └─ 설계 검토, DB 스키마, API 구조 확정
   ↓
2. Swimming Domain
   └─ 도메인 규칙 확인 (커리큘럼, 역할, 관계)
   ↓
3. Backend
   └─ DB 마이그레이션 SQL 작성 → Supabase SQL Editor 실행
   └─ API Route / Server Action 구현
   └─ RLS 정책 적용
   ↓
4. Frontend
   └─ 페이지·컴포넌트 구현
   └─ 모바일 반응형 확인
   ↓
5. QA (필요 시)
   └─ 실제 브라우저에서 골든패스 + 엣지케이스 테스트
   ↓
6. git push → Vercel 자동 배포
   ↓
7. 사용자: "저장해줘"
   ↓
8. Knowledge Manager
   └─ raw/ 원본 저장
   └─ wiki/ 정제 저장
   └─ log.md 업데이트
   └─ Compass (starkids-swim.md) 갱신
```

---

## 빠른 참조

| 상황 | 먼저 부를 Agent |
|------|----------------|
| 새 기능 계획 | Architect |
| 수영 규칙 질문 | Swimming Domain |
| DB/API 작업 | Backend |
| 화면 수정 | Frontend |
| 작업 마무리 | Knowledge Manager |
| 버그 발생 | Architect → Backend 순서로 |

---

## 참고 파일

- 공통 규칙: `CLAUDE.md`
- Agent 정의: `agents/` 폴더
- 현재 방향: 두뇌 저장소 Compass (`CLAUDE BRAIN\projects\up2u\README.md`)
