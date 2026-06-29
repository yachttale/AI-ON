@AGENTS.md

# starkids-swim 세션 규약 (AI-ON)

## 세션 시작 프로토콜 (필수)

코드 작성 전 반드시 이 순서로 읽는다:

1. **Second Brain Compass**: `C:\Users\hyo seong\Desktop\Claude\second brain\second brain\AI-Sessions\wiki\projects\starkids-swim.md`
   → `## 현재 방향` 확인 (up2u: AI 분석 DB 구축)
2. **알려진 버그**: `C:\Users\hyo seong\Desktop\Claude\second brain\second brain\AI-Sessions\wiki\errors\starkids-swim-supabase-fk-중복.md`
3. **작업 로그**: `C:\Users\hyo seong\Desktop\Claude\second brain\second brain\log.md`

---

## 현재 방향 (up2u)

AI 직접 연동 전 단계 — **AI가 잘 분석할 수 있는 DB 구축**

- 분석 대상: 학생 진도 패턴 + 강사 패턴
- 분석 소비자: 강사(본인+담당 아이들), 원장(전체)
- 판단 기준: "이 기능이 AI 분석에 좋은 데이터를 만드는가?"

---

## 옵시디언 저장 경로

`이번 작업 내용 옵시디언에 저장해줘` / `옵시디언 참조` 명령 시:

| 용도 | 경로 |
|------|------|
| raw (원본) | `C:\Users\hyo seong\Desktop\Claude\second brain\second brain\AI-Sessions\raw\` |
| wiki | `C:\Users\hyo seong\Desktop\Claude\second brain\second brain\AI-Sessions\wiki\` |
| log | `C:\Users\hyo seong\Desktop\Claude\second brain\second brain\log.md` |
| Compass | `C:\Users\hyo seong\Desktop\Claude\second brain\second brain\AI-Sessions\wiki\projects\starkids-swim.md` |

---

## 핵심 기술 정보

- Next.js 14 App Router, Supabase, TypeScript, Tailwind, shadcn/ui
- Supabase 마이그레이션: SQL Editor 직접 실행 (CLI 미사용)
- 배포: Vercel (git push → 자동)
- 헤더 커밋해시: NEXT_PUBLIC_BUILD_ID 환경변수
