import { esc } from './telegram.js'

/** Форматирование сообщений бота. Чистые функции — их удобно проверять. */

const WEEKDAYS = [
  'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье',
]

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

/** ISO-день недели без создания Date в локальной зоне сервера. */
export function isoWeekday(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return js === 0 ? 7 : js
}

export function formatDate(isoDate) {
  const [, m, d] = isoDate.split('-').map(Number)
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]}, ${WEEKDAYS[isoWeekday(isoDate) - 1]}`
}

export function plural(n, one, few, many) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const hhmm = (time) => String(time ?? '').slice(0, 5)

/** Расписание на день. `lessons` — строки из resolved_lessons. */
export function formatDay(isoDate, lessons, { dayLabel } = {}) {
  const head = `<b>${esc(formatDate(isoDate))}</b>`

  if (dayLabel) return `${head}\n\n${esc(dayLabel)} — уроков нет.`
  if (!lessons?.length) return `${head}\n\nУроков нет.`

  const lines = lessons.map((lesson) => {
    const time = `${hhmm(lesson.starts_at)}–${hhmm(lesson.ends_at)}`
    const head = [
      `<b>${lesson.bell_position}.</b> <code>${time}</code>`,
      esc(lesson.subject_name ?? '—'),
      lesson.class_name ? esc(lesson.class_name) : null,
      lesson.room ? `каб. ${esc(lesson.room)}` : null,
    ]
      .filter(Boolean)
      .join(' · ')

    if (lesson.status === 'cancelled') return `<s>${head}</s> — отменён`
    return lesson.topic ? `${head}\n    <i>${esc(lesson.topic)}</i>` : head
  })

  const active = lessons.filter((l) => l.status !== 'cancelled')
  const minutes = active.reduce((sum, l) => sum + duration(l.starts_at, l.ends_at), 0)
  const count = active.length

  const footer = count
    ? `\n\n${count} ${plural(count, 'урок', 'урока', 'уроков')} · ${formatDuration(minutes)} у доски`
    : ''

  return `${head}\n\n${lines.join('\n')}${footer}`
}

/** Одно напоминание перед уроком. */
export function formatReminder(row) {
  const parts = [
    esc(row.subject_name ?? 'Урок'),
    row.class_name ? esc(row.class_name) : null,
    row.room ? `каб. ${esc(row.room)}` : null,
  ].filter(Boolean)

  const minutes = Math.max(0, row.minutes_left ?? 0)
  const lead =
    minutes <= 1
      ? 'начинается'
      : `через ${minutes} ${plural(minutes, 'минуту', 'минуты', 'минут')}`

  const lines = [
    `<b>${parts.join(' · ')}</b>`,
    `Урок ${row.bell_position ?? ''} ${lead}, в <code>${hhmm(row.starts_at)}</code>`.replace(/\s+/g, ' '),
  ]
  if (row.topic) lines.push(`<i>${esc(row.topic)}</i>`)
  return lines.join('\n')
}

function duration(start, end) {
  const toMin = (t) => {
    const [h, m] = String(t).split(':').map(Number)
    return h * 60 + m
  }
  return Math.max(0, toMin(end) - toMin(start))
}

export function formatDuration(minutes) {
  if (!minutes) return '0 мин'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} мин`
  if (!m) return `${h} ч`
  return `${h} ч ${m} мин`
}

export const HELP = `Я присылаю напоминания об уроках и показываю расписание.

<b>Команды</b>
/today — расписание на сегодня
/tomorrow — на завтра
/week — на ближайшие семь дней
/stop — отвязать аккаунт и перестать писать
/help — этот список

Чтобы привязать аккаунт, откройте расписание на сайте, получите код и отправьте
его командой <code>/start КОД</code>.`
