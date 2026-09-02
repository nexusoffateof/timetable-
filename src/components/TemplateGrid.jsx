import { WEEKDAYS_SHORT, WEEKDAYS_FULL } from '../lib/datetime.js'
import { subjectById } from '../lib/schedule.js'
import Icon from './ui/Icon.jsx'

/**
 * Постоянное расписание — второй уровень модели.
 *
 * Отдельный экран нужен, чтобы правка «по средам вместо алгебры геометрия»
 * не выглядела так же, как правка одного конкретного дня. Визуально режим
 * намеренно отличается: приглушённые цвета и явная плашка сверху.
 */
export default function TemplateGrid({
  state,
  bells,
  visibleDays,
  clipboard,
  onEdit,
  onMenu,
}) {
  const weekdays = Array.from({ length: visibleDays }, (_, i) => i + 1)
  const columns = `var(--rail) repeat(${weekdays.length}, minmax(var(--cell-min), 1fr))`

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-xl border border-magenta/25 bg-magenta/8 px-4 py-3">
        <Icon name="repeat" size={17} className="mt-0.5 text-magenta" />
        <div className="text-[13px] leading-relaxed text-night-200">
          <strong className="font-semibold text-night-50">Шаблон недели</strong> — постоянное
          расписание. Правка здесь меняет все недели сразу. Разовые замены, отмены и темы
          уроков делайте в режиме «Неделя»: они привязаны к датам и шаблон не трогают.
        </div>
      </div>

      <div
        className="panel group/grid overflow-hidden"
        style={{ '--rail': '78px', '--cell-min': '158px' }}
      >
        <div className="max-h-[calc(100dvh-17rem)] overflow-auto">
          <div className="print-fit grid min-w-max" style={{ gridTemplateColumns: columns }}>
            <div
              data-print-surface
              className="sticky left-0 top-0 z-30 border-b border-r border-night-700/50 bg-night-850/95 backdrop-blur-md"
            />

            {weekdays.map((weekday) => (
              <div
                key={`h-${weekday}`}
                data-print-surface
                className="sticky top-0 z-20 border-b border-night-700/50 bg-night-850/95 px-3 py-2.5 backdrop-blur-md"
              >
                <div className="text-[13px] font-semibold tracking-tight text-night-100">
                  <span className="sm:hidden">{WEEKDAYS_SHORT[weekday - 1]}</span>
                  <span className="hidden sm:inline">{WEEKDAYS_FULL[weekday - 1]}</span>
                </div>
                <div className="num text-[11px] text-night-450">
                  {countForWeekday(state, weekday)} в неделю
                </div>
              </div>
            ))}

            {bells.map((bell) => (
              <TemplateRow
                key={bell.id}
                bell={bell}
                weekdays={weekdays}
                state={state}
                clipboard={clipboard}
                onEdit={onEdit}
                onMenu={onMenu}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function countForWeekday(state, weekday) {
  return state.template.filter((t) => t.weekday === weekday && t.subjectId).length
}

function TemplateRow({ bell, weekdays, state, clipboard, onEdit, onMenu }) {
  return (
    <>
      <div
        data-print-surface
        className="sticky left-0 z-10 flex flex-col justify-center border-r border-t border-night-700/40 bg-night-850/95 px-2.5 py-2 backdrop-blur-md"
      >
        <span className="num text-[13px] font-semibold text-night-200">{bell.index}</span>
        <span className="num text-[10.5px] leading-tight text-night-450">
          {bell.start}
          <br />
          {bell.end}
        </span>
      </div>

      {weekdays.map((weekday) => {
        const tpl = state.template.find(
          (t) => t.weekday === weekday && t.bellId === bell.id && t.subjectId,
        )
        const subject = tpl ? subjectById(state, tpl.subjectId) : null

        return (
          <div
            key={`${bell.id}-${weekday}`}
            className="group/empty relative min-h-[70px] border-l border-t border-night-700/35 p-1"
          >
            {tpl && subject ? (
              <button
                type="button"
                onClick={() => onEdit(weekday, bell, tpl)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onMenu?.({ weekday, bell, tpl }, event.clientX, event.clientY)
                }}
                style={{ '--subject': subject.color }}
                className="subject-tint flex h-full w-full flex-col gap-1 rounded-[10px] px-2.5 py-2 text-left transition-transform duration-150 hover:-translate-y-px"
              >
                <span className="truncate text-[13px] font-semibold leading-tight text-night-50">
                  {subject.name}
                </span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-[11px]">
                  {tpl.className && (
                    <span className="num rounded-md bg-night-1000/45 px-1.5 py-px text-night-100">
                      {tpl.className}
                    </span>
                  )}
                  {tpl.room && <span className="num text-night-300">каб. {tpl.room}</span>}
                </span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(weekday, bell, null)}
                  aria-label="Добавить в постоянное расписание"
                  className="flex h-full w-full items-center justify-center rounded-[10px] border border-dashed border-night-700/0 text-night-600 transition-all duration-150 hover:border-night-650 hover:bg-night-800/50 hover:text-night-300"
                >
                  <Icon
                    name="plus"
                    size={16}
                    className="opacity-0 transition-opacity group-hover/empty:opacity-100"
                  />
                </button>
                {clipboard.has && (
                  <button
                    type="button"
                    onClick={() => clipboard.pasteTemplate(weekday, bell)}
                    title="Вставить скопированный урок"
                    className="absolute right-1 top-1 rounded-md bg-night-750 p-1 text-night-300 opacity-0 transition-opacity hover:text-brand group-hover/empty:opacity-100"
                  >
                    <Icon name="copy" size={12} />
                  </button>
                )}
              </>
            )}
          </div>
        )
      })}
    </>
  )
}
