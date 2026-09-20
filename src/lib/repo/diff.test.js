import { describe, it, expect } from 'vitest'
import { diffDoc } from './diff.js'

/**
 * Разница документов — единственное, что решает, какие строки уедут в базу.
 * Ошибка здесь не падает с исключением, а тихо теряет правку или стирает
 * чужую строку, поэтому проверяем её отдельно от всего остального.
 */

const doc = (over = {}) => ({
  settings: { teacherName: '', timezone: 'Europe/Minsk', visibleDays: 6 },
  bells: [],
  subjects: [],
  template: [],
  overrides: [],
  days: [],
  ...over,
})

const bell = (id, index, start, end) => ({ id, index, start, end })

describe('diffDoc', () => {
  it('на одинаковых документах не находит ничего', () => {
    const a = doc({ bells: [bell('b1', 1, '08:30', '09:15')] })
    const b = doc({ bells: [bell('b1', 1, '08:30', '09:15')] })

    expect(diffDoc(a, b).empty).toBe(true)
  })

  it('видит новую строку', () => {
    const next = doc({ bells: [bell('b1', 1, '08:30', '09:15')] })
    const result = diffDoc(doc(), next)

    expect(result.empty).toBe(false)
    expect(result.upserts.bells).toEqual([bell('b1', 1, '08:30', '09:15')])
    expect(result.deletes.bells).toEqual([])
  })

  it('видит правку существующей строки', () => {
    const prev = doc({ bells: [bell('b1', 1, '08:30', '09:15')] })
    const next = doc({ bells: [bell('b1', 1, '08:45', '09:30')] })
    const result = diffDoc(prev, next)

    expect(result.upserts.bells).toHaveLength(1)
    expect(result.upserts.bells[0].start).toBe('08:45')
    expect(result.deletes.bells).toEqual([])
  })

  it('видит удаление строки', () => {
    const prev = doc({ bells: [bell('b1', 1, '08:30', '09:15')] })
    const result = diffDoc(prev, doc())

    expect(result.deletes.bells).toEqual(['b1'])
    expect(result.upserts.bells).toEqual([])
  })

  it('не трогает строки, которые не менялись', () => {
    const prev = doc({
      bells: [bell('b1', 1, '08:30', '09:15'), bell('b2', 2, '09:25', '10:10')],
    })
    const next = doc({
      bells: [bell('b1', 1, '08:30', '09:15'), bell('b2', 2, '09:30', '10:15')],
    })
    const result = diffDoc(prev, next)

    expect(result.upserts.bells.map((b) => b.id)).toEqual(['b2'])
  })

  it('отметки дней опознаёт по дате, а не по идентификатору', () => {
    const prev = doc({ days: [{ date: '2026-09-21', kind: 'holiday', label: 'День знаний' }] })
    const next = doc({ days: [{ date: '2026-09-22', kind: 'vacation', label: '' }] })
    const result = diffDoc(prev, next)

    expect(result.deletes.days).toEqual(['2026-09-21'])
    expect(result.upserts.days).toEqual([{ date: '2026-09-22', kind: 'vacation', label: '' }])
  })

  it('замечает изменение настроек', () => {
    const next = doc({ settings: { teacherName: 'Марк', timezone: 'Europe/Minsk', visibleDays: 6 } })
    const result = diffDoc(doc(), next)

    expect(result.settings).toEqual(next.settings)
    expect(result.empty).toBe(false)
  })

  it('пустая база отсчёта означает «записать всё»', () => {
    const baseline = { settings: null, bells: [], subjects: [], template: [], overrides: [], days: [] }
    const next = doc({
      bells: [bell('b1', 1, '08:30', '09:15')],
      subjects: [{ id: 's1', name: 'Алгебра', short: 'АЛГ', color: '#7aa2f7', room: '212' }],
      template: [{ id: 't1', weekday: 1, bellId: 'b1', subjectId: 's1', className: '8А' }],
    })
    const result = diffDoc(baseline, next)

    expect(result.upserts.bells).toHaveLength(1)
    expect(result.upserts.subjects).toHaveLength(1)
    expect(result.upserts.template).toHaveLength(1)
    expect(result.settings).toEqual(next.settings)
  })

  it('переименование урока не приводит к удалению и повторной вставке', () => {
    const prev = doc({
      template: [{ id: 't1', weekday: 1, bellId: 'b1', subjectId: 's1', className: '8А' }],
    })
    const next = doc({
      template: [{ id: 't1', weekday: 1, bellId: 'b1', subjectId: 's1', className: '8Б' }],
    })
    const result = diffDoc(prev, next)

    expect(result.deletes.template).toEqual([])
    expect(result.upserts.template[0].className).toBe('8Б')
  })
})
