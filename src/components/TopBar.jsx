import { formatWeekRange, formatDayMonth } from '../lib/datetime.js'
import Button from './ui/Button.jsx'
import Icon from './ui/Icon.jsx'
import Segmented from './ui/Segmented.jsx'

const VIEWS = [
  { value: 'week', label: 'Неделя', icon: 'week' },
  { value: 'day', label: 'День', icon: 'day' },
  { value: 'template', label: 'Шаблон', icon: 'repeat', title: 'Постоянное расписание' },
]

export default function TopBar({
  view,
  onViewChange,
  anchor,
  weekStart,
  visibleDays,
  onStep,
  onToday,
  isCurrentPeriod,
  canUndo,
  onUndo,
  onPrint,
  onExport,
  onSettings,
}) {
  const label =
    view === 'day'
      ? formatDayMonth(anchor)
      : view === 'template'
        ? 'Шаблон недели'
        : formatWeekRange(weekStart, visibleDays)

  return (
    <header className="no-print sticky top-0 z-40 border-b border-night-700/50 bg-night-1000/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2.5 px-3 py-2.5 sm:px-5 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand/15 text-brand">
              <Icon name="calendar" size={17} />
            </span>
            <div className="text-[14px] font-semibold tracking-tight text-night-50">
              Расписание
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1 lg:hidden">
            <ActionButtons
              canUndo={canUndo}
              onUndo={onUndo}
              onPrint={onPrint}
              onExport={onExport}
              onSettings={onSettings}
            />
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Segmented value={view} onChange={onViewChange} options={VIEWS} />

          {view !== 'template' && (
            <div className="flex items-center gap-1">
              {/* Метки по смыслу, а не «Назад/Вперёд»: на странице есть другие
                  кнопки возврата, и для скринридера это была путаница. */}
              <Button
                variant="ghost"
                size="icon"
                icon="chevronLeft"
                aria-label={view === 'day' ? 'Предыдущий день' : 'Предыдущая неделя'}
                onClick={() => onStep(-1)}
              />
              <Button
                variant="ghost"
                size="icon"
                icon="chevronRight"
                aria-label={view === 'day' ? 'Следующий день' : 'Следующая неделя'}
                onClick={() => onStep(1)}
              />
              <span className="ml-1 min-w-0 truncate text-[13.5px] font-medium text-night-100">
                {label}
              </span>
              {!isCurrentPeriod && (
                <Button variant="quiet" size="sm" className="ml-1" onClick={onToday}>
                  Сегодня
                </Button>
              )}
            </div>
          )}

          {view === 'template' && (
            <span className="text-[13.5px] font-medium text-night-100">{label}</span>
          )}

          <div className="ml-auto hidden items-center gap-1 lg:flex">
            <ActionButtons
              canUndo={canUndo}
              onUndo={onUndo}
              onPrint={onPrint}
              onExport={onExport}
              onSettings={onSettings}
            />
          </div>
        </div>
      </div>
    </header>
  )
}

function ActionButtons({ canUndo, onUndo, onPrint, onExport, onSettings }) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        icon="undo"
        aria-label="Отменить последнее действие"
        title="Отменить (Ctrl+Z)"
        disabled={!canUndo}
        onClick={onUndo}
      />
      <Button
        variant="ghost"
        size="icon"
        icon="printer"
        aria-label="Печать"
        title="Печать (Ctrl+P)"
        onClick={onPrint}
      />
      <Button
        variant="ghost"
        size="icon"
        icon="download"
        aria-label="Экспорт"
        title="Экспорт"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          onExport(rect.right, rect.bottom + 6)
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        icon="settings"
        aria-label="Настройки"
        title="Настройки"
        onClick={onSettings}
      />
    </>
  )
}
