#!/usr/bin/env node
/**
 * Сценарий → план событий Google Календаря.
 *
 * Скрипт ничего не пишет в календарь. Он читает `calendar/scenario.json`
 * и печатает план: что должно стоять в календаре на выбранный период.
 * Запись делает Claude по команде `/calendar` через коннектор Google.
 * Разделение намеренное — генерация детерминирована и проверяема локально,
 * сеть трогает только последний шаг.
 *
 * Постоянные уроки собираются в повторяющиеся события: одно событие на пару
 * «день недели × звонок», каникулы вычитаются через EXDATE. Двадцать событий
 * на четверть вместо шестисот, и переносить руками нечего.
 *
 *   node scripts/calendar-plan.mjs                 план на период из сценария
 *   node scripts/calendar-plan.mjs --week          только текущая неделя
 *   node scripts/calendar-plan.mjs --json          машинный план для /calendar
 *   node scripts/calendar-plan.mjs --backup b.json расписание из копии приложения
 */

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { addDaysISO, isoWeekday, startOfWeekISO, toISODate } from '../src/lib/datetime.js'
import { resolveDay, sortedBells, subjectById } from '../src/lib/schedule.js'

const DEFAULT_SCENARIO = 'calendar/scenario.json'
const DEFAULT_MARKER = 'timetable-sync'

/** Ключи дней: латиница, кириллица и просто номер — как удобнее писать. */
const WEEKDAY_KEYS = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
  пн: 1, вт: 2, ср: 3, чт: 4, пт: 5, сб: 6, вс: 7,
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7,
}

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
const DAY_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

/** Палитра событий Google: id → цвет. Нужна, чтобы из hex сценария
 *  получить ближайший штатный цвет, а не сбрасывать всё в серый. */
const GOOGLE_COLORS = [
  ['1', '#7986cb'], ['2', '#33b679'], ['3', '#8e24aa'], ['4', '#e67c73'],
  ['5', '#f6bf26'], ['6', '#f4511e'], ['7', '#039be5'], ['8', '#616161'],
  ['9', '#3f51b5'], ['10', '#0b8043'], ['11', '#d50000'],
]

const fail = (message) => {
  console.error(`Ошибка: ${message}`)
  process.exit(1)
}

const pad = (n) => String(n).padStart(2, '0')
const isTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t ?? '')
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '')

// ─────────────────────────────────────────────────────────── аргументы

function parseArgs(argv) {
  const opts = { scenario: DEFAULT_SCENARIO, flat: false, json: false }
  const takesValue = new Set(['--scenario', '--backup', '--from', '--to'])
  const optionalValue = new Set(['--week', '--next-week', '--month'])

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]
    const hasNext = next && !next.startsWith('--')

    if (arg === '--help' || arg === '-h') return { help: true }
    else if (arg === '--flat') opts.flat = true
    else if (arg === '--json') opts.json = true
    else if (takesValue.has(arg)) {
      if (!hasNext) fail(`${arg} требует значение`)
      opts[arg.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = next
      i++
    } else if (optionalValue.has(arg)) {
      opts[arg.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = hasNext ? next : true
      if (hasNext) i++
    } else fail(`неизвестный аргумент ${arg}`)
  }
  return opts
}

/** Период: аргументы командной строки важнее того, что записано в сценарии. */
function resolvePeriod(scenario, opts) {
  const today = toISODate(new Date())

  if (opts.week) {
    const base = opts.week === true ? today : opts.week
    if (!isDate(base)) fail(`--week: ожидалась дата YYYY-MM-DD, получено «${base}»`)
    const monday = startOfWeekISO(base)
    return { from: monday, to: addDaysISO(monday, 6) }
  }

  if (opts.nextWeek) {
    const monday = addDaysISO(startOfWeekISO(today), 7)
    return { from: monday, to: addDaysISO(monday, 6) }
  }

  if (opts.month) {
    const value = opts.month === true ? today.slice(0, 7) : String(opts.month)
    if (!/^\d{4}-\d{2}$/.test(value)) fail(`--month: ожидался YYYY-MM, получено «${value}»`)
    const [y, m] = value.split('-').map(Number)
    return { from: `${value}-01`, to: toISODate(new Date(y, m, 0)) }
  }

  const from = opts.from ?? scenario.period?.from
  const to = opts.to ?? scenario.period?.to
  if (!isDate(from) || !isDate(to)) fail('период не задан: нужен period.from и period.to в сценарии либо --from/--to')
  if (from > to) fail('начало периода позже конца')
  return { from, to }
}

