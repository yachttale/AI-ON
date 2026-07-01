@AGENTS.md

# starkids-swim 세션 규약 (AI-ON)

## 세션 시작 프로토콜 (필수)

코드 작성 전 반드시 이 순서로 읽는다:

> 두뇌 저장소 = GitHub `yachttale/claude-brain` (private), 로컬 = **양쪽 컴퓨터 모두 `%USERPROFILE%\Desktop\CLAUDE BRAIN`**. 읽기 전 `git pull`.

1. **Compass**: `<CLAUDE BRAIN>\projects\up2u\README.md`
   → `## 현재 방향` 확인 (up2u: AI 분석 DB 구축)
2. **알려진 버그**: `<CLAUDE BRAIN>\knowledge\errors\starkids-supabase-fk-중복.md`
3. **작업 로그**: `<CLAUDE BRAIN>\log.md` + 핸드오프 `<CLAUDE BRAIN>\NOW.md`

---

## 현재 방향 (up2u)

AI 직접 연동 전 단계 — **AI가 잘 분석할 수 있는 DB 구축**

- 분석 대상: 학생 진도 패턴 + 강사 패턴
- 분석 소비자: 강사(본인+담당 아이들), 원장(전체)
- 판단 기준: "이 기능이 AI 분석에 좋은 데이터를 만드는가?"

---

## 두뇌 저장소(claude-brain) 저장 경로

> 2026-07-02 Obsidian Second Brain에서 이관됨. `저장해줘` 명령 시 (저장 전 `git pull`, 저장 후 commit+push):

| 용도 | 경로 (CLAUDE BRAIN 기준) |
|------|------|
| Compass (프로젝트 나침반) | `projects/up2u/README.md` |
| 재사용 지식 | `projects/up2u/` (프로젝트 전용) 또는 `knowledge/` (범용) |
| 버그 해결법 | `knowledge/errors/` |
| log | `log.md` |
| 핸드오프 | `NOW.md` |

---

## 핵심 기술 정보

- Next.js 14 App Router, Supabase, TypeScript, Tailwind, shadcn/ui
- Supabase 마이그레이션: SQL Editor 직접 실행 (CLI 미사용)
- 배포: Vercel (git push → 자동)
- 헤더 커밋해시: NEXT_PUBLIC_BUILD_ID 환경변수
