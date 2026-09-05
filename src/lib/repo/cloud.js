import { supabase } from '../supabase.js'
import { toRow, fromRow } from './mapping.js'
import { diffDoc } from './diff.js'
import { uid, isUuid } from '../id.js'
import { detectTimezone } from '../datetime.js'

/** Чтение и запись расписания в Supabase. */

const DEFAULT_SETTINGS = {
  teacherName: '',
  timezone: detectTimezone(),
  visibleDays: 6,
  reminderLeadMinutes: 15,
  remindersEnabled: true,
  compactCells: false,
}

/** Всё расписание пользователя одним заходом. */
export async function loadAll(userId) {
  const [profile, bells, subjects, template, overrides, days] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('bells').select('*').eq('user_id', userId).order('starts_at'),
    supabase.from('subjects').select('*').eq('user_id', userId).order('created_at'),
    supabase.from('template_lessons').select('*').eq('user_id', userId),
    supabase.from('lesson_overrides').select('*').eq('user_id', userId),
    supabase.from('day_marks').select('*').eq('user_id', userId),
  ])

  const failed = [profile, bells, subjects, template, overrides, days].find((r) => r.error)
  if (failed) throw failed.error

  return {
    version: 2,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(profile.data ? fromRow.profiles(profile.data) : {}),
      // Компактность сетки — вкус конкретного экрана, а не свойство учителя.
      // Держим её локально, в базу не гоняем.
      compactCells: readCompact(),
    },
    bells: (bells.data ?? []).map(fromRow.bells),
    subjects: (subjects.data ?? []).map(fromRow.subjects),
    template: (template.data ?? []).map(fromRow.template_lessons),
    overrides: (overrides.data ?? []).map(fromRow.lesson_overrides),
    days: (days.data ?? []).map(fromRow.day_marks),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Применение разницы.
 *
 * Порядок обязателен. Сначала удаления — иначе перенумерация звонков
 * упрётся в уникальный индекс (user_id, position), пока старая строка ещё
 * на месте. Потом записи, и внутри них звонки и предметы раньше уроков:
 * урок ссылается на них внешним ключом.
 */
export async function pushDiff(userId, prev, next) {
  const diff = diffDoc(prev, next)
  if (diff.empty) return { changed: false }

  const run = async (promise, what) => {
    const { error } = await promise
    if (error) throw new Error(`${what}: ${error.message}`)
  }

  const D = diff.deletes
  if (D.overrides.length)
    await run(supabase.from('lesson_overrides').delete().in('id', D.overrides), 'удаление замен')
  if (D.template.length)
    await run(supabase.from('template_lessons').delete().in('id', D.template), 'удаление шаблона')
  if (D.days.length)
    await run(
      supabase.from('day_marks').delete().eq('user_id', userId).in('on_date', D.days),
      'удаление отметок дней',
    )
  if (D.bells.length)
    await run(supabase.from('bells').delete().in('id', D.bells), 'удаление звонков')
  if (D.subjects.length)
    await run(supabase.from('subjects').delete().in('id', D.subjects), 'удаление предметов')

  const U = diff.upserts
  if (U.bells.length)
    await run(
      supabase.from('bells').upsert(U.bells.map((b) => toRow.bells(b, userId))),
      'сохранение звонков',
    )
  if (U.subjects.length)
    await run(
      supabase.from('subjects').upsert(U.subjects.map((s) => toRow.subjects(s, userId))),
      'сохранение предметов',
    )
  if (U.template.length)
    await run(
      supabase
        .from('template_lessons')
        .upsert(U.template.map((t) => toRow.template_lessons(t, userId))),
      'сохранение расписания',
    )
  if (U.overrides.length)
    await run(
      supabase
        .from('lesson_overrides')
        .upsert(U.overrides.map((o) => toRow.lesson_overrides(o, userId))),
      'сохранение изменений по датам',
    )
  if (U.days.length)
    await run(
      supabase
        .from('day_marks')
        .upsert(U.days.map((d) => toRow.day_marks(d, userId)), { onConflict: 'user_id,on_date' }),
      'сохранение отметок дней',
    )

  if (diff.settings)
    await run(
      supabase.from('profiles').upsert(toRow.profiles(diff.settings, userId)),
      'сохранение настроек',
    )

  return { changed: true }
}

/**
 * Перенос локального расписания в аккаунт при первом входе.
 *
 * Идентификаторы старого формата (`subj_…`) в колонки типа uuid не лягут,
 * поэтому вся ссылочная структура пересобирается на новых ключах.
 */
export function prepareLocalForCloud(doc) {
  const remap = new Map()
  const key = (id) => {
    if (!id) return id
    if (isUuid(id)) return id
    if (!remap.has(id)) remap.set(id, uid())
    return remap.get(id)
  }

  return {
    ...doc,
    bells: doc.bells.map((b) => ({ ...b, id: key(b.id) })),
    subjects: doc.subjects.map((s) => ({ ...s, id: key(s.id) })),
    template: doc.template.map((t) => ({
      ...t,
      id: key(t.id),
      bellId: key(t.bellId),
      subjectId: key(t.subjectId),
    })),
    overrides: doc.overrides.map((o) => ({
      ...o,
      id: key(o.id),
      bellId: key(o.bellId),
      subjectId: o.subjectId ? key(o.subjectId) : o.subjectId,
    })),
  }
}

export function isEmptyDoc(doc) {
  return (
    !doc.bells.length && !doc.subjects.length && !doc.template.length && !doc.overrides.length
  )
}

const COMPACT_KEY = 'timetable:compact'

export function readCompact() {
  try {
    return localStorage.getItem(COMPACT_KEY) === '1'
  } catch {
    return false
  }
}

export function writeCompact(value) {
  try {
    localStorage.setItem(COMPACT_KEY, value ? '1' : '0')
  } catch {
    /* приватный режим — переживём */
  }
}
