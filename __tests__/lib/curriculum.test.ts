import { describe, it, expect } from 'vitest'
import { STROKES, STAGES, getStages, isValidStroke, isValidStage } from '@/lib/curriculum'

describe('curriculum', () => {
  it('영법 목록에 초급~마스터 포함', () => {
    expect(STROKES).toEqual(['초급', '자유형', '배영', '평영', '접영', '마스터'])
  })

  it('자유형 세부단계 5개', () => {
    expect(STAGES['자유형']).toHaveLength(5)
    expect(STAGES['자유형'][0]).toBe('발차기')
    expect(STAGES['자유형'][4]).toBe('숙달')
  })

  it('getStages: 올바른 영법 반환', () => {
    expect(getStages('평영')).toEqual(['발차기', '팔동작', '콤비네이션', '완주', '숙달'])
  })

  it('getStages: 마스터는 거리 단계 반환', () => {
    expect(getStages('마스터')).toEqual(['200m', '400m', '800m', '1600m'])
  })

  it('isValidStroke: 올바른 값 true', () => {
    expect(isValidStroke('자유형')).toBe(true)
    expect(isValidStroke('없는영법')).toBe(false)
  })

  it('isValidStage: 자유형+발차기 true', () => {
    expect(isValidStage('자유형', '발차기')).toBe(true)
    expect(isValidStage('자유형', '돌핀킥')).toBe(false)
  })
})
