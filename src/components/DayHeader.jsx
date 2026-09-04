import { WEEKDAYS_SHORT, formatDayMonth, formatDayNumber } from '../lib/datetime.js'
import { DAY_KINDS } from '../lib/schedule.js'
import Icon from './ui/Icon.jsx'

const KIND_ICON = { holiday: 'flag', vacation: 'palm', special: 'sparkle' }

export default function DayHeader({ day, isToday, onMenu, compact = false }) {
  const kind = DAY_KINDS[day.kind]
  const off = kind?.lessons === false
  const dateNumber = formatDayNumber(day.date)

  return (
    <div
      className={`relative flex items-center gap-2 border-b px-3 py-2.5 transition-colors ${
        isToday ? 'border-brand/35 bg-brand/8' : 'border-night-700/50'
      }`}
    >
      {isToday && <span className="absolute inset-x-0 top-0 h-0.5 bg-brand" />}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span
            data-print-text
            className={`text-[13px] font-semibold tracking-tight ${
              isToday ? 'text-brand' : 'text-night-100'
            }`}
          >
            {WEEKDAYS_SHORT[day.weekday - 1]}
          </span>
          <span
            data-print-muted
            className={`num text-[12px] ${isToday ? 'text-brand/80' : 'text-night-400'}`}
          >
            {compact ? dateNumber : formatDayMonth(day.date)}
          </span>
        </div>

        {off ? (
          <span
            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium"
            style={{ color: kind.color }}
          >
            <Icon name={KIND_ICON[day.kind]} size={11} />
            {day.dayLabel || kind.label}
          </span>
        ) : (
          <span data-print-muted className="num mt-0.5 block text-[11px] text-night-450">
            {day.lessonCount
              ? `${day.lessonCount} ${plural(day.lessonCount)}`
              : day.dayLabel || 'нет уроков'}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          const rect = event.currentTarget.getBoundingClientRect()
          onMenu?.(day, rect.right, rect.bottom + 4)
        }}
        aria-label={`Действия для ${formatDayMonth(day.date)}`}
        className="no-print -mr-1 rounded-md p-1 text-night-500 opacity-0 transition-all hover:bg-night-750 hover:text-night-100 focus-visible:opacity-100 group-hover/grid:opacity-100"
      >
        <Icon name="more" size={15} />
      </button>
    </div>
  )
}

function plural(n) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'урок'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'урока'
  return 'уроков'
}

export { plural }