// ─────────────────────────────────────────────────────────── сценарий

function loadJSON(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`не читается ${path}: ${error.message}`)
  }
}

function validateScenario(scenario) {
  const bells = scenario.bells ?? []
  if (!bells.length) fail('в сценарии нет звонков (bells)')

  const byNumber = new Map()
  for (const bell of bells) {
    if (!Number.isInteger(bell.n)) fail(`звонок без номера: ${JSON.stringify(bell)}`)
    if (!isTime(bell.start) || !isTime(bell.end)) fail(`звонок ${bell.n}: время должно быть HH:MM`)
    if (bell.end <= bell.start) fail(`звонок ${bell.n}: конец не позже начала`)
    if (byNumber.has(bell.n)) fail(`звонок ${bell.n} задан дважды`)
    byNumber.set(bell.n, bell)
  }

  const seen = new Set()
  for (const [dayKey, lessons] of Object.entries(scenario.template ?? {})) {
    const weekday = WEEKDAY_KEYS[String(dayKey).toLowerCase()]
    if (!weekday) fail(`неизвестный день недели «${dayKey}» (нужен mon…sun, пн…вс или 1…7)`)
    for (const lesson of lessons ?? []) {
      if (!byNumber.has(lesson.bell)) fail(`${dayKey}: нет звонка №${lesson.bell}`)
      const slot = `${weekday}-${lesson.bell}`
      if (seen.has(slot)) fail(`${dayKey}, звонок ${lesson.bell}: два урока в одно время`)
      seen.add(slot)
      if (!lesson.subject && !lesson.title) fail(`${dayKey}, звонок ${lesson.bell}: нужен subject или title`)
      for (const key of ['start', 'end']) {
        if (lesson[key] !== undefined && !isTime(lesson[key])) fail(`${dayKey}, звонок ${lesson.bell}: ${key} должно быть HH:MM`)
      }
    }
  }

  for (const item of scenario.extra ?? []) {
    if (!isDate(item.date)) fail(`разовое событие: дата должна быть YYYY-MM-DD, получено «${item.date}»`)
    if (!item.allDay && (!isTime(item.start) || !isTime(item.end))) fail(`разовое событие ${item.date}: нужно время start и end`)
  }

  return byNumber
}

/** Каникулы, праздники и любые «в этот день уроков нет» → дата → подпись. */
function skipMap(scenario) {
  const map = new Map()
  for (const item of scenario.skip ?? []) {
    const from = item.date ?? item.from
    const to = item.date ?? item.to ?? from
    if (!isDate(from) || !isDate(to)) fail(`пропуск: нужна date либо from и to (${JSON.stringify(item)})`)
    for (let d = from; d <= to; d = addDaysISO(d, 1)) map.set(d, item.label ?? 'без уроков')
  }
  return map
}

// ─────────────────────────────────────────────────────────── помощники

function datesInRange(from, to, weekday) {
  const out = []
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    if (!weekday || isoWeekday(d) === weekday) out.push(d)
  }
  return out
}

/** Смещение таймзоны для конкретного момента — без библиотек, через Intl. */
function zoneOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  const p = Object.fromEntries(parts.filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]))
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return (asUTC - date.getTime()) / 60000
}

/** «2026-09-08» + «08:30» + Europe/Minsk → «2026-09-08T08:30:00+03:00».
 *  Настенное время остаётся настенным, смещение считается на нужную дату —
 *  иначе события уезжают на час при переходе на летнее время. */
function isoWithOffset(date, time, timeZone) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const first = zoneOffsetMinutes(new Date(guess), timeZone)
  const offset = zoneOffsetMinutes(new Date(guess - first * 60000), timeZone)
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${date}T${time}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

