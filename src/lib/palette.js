/** Палитра предметов: акценты Tokyo Night, отобранные по различимости. */
export const SUBJECT_COLORS = [
  { id: 'blue', value: '#7aa2f7', label: 'Синий' },
  { id: 'cyan', value: '#7dcfff', label: 'Голубой' },
  { id: 'teal', value: '#73daca', label: 'Бирюзовый' },
  { id: 'green', value: '#9ece6a', label: 'Зелёный' },
  { id: 'yellow', value: '#e0af68', label: 'Жёлтый' },
  { id: 'orange', value: '#ff9e64', label: 'Оранжевый' },
  { id: 'red', value: '#f7768e', label: 'Красный' },
  { id: 'magenta', value: '#bb9af7', label: 'Сиреневый' },
  { id: 'purple', value: '#9d7cd8', label: 'Фиолетовый' },
  { id: 'slate', value: '#8b93bd', label: 'Серый' },
]

export const DEFAULT_SUBJECT_COLOR = SUBJECT_COLORS[0].value

/** Следующий наименее занятый цвет — чтобы новые предметы не сливались. */
export function nextColor(subjects) {
  const used = new Map(SUBJECT_COLORS.map((c) => [c.value, 0]))
  for (const s of subjects) used.set(s.color, (used.get(s.color) ?? 0) + 1)
  let best = SUBJECT_COLORS[0].value
  let bestCount = Infinity
  for (const c of SUBJECT_COLORS) {
    const count = used.get(c.value) ?? 0
    if (count < bestCount) {
      bestCount = count
      best = c.value
    }
  }
  return best
}

/** Инициалы предмета для компактных режимов: «Русский язык» → «РЯ». */
export function initials(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '—'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
