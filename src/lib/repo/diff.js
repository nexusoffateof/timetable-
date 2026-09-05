/**
 * Разница между двумя состояниями расписания.
 *
 * Синхронизация построена на сравнении документов, а не на перехвате
 * действий: редьюсер сам придумывает идентификаторы внутри себя, и снаружи
 * их не видно. Сравнение работает при любом действии, включая «отменить»
 * и восстановление из копии, — их отдельно обрабатывать не пришлось бы.
 */

const KEYED = [
  ['bells', 'id'],
  ['subjects', 'id'],
  ['template', 'id'],
  ['overrides', 'id'],
]

const index = (rows, key) => new Map((rows ?? []).map((row) => [row[key], row]))

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Возвращает списки на удаление и на запись по каждой коллекции.
 * Порядок применения важен и задан в cloud.js: сначала удаления,
 * потом записи — иначе внешние ключи и уникальные индексы конфликтуют.
 */
export function diffDoc(prev, next) {
  const result = {
    deletes: { bells: [], subjects: [], template: [], overrides: [], days: [] },
    upserts: { bells: [], subjects: [], template: [], overrides: [], days: [] },
    settings: null,
    empty: true,
  }

  for (const [collection, key] of KEYED) {
    const before = index(prev?.[collection], key)
    const after = index(next?.[collection], key)

    for (const id of before.keys()) {
      if (!after.has(id)) result.deletes[collection].push(id)
    }
    for (const [id, row] of after) {
      if (!same(before.get(id), row)) result.upserts[collection].push(row)
    }
  }

  // Отметки дней опознаются по дате: собственного идентификатора у них нет.
  const beforeDays = index(prev?.days, 'date')
  const afterDays = index(next?.days, 'date')
  for (const date of beforeDays.keys()) {
    if (!afterDays.has(date)) result.deletes.days.push(date)
  }
  for (const [date, row] of afterDays) {
    if (!same(beforeDays.get(date), row)) result.upserts.days.push(row)
  }

  if (!same(prev?.settings, next?.settings)) result.settings = next.settings

  result.empty =
    !result.settings &&
    Object.values(result.deletes).every((list) => !list.length) &&
    Object.values(result.upserts).every((list) => !list.length)

  return result
}
