import { formatFull, formatWeekRange } from '../lib/datetime.js'

/** Шапка для бумаги: на экране скрыта, в печати даёт контекст листу. */
export default function PrintHeader({ state, view, anchor, weekStart, visibleDays }) {
  const period =
    view === 'day' ? formatFull(anchor) : view === 'template'
      ? 'Постоянное расписание'
      : formatWeekRange(weekStart, visibleDays)

  return (
    <div className="print-only mb-3 border-b border-[#c8ccd8] pb-2">
      <div className="flex items-baseline justify-between">
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#111' }}>
            Расписание уроков
          </div>
          {state.settings.teacherName && (
            <div style={{ fontSize: '12px', color: '#444' }}>{state.settings.teacherName}</div>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#444' }}>{period}</div>
      </div>
    </div>
  )
}
