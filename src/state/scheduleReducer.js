import { uid } from '../lib/id.js'

/**
 * Редьюсер расписания.
 *
 * Каждое действие — это ровно одна операция над одной сущностью. Сделано так
 * специально: когда данные переедут в Supabase, действие превращается в один
 * запрос к соответствующей таблице, а логика экранов не меняется.
 *
 * История правок лежит рядом с документом (`past` / `future`), поэтому
 * «Отменить» работает для любого действия, а не только для удаления.
 */

const HISTORY_LIMIT = 40

export function initState(doc) {
  return { doc, past: [], future: [] }
}

/** Действия, которые не должны попадать в историю. */
const TRANSPARENT = new Set(['undo', 'redo', 'replace'])

export function reducer(state, action) {
  if (action.type === 'undo') {
    if (!state.past.length) return state
    const previous = state.past[state.past.length - 1]
    return {
      doc: previous,
      past: state.past.slice(0, -1),
      future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
    }
  }

  if (action.type === 'redo') {
    if (!state.future.length) return state
    const [next, ...rest] = state.future
    return {
      doc: next,
      past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
      future: rest,
    }
  }

  // Загрузка из облака — не действие пользователя: в историю отмен
  // она попадать не должна, иначе Ctrl+Z вернёт пустое состояние.
  if (action.type === 'hydrate') {
    return { doc: action.doc, past: [], future: [] }
  }

  if (action.type === 'replace') {
    return {
      doc: stamp(action.doc),
      past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
      future: [],
    }
  }

  const doc = applyToDoc(state.doc, action)
  if (doc === state.doc) return state

  return TRANSPARENT.has(action.type)
    ? { ...state, doc }
    : {
        doc: stamp(doc),
        past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: [],
      }
}

const stamp = (doc) => ({ ...doc, updatedAt: new Date().toISOString() })

function applyToDoc(doc, action) {
  switch (action.type) {
    /* ── Настройки ──────────────────────────────────────────────────────── */
    case 'settings/update':
      return { ...doc, settings: { ...doc.settings, ...action.patch } }

    /* ── Предметы ───────────────────────────────────────────────────────── */
    case 'subject/add': {
      const subject = { id: uid(), short: '', room: '', ...action.subject }
      return { ...doc, subjects: [...doc.subjects, subject] }
    }

    case 'subject/update':
      return {
        ...doc,
        subjects: doc.subjects.map((s) =>
          s.id === action.id ? { ...s, ...action.patch } : s,
        ),
      }

    /** Удаление предмета вычищает все уроки с ним — иначе останутся сироты. */
    case 'subject/remove':
      return {
        ...doc,
        subjects: doc.subjects.filter((s) => s.id !== action.id),
        template: doc.template.filter((t) => t.subjectId !== action.id),
        overrides: doc.overrides
          .map((o) => (o.subjectId === action.id ? { ...o, subjectId: null } : o))
          .filter((o) => !isEmptyOverride(o)),
      }

    /* ── Звонки ─────────────────────────────────────────────────────────── */
    case 'bell/add': {
      const bell = { id: uid(), index: doc.bells.length + 1, ...action.bell }
      return { ...doc, bells: reindex([...doc.bells, bell]) }
    }

    case 'bell/update':
      return {
        ...doc,
        bells: doc.bells.map((b) => (b.id === action.id ? { ...b, ...action.patch } : b)),
      }

    case 'bell/remove':
      return {
        ...doc,
        bells: reindex(doc.bells.filter((b) => b.id !== action.id)),
        template: doc.template.filter((t) => t.bellId !== action.id),
        overrides: doc.overrides.filter((o) => o.bellId !== action.id),
      }

    /* ── Постоянное расписание ──────────────────────────────────────────── */
    case 'template/upsert': {
      const { weekday, bellId, patch } = action
      const existing = doc.template.find(
        (t) => t.weekday === weekday && t.bellId === bellId,
      )
      if (existing) {
        return {
          ...doc,
          template: doc.template.map((t) => (t.id === existing.id ? { ...t, ...patch } : t)),
        }
      }
      return {
        ...doc,
        template: [
          ...doc.template,
          {
            id: uid(),
            weekday,
            bellId,
            subjectId: null,
            className: '',
            room: '',
            note: '',
            ...patch,
          },
        ],
      }
    }

    case 'template/remove':
      return {
        ...doc,
        template: doc.template.filter(
          (t) => !(t.weekday === action.weekday && t.bellId === action.bellId),
        ),
      }

    case 'template/clear':
      return { ...doc, template: [] }

    /* ── Конкретные даты ────────────────────────────────────────────────── */
    case 'override/upsert': {
      const { date, bellId, patch } = action
      const existing = doc.overrides.find((o) => o.date === date && o.bellId === bellId)
      const next = existing
        ? { ...existing, ...patch }
        : {
            id: uid(),
            date,
            bellId,
            status: 'planned',
            subjectId: null,
            className: null,
            room: null,
            note: null,
            topic: '',
            start: null,
            end: null,
            ...patch,
          }

      // Пустой override — это отсутствие изменений, хранить его незачем.
      if (isEmptyOverride(next)) {
        return existing
          ? { ...doc, overrides: doc.overrides.filter((o) => o.id !== existing.id) }
          : doc
      }

      return {
        ...doc,
        overrides: existing
          ? doc.overrides.map((o) => (o.id === existing.id ? next : o))
          : [...doc.overrides, next],
      }
    }

    case 'override/remove':
      return {
        ...doc,
        overrides: doc.overrides.filter(
          (o) => !(o.date === action.date && o.bellId === action.bellId),
        ),
      }

    /** Отмена урока в конкретный день: шаблон остаётся нетронутым. */
    case 'override/cancel':
      return applyToDoc(doc, {
        type: 'override/upsert',
        date: action.date,
        bellId: action.bellId,
        patch: { status: 'cancelled' },
      })

    case 'override/restore':
      return applyToDoc(doc, {
        type: 'override/upsert',
        date: action.date,
        bellId: action.bellId,
        patch: { status: 'planned' },
      })

    /* ── Характер дня ───────────────────────────────────────────────────── */
    case 'day/set': {
      const { date, kind, label = '' } = action
      const rest = doc.days.filter((d) => d.date !== date)
      if (kind === 'normal' && !label) return { ...doc, days: rest }
      return { ...doc, days: [...rest, { date, kind, label }] }
    }

    /** Диапазон каникул одним действием. */
    case 'day/setRange': {
      const rest = doc.days.filter((d) => !action.dates.includes(d.date))
      if (action.kind === 'normal') return { ...doc, days: rest }
      return {
        ...doc,
        days: [
          ...rest,
          ...action.dates.map((date) => ({ date, kind: action.kind, label: action.label ?? '' })),
        ],
      }
    }

    /* ── Данные целиком ─────────────────────────────────────────────────── */
    case 'data/reset':
      return action.doc

    default:
      return doc
  }
}

/** Override без единого отличия от шаблона хранить не нужно. */
function isEmptyOverride(o) {
  if (!o) return true
  if (o.status === 'cancelled') return false
  const hasDiff = ['subjectId', 'className', 'room', 'note', 'start', 'end'].some(
    (k) => o[k] !== null && o[k] !== undefined && o[k] !== '',
  )
  return !hasDiff && !o.topic
}

function reindex(bells) {
  return bells.map((b, i) => ({ ...b, index: i + 1 }))
}
