/** Короткие идентификаторы. UUID из crypto, когда он есть, иначе запасной путь. */
export function uid(prefix = '') {
  const raw =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return prefix ? `${prefix}_${raw}` : raw
}
