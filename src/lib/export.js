import { WEEKDAYS_FULL, formatFull } from './datetime.js'
import { resolveDay, subjectById } from './schedule.js'

function download(filename, content, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const csvCell = (value) => {
  const text = String(value ?? '')
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * CSV с разделителем «;» и BOM: русский Excel по умолчанию ждёт именно так,
 * иначе всё склеивается в одну колонку и ломается кириллица.
 */
export function exportCSV(state, dates, filename = 'raspisanie.csv') {
  const header = [
    'Дата',
    'День недели',
    'Урок',
    'Начало',
    'Конец',
    'Предмет',
    'Класс',
    'Кабинет',
    'Тема',
    'Заметка',
    'Статус',
  ]

  const rows = [header]

  for (const date of dates) {
    const day = resolveDay(state, date)
    for (const slot of day.slots) {
      if (!slot.lesson) continue
      const subject = subjectById(state, slot.lesson.subjectId)
      rows.push([
        date,
        WEEKDAYS_FULL[day.weekday - 1],
        slot.bell.index,
        slot.lesson.start,
        slot.lesson.end,
        subject?.name ?? '',
        slot.lesson.className,
        slot.lesson.room,
        slot.lesson.topic,
        slot.lesson.note,
        slot.source === 'cancelled'
          ? 'отменён'
          : slot.source === 'override'
            ? 'изменён'
            : 'по расписанию',
      ])
    }
  }

  const csv = rows.map((row) => row.map(csvCell).join(';')).join('\r\n')
  // \uFEFF — BOM: без него русский Excel читает CSV как крякозябры.
  download(filename, `\uFEFF${csv}`, 'text/csv')
}

export function exportJSON(state, filename = 'raspisanie-backup.json') {
  download(filename, JSON.stringify(state, null, 2), 'application/json')
}

const icsEscape = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')

/** Строки .ics ограничены 75 октетами — считаем байты, а не символы:
    кириллица в UTF-8 занимает по два. */
function fold(line) {
  const encoder = new TextEncoder()
  const out = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    if (bytes + size > 72) {
      out.push(current)
      current = ` ${char}`
      bytes = 1 + size
    } else {
      current += char
      bytes += size
    }
  }
  out.push(current)
  return out.join('\r\n')
}

const icsStamp = (iso, time) =>
  `${iso.replace(/-/g, '')}T${time.replace(':', '')}00`

/**
 * Экспорт в календарь.
 *
 * Время пишется «плавающим» (без Z и без TZID) — ровно то, что нужно школьному
 * расписанию: урок в 08:30 остаётся уроком в 08:30 на любом устройстве.
 * Приведение к UTC здесь было бы ошибкой, а не строгостью.
 */
export function exportICS(state, dates, filename = 'raspisanie.ics') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//timetable//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Расписание уроков',
  ]

  const created = new Date()
  const dtstamp = `${created.getUTCFullYear()}${String(created.getUTCMonth() + 1).padStart(2, '0')}${String(created.getUTCDate()).padStart(2, '0')}T${String(created.getUTCHours()).padStart(2, '0')}${String(created.getUTCMinutes()).padStart(2, '0')}${String(created.getUTCSeconds()).padStart(2, '0')}Z`

  for (const date of dates) {
    const day = resolveDay(state, date)
    for (const slot of day.slots) {
      if (!slot.lesson || slot.source === 'cancelled') continue
      const subject = subjectById(state, slot.lesson.subjectId)
      const title = [subject?.name, slot.lesson.className].filter(Boolean).join(' · ')
      const description = [slot.lesson.topic, slot.lesson.note].filter(Boolean).join('\n')

      lines.push(
        'BEGIN:VEVENT',
        `UID:${date}-${slot.bell.id}@timetable`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${icsStamp(date, slot.lesson.start)}`,
        `DTEND:${icsStamp(date, slot.lesson.end)}`,
        fold(`SUMMARY:${icsEscape(title)}`),
        ...(description ? [fold(`DESCRIPTION:${icsEscape(description)}`)] : []),
        ...(slot.lesson.room ? [fold(`LOCATION:${icsEscape(`Кабинет ${slot.lesson.room}`)}`)] : []),
        'END:VEVENT',
      )
    }
  }

  lines.push('END:VCALENDAR')
  download(filename, lines.join('\r\n'), 'text/calendar')
}

/** Текст дня для отправки себе в мессенджер — заготовка формата для бота. */
export function dayAsText(state, date) {
  const day = resolveDay(state, date)
  const lines = [formatFull(date)]

  if (day.kind === 'holiday' || day.kind === 'vacation') {
    lines.push(day.kind === 'holiday' ? 'Праздник — уроков нет' : 'Каникулы — уроков нет')
    return lines.join('\n')
  }

  const lessons = day.slots.filter((s) => s.lesson)
  if (!lessons.length) {
    lines.push('Уроков нет')
    return lines.join('\n')
  }

  for (const slot of lessons) {
    const subject = subjectById(state, slot.lesson.subjectId)
    const parts = [
      `${slot.bell.index}. ${slot.lesson.start}–${slot.lesson.end}`,
      subject?.name ?? '—',
      slot.lesson.className,
      slot.lesson.room ? `каб. ${slot.lesson.room}` : '',
    ].filter(Boolean)
    lines.push(
      slot.source === 'cancelled' ? `${parts.join(' · ')} — отменён` : parts.join(' · '),
    )
    if (slot.lesson.topic && slot.source !== 'cancelled') {
      lines.push(`    тема: ${slot.lesson.topic}`)
    }
  }

  return lines.join('\n')
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.bells)) {
          throw new Error('Это не похоже на резервную копию расписания')
        }
        resolve(parsed)
      } catch (error) {
        reject(error)
      }
    }
    reader.readAsText(file)
  })
}
