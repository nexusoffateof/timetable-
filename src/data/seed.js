import { uid } from '../lib/id.js'
import { detectTimezone } from '../lib/datetime.js'

/**
 * Стартовое наполнение: звонки типовой российской школы и пример недели.
 * Всё это можно снести одной кнопкой в «Настройки → Данные».
 */

const BELL_TIMES = [
  ['08:30', '09:15'],
  ['09:25', '10:10'],
  ['10:25', '11:10'],
  ['11:25', '12:10'],
  ['12:25', '13:10'],
  ['13:20', '14:05'],
  ['14:15', '15:00'],
]

const SUBJECT_SEED = [
  ['Алгебра', 'АЛГ', '#7aa2f7', '212'],
  ['Геометрия', 'ГЕО', '#7dcfff', '212'],
  ['Информатика', 'ИНФ', '#9ece6a', '305'],
  ['Вероятность и статистика', 'ВИС', '#73daca', '212'],
  ['Классный час', 'КЧ', '#e0af68', '212'],
  ['Кружок «Алгоритмы»', 'КРЖ', '#bb9af7', '305'],
]

/** [день недели 1–5, номер звонка 1–7, индекс предмета, класс] */
const TEMPLATE_SEED = [
  [1, 1, 0, '8А'],
  [1, 2, 0, '9В'],
  [1, 3, 2, '7Б'],
  [1, 4, 1, '8А'],
  [1, 6, 4, '8А'],

  [2, 2, 2, '9В'],
  [2, 3, 0, '8А'],
  [2, 4, 3, '7Б'],
  [2, 5, 1, '9В'],

  [3, 1, 1, '8А'],
  [3, 2, 0, '7Б'],
  [3, 3, 2, '11А'],
  [3, 4, 0, '9В'],
  [3, 5, 2, '7Б'],
  [3, 7, 5, '9В'],

  [4, 2, 0, '8А'],
  [4, 3, 3, '9В'],
  [4, 4, 2, '11А'],
  [4, 5, 1, '7Б'],

  [5, 1, 2, '9В'],
  [5, 2, 0, '11А'],
  [5, 3, 0, '8А'],
  [5, 4, 1, '11А'],
]

export function createSeedState() {
  const bells = BELL_TIMES.map(([start, end], i) => ({
    id: uid(),
    index: i + 1,
    start,
    end,
  }))

  const subjects = SUBJECT_SEED.map(([name, short, color, room]) => ({
    id: uid(),
    name,
    short,
    color,
    room,
  }))

  const template = TEMPLATE_SEED.map(([weekday, bellIndex, subjectIndex, className]) => ({
    id: uid(),
    weekday,
    bellId: bells[bellIndex - 1].id,
    subjectId: subjects[subjectIndex].id,
    className,
    room: subjects[subjectIndex].room,
    note: '',
  }))

  return {
    version: 2,
    settings: {
      teacherName: '',
      timezone: detectTimezone(),
      visibleDays: 6,
      reminderLeadMinutes: 15,
      remindersEnabled: true,
      compactCells: false,
    },
    bells,
    subjects,
    template,
    overrides: [],
    days: [],
    updatedAt: new Date().toISOString(),
  }
}

export function createEmptyState() {
  const seed = createSeedState()
  return { ...seed, template: [], overrides: [], days: [] }
}
