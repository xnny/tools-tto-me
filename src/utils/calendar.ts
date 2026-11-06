import { SolarDay } from 'tyme4ts'
import { getChristianFestival } from './christianFestivals'

// Additional solar festivals not included in tyme4ts.
const extraSolarFestivals: Record<string, string> = {
  '2-14': '情人节',
  '4-1': '愚人节',
  '12-25': '圣诞节',
}

// Traditional festivals missing from tyme4ts. Leap lunar months use negative keys.
const extraLunarFestivals: Record<string, string> = {
  '10-1': '寒衣节',
  '10-15': '下元节',
  '12-23': '北方小年',
  '12-24': '南方小年',
}

// Keys use month-occurrence-ISO weekday.
const weekdayFestivals: Record<string, string> = {
  '5-2-7': '母亲节',
  '6-3-7': '父亲节',
}

// Commemorative and religious observances displayed with lower priority.
// Environmental dates: https://www.un.org/en/observances/list-days-weeks
const solarObservances: Record<string, string> = {
  '2-2': '世界湿地日',
  '3-3': '世界野生动植物日',
  '3-15': '消费者权益日',
  '3-21': '国际森林日',
  '3-22': '世界水日',
  '3-23': '世界气象日',
  '4-22': '世界地球日',
  '5-12': '国际护士节',
  '5-22': '国际生物多样性日',
  '6-5': '世界环境日',
  '6-8': '世界海洋日',
  '9-16': '国际保护臭氧层日',
  '10-31': '万圣节前夜',
  '11-1': '万圣节',
  '11-8': '记者节',
  '11-17': '国际学生日',
  '12-24': '平安夜',
}

// Occurrence 0 means the last matching weekday in the month.
const weekdayObservances: Record<string, string> = {
  '3-0-1': '全国中小学生安全教育日',
  '5-3-7': '全国助残日',
  '9-3-6': '全民国防教育日',
  '10-1-1': '世界住房日',
  '11-4-4': '感恩节',
}

// Change display priority without changing the date rules for these observances.
const lowPriorityFestivalNames = new Set(['教师节', '植树节', '寒衣节', '下元节'])

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
  observances: string[]
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
  const solarFestival = solar.getFestival()?.getName()
  const isSolarObservance =
    solarFestival !== undefined && lowPriorityFestivalNames.has(solarFestival)
  const festivals = [
    ...new Set(
      [
        isSolarObservance ? undefined : solarFestival,
        extraSolarFestivals[`${month}-${day}`],
        weekdayFestivals[`${month}-${week}-${date.dayOfWeek}`],
        lunar.getFestival()?.getName(),
      ].filter(
        // Solar terms already have their own label: avoid 冬至节 / 冬至 and 清明节 / 清明.
        (name): name is string =>
          name !== undefined && name !== solarTerm && name !== `${solarTerm}节`,
      ),
    ),
  ]
  const primaryLabel = festivals[0] || solarTerm
  const nextTermDay = solar.next(1).getTermDay()
  const christianFestival = getChristianFestival(date)
  // Christian observances are secondary except for Easter and Christmas.
  const isMajorChristianFestival = christianFestival === '复活节' || christianFestival === '圣诞节'
  const additionalEvents = [
    extraLunarFestivals[`${lunar.getMonth()}-${lunar.getDay()}`],
    // Observe 寒食 on the day before 清明, whose Gregorian date varies by year.
    nextTermDay.getDayIndex() === 0 && nextTermDay.getSolarTerm().getName() === '清明'
      ? '寒食节'
      : undefined,
    isMajorChristianFestival ? christianFestival : undefined,
  ].filter((name): name is string => name !== undefined)
  const additionalFestivals = additionalEvents.filter((name) => !lowPriorityFestivalNames.has(name))
  for (const name of additionalFestivals) {
    if (!festivals.includes(name)) festivals.push(name)
  }
  // Keep coinciding festivals and solar terms visible, e.g. 清明 · 复活节 in 2026.
  const festivalLabel = [...new Set([primaryLabel, ...additionalFestivals])]
    .filter(Boolean)
    .join(' · ')
  const seasonalDay = solar.getDogDay() ?? solar.getNineDay()
  const observanceNames = [
    isSolarObservance ? solarFestival : undefined,
    solarObservances[`${month}-${day}`],
    weekdayObservances[`${month}-${week}-${date.dayOfWeek}`],
    day + 7 > date.daysInMonth ? weekdayObservances[`${month}-0-${date.dayOfWeek}`] : undefined,
    ...additionalEvents.filter((name) => lowPriorityFestivalNames.has(name)),
    isMajorChristianFestival ? undefined : christianFestival,
  ].filter((name): name is string => name !== undefined)
  const observances = [seasonalDay?.toString(), ...observanceNames].filter(
    (name): name is string => name !== undefined,
  )
  // Show only the start of each 伏 / 九 in the grid; keep daily progress in the details.
  const observanceLabel = [
    seasonalDay?.getDayIndex() === 0 ? seasonalDay.getName() : undefined,
    ...observanceNames,
  ]
    .filter(Boolean)
    .join(' · ')
  const holiday = solar.getLegalHoliday()

  return {
    date,
    key: dateKey(date),
    day,
    inMonth: true,
    lunarLabel: festivalLabel || observanceLabel || (lunar.getDay() === 1 ? lunarMonth : lunarDay),
    lunarDate: `${lunarMonth}${lunarDay}`,
    lunarYear: `${String(lunar.getYear()).replace(/\d/g, (digit) => '〇一二三四五六七八九'.charAt(Number(digit)))}年`,
    gzYear: lunarYearCycle.getName(),
    gzMonth: sixtyCycleDay.getMonth().getName(),
    gzDay: sixtyCycleDay.getSixtyCycle().getName(),
    zodiac: lunarYearCycle.getEarthBranch().getZodiac().getName(),
    festivals,
    solarTerm,
    observances,
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
