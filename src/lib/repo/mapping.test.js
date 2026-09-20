import { describe, it, expect } from 'vitest'
import { toRow, fromRow } from './mapping.js'

/**
 * Названия полей в приложении и в базе разные. Разъехаться они могут молча:
 * Postgres на лишнюю колонку ругается, а на пропущенную — нет, вместо неё
 * встанет default. Поэтому проверяем обе стороны перевода.
 */

const USER = '33634725-f203-4e14-aa61-8e396d252cdc'

describe('звонки', () => {
  it('index превращается в position, а время едет как есть', () => {
    const row = toRow.bells({ id: 'b1', index: 2, start: '09:25', end: '10:10' }, USER)

    expect(row).toEqual({
      id: 'b1',
      user_id: USER,
      position: 2,
      starts_at: '09:25',
      ends_at: '10:10',
    })
  })

  it('Postgres отдаёт время с секундами — в приложение они не проходят', () => {
    const value = fromRow.bells({ id: 'b1', position: 2, starts_at: '09:25:00', ends_at: '10:10:00' })

    expect(value).toEqual({ id: 'b1', index: 2, start: '09:25', end: '10:10' })
  })

  it('оборот туда-обратно не теряет полей', () => {
    const before = { id: 'b1', index: 1, start: '08:30', end: '09:15' }
    const after = fromRow.bells({ ...toRow.bells(before, USER), starts_at: '08:30:00', ends_at: '09:15:00' })

    expect(after).toEqual(before)
  })
})

describe('замены по датам', () => {
  it('date становится on_date, className — class_name', () => {
    const row = toRow.lesson_overrides(
      { id: 'o1', date: '2026-09-21', bellId: 'b1', subjectId: 's1', className: '8А', topic: 'Циклы' },
      USER,
    )

    expect(row.on_date).toBe('2026-09-21')
    expect(row.class_name).toBe('8А')
    expect(row.topic).toBe('Циклы')
    expect(row.status).toBe('planned')
  })

  it('«как в шаблоне» — это null, а не пустая строка', () => {
    const row = toRow.lesson_overrides({ id: 'o1', date: '2026-09-21', bellId: 'b1' }, USER)

    expect(row.class_name).toBeNull()
    expect(row.room).toBeNull()
    expect(row.subject_id).toBeNull()
    expect(row.starts_at).toBeNull()
  })

  it('своё время урока читается без секунд, отсутствие времени остаётся null', () => {
    const value = fromRow.lesson_overrides({
      id: 'o1',
      on_date: '2026-09-21',
      bell_id: 'b1',
      starts_at: '08:38:26',
      ends_at: null,
    })

    expect(value.start).toBe('08:38')
    expect(value.end).toBeNull()
  })
})

describe('профиль', () => {
  it('настройки ложатся в колонки профиля вместе с идентификатором пользователя', () => {
    const row = toRow.profiles(
      {
        teacherName: 'Марк',
        timezone: 'Europe/Minsk',
        visibleDays: 6,
        reminderLeadMinutes: 15,
        remindersEnabled: true,
        compactCells: true,
      },
      USER,
    )

    expect(row.id).toBe(USER)
    expect(row.teacher_name).toBe('Марк')
    expect(row.reminder_lead_minutes).toBe(15)
    // Компактность сетки — вкус экрана, в базе ей делать нечего.
    expect(row).not.toHaveProperty('compact_cells')
  })
})

describe('постоянное расписание', () => {
  it('bellId и subjectId едут в bell_id и subject_id', () => {
    const row = toRow.template_lessons(
      { id: 't1', weekday: 1, bellId: 'b1', subjectId: 's1', className: '8А', room: '212' },
      USER,
    )

    expect(row).toMatchObject({ weekday: 1, bell_id: 'b1', subject_id: 's1', class_name: '8А', room: '212' })
  })

  it('пустые необязательные поля читаются пустой строкой, а не undefined', () => {
    const value = fromRow.template_lessons({
      id: 't1',
      weekday: 1,
      bell_id: 'b1',
      subject_id: 's1',
      class_name: null,
      room: null,
      note: null,
    })

    expect(value.className).toBe('')
    expect(value.room).toBe('')
    expect(value.note).toBe('')
  })
})
