/**
 * Идентификаторы — чистые UUID, без префиксов.
 *
 * Раньше здесь был человекочитаемый префикс вида `subj_…`. В Postgres
 * первичные ключи имеют тип uuid, и такая строка в него не ложится:
 * префикс пришлось бы срезать при каждой записи и возвращать при чтении.
 * Дешевле не заводить его вовсе.
 */
export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()

  // Запасной путь для окружений без crypto.randomUUID.
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** UUID ли это. Локальные данные старого формата содержат префиксы. */
export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value ?? '')
}
