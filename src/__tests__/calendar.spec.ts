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

  it.each([
    { date: '2026-02-14', name: '情人节' },
    { date: '2026-03-15', name: '消费者权益日' },
    { date: '2026-04-01', name: '愚人节' },
    { date: '2026-10-31', name: '万圣节前夜' },
    { date: '2026-11-01', name: '万圣节' },
    { date: '2026-12-24', name: '平安夜' },
    { date: '2026-12-25', name: '圣诞节' },
  ])('preserves the fixed-date festival $name on $date', ({ date, name }) => {
    expect(getCalendarDay(Temporal.PlainDate.from(date))).toMatchObject({
      lunarLabel: name,
      festivals: [name],
    })
  })

  it.each([
    { date: '2026-02-02', name: '世界湿地日' },
    { date: '2026-03-03', name: '世界野生动植物日' },
    { date: '2026-03-21', name: '国际森林日' },
    { date: '2026-03-22', name: '世界水日' },
    { date: '2026-03-23', name: '世界气象日' },
    { date: '2026-04-22', name: '世界地球日' },
    { date: '2026-05-22', name: '国际生物多样性日' },
    { date: '2026-06-05', name: '世界环境日' },
    { date: '2026-06-08', name: '世界海洋日' },
    { date: '2026-09-16', name: '国际保护臭氧层日' },
  ])('keeps $name as a low-priority observance on $date', ({ date, name }) => {
    const target = Temporal.PlainDate.from(date)
    const current = getCalendarDay(target)
    expect(current.observances).toContain(name)
    expect(current.festivals).not.toContain(name)
    expect(getCalendarDay(target.subtract({ days: 1 })).observances).not.toContain(name)
    expect(getCalendarDay(target.add({ days: 1 })).observances).not.toContain(name)
  })

  it.each([
    { date: '2025-07-20', name: '初伏' },
    { date: '2025-07-30', name: '中伏' },
    { date: '2025-08-09', name: '末伏' },
    { date: '2026-07-15', name: '初伏' },
    { date: '2026-07-25', name: '中伏' },
    { date: '2026-08-14', name: '末伏' },
  ])('marks the start of $name on $date for both short and long summers', ({ date, name }) => {
    expect(getCalendarDay(Temporal.PlainDate.from(date))).toMatchObject({
      lunarLabel: name,
      observances: [`${name}第1天`],
      festivals: [],
      solarTerm: '',
    })
  })

  it.each([
    { date: '2025-08-08', detail: '中伏第10天' },
    { date: '2026-08-13', detail: '中伏第20天' },
    { date: '2025-08-18', detail: '末伏第10天' },
    { date: '2026-08-23', detail: '末伏第10天' },
  ])('counts seasonal progress through $detail on $date', ({ date, detail }) => {
    const current = getCalendarDay(Temporal.PlainDate.from(date))
    expect(current.observances).toContain(detail)
    expect(current.lunarLabel).not.toContain('伏')
  })

  it.each([
    { date: '2025-12-21', name: '一九' },
    { date: '2025-12-30', name: '二九' },
    { date: '2026-01-08', name: '三九' },
    { date: '2026-01-17', name: '四九' },
    { date: '2026-01-26', name: '五九' },
    { date: '2026-02-04', name: '六九' },
    { date: '2026-02-13', name: '七九' },
    { date: '2026-02-22', name: '八九' },
    { date: '2026-03-03', name: '九九' },
  ])('counts $name across the winter year boundary on $date', ({ date, name }) => {
    expect(getCalendarDay(Temporal.PlainDate.from(date)).observances).toContain(`${name}第1天`)
  })

  it.each([
    { date: '2026-01-01', detail: '二九第3天' },
    { date: '2024-02-29', detail: '八九第7天' },
    { date: '2024-03-11', detail: '九九第9天' },
    { date: '2026-03-11', detail: '九九第9天' },
  ])('keeps the correct winter day count on $date', ({ date, detail }) => {
    expect(getCalendarDay(Temporal.PlainDate.from(date)).observances).toContain(detail)
  })

  it.each(['2025-07-19', '2025-08-19', '2026-07-14', '2026-08-24', '2025-12-20', '2026-03-12'])(
    'does not retain seasonal annotations outside their periods on %s',
    (date) => {
      expect(getCalendarDay(Temporal.PlainDate.from(date)).observances).toEqual([])
    },
  )

  it('keeps a festival above both an environmental day and a winter-period start', () => {
    expect(getCalendarDay(Temporal.PlainDate.from('2026-03-03'))).toMatchObject({
      lunarLabel: '元宵节',
      festivals: ['元宵节'],
      observances: ['九九第1天', '世界野生动植物日'],
    })
  })

  it.each([
    { date: '2026-02-10', name: '北方小年', lunarDate: '腊月廿三' },
    { date: '2026-02-11', name: '南方小年', lunarDate: '腊月廿四' },
    { date: '2026-11-09', name: '寒衣节', lunarDate: '十月初一' },
    { date: '2026-11-23', name: '下元节', lunarDate: '十月十五' },
    { date: '2027-01-30', name: '北方小年', lunarDate: '腊月廿三' },
    { date: '2027-01-31', name: '南方小年', lunarDate: '腊月廿四' },
    { date: '2027-10-29', name: '寒衣节', lunarDate: '十月初一' },
    { date: '2027-11-12', name: '下元节', lunarDate: '十月十五' },
  ])('marks $name on its lunar date in $date', ({ date, name, lunarDate }) => {
    const target = Temporal.PlainDate.from(date)
    expect(getCalendarDay(target)).toMatchObject({
      lunarLabel: name,
      lunarDate,
      festivals: [name],
    })
    expect(getCalendarDay(target.subtract({ days: 1 })).festivals).not.toContain(name)
    expect(getCalendarDay(target.add({ days: 1 })).festivals).not.toContain(name)
  })

  it.each(['2024-04-03', '2026-04-04'])(
    'marks Cold Food on %s, one day before that year’s Qingming',
    (date) => {
      const target = Temporal.PlainDate.from(date)
      expect(getCalendarDay(target)).toMatchObject({
        lunarLabel: '寒食节',
        festivals: ['寒食节'],
        solarTerm: '',
      })
      const qingming = getCalendarDay(target.add({ days: 1 }))
      expect(qingming.solarTerm).toBe('清明')
      expect(qingming.festivals).not.toContain('寒食节')
      expect(getCalendarDay(target.subtract({ days: 1 })).festivals).not.toContain('寒食节')
    },
  )

  it('still observes Cold Food when its solar date falls in a leap lunar month', () => {
    expect(getCalendarDay(Temporal.PlainDate.from('2023-04-04'))).toMatchObject({
      lunarDate: '闰二月十四',
      lunarLabel: '寒食节',
      festivals: ['寒食节'],
    })
  })

  it.each([
    { regular: '1984-10-24', leap: '1984-11-23', name: '寒衣节', lunarDate: '闰十月初一' },
    { regular: '1984-11-07', leap: '1984-12-07', name: '下元节', lunarDate: '闰十月十五' },
  ])('does not repeat $name in a leap lunar month', ({ regular, leap, name, lunarDate }) => {
    expect(getCalendarDay(Temporal.PlainDate.from(regular)).festivals).toContain(name)
    const leapDay = getCalendarDay(Temporal.PlainDate.from(leap))
    expect(leapDay.lunarDate).toBe(lunarDate)
    expect(leapDay.festivals).not.toContain(name)
    expect(leapDay.lunarLabel).not.toContain(name)
  })

  it.each([
    { date: '2026-04-19', name: '上巳节' },
    { date: '2026-08-27', name: '中元节' },
  ])('keeps the existing traditional festival $name without duplication', ({ date, name }) => {
    expect(getCalendarDay(Temporal.PlainDate.from(date))).toMatchObject({
      lunarLabel: name,
      festivals: [name],
    })
  })

  it('preserves coinciding traditional and Christian festivals', () => {
    expect(getCalendarDay(Temporal.PlainDate.from('2010-04-04'))).toMatchObject({
      lunarLabel: '寒食节 · 复活节',
      festivals: ['寒食节', '复活节'],
      solarTerm: '',
    })
  })

  it('preserves a solar term alongside a traditional festival', () => {
    expect(getCalendarDay(Temporal.PlainDate.from('2028-01-20'))).toMatchObject({
      lunarLabel: '大寒 · 南方小年',
      festivals: ['南方小年'],
      solarTerm: '大寒',
    })
  })

  it.each([
    { date: '2026-01-06', name: '主显节' },
    { date: '2026-02-18', name: '圣灰星期三' },
    { date: '2026-03-29', name: '棕枝主日' },
    { date: '2026-04-02', name: '濯足节' },
    { date: '2026-04-03', name: '耶稣受难日' },
    { date: '2026-04-05', name: '复活节' },
    { date: '2026-05-14', name: '耶稣升天节' },
    { date: '2026-05-24', name: '圣灵降临节' },
    { date: '2026-05-31', name: '三一主日' },
    { date: '2026-11-29', name: '将临期第一主日' },
    { date: '2027-02-10', name: '圣灰星期三' },
    { date: '2027-03-26', name: '耶稣受难日' },
    { date: '2027-05-06', name: '耶稣升天节' },
    { date: '2027-05-16', name: '圣灵降临节' },
  ])('marks $name on its Gregorian observance date $date', ({ date, name }) => {
    const target = Temporal.PlainDate.from(date)
    const current = getCalendarDay(target)

    expect(current.festivals).toContain(name)
    expect(current.lunarLabel).toContain(name)
    expect(getCalendarDay(target.subtract({ days: 1 })).festivals).not.toContain(name)
    expect(getCalendarDay(target.add({ days: 1 })).festivals).not.toContain(name)
  })

  it.each([
    '1901-04-07',
    '1954-04-18',
    '1981-04-19',
    '2000-04-23',
    '2008-03-23',
    '2027-03-28',
    '2038-04-25',
    '2099-04-12',
  ])('calculates Western Easter on %s, including early and late dates', (date) => {
    const target = Temporal.PlainDate.from(date)
    expect(getCalendarDay(target).festivals).toContain('复活节')
    expect(getCalendarDay(target.subtract({ days: 7 })).festivals).not.toContain('复活节')
    expect(getCalendarDay(target.add({ days: 7 })).festivals).not.toContain('复活节')
  })

  it.each(['2022-11-27', '2023-12-03', '2027-11-28'])(
    'places the first Sunday of Advent on %s',
    (date) => {
      const target = Temporal.PlainDate.from(date)
      expect(getCalendarDay(target).festivals).toContain('将临期第一主日')
      expect(getCalendarDay(target.subtract({ days: 7 })).festivals).not.toContain('将临期第一主日')
      expect(getCalendarDay(target.add({ days: 7 })).festivals).not.toContain('将临期第一主日')
    },
  )

  it('retains existing festivals when a Christian observance falls on the same date', () => {
    expect(getCalendarDay(Temporal.PlainDate.from('2025-06-15'))).toMatchObject({
      lunarLabel: '父亲节 · 三一主日',
      festivals: ['父亲节', '三一主日'],
    })
  })

  it.each(['2026-01-06', '2026-04-03', '2026-05-14', '2026-05-24'])(
    'does not turn a Christian observance on %s into an official public holiday',
    (date) => {
      expect(getCalendarDay(Temporal.PlainDate.from(date)).holiday).toBeNull()
    },
  )

  it.each([
    { date: '2025-05-11', name: '母亲节' },
    { date: '2026-05-10', name: '母亲节' },
    { date: '2025-06-15', name: '父亲节' },
    { date: '2026-06-21', name: '父亲节' },
    { date: '2025-11-27', name: '感恩节' },
    { date: '2026-11-26', name: '感恩节' },
    { date: '2025-03-31', name: '全国中小学生安全教育日' },
    { date: '2028-03-27', name: '全国中小学生安全教育日' },
    { date: '2026-05-17', name: '全国助残日' },
    { date: '2026-09-19', name: '全民国防教育日' },
    { date: '2026-10-05', name: '世界住房日' },
  ])('places $name on the correct weekday occurrence in $date', ({ date, name }) => {
    const target = Temporal.PlainDate.from(date)
    expect(getCalendarDay(target).festivals).toContain(name)
    expect(getCalendarDay(target).lunarLabel.split(' · ')[0]).toBe(name)
    expect(getCalendarDay(target.subtract({ days: 7 })).festivals).not.toContain(name)
    expect(getCalendarDay(target.add({ days: 7 })).festivals).not.toContain(name)
  })

  it.each([
    { date: '2026-04-05', name: '清明', label: '清明 · 复活节', festivals: ['复活节'] },
    { date: '2026-12-22', name: '冬至', label: '冬至', festivals: [] },
  ])(
    'uses the solar-term name $name without a duplicate festival',
    ({ date, name, label, festivals }) => {
      expect(getCalendarDay(Temporal.PlainDate.from(date))).toMatchObject({
        lunarLabel: label,
        solarTerm: name,
        festivals,
      })
    },
  )

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
    { date: '2020-05-23', lunarDate: '闰四月初一', lunarLabel: '闰四月' },
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

  it.each([
    { date: '2020-10-01', festivals: ['国庆节', '中秋节'] },
    { date: '2033-02-14', festivals: ['情人节', '元宵节'] },
    { date: '2029-10-01', festivals: ['国庆节', '世界住房日'] },
    { date: '2025-03-31', festivals: ['全国中小学生安全教育日', '上巳节'] },
  ])(
    'preserves coinciding festivals and their display priority on $date',
    ({ date, festivals }) => {
      expect(getCalendarDay(Temporal.PlainDate.from(date))).toMatchObject({
        lunarLabel: festivals[0],
        festivals,
      })
    },
  )

  it('uses ISO calendar dates as keys', () => {
    expect(dateKey(Temporal.PlainDate.from('2026-01-01'))).toBe('2026-01-01')
  })
})
