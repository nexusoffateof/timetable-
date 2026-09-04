import { timeToMinutes, formatDuration } from '../lib/datetime.js'
import { subjectById } from '../lib/schedule.js'
import { DAY_KINDS } from '../lib/schedule.js'
import LessonCard, { EmptySlot } from './LessonCard.jsx'
import DayHeader from './DayHeader.jsx'

/**
 * Недельная сетка.
 *
 * Одна CSS-grid на всё: заголовки, рельс со звонками и ячейки живут в общей
 * координатной сетке, поэтому колонки не разъезжаются при липких заголовках.
 */
export default function WeekGrid({
  state,
  days,
  bells,
  today,
  now,
  clipboard,
  compact,
  onOpenLesson,
  onQuickAdd,
  onLessonMenu,
  onDayMenu,
}) {
  const columns = `var(--rail) repeat(${days.length}, minmax(var(--cell-min), 1fr))`
  const isTodayVisible = days.some((d) => d.date === today)

  /**
   * Компактный режим — это не «чуть уже», а обещание уместить весь день
   * на экране. Поэтому строки не задаются минимальной высотой, а делят
   * доступную высоту поровну: сколько бы ни было звонков, прокрутки нет.
   */
  const rows = compact
    ? `auto repeat(${bells.length}, minmax(0, 1fr)) auto`
    : undefined

  return (
    <div
      className="panel group/grid overflow-hidden"
      style={{ '--rail': '78px', '--cell-min': compact ? '124px' : '158px' }}
    >
      <div
        className={`print-grid overflow-auto ${
          compact ? 'h-[calc(100dvh-8rem)]' : 'max-h-[calc(100dvh-13.5rem)]'
        }`}
      >
        <div
          className={`print-fit grid min-w-max ${compact ? 'h-full' : ''}`}
          style={{ gridTemplateColumns: columns, gridTemplateRows: rows }}
        >
          {/* Угол */}
          <div
            data-print-surface
            className="sticky left-0 top-0 z-30 border-b border-r border-night-700/50 bg-night-850/95 backdrop-blur-md"
          />

          {days.map((day) => (
            <div
              key={`h-${day.date}`}
              data-print-surface
              className="sticky top-0 z-20 bg-night-850/95 backdrop-blur-md"
            >
              <DayHeader
                day={day}
                isToday={day.date === today}
                onMenu={onDayMenu}
                compact={compact}
              />
            </div>
          ))}

          {/* Строки звонков */}
          {bells.map((bell) => {
            const start = timeToMinutes(bell.start)
            const end = timeToMinutes(bell.end)
            const live = isTodayVisible && now.minutes >= start && now.minutes < end

            return (
              <BellRow
                key={bell.id}
                bell={bell}
                live={live}
                days={days}
                state={state}
                today={today}
                compact={compact}
                clipboard={clipboard}
                onOpenLesson={onOpenLesson}
                onQuickAdd={onQuickAdd}
                onLessonMenu={onLessonMenu}
              />
            )
          })}

          {/* Итоги */}
          <div
            data-print-surface
            className="sticky bottom-0 left-0 z-30 border-r border-t border-night-700/50 bg-night-850/95 px-2.5 py-2 backdrop-blur-md"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-night-500">
              Итого
            </span>
          </div>
          {days.map((day) => (
            <div
              key={`f-${day.date}`}
              data-print-surface
              className={`sticky bottom-0 z-20 border-l border-t border-night-700/35 bg-night-850/95 px-3 py-2 backdrop-blur-md ${
                day.date === today ? 'bg-brand/6' : ''
              }`}
            >
              {day.teachingMinutes > 0 ? (
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span data-print-text className="num text-[12px] font-medium text-night-100">
                    {formatDuration(day.teachingMinutes)}
                  </span>
                  {day.windows > 0 && (
                    <span data-print-muted className="num text-[11px] text-yellow/80">
                      {day.windows} {day.windows === 1 ? 'окно' : 'окна'}
                    </span>
                  )}
                </div>
              ) : (
                <span data-print-muted className="text-[11px] text-night-600">—</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BellRow({
  bell,
  live,
  days,
  state,
  today,
  compact,
  clipboard,
  onOpenLesson,
  onQuickAdd,
  onLessonMenu,
}) {
  return (
    <>
      <div
        data-print-surface
        className={`sticky left-0 z-10 flex flex-col justify-center border-r border-t border-night-700/40 px-2.5 py-2 backdrop-blur-md transition-colors ${
          live ? 'bg-brand/10' : 'bg-night-850/95'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span
            data-print-text
            className={`num text-[13px] font-semibold ${live ? 'text-brand' : 'text-night-200'}`}
          >
            {bell.index}
          </span>
          {live && (
            <span className="relative flex h-1.5 w-1.5 no-print">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
            </span>
          )}
        </div>
        <span
          data-print-muted
          className={`num text-[10.5px] leading-tight ${live ? 'text-brand/75' : 'text-night-450'}`}
        >
          {bell.start}
          <br />
          {bell.end}
        </span>
      </div>

      {days.map((day) => {
        const slot = day.slots.find((s) => s.bell.id === bell.id)
        const kind = DAY_KINDS[day.kind]
        const off = kind?.lessons === false && !slot?.lesson
        const isToday = day.date === today

        return (
          <div
            key={`${bell.id}-${day.date}`}
            className={`relative overflow-hidden border-l border-t border-night-700/35 p-1 transition-colors ${
              compact ? 'min-h-0' : 'min-h-[78px]'
            } ${isToday ? 'bg-brand/6' : ''} ${live && isToday ? 'bg-brand/10' : ''}`}
          >
            {off ? (
              <div
                className="h-full w-full rounded-[10px] opacity-40"
                style={{
                  backgroundImage: `repeating-linear-gradient(135deg, ${kind.color}18 0 6px, transparent 6px 12px)`,
                }}
              />
            ) : slot?.lesson ? (
              <LessonCard
                slot={slot}
                subject={subjectById(state, slot.lesson.subjectId)}
                compact={compact}
                onOpen={onOpenLesson}
                onMenu={onLessonMenu}
              />
            ) : (
              <EmptySlot
                onClick={() => onQuickAdd(day.date, bell)}
                onPaste={() => clipboard.paste(day.date, bell)}
                hasClipboard={clipboard.has}
              />
            )}
          </div>
        )
      })}
    </>
  )
}
