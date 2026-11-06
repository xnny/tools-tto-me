// Western Gregorian observances, using their traditional dates without local Sunday transfers.
// https://aa.usno.navy.mil/data/christian_observances
const easterRelativeFestivals: Record<number, string> = {
  [-46]: '圣灰星期三',
  [-7]: '棕枝主日',
  [-3]: '濯足节',
  [-2]: '耶稣受难日',
  0: '复活节',
  39: '耶稣升天节',
  49: '圣灵降临节',
  56: '三一主日',
}

/** Gregorian Easter using the integer algorithm published by the US Naval Observatory. */
function getEaster(year: number): Temporal.PlainDate {
  // https://aa.usno.navy.mil/faq/easter (Oudin's algorithm)
  const century = Math.floor(year / 100)
  const goldenNumber = year % 19
  const correction = Math.floor((century - 17) / 25)
  let epact =
    (century -
      Math.floor(century / 4) -
      Math.floor((century - correction) / 3) +
      19 * goldenNumber +
      15) %
    30
  epact -=
    Math.floor(epact / 28) *
    (1 -
      Math.floor(epact / 28) * Math.floor(29 / (epact + 1)) * Math.floor((21 - goldenNumber) / 11))
  const weekday = (year + Math.floor(year / 4) + epact + 2 - century + Math.floor(century / 4)) % 7
  const offset = epact - weekday
  const month = 3 + Math.floor((offset + 40) / 44)
  const day = offset + 28 - 31 * Math.floor(month / 4)
  return Temporal.PlainDate.from({ year, month, day })
}

/** Additional Christian observances; Christmas and All Saints use fixed-date calendar entries. */
export function getChristianFestival(date: Temporal.PlainDate): string | undefined {
  if (date.month === 1 && date.day === 6) return '主显节'

  // The fourth Sunday before Christmas falls between November 27 and December 3.
  if (
    date.dayOfWeek === 7 &&
    ((date.month === 11 && date.day >= 27) || (date.month === 12 && date.day <= 3))
  ) {
    return '将临期第一主日'
  }

  if (date.month < 2 || date.month > 6) return undefined
  const daysFromEaster = getEaster(date.year).until(date, { largestUnit: 'days' }).days
  return easterRelativeFestivals[daysFromEaster]
}
