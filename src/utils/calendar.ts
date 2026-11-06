import { SolarDay } from 'tyme4ts'

// Preserve the festivals shown before the tyme4ts migration that it does not include.
const extraSolarFestivals: Record<string, string> = {
  '2-14': '情人节',
  '3-15': '消费者权益日',
  '4-1': '愚人节',
  '10-31': '万圣节前夜',
  '11-1': '万圣节',
  '12-24': '平安夜',
  '12-25': '圣诞节',
}

// Keys use month-occurrence-ISO weekday; occurrence 0 means the last in the month.
const weekdayFestivals: Record<string, string> = {
  '3-0-1': '全国中小学生安全教育日',
  '5-2-7': '母亲节',
  '5-3-7': '全国助残日',
  '6-3-7': '父亲节',
  '9-3-6': '全民国防教育日',
  '10-1-1': '世界住房日',
  '11-4-4': '感恩节',
}

export interface CalendarDay {
  date: Temporal.PlainDate
  key: string
  day: number
  inMonth: boolean
  lunarLabel: string
  lunarDate: string
  lunarYear: string
  gzYear: string
  gzMonth: string
  gzDay: string
  zodiac: string
  festivals: string[]
  solarTerm: string
  holiday: '休' | '班' | null
  yi: string[]
  ji: string[]
}

/** ISO date key, independent of time zones. */
export function dateKey(date: Temporal.PlainDate): string {
  return date.toString()
}

/** Convert one Gregorian date into the information shown on the calendar. */
export function getCalendarDay(date: Temporal.PlainDate): CalendarDay {
  const { year, month, day } = date
  const solar = SolarDay.fromYmd(year, month, day)
  const lunar = solar.getLunarDay()
  const lunarMonth = lunar
    .getLunarMonth()
    .getName()
    .replace('十一月', '冬月')
    .replace('十二月', '腊月')
  const lunarDay = lunar.getName()
  // The displayed year and zodiac change at Lunar New Year, while the month follows solar terms.
  const lunarYearCycle = lunar.getLunarMonth().getLunarYear().getSixtyCycle()
  const sixtyCycleDay = solar.getSixtyCycleDay()
  const termDay = solar.getTermDay()
  const solarTerm = termDay.getDayIndex() === 0 ? termDay.getSolarTerm().getName() : ''
  const week = Math.ceil(day / 7)
  const festivals = [
    ...new Set(
      [
        solar.getFestival()?.getName(),
        extraSolarFestivals[`${month}-${day}`],
        weekdayFestivals[`${month}-${week}-${date.dayOfWeek}`],
        day + 7 > date.daysInMonth ? weekdayFestivals[`${month}-0-${date.dayOfWeek}`] : undefined,
        lunar.getFestival()?.getName(),
      ].filter(
        // Solar terms already have their own label: avoid 冬至节 / 冬至 and 清明节 / 清明.
        (name): name is string =>
          name !== undefined && name !== solarTerm && name !== `${solarTerm}节`,
      ),
    ),
  ]
  const holiday = solar.getLegalHoliday()

  return {
    date,
    key: dateKey(date),
    day,
    inMonth: true,
    lunarLabel: festivals[0] || solarTerm || (lunar.getDay() === 1 ? lunarMonth : lunarDay),
    lunarDate: `${lunarMonth}${lunarDay}`,
    lunarYear: `${String(lunar.getYear()).replace(/\d/g, (digit) => '〇一二三四五六七八九'.charAt(Number(digit)))}年`,
    gzYear: lunarYearCycle.getName(),
    gzMonth: sixtyCycleDay.getMonth().getName(),
    gzDay: sixtyCycleDay.getSixtyCycle().getName(),
    zodiac: lunarYearCycle.getEarthBranch().getZodiac().getName(),
    festivals,
    solarTerm,
    holiday: holiday ? (holiday.isWork() ? '班' : '休') : null,
    yi: lunar.getRecommends().map((item) => item.getName()),
    ji: lunar.getAvoids().map((item) => item.getName()),
  }
}

/** Return a Monday-first six-week grid. Month is one-based. */
export function getCalendarMonth(year: number, month: number): CalendarDay[] {
  const first = Temporal.PlainDate.from({ year, month, day: 1 })
  const start = first.subtract({ days: first.dayOfWeek - 1 })
  return Array.from({ length: 42 }, (_, index) => {
    const date = start.add({ days: index })
    return {
      ...getCalendarDay(date),
      inMonth: date.year === year && date.month === month,
    }
  })
}
