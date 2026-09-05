/**
 * Перевод между документом приложения и строками базы.
 *
 * В приложении поля называются по-своему (`start`, `className`), в Postgres —
 * по-своему (`starts_at`, `class_name`). Всё преобразование собрано здесь,
 * чтобы разъехавшиеся названия ловились в одном файле, а не по всему коду.
 */

const nn = (v) => (v === undefined ? null : v)

/** Postgres отдаёт время как `08:30:00`, приложению нужно `08:30`. */
function hhmm(value) {
  if (!value) return null
  return String(value).slice(0, 5)
}

export const toRow = {
  bells: (b, userId) => ({
    id: b.id,
    user_id: userId,
    position: b.index,
    starts_at: b.start,
    ends_at: b.end,
  }),

  subjects: (s, userId) => ({
    id: s.id,
    user_id: userId,
    name: s.name,
    short: s.short ?? '',
    color: s.color,
    room: s.room ?? '',
  }),

  template_lessons: (t, userId) => ({
    id: t.id,
    user_id: userId,
    weekday: t.weekday,
    bell_id: t.bellId,
    subject_id: t.subjectId,
    class_name: t.className ?? '',
    room: t.room ?? '',
    note: t.note ?? '',
  }),

  lesson_overrides: (o, userId) => ({
    id: o.id,
    user_id: userId,
    on_date: o.date,
    bell_id: o.bellId,
    status: o.status ?? 'planned',
    subject_id: nn(o.subjectId),
    class_name: nn(o.className),
    room: nn(o.room),
    note: nn(o.note),
    topic: o.topic ?? '',
    starts_at: nn(o.start),
    ends_at: nn(o.end),
  }),

  day_marks: (d, userId) => ({
    user_id: userId,
    on_date: d.date,
    kind: d.kind,
    label: d.label ?? '',
  }),

  profiles: (settings, userId) => ({
    id: userId,
    teacher_name: settings.teacherName ?? '',
    timezone: settings.timezone,
    visible_days: settings.visibleDays,
    reminder_lead_minutes: settings.reminderLeadMinutes,
    reminders_enabled: settings.remindersEnabled,
  }),
}

export const fromRow = {
  bells: (r) => ({ id: r.id, index: r.position, start: hhmm(r.starts_at), end: hhmm(r.ends_at) }),

  subjects: (r) => ({
    id: r.id,
    name: r.name,
    short: r.short ?? '',
    color: r.color,
    room: r.room ?? '',
  }),

  template_lessons: (r) => ({
    id: r.id,
    weekday: r.weekday,
    bellId: r.bell_id,
    subjectId: r.subject_id,
    className: r.class_name ?? '',
    room: r.room ?? '',
    note: r.note ?? '',
  }),

  lesson_overrides: (r) => ({
    id: r.id,
    date: r.on_date,
    bellId: r.bell_id,
    status: r.status ?? 'planned',
    subjectId: r.subject_id,
    className: r.class_name,
    room: r.room,
    note: r.note,
    topic: r.topic ?? '',
    start: hhmm(r.starts_at),
    end: hhmm(r.ends_at),
  }),

  day_marks: (r) => ({ date: r.on_date, kind: r.kind, label: r.label ?? '' }),

  profiles: (r) => ({
    teacherName: r.teacher_name ?? '',
    timezone: r.timezone,
    visibleDays: r.visible_days,
    reminderLeadMinutes: r.reminder_lead_minutes,
    remindersEnabled: r.reminders_enabled,
  }),
}
