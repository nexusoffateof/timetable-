import { describe, it, expect } from 'vitest'
import { prepareLocalForCloud, isEmptyDoc } from './cloud.js'
import { isUuid } from '../id.js'

/**
 * Первый вход с уже заполненным локальным расписанием. Идентификаторы
 * старого формата (`subj_…`) в колонку uuid не лягут, поэтому вся ссылочная
 * структура пересобирается. Если пересборка разъедется — урок будет ссылаться
 * на звонок, которого нет, и внешний ключ отвергнет запись.
 */

const localDoc = () => ({
  settings: { teacherName: 'Марк', timezone: 'Europe/Minsk' },
  bells: [
    { id: 'bell_1', index: 1, start: '08:30', end: '09:15' },
    { id: 'bell_2', index: 2, start: '09:25', end: '10:10' },
  ],
  subjects: [
    { id: 'subj_1', name: 'Алгебра', short: 'АЛГ', color: '#7aa2f7', room: '212' },
  ],
  template: [
    { id: 'tpl_1', weekday: 1, bellId: 'bell_1', subjectId: 'subj_1', className: '8А' },
  ],
  overrides: [
    { id: 'ovr_1', date: '2026-09-21', bellId: 'bell_2', subjectId: 'subj_1', topic: 'Циклы' },
  ],
  days: [{ date: '2026-09-21', kind: 'normal', label: '' }],
})

describe('prepareLocalForCloud', () => {
  it('меняет идентификаторы старого формата на uuid', () => {
    const cloud = prepareLocalForCloud(localDoc())

    for (const row of [...cloud.bells, ...cloud.subjects, ...cloud.template, ...cloud.overrides]) {
      expect(isUuid(row.id)).toBe(true)
    }
  })

  it('ссылки урока ведут на те же звонок и предмет, что и до пересборки', () => {
    const cloud = prepareLocalForCloud(localDoc())

    const [firstBell, secondBell] = cloud.bells
    const [subject] = cloud.subjects

    expect(cloud.template[0].bellId).toBe(firstBell.id)
    expect(cloud.template[0].subjectId).toBe(subject.id)
    expect(cloud.overrides[0].bellId).toBe(secondBell.id)
    expect(cloud.overrides[0].subjectId).toBe(subject.id)
  })

  it('один и тот же старый идентификатор всегда даёт один и тот же новый', () => {
    const doc = localDoc()
    doc.overrides.push({ id: 'ovr_2', date: '2026-09-22', bellId: 'bell_1', subjectId: 'subj_1' })

    const cloud = prepareLocalForCloud(doc)

    expect(cloud.overrides[0].subjectId).toBe(cloud.overrides[1].subjectId)
    expect(cloud.overrides[1].bellId).toBe(cloud.bells[0].id)
  })

  it('идентификаторы, уже похожие на uuid, не трогает', () => {
    const doc = localDoc()
    doc.bells[0].id = '11111111-2222-4333-8444-555555555555'
    doc.template[0].bellId = '11111111-2222-4333-8444-555555555555'

    const cloud = prepareLocalForCloud(doc)

    expect(cloud.bells[0].id).toBe('11111111-2222-4333-8444-555555555555')
    expect(cloud.template[0].bellId).toBe('11111111-2222-4333-8444-555555555555')
  })

  it('отмена урока без предмета остаётся без предмета', () => {
    const doc = localDoc()
    doc.overrides[0].subjectId = null

    const cloud = prepareLocalForCloud(doc)

    expect(cloud.overrides[0].subjectId).toBeNull()
  })

  it('настройки и отметки дней переносятся как есть', () => {
    const cloud = prepareLocalForCloud(localDoc())

    expect(cloud.settings).toEqual({ teacherName: 'Марк', timezone: 'Europe/Minsk' })
    expect(cloud.days).toEqual([{ date: '2026-09-21', kind: 'normal', label: '' }])
  })
})

describe('isEmptyDoc', () => {
  it('аккаунт без единой строки считается пустым', () => {
    expect(isEmptyDoc({ bells: [], subjects: [], template: [], overrides: [] })).toBe(true)
  })

  it('один только звонок — уже не пустой', () => {
    expect(
      isEmptyDoc({ bells: [{ id: 'b1' }], subjects: [], template: [], overrides: [] }),
    ).toBe(false)
  })
})
