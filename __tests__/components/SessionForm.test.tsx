import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SessionForm from '@/components/SessionForm'
import type { Student, SessionLog } from '@/types/database'

const mockStudent: Student = {
  id: 'student-1',
  name: '김민준',
  grade: '3학년',
  schedule: '월수4시',
  instructor_id: 'instructor-1',
  is_active: true,
  withdrawal_status: null,
  withdrawal_requested_by: null,
  withdrawal_note: null,
  created_at: '2026-01-01T00:00:00Z',
}

const mockLatestLog: SessionLog = {
  id: 'log-1',
  session_date: '2026-06-09',
  student_id: 'student-1',
  instructor_id: 'instructor-1',
  attendance: '출석',
  stroke: '자유형',
  stage: '발차기',
  status: '진행중',
  memo: null,
  absence_reason: null,
  created_at: '2026-06-09T10:00:00Z',
}

describe('SessionForm', () => {
  it('학생 이름이 표시된다', () => {
    render(
      <SessionForm
        student={mockStudent}
        latestLog={mockLatestLog}
        instructorId="instructor-1"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('김민준')).toBeInTheDocument()
  })

  it('이전 기록의 영법이 기본 선택된다', () => {
    render(
      <SessionForm
        student={mockStudent}
        latestLog={mockLatestLog}
        instructorId="instructor-1"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('자유형')).toBeInTheDocument()
  })

  it('결석 선택 시 영법 섹션이 숨겨진다', async () => {
    const user = userEvent.setup()
    render(
      <SessionForm
        student={mockStudent}
        latestLog={mockLatestLog}
        instructorId="instructor-1"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: '결석' }))
    expect(screen.queryByText('영법')).not.toBeInTheDocument()
  })

  it('저장 버튼 클릭 시 onSave 호출', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <SessionForm
        student={mockStudent}
        latestLog={mockLatestLog}
        instructorId="instructor-1"
        onSave={onSave}
        onCancel={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})