const stamp = (date, time) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`

function nearestColorId(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) return undefined
  const rgb = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16))
  const [r, g, b] = rgb(hex)
  let best = GOOGLE_COLORS[0][0]
  let bestDistance = Infinity
  for (const [id, color] of GOOGLE_COLORS) {
    const [cr, cg, cb] = rgb(color)
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (distance < bestDistance) { bestDistance = distance; best = id }
  }
  return best
}

function reminders(minutes) {
  if (minutes === null || minutes === undefined) return undefined
  const list = Array.isArray(minutes) ? minutes : [minutes]
  return list.map((m) => ({ method: 'popup', minutes: m }))
}

/**
 * Подпись в описании — единственное, по чему команда узнаёт свои события.
 * Всё, что без неё, скрипт и Claude не трогают: чужие встречи в безопасности.
 */
function withMarker(event, marker) {
  const core = JSON.stringify({
    summary: event.summary,
    location: event.location ?? '',
    body: event.body ?? '',
    start: event.startTime,
    end: event.endTime,
    recurrence: event.recurrenceData ?? [],
    color: event.colorId ?? '',
    reminders: event.overrideReminders ?? [],
  })
  const hash = createHash('sha1').update(core).digest('hex').slice(0, 8)
  const description = [event.body, event.body ? '' : null, `${marker} · ${event.key} · v=${hash}`]
    .filter((line) => line !== null && line !== undefined)
    .join('\n')
  const { body, ...rest } = event
  return { ...rest, hash, description: body ? description : `${marker} · ${event.key} · v=${hash}` }
}

// ─────────────────────────────────────────────────────────── план

function planFromScenario(scenario, period, opts) {
  const bells = validateScenario(scenario)
  const skipped = skipMap(scenario)
  const settings = scenario.calendar ?? {}
  const timeZone = settings.timezone ?? 'Europe/Minsk'
  const marker = settings.marker ?? DEFAULT_MARKER
  const subjects = scenario.subjects ?? {}
  const events = []

  for (const [dayKey, lessons] of Object.entries(scenario.template ?? {})) {
    const weekday = WEEKDAY_KEYS[String(dayKey).toLowerCase()]

    for (const lesson of lessons ?? []) {
      const bell = bells.get(lesson.bell)
      const subject = subjects[lesson.subject] ?? {}
      const start = lesson.start ?? bell.start
      const end = lesson.end ?? bell.end
      const room = lesson.room ?? subject.room ?? ''
      const summary = lesson.title ?? [lesson.subject, lesson.class].filter(Boolean).join(' · ')
      const colorId = lesson.colorId ?? subject.colorId ?? nearestColorId(subject.color)
      const alarm = reminders(lesson.reminderMinutes ?? settings.reminderMinutes)
      const key = `${DAY_SHORT[weekday - 1]}-${lesson.bell}`

      const dates = datesInRange(period.from, period.to, weekday)
      const working = dates.filter((d) => !skipped.has(d))
      if (!working.length) continue

      const base = {
        summary,
        location: room ? `Кабинет ${room}` : undefined,
        body: lesson.note ?? '',
        timeZone,
        colorId,
        overrideReminders: alarm,
      }

      if (opts.flat) {
        for (const date of working) {
          events.push(withMarker({
            ...base,
            key: `${key}-${date}`,
            startTime: isoWithOffset(date, start, timeZone),
            endTime: isoWithOffset(date, end, timeZone),
            dates: [date],
          }, marker))
        }
        continue
      }

      const first = working[0]
      const rest = dates.filter((d) => d > first)
      const excluded = rest.filter((d) => skipped.has(d))
      const recurrenceData = [`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[weekday - 1]};COUNT=${1 + rest.length}`]
      if (excluded.length) {
        recurrenceData.push(`EXDATE;TZID=${timeZone}:${excluded.map((d) => stamp(d, start)).join(',')}`)
      }

      events.push(withMarker({
        ...base,
        key,
        startTime: isoWithOffset(first, start, timeZone),
        endTime: isoWithOffset(first, end, timeZone),
        recurrenceData,
        dates: working,
      }, marker))
    }
  }

  for (const item of scenario.extra ?? []) {
    if (item.date < period.from || item.date > period.to) continue
    events.push(withMarker({
      key: `раз-${item.date}-${(item.start ?? 'весь-день').replace(':', '')}`,
      summary: item.title ?? item.subject ?? 'Событие',
      location: item.location ?? (item.room ? `Кабинет ${item.room}` : undefined),
      body: item.note ?? '',
      timeZone,
      allDay: item.allDay || undefined,
      startTime: item.allDay ? item.date : isoWithOffset(item.date, item.start, timeZone),
      endTime: item.allDay ? item.date : isoWithOffset(item.date, item.end, timeZone),
      colorId: item.colorId ?? nearestColorId(item.color),
      overrideReminders: reminders(item.reminderMinutes ?? settings.reminderMinutes),
      dates: [item.date],
    }, marker))
  }

  return { timeZone, marker, calendarId: settings.calendarId ?? 'primary', skipped, events }
}

/**
 * Второй источник сценария — резервная копия приложения (Настройки → Данные).
 * Здесь у каждой даты своя правда: замены, темы, отмены, перенос времени,
 * поэтому повторяющиеся события не строим, разворачиваем по дням.
 */
function planFromBackup(state, settings, period) {
  const timeZone = settings.timezone ?? state.settings?.timezone ?? 'Europe/Minsk'
  const marker = settings.marker ?? DEFAULT_MARKER
  const bells = sortedBells(state)
  const events = []

  for (const date of datesInRange(period.from, period.to)) {
    const day = resolveDay(state, date)
    for (const slot of day.slots) {
      if (!slot.lesson || slot.source === 'cancelled') continue
      const subject = subjectById(state, slot.lesson.subjectId)
      const index = bells.findIndex((b) => b.id === slot.bell.id) + 1
      const body = [slot.lesson.topic, slot.lesson.note].filter(Boolean).join('\n')

      events.push(withMarker({
        key: `${DAY_SHORT[day.weekday - 1]}-${index}-${date}`,
        summary: [subject?.name, slot.lesson.className].filter(Boolean).join(' · '),
        location: slot.lesson.room ? `Кабинет ${slot.lesson.room}` : undefined,
        body,
        timeZone,
        startTime: isoWithOffset(date, slot.lesson.start, timeZone),
        endTime: isoWithOffset(date, slot.lesson.end, timeZone),
        colorId: nearestColorId(subject?.color),
        overrideReminders: reminders(settings.reminderMinutes ?? state.settings?.reminderLeadMinutes),
        dates: [date],
      }, marker))
    }
  }

  return { timeZone, marker, calendarId: settings.calendarId ?? 'primary', skipped: new Map(), events }
}

// ─────────────────────────────────────────────────────────── вывод

function printHuman(plan, period) {
  const lessons = plan.events.reduce((sum, e) => sum + e.dates.length, 0)
  console.log(`Календарь: ${plan.calendarId} · ${plan.timeZone}`)
  console.log(`Период:    ${period.from} … ${period.to}`)
  console.log(`Событий:   ${plan.events.length} (занятий за период: ${lessons})`)
  if (plan.skipped.size) console.log(`Без уроков: ${plan.skipped.size} дн.`)
  console.log('')
  for (const event of plan.events) {
    const time = event.allDay ? 'весь день' : `${event.startTime.slice(11, 16)}–${event.endTime.slice(11, 16)}`
    const repeat = event.recurrenceData ? `×${event.dates.length}` : event.dates[0]
    console.log(`  ${event.key.padEnd(18)} ${time}  ${String(repeat).padEnd(12)} ${event.summary}`)
  }
  console.log('')
  console.log('Ничего не записано: план печатается, запись делает /calendar.')
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 22).join('\n').replace(/^ ?\*\/?/gm, '').trim())
    return
  }

  const scenario = loadJSON(opts.scenario)
  const period = resolvePeriod(scenario, opts)
  const plan = opts.backup
    ? planFromBackup(loadJSON(opts.backup), scenario.calendar ?? {}, period)
    : planFromScenario(scenario, period, opts)

  if (opts.json) {
    console.log(JSON.stringify({
      calendarId: plan.calendarId,
      timeZone: plan.timeZone,
      marker: plan.marker,
      period,
      events: plan.events.map(({ dates, ...event }) => ({ ...event, occurrences: dates.length })),
    }, null, 2))
    return
  }

  printHuman(plan, period)
}

main()
