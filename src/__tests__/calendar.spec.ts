import { describe, expect, it } from 'vitest'
import { dateKey, getCalendarDay, getCalendarMonth } from '../utils/calendar'

describe('calendar data', () => {
  it.each([
    { year: 2026, month: 1, first: '2025-12-29', last: '2026-02-08', offset: 3, count: 31 },
    { year: 2026, month: 6, first: '2026-06-01', last: '2026-07-12', offset: 0, count: 30 },
    { year: 2026, month: 2, first: '2026-01-26', last: '2026-03-08', offset: 6, count: 28 },
    { year: 2024, month: 2, first: '2024-01-29', last: '2024-03-10', offset: 3, count: 29 },
    { year: 1901, month: 1, first: '1900-12-31', last: '1901-02-10', offset: 1, count: 31 },
    { year: 2099, month: 12, first: '2099-11-30', last: '2100-01-10', offset: 1, count: 31 },
  ])(
    'builds a Monday-first grid for $year-$month',
    ({ year, month, first, last, offset, count }) => {
      const days = getCalendarMonth(year, month)
      expect(days).toHaveLength(42)
      expect(new Set(days.map((day) => day.key)).size).toBe(42)
      expect(days[0]?.key).toBe(first)
      expect(days[0]?.date.dayOfWeek).toBe(1)
      expect(days[41]?.key).toBe(last)
      expect(days[41]?.date.dayOfWeek).toBe(7)
      expect(days[offset]).toMatchObject({ day: 1, inMonth: true })
      expect(days.filter((day) => day.inMonth)).toHaveLength(count)
      expect(days.slice(0, offset).every((day) => !day.inMonth)).toBe(true)
      expect(days.slice(offset + count).every((day) => !day.inMonth)).toBe(true)
    },
  )

  it('shows lunar new year, an official holiday and its almanac', () => {
    const day = getCalendarDay(Temporal.PlainDate.from('2026-02-17'))
    expect(day).toMatchObject({
      key: '2026-02-17',
      lunarDate: '正月初一',
      lunarLabel: '春节',
      lunarYear: '二〇二六年',
      gzYear: '丙午',
      gzMonth: '庚寅',
      gzDay: '壬戌',
      zodiac: '马',
      festivals: ['春节'],
      holiday: '休',
      yi: ['祭祀', '塞穴', '结网', '破土', '谢土', '安葬', '移柩', '除服', '成服', '馀事勿取'],
      ji: ['嫁娶', '入宅'],
    })
    expect(day.date.equals('2026-02-17')).toBe(true)
  })

  it('identifies solar terms and adjusted working days', () => {
    expect(getCalendarDay(Temporal.PlainDate.from('2026-02-04')).solarTerm).toBe('立春')
    expect(getCalendarDay(Temporal.PlainDate.from('2026-02-14')).holiday).toBe('班')
  })

  it('does not show the preceding solar term on an ordinary day', () => {
    expect(getCalendarDay(Temporal.PlainDate.from('2026-02-05'))).toMatchObject({
      solarTerm: '',
      festivals: [],
      holiday: null,
      lunarLabel: '十八',
    })
  })

  it.each(['2026-02-04', '2026-02-05'])(
    'keeps the lunar year while changing the solar-term month on %s',
    (date) => {
      expect(getCalendarDay(Temporal.PlainDate.from(date))).toMatchObject({
        lunarYear: '二〇二五年',
        gzYear: '乙巳',
        gzMonth: '庚寅',
        zodiac: '蛇',
      })
    },
  )

  it.each([
    { date: '2023-03-22', lunarDate: '闰二月初一', lunarLabel: '闰二月' },
    { date: '2025-12-20', lunarDate: '冬月初一', lunarLabel: '冬月' },
    { date: '2026-01-19', lunarDate: '腊月初一', lunarLabel: '腊月' },
  ])('formats the lunar month on $date', ({ date, lunarDate, lunarLabel }) => {
    expect(getCalendarDay(Temporal.PlainDate.from(date))).toMatchObject({ lunarDate, lunarLabel })
  })

  it('recognizes New Year’s Eve in a lunar month with 29 days', () => {
    expect(getCalendarDay(Temporal.PlainDate.from('2026-02-16'))).toMatchObject({
      lunarDate: '腊月廿九',
      lunarLabel: '除夕',
      festivals: ['除夕'],
    })
  })

  it('preserves coinciding solar and lunar festivals with the solar festival first', () => {
    expect(getCalendarDay(Temporal.PlainDate.from('2020-10-01'))).toMatchObject({
      lunarLabel: '国庆节',
      festivals: ['国庆节', '中秋节'],
    })
  })

  it('uses ISO calendar dates as keys', () => {
    expect(dateKey(Temporal.PlainDate.from('2026-01-01'))).toBe('2026-01-01')
  })
})
