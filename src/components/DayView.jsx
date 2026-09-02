import {
  WEEKDAYS_SHORT,
  formatDayMonth,
  formatDuration,
  formatFull,
  relativeMinutes,
  timeToMinutes,
} from '../lib/datetime.js'
import { DAY_KINDS, subjectById } from '../lib/schedule.js'
import LessonCard from './LessonCard.jsx'
import Icon from './ui/Icon.jsx'
import Button from './ui/Button.jsx'
import { plural } from './DayHeader.jsx'

/**
 * День списком: основной режим на телефоне и самый честный ответ на вопрос
 * «что сегодня». Окна между уроками показаны явно — для учителя это
 * ощутимая часть дня, а не пустое место.
 */
export default function DayView({
  state,
  day,
  today,
  now,
  clipboard,
  onOpenLesson,
  onQuickAdd,
  onLessonMenu,
  onDayMenu,
}) {
  const isToday = day.date === today
  const kind = DAY_KINDS[day.kind]
  const off = kind?.lessons === false

  const filled = day.slots.map((s) => !!s.lesson)
  const firstIndex = filled.indexOf(true)
  const lastIndex = filled.lastIndexOf(true)

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <header className="panel flex items-start gap-3 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2
              data-print-text
              className="text-[15px] font-semibold tracking-tight text-night-50"
            >
              <span className="sm:hidden">
                {WEEKDAYS_SHORT[day.weekday - 1]}, {formatDayMonth(day.date)}
              </span>
              <span className="hidden sm:inline">{formatFull(day.date)}</span>
            </h2>
            {isToday && (
              <span className="rounded-md bg-brand/15 px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                сегодня
              </span>
            )}
          </div>

          {off ? (
            <p className="mt-1 flex items-center gap-1.5 text-[13px]" style={{ color: kind.color }}>
              <Icon name={day.kind === 'holiday' ? 'flag' : 'palm'} size={13} />
              {day.dayLabel || kind.label}
            </p>
          ) : (
            <p data-print-muted className="num mt-1 text-[12.5px] leading-relaxed text-night-400">
              {day.lessonCount} {plural(day.lessonCount)}
              {day.teachingMinutes > 0 && ` · ${formatDuration(day.teachingMinutes)} у доски`}
              {day.firstStart && ` · ${day.firstStart}–${day.lastEnd}`}
              {day.windows > 0 && ` · ${day.windows} ${day.windows === 1 ? 'окно' : 'окна'}`}
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          icon="more"
          aria-label="Действия дня"
          className="no-print -mr-1"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            onDayMenu?.(day, rect.right, rect.bottom + 4)
          }}
        />
      </header>

      <div className="panel divide-y divide-night-700/40 overflow-hidden">
        {day.slots.map((slot, index) => {
          const start = timeToMinutes(slot.lesson?.start ?? slot.bell.start)
          const end = timeToMinutes(slot.lesson?.end ?? slot.bell.end)
          const live = isToday && now.minutes >= start && now.minutes < end
          const upcoming = isToday && now.minutes < start && slot.lesson
          const inside = index > firstIndex && index < lastIndex

          if (!slot.lesson && off) return null

          return (
            <div
              key={slot.bell.id}
              className={`flex gap-2.5 px-3 transition-colors ${
                slot.lesson ? 'py-2.5' : 'py-1.5'
              } ${live ? 'bg-brand/8' : ''}`}
            >
              <span
                className={`num mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${
                  live
                    ? 'bg-brand text-night-1000'
                    : slot.lesson
                      ? 'bg-night-750 text-night-300'
                      : 'text-night-600'
                }`}
              >
                {slot.bell.index}
              </span>

              <div className={`w-11 shrink-0 ${slot.lesson ? 'mt-0.5' : 'mt-1'}`}>
                <div
                  data-print-text
                  className={`num text-[12.5px] font-semibold leading-tight ${
                    live ? 'text-brand' : slot.lesson ? 'text-night-200' : 'text-night-500'
                  }`}
                >
                  {slot.lesson?.start ?? slot.bell.start}
                </div>
                {slot.lesson && (
                  <div data-print-muted className="num text-[11px] leading-tight text-night-450">
                    {slot.lesson.end}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                {slot.lesson ? (
                  <div className="space-y-1">
                    <LessonCard
                      slot={slot}
                      subject={subjectById(state, slot.lesson.subjectId)}
                      showTime={false}
                      onOpen={onOpenLesson}
                      onMenu={onLessonMenu}
                    />
                    {live && <LiveBar start={start} end={end} nowMinutes={now.minutes} />}
                    {upcoming && now.minutes > start - 90 && (
                      <p className="num px-1 text-[11px] text-brand/80 no-print">
                        {relativeMinutes(start - now.minutes)}
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onQuickAdd(day.date, slot.bell)}
                    className={`no-print flex h-8 w-full items-center gap-2 rounded-lg border border-dashed px-2.5 text-[12px] transition-colors ${
                      inside
                        ? 'border-night-700/70 text-night-500 hover:border-night-600 hover:text-night-300'
                        : 'border-transparent text-night-600 hover:border-night-700 hover:bg-night-800/40 hover:text-night-300'
                    }`}
                  >
                    <Icon name={inside ? 'clock' : 'plus'} size={13} />
                    {inside ? 'окно' : 'добавить'}
                    {clipboard.has && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation()
                          clipboard.paste(day.date, slot.bell)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.stopPropagation()
                            clipboard.paste(day.date, slot.bell)
                          }
                        }}
                        className="ml-auto rounded-md px-2 py-0.5 text-[11px] text-brand hover:bg-brand/12"
                      >
                        вставить
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {off && (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] text-night-400">
              {kind.label}. Уроков из постоянного расписания в этот день нет.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function LiveBar({ start, end, nowMinutes }) {
  const progress = Math.min(100, Math.max(0, ((nowMinutes - start) / (end - start)) * 100))
  return (
    <div className="flex items-center gap-2 px-1 no-print">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-night-750">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="num text-[10.5px] text-brand/80">
        {relativeMinutes(end - nowMinutes)} до конца
      </span>
    </div>
  )
}
