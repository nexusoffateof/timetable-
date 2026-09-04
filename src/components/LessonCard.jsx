import { useRef } from 'react'
import Icon from './ui/Icon.jsx'

/**
 * Ячейка урока.
 *
 * Держится на оттенке предмета и левой цветной полосе, а не на рамках:
 * в сетке 7×6 рамки складываются в решётку и читать её тяжело.
 */
export default function LessonCard({
  slot,
  subject,
  compact = false,
  showTime = false,
  onOpen,
  onMenu,
}) {
  const { lesson, source } = slot
  const timer = useRef(null)

  const cancelled = source === 'cancelled'
  const color = subject?.color ?? '#8b93bd'

  // Долгое нажатие на телефоне = правый клик на десктопе.
  const startPress = (event) => {
    const touch = event.touches?.[0]
    timer.current = setTimeout(() => {
      timer.current = null
      onMenu?.(slot, touch?.clientX ?? 0, touch?.clientY ?? 0)
      if (navigator.vibrate) navigator.vibrate(8)
    }, 480)
  }

  const endPress = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  return (
    <button
      type="button"
      onClick={() => onOpen?.(slot)}
      onContextMenu={(event) => {
        event.preventDefault()
        onMenu?.(slot, event.clientX, event.clientY)
      }}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchMove={endPress}
      style={{ '--subject': color }}
      className={`subject-tint print-break-avoid group/card relative flex h-full w-full flex-col gap-1 overflow-hidden rounded-[10px] px-2.5 text-left transition-[transform,border-color,background] duration-150 hover:-translate-y-px hover:shadow-[var(--shadow-lift)] ${
        compact ? 'py-1.5' : 'py-2'
      } ${cancelled ? 'opacity-45 saturate-50' : ''}`}
    >
      <div className="flex items-start gap-1.5">
        <span
          data-print-text
          className={`min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight tracking-tight text-night-50 ${
            cancelled ? 'line-through decoration-red/70' : ''
          }`}
          title={subject?.name}
        >
          {subject?.name ?? 'Без предмета'}
        </span>

        <span className="flex shrink-0 items-center gap-1 pt-px">
          {lesson.note && (
            <span title="Личная заметка к уроку" aria-label="есть заметка">
              <Icon name="note" size={12} className="text-night-300/80" />
            </span>
          )}
          {lesson.timeShifted && (
            <span
              title={`Время сдвинуто на этот день: ${lesson.start}–${lesson.end} вместо звонка`}
              aria-label="время изменено"
            >
              <Icon name="clock" size={12} className="text-orange" />
            </span>
          )}
          {cancelled && (
            <span title="Урок отменён в этот день" aria-label="отменён">
              <Icon name="ban" size={12} className="text-red" />
            </span>
          )}
          {/* Оранжевая точка = «в этот день не как обычно». Формулировка
              развёрнутая: короткое «изменён» читателю ничего не говорило. */}
          {!cancelled && source === 'override' && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-orange"
              aria-label="отличается от постоянного расписания"
              title={
                lesson.addedOnDate
                  ? 'Разовый урок: в постоянном расписании его нет, он стоит только в этот день'
                  : 'Замена: в этот день урок отличается от постоянного расписания'
              }
            />
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
        {lesson.className && (
          <span
            data-print-text
            className="num rounded-md bg-night-1000/45 px-1.5 py-px font-medium text-night-100"
          >
            {lesson.className}
          </span>
        )}
        {lesson.room && (
          <span data-print-muted className="num text-night-300">
            каб. {lesson.room}
          </span>
        )}
        {showTime && (
          <span data-print-muted className="num text-night-300">
            {lesson.start}–{lesson.end}
          </span>
        )}
      </div>

      {!compact && lesson.topic && (
        <p
          data-print-muted
          className="line-clamp-2 text-[11.5px] leading-snug text-night-300/90"
          title={lesson.topic}
        >
          {lesson.topic}
        </p>
      )}
    </button>
  )
}

/** Пустой слот. В покое почти невидим, проявляется при наведении. */
export function EmptySlot({ onClick, onPaste, hasClipboard, label = 'Добавить урок' }) {
  return (
    <div className="group/empty relative h-full w-full">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="flex h-full w-full items-center justify-center rounded-[10px] border border-dashed border-night-700/0 text-night-600 transition-all duration-150 hover:border-night-650 hover:bg-night-800/50 hover:text-night-300 focus-visible:border-night-650"
      >
        <Icon
          name="plus"
          size={16}
          className="opacity-0 transition-opacity duration-150 group-hover/empty:opacity-100 group-focus-within/empty:opacity-100"
        />
      </button>
      {hasClipboard && (
        <button
          type="button"
          onClick={onPaste}
          title="Вставить скопированный урок"
          className="absolute right-1 top-1 rounded-md bg-night-750 p-1 text-night-300 opacity-0 shadow-sm transition-opacity duration-150 hover:text-brand group-hover/empty:opacity-100 no-print"
        >
          <Icon name="copy" size={12} />
        </button>
      )}
    </div>
  )
}
