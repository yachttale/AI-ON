# scripts/emit_students_seed.py
# 재원생 명단 xlsx(PII, gitignore됨) → 학생 시드 SQL 출력.
# 스크립트 자체엔 개인정보 없음. 출력 SQL은 supabase/seed-local/(gitignore)로만 저장.
#
# 실행:
#   python scripts/emit_students_seed.py > supabase/seed-local/013_students_coldstart.sql
#
# 매핑: 이름→name, 입학일→enrolled_on, 수업시간→schedule, 휴대전화→phone, is_active=true.
# 기능(skill) 데이터는 명단에 없음 → skill_progress 베이스라인은 강사 첫 관찰로 별도 입력(source='baseline').
import sys, datetime, openpyxl

XLSX = "재원생 DB.xlsx"

def q(v):
    if v is None or v == "":
        return "null"
    return "'" + str(v).strip().replace("'", "''") + "'"

def qdate(v):
    if isinstance(v, datetime.datetime):
        return "'" + v.date().isoformat() + "'"
    if isinstance(v, datetime.date):
        return "'" + v.isoformat() + "'"
    return "null"

def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb.active
    rows = [r for r in ws.iter_rows(values_only=True)][1:]  # 헤더 제외
    rows = [r for r in rows if r and any(c is not None for c in r)]

    out = []
    out.append(f"-- 생성물: 재원생 cold-start 시드 ({len(rows)}명) — PII 포함, 커밋 금지")
    out.append("-- 컬럼: 구분 / 이름 / 입학일 / 휴대전화 / 수업시간")
    out.append("-- 최초 1회만 실행 (중복 실행 시 학생 중복 생성 주의)")
    out.append("begin;")
    for r in rows:
        _gubun, name, enrolled, phone, schedule = (list(r) + [None] * 5)[:5]
        out.append(
            "insert into public.students (name, enrolled_on, schedule, phone, is_active) "
            f"values ({q(name)}, {qdate(enrolled)}, {q(schedule)}, {q(phone)}, true);"
        )
    out.append("commit;")
    sys.stdout.write("\n".join(out) + "\n")

if __name__ == "__main__":
    main()
