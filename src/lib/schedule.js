/**
 * Два уровня расписания.
 *
 *   template  — постоянное расписание: «по понедельникам вторым уроком алгебра».
 *   overrides — что реально происходит в конкретную дату: тема урока, замена,
 *               отмена, перенос времени, разовое добавление.
 *   days      — характер дня целиком: каникулы, праздник, особый день.
 *
 * Экран всегда показывает результат наложения: template + override + day.
 * Правка одного дня не трогает шаблон, правка шаблона не стирает темы уроков.
 * Ради этого разделения всё и затевалось — см. CLAUDE.md, «Даты, а не
 * понедельник вообще».
 */

import { isoWeekday, timeToMinutes } from './datetime.js'

export const DAY_KINDS = {
  normal: { id: 'normal', label: 'Обычный день', color: null, lessons: true },
  holiday: { id: 'holiday', label: 'Праздник', color: '#f7768e', lessons: false },
  vacation: { id: 'vacation', label: 'Каникулы', color: '#7dcfff', lessons: false },
  special: { id: 'special', label: 'Особый день', color: '#e0af68', lessons: true },
}

/** Поля, которые override может переопределить у шаблонного урока. */
const OVERRIDABLE = ['subjectId', 'className', 'room', 'note', 'start', 'end']

const isSet = (v) => v !== null && v !== undefined && v !== ''

export function findDay(state, date) {
  return state.days.find((d) => d.date === date) ?? null
}

export function dayKindOf(state, date) {
  return findDay(state, date)?.kind ?? 'normal'
}

export function templateFor(state, weekday, bellId) {
  return (
    state.template.find((t) => t.weekday === weekday && t.bellId === bellId) ?? null
  )
}

export function overrideFor(state, date, bellId) {
  return (
    state.overrides.find((o) => o.date === date && o.bellId === bellId) ?? null
  )
}

/**
 * Одна ячейка сетки: звонок + то, что в нём стоит после наложения слоёв.
 *
 * source:
 *   'template' — как в постоянном расписании
 *   'override' — изменено на эту дату (замена, другое время, добавленный урок)
 *   'cancelled'— урок отменён именно в этот день
 *   'empty'    — окно
 */
export function resolveSlot(state, date, bell) {
  const weekday = isoWeekday(date)
  const kind = dayKindOf(state, date)
  const allowsTemplate = DAY_KINDS[kind]?.lessons !== false

  const tpl = allowsTemplate ? templateFor(state, weekday, bell.id) : null
  const ovr = overrideFor(state, date, bell.id)

  if (!tpl && !ovr) {
    return { bell, date, source: 'empty', lesson: null, template: null, override: null }
  }

  if (ovr?.status === 'cancelled') {
    return {
      bell,
      date,
      source: 'cancelled',
      lesson: tpl ? { ...tpl, topic: ovr.topic ?? '' } : null,
      template: tpl,
      override: ovr,
    }
  }

  const merged = {
    subjectId: tpl?.subjectId ?? null,
    className: tpl?.className ?? '',
    room: tpl?.room ?? '',
    note: tpl?.note ?? '',
    start: null,
    end: null,
    topic: '',
  }

  if (ovr) {
    for (const key of OVERRIDABLE) {
      if (isSet(ovr[key])) merged[key] = ovr[key]
    }
    merged.topic = ovr.topic ?? ''
  }

  if (!merged.subjectId) {
    return { bell, date, source: 'empty', lesson: null, template: tpl, override: ovr }
  }

  const changed =
    !!ovr && (!tpl || OVERRIDABLE.some((k) => isSet(ovr[k]) && ovr[k] !== tpl[k]))

  return {
    bell,
    date,
    source: changed ? 'override' : 'template',
    lesson: {
      ...merged,
      start: merged.start || bell.start,
      end: merged.end || bell.end,
      timeShifted: isSet(merged.start) || isSet(merged.end),
      addedOnDate: !tpl,
      templateId: tpl?.id ?? null,
      overrideId: ovr?.id ?? null,
    },
    template: tpl,
    override: ovr,
  }
}

/** Полный день: звонки в порядке следования + метаданные дня. */
export function resolveDay(state, date) {
  const bells = sortedBells(state)
  const slots = bells.map((bell) => resolveSlot(state, date, bell))
  const day = findDay(state, date)
  const kind = day?.kind ?? 'normal'

  const lessons = slots.filter((s) => s.lesson && s.source !== 'cancelled')
  const first = lessons[0]
  const last = lessons[lessons.length - 1]

  return {
    date,
    weekday: isoWeekday(date),
    kind,
    dayLabel: day?.label ?? '',
    slots,
    lessonCount: lessons.length,
    cancelledCount: slots.filter((s) => s.source === 'cancelled').length,
    teachingMinutes: lessons.reduce(
      (sum, s) =>
        sum + Math.max(0, timeToMinutes(s.lesson.end) - timeToMinutes(s.lesson.start)),
      0,
    ),
    /** Присутствие в школе — от первого звонка до последнего, включая окна. */
    spanMinutes:
      first && last
        ? Math.max(0, timeToMinutes(last.lesson.end) - timeToMinutes(first.lesson.start))
        : 0,
    firstStart: first?.lesson.start ?? null,
    lastEnd: last?.lesson.end ?? null,
    windows: countWindows(slots),
  }
}

export function resolveWeek(state, dates) {
  return dates.map((date) => resolveDay(state, date))
}

/** Окна: пустые звонки между первым и последним уроком дня. */
function countWindows(slots) {
  const filled = slots.map((s) => !!s.lesson && s.source !== 'cancelled')
  const first = filled.indexOf(true)
  const last = filled.lastIndexOf(true)
  if (first === -1) return 0
  let windows = 0
  for (let i = first; i <= last; i++) if (!filled[i]) windows++
  return windows
}

export function sortedBells(state) {
  return [...state.bells].sort(
    (a, b) => (timeToMinutes(a.start) ?? 0) - (timeToMinutes(b.start) ?? 0),
  )
}

export function subjectById(state, id) {
  return state.subjects.find((s) => s.id === id) ?? null
}

/** Шаблонный день — для режима постоянного расписания. */
export function resolveTemplateDay(state, weekday) {
  const bells = sortedBells(state)
  return {
    weekday,
    slots: bells.map((bell) => ({
      bell,
      weekday,
      template: templateFor(state, weekday, bell.id),
    })),
  }
}

/** Сколько раз предмет встречается в шаблоне и в датах — для удаления. */
export function subjectUsage(state, subjectId) {
  return {
    template: state.template.filter((t) => t.subjectId === subjectId).length,
    overrides: state.overrides.filter((o) => o.subjectId === subjectId).length,
  }
}

export function bellUsage(state, bellId) {
  return {
    template: state.template.filter((t) => t.bellId === bellId).length,
    overrides: state.overrides.filter((o) => o.bellId === bellId).length,
  }
}

/** Классы, встречавшиеся в расписании — для автодополнения. */
export function knownClasses(state) {
  const set = new Set()
  for (const t of state.template) if (t.className) set.add(t.className)
  for (const o of state.overrides) if (o.className) set.add(o.className)
  return [...set].sort((a, b) =>
    a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' }),
  )
}
