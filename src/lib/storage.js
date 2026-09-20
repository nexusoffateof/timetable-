/**
 * Локальное хранилище.
 *
 * Слой намеренно узкий — `load` / `save` / `clear`. Когда придёт Supabase,
 * меняется только он: редьюсер и компоненты про хранилище ничего не знают.
 * Подробности перехода — в docs/ROADMAP.md.
 */

const KEY = 'timetable:v2'
const LEGACY_KEYS = ['timetable:v1', 'teacher-schedule']
const MIGRATED_KEY = 'timetable:migrated'

export function load() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY) ?? readLegacy()
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return migrate(parsed)
  } catch (error) {
    console.warn('Не удалось прочитать сохранённое расписание:', error)
    return null
  }
}

function readLegacy() {
  for (const key of LEGACY_KEYS) {
    const raw = localStorage.getItem(key)
    if (raw) return raw
  }
  return null
}

let pending = null

/** Записи склеиваются: при быстром вводе не дёргаем localStorage на каждый символ. */
export function save(doc) {
  if (typeof localStorage === 'undefined') return
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(doc))
    } catch (error) {
      console.warn('Не удалось сохранить расписание:', error)
    }
  }, 250)
}

export function saveNow(doc) {
  if (typeof localStorage === 'undefined') return
  if (pending) clearTimeout(pending)
  try {
    localStorage.setItem(KEY, JSON.stringify(doc))
  } catch (error) {
    console.warn('Не удалось сохранить расписание:', error)
  }
}

export function clear() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(KEY)
  for (const key of LEGACY_KEYS) localStorage.removeItem(key)
}

/**
 * Отметка о переезде локального расписания в аккаунт.
 *
 * Снимок в localStorage принадлежит браузеру, а не пользователю. Без
 * отметки он переезжал бы в каждый новый пустой аккаунт подряд: первый
 * учитель заводит аккаунт и получает своё расписание, второй заводит
 * аккаунт на том же компьютере — и получает копию чужого.
 *
 * Снимок при этом не стираем. Переезд состоит из нескольких запросов,
 * и если часть из них не дойдёт, единственная целая копия расписания
 * останется здесь.
 */
export function migratedTo() {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(MIGRATED_KEY)
  } catch {
    return null
  }
}

export function markMigrated(userId) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(MIGRATED_KEY, userId)
  } catch {
    /* приватный режим — переживём */
  }
}

/** Приведение старых снимков к текущей форме. */
export function migrate(doc) {
  if (!doc || typeof doc !== 'object') return null

  const next = {
    version: 2,
    settings: {
      teacherName: '',
      timezone: 'Europe/Moscow',
      visibleDays: 6,
      reminderLeadMinutes: 15,
      remindersEnabled: true,
      compactCells: false,
      ...(doc.settings ?? {}),
    },
    bells: Array.isArray(doc.bells) ? doc.bells : [],
    subjects: Array.isArray(doc.subjects) ? doc.subjects : [],
    template: Array.isArray(doc.template) ? doc.template : [],
    overrides: Array.isArray(doc.overrides) ? doc.overrides : [],
    days: Array.isArray(doc.days) ? doc.days : [],
    updatedAt: doc.updatedAt ?? new Date().toISOString(),
  }

  // v1 хранил расписание одним массивом lessons с абстрактным днём недели.
  if (doc.version === 1 && Array.isArray(doc.lessons)) {
    next.template = doc.lessons.map((l) => ({
      id: l.id,
      weekday: l.weekday ?? l.day ?? 1,
      bellId: l.bellId,
      subjectId: l.subjectId,
      className: l.className ?? '',
      room: l.room ?? '',
      note: l.note ?? '',
    }))
  }

  next.bells = next.bells.map((b, i) => ({ index: i + 1, ...b }))
  return next
}
