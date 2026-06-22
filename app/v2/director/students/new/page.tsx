// app/v2/director/students/new/page.tsx — 신규 학생 등록(서버: 강사 목록 조회)
import { redirect } from 'next/navigation'
import { getCurrentRole } from '@/lib/v2/session'
import { getInstructors } from '@/lib/v2/data'
import NewStudentForm from './NewStudentForm'

export default async function NewStudentPage() {
  if (await getCurrentRole() !== 'director') redirect('/v2/today')
  const instructors = await getInstructors()
  return <NewStudentForm instructors={instructors} />
}
