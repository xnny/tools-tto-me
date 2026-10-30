import { describe, expect, it } from 'vitest'
import { dateKey, getCalendarDay, getCalendarMonth } from '../utils/calendar'

describe('calendar data', () => {
  it('builds a Sunday-first grid across month and year boundaries', () => {
    const days = getCalendarMonth(2026, 1)
    expect(days).toHaveLength(42)
    expect(days[0]?.key).toBe('2025-12-28')
    expect(days[4]).toMatchObject({ key: '2026-01-01', inMonth: true })
    expect(days[0]?.inMonth).toBe(false)
    expect(days[41]?.key).toBe('2026-02-07')
  })

  it('shows lunar new year, an official holiday and its almanac', () => {
    const day = getCalendarDay(new Date(2026, 1, 17))
    expect(day.lunarDate).toBe('正月初一')
    expect(day.festivals).toContain('春节')
    expect(day.lunarLabel).toBe('春节')
    expect(day.holiday).toBe('休')
    expect(day.yi.length + day.ji.length).toBeGreaterThan(0)
  })

  it('identifies solar terms and adjusted working days', () => {
    expect(getCalendarDay(new Date(2026, 1, 4)).solarTerm).toBe('立春')
    expect(getCalendarDay(new Date(2026, 1, 14)).holiday).toBe('班')
    expect(dateKey(new Date(2026, 0, 1))).toBe('2026-01-01')
  })
})
