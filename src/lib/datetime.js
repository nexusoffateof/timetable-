/**
 * Работа с датами и временем.
 *
 * Главное правило проекта: дата — это строка `YYYY-MM-DD` в местном времени
 * пользователя, время — строка `HH:MM` (тоже местная, «настенные часы»).
 * Никаких `Date.toISOString()` для дат: он переводит в UTC и в Москве
 * стабильно отдаёт вчерашний день для всего, что раньше 03:00.
 *
 * Момент во времени (для напоминаний) собирается только на сервере —
 * из пары «дата + время + IANA-таймзона пользователя». Смотри docs/ROADMAP.md.
 */

export const WEEKDAYS_FULL = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
]

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

const MONTHS_NOMINATIVE = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

const pad = (n) => String(n).padStart(2, '0')

/** Локальная дата → `YYYY-MM-DD`. */
export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `YYYY-MM-DD` → Date на локальную полночь. */
export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO() {
  return toISODate(new Date())
}

export function addDaysISO(iso, days) {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** 1 — понедельник … 7 — воскресенье. */
export function isoWeekday(iso) {
  const js = parseISODate(iso).getDay()
  return js === 0 ? 7 : js
}

/** Понедельник недели, в которую попадает дата. */
export function startOfWeekISO(iso) {
  return addDaysISO(iso, -(isoWeekday(iso) - 1))
}

export function weekDates(mondayISO, count = 7) {
  return Array.from({ length: count }, (_, i) => addDaysISO(mondayISO, i))
}

/** Номер учебной недели по ISO 8601 — пригодится для «чётная/нечётная». */
export function isoWeekNumber(iso) {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

export function formatDayMonth(iso) {
  const d = parseISODate(iso)
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`
}

export function formatFull(iso) {
  const d = parseISODate(iso)
  return `${WEEKDAYS_FULL[isoWeekday(iso) - 1]}, ${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}`
}

export function monthName(iso) {
  return MONTHS_NOMINATIVE[parseISODate(iso).getMonth()]
}

/** «2 – 8 марта 2026», со схлопыванием повторяющегося месяца и года. */
export function formatWeekRange(mondayISO, days = 7) {
  const from = parseISODate(mondayISO)
  const to = parseISODate(addDaysISO(mondayISO, days - 1))
  const sameMonth = from.getMonth() === to.getMonth()
  const sameYear = from.getFullYear() === to.getFullYear()

  const left = sameMonth && sameYear
    ? String(from.getDate())
    : `${from.getDate()} ${MONTHS_GENITIVE[from.getMonth()]}${sameYear ? '' : ` ${from.getFullYear()}`}`

  return `${left} – ${to.getDate()} ${MONTHS_GENITIVE[to.getMonth()]} ${to.getFullYear()}`
}

/** `HH:MM` → минуты от полуночи. */
export function timeToMinutes(time) {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

export function minutesToTime(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export function isValidTime(time) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time ?? '')
}

/** Минуты → «1 ч 45 мин» / «45 мин». */
export function formatDuration(minutes) {
  if (!minutes) return '0 мин'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} мин`
  if (!m) return `${h} ч`
  return `${h} ч ${m} мин`
}

/** Минуты от локальной полуночи прямо сейчас. */
export function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/** Таймзона браузера — то, что мы сохраняем и отдаём серверу напоминаний. */
export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow'
  } catch {
    return 'Europe/Moscow'
  }
}

/** «через 12 мин», «5 мин назад» — для маркера текущего урока. */
export function relativeMinutes(delta) {
  const abs = Math.abs(delta)
  if (abs < 1) return 'сейчас'
  const body = formatDuration(abs)
  return delta > 0 ? `через ${body}` : `${body} назад`
}
