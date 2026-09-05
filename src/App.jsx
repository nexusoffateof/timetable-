import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSchedule, useToasts } from './state/ScheduleContext.jsx'
import { useAuth } from './state/AuthContext.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import {
  addDaysISO,
  formatDayMonth,
  isoWeekday,
  startOfWeekISO,
  todayISO,
  weekDates,
} from './lib/datetime.js'
import { DAY_KINDS, resolveDay, sortedBells, subjectById } from './lib/schedule.js'
import { dayAsText, exportCSV, exportICS, exportJSON } from './lib/export.js'
import { useNow } from './lib/useNow.js'

import TopBar from './components/TopBar.jsx'
import WeekGrid from './components/WeekGrid.jsx'
import DayView from './components/DayView.jsx'
import TemplateGrid from './components/TemplateGrid.jsx'
import LessonDialog from './components/LessonDialog.jsx'
import SettingsDrawer from './components/SettingsDrawer.jsx'
import PopMenu from './components/ui/PopMenu.jsx'
import ConfirmDialog from './components/ui/ConfirmDialog.jsx'
import Toasts from './components/ui/Toasts.jsx'
import PrintHeader from './components/PrintHeader.jsx'
import EmptyState from './components/EmptyState.jsx'
import ChatWidget from './components/chat/ChatWidget.jsx'
import Icon from './components/ui/Icon.jsx'

export default function App() {
  const auth = useAuth()
  const { state, dispatch, dispatchWithUndo, undo, redo, canUndo, ready, syncError } =
    useSchedule()
  const { toast } = useToasts()
  const now = useNow()

  const [view, setView] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
      ? 'day'
      : 'week',
  )
  const [anchor, setAnchor] = useState(() => todayISO())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [menu, setMenu] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [clipboardLesson, setClipboardLesson] = useState(null)

  const bells = useMemo(() => sortedBells(state), [state])
  const visibleDays = state.settings.visibleDays ?? 6
  const weekStart = useMemo(() => startOfWeekISO(anchor), [anchor])
  const dates = useMemo(() => weekDates(weekStart, visibleDays), [weekStart, visibleDays])
  const days = useMemo(() => dates.map((date) => resolveDay(state, date)), [state, dates])
  const day = useMemo(() => resolveDay(state, anchor), [state, anchor])

  const today = now.date
  const isCurrentPeriod =
    view === 'day' ? anchor === today : weekStart === startOfWeekISO(today)

  /* ── Навигация ───────────────────────────────────────────────────────── */

  const step = useCallback(
    (direction) => {
      setAnchor((current) => addDaysISO(current, direction * (view === 'day' ? 1 : 7)))
    },
    [view],
  )

  const goToday = useCallback(() => setAnchor(todayISO()), [])

  /* ── Буфер обмена уроков ─────────────────────────────────────────────── */

  const clipboard = useMemo(
    () => ({
      has: Boolean(clipboardLesson),
      copy: (lesson, subjectName) => {
        setClipboardLesson(lesson)
        toast({ message: `Скопировано: ${subjectName ?? 'урок'}` })
      },
      paste: (date, bell) => {
        if (!clipboardLesson) return
        dispatch({
          type: 'override/upsert',
          date,
          bellId: bell.id,
          patch: {
            status: 'planned',
            subjectId: clipboardLesson.subjectId,
            className: clipboardLesson.className || null,
            room: clipboardLesson.room || null,
            note: clipboardLesson.note || null,
            topic: '',
          },
        })
      },
      pasteTemplate: (weekday, bell) => {
        if (!clipboardLesson) return
        dispatch({
          type: 'template/upsert',
          weekday,
          bellId: bell.id,
          patch: {
            subjectId: clipboardLesson.subjectId,
            className: clipboardLesson.className ?? '',
            room: clipboardLesson.room ?? '',
            note: clipboardLesson.note ?? '',
          },
        })
      },
      clear: () => setClipboardLesson(null),
    }),
    [clipboardLesson, dispatch, toast],
  )

  /* ── Диалог урока ────────────────────────────────────────────────────── */

  const openLesson = useCallback((slot) => {
    setDialog({
      mode: 'date',
      date: slot.date,
      weekday: isoWeekday(slot.date),
      bell: slot.bell,
      slot,
    })
  }, [])

  const quickAdd = useCallback((date, bell) => {
    setDialog({
      mode: 'date',
      date,
      weekday: isoWeekday(date),
      bell,
      slot: null,
    })
  }, [])

  const openTemplate = useCallback((weekday, bell, tpl) => {
    setDialog({ mode: 'template', weekday, bell, tpl })
  }, [])

  const deleteFromDialog = useCallback(
    (context) => {
      setDialog(null)
      if (context.mode === 'template') {
        dispatchWithUndo(
          { type: 'template/remove', weekday: context.weekday, bellId: context.bell.id },
          'Урок убран из постоянного расписания',
        )
        return
      }

      const slot = context.slot
      if (slot?.template) {
        setConfirm({
          title: 'Что удалить?',
          description:
            'Урок стоит в постоянном расписании. Уберите его только из этого дня — или из расписания целиком.',
          confirmLabel: 'Убрать из расписания',
          details: [`Постоянное расписание: каждый ${weekdayGenitive(context.weekday)}`],
          onConfirm: () =>
            dispatchWithUndo(
              { type: 'template/remove', weekday: context.weekday, bellId: context.bell.id },
              'Урок убран из постоянного расписания',
            ),
          onSecondary: () =>
            dispatchWithUndo(
              { type: 'override/cancel', date: context.date, bellId: context.bell.id },
              `Урок отменён ${formatDayMonth(context.date)}`,
            ),
          secondaryLabel: 'Только в этот день',
        })
      } else {
        dispatchWithUndo(
          { type: 'override/remove', date: context.date, bellId: context.bell.id },
          'Урок удалён',
        )
      }
    },
    [dispatchWithUndo],
  )

  /* ── Контекстные меню ────────────────────────────────────────────────── */

  const lessonMenu = useCallback(
    (slot, x, y) => {
      const subject = subjectById(state, slot.lesson?.subjectId)
      const cancelled = slot.source === 'cancelled'

      setMenu({
        x,
        y,
        header: subject?.name ?? 'Урок',
        items: [
          { label: 'Изменить…', icon: 'pencil', onClick: () => openLesson(slot) },
          {
            label: 'Копировать',
            icon: 'copy',
            onClick: () => clipboard.copy(slot.lesson, subject?.name),
          },
          { separator: true },
          cancelled
            ? {
                label: 'Вернуть урок',
                icon: 'rotate',
                onClick: () =>
                  dispatch({ type: 'override/restore', date: slot.date, bellId: slot.bell.id }),
              }
            : {
                label: 'Отменить в этот день',
                icon: 'ban',
                onClick: () =>
                  dispatchWithUndo(
                    { type: 'override/cancel', date: slot.date, bellId: slot.bell.id },
                    `Урок отменён ${formatDayMonth(slot.date)}`,
                  ),
              },
          slot.override && {
            label: 'Вернуть как в расписании',
            icon: 'repeat',
            onClick: () =>
              dispatchWithUndo(
                { type: 'override/remove', date: slot.date, bellId: slot.bell.id },
                'Разовые изменения сняты',
              ),
          },
          { separator: true },
          slot.template && {
            label: 'Убрать из расписания',
            icon: 'trash',
            tone: 'danger',
            onClick: () =>
              setConfirm({
                title: 'Убрать из постоянного расписания?',
                description: `Урок исчезнет из всех недель — каждый ${weekdayGenitive(isoWeekday(slot.date))}.`,
                confirmLabel: 'Убрать',
                onConfirm: () =>
                  dispatchWithUndo(
                    {
                      type: 'template/remove',
                      weekday: isoWeekday(slot.date),
                      bellId: slot.bell.id,
                    },
                    'Урок убран из постоянного расписания',
                  ),
              }),
          },
          !slot.template && {
            label: 'Удалить урок',
            icon: 'trash',
            tone: 'danger',
            onClick: () =>
              dispatchWithUndo(
                { type: 'override/remove', date: slot.date, bellId: slot.bell.id },
                'Урок удалён',
              ),
          },
        ].filter(Boolean),
      })
    },
    [state, clipboard, dispatch, dispatchWithUndo, openLesson],
  )

  const templateMenu = useCallback(
    ({ weekday, bell, tpl }, x, y) => {
      const subject = subjectById(state, tpl?.subjectId)
      setMenu({
        x,
        y,
        header: subject?.name ?? 'Урок',
        items: [
          { label: 'Изменить…', icon: 'pencil', onClick: () => openTemplate(weekday, bell, tpl) },
          {
            label: 'Копировать',
            icon: 'copy',
            onClick: () => clipboard.copy(tpl, subject?.name),
          },
          { separator: true },
          {
            label: 'Убрать из расписания',
            icon: 'trash',
            tone: 'danger',
            onClick: () =>
              dispatchWithUndo(
                { type: 'template/remove', weekday, bellId: bell.id },
                'Урок убран из постоянного расписания',
              ),
          },
        ],
      })
    },
    [state, clipboard, dispatchWithUndo, openTemplate],
  )

  const dayMenu = useCallback(
    (targetDay, x, y) => {
      const overrideCount = state.overrides.filter((o) => o.date === targetDay.date).length

      setMenu({
        x,
        y,
        header: formatDayMonth(targetDay.date),
        items: [
          {
            label: 'Открыть день',
            icon: 'day',
            onClick: () => {
              setAnchor(targetDay.date)
              setView('day')
            },
          },
          {
            label: 'Скопировать текстом',
            icon: 'copy',
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(dayAsText(state, targetDay.date))
                toast({ message: 'День скопирован в буфер обмена' })
              } catch {
                toast({ message: 'Браузер не дал доступ к буферу обмена', tone: 'danger' })
              }
            },
          },
          { separator: true },
          ...Object.values(DAY_KINDS).map((kind) => ({
            label: kind.label,
            icon:
              kind.id === 'holiday'
                ? 'flag'
                : kind.id === 'vacation'
                  ? 'palm'
                  : kind.id === 'special'
                    ? 'sparkle'
                    : 'sun',
            active: targetDay.kind === kind.id,
            onClick: () =>
              dispatch({ type: 'day/set', date: targetDay.date, kind: kind.id, label: '' }),
          })),
          { separator: true },
          {
            label: 'Снять разовые изменения',
            icon: 'rotate',
            hint: overrideCount || undefined,
            disabled: !overrideCount,
            onClick: () =>
              setConfirm({
                title: 'Снять изменения дня?',
                description:
                  'Замены, отмены и темы уроков за этот день будут удалены. Постоянное расписание вернётся как есть.',
                confirmLabel: 'Снять',
                onConfirm: () =>
                  dispatchWithUndo(
                    {
                      type: 'replace',
                      doc: {
                        ...state,
                        overrides: state.overrides.filter((o) => o.date !== targetDay.date),
                      },
                    },
                    'Изменения дня сняты',
                  ),
              }),
          },
        ],
      })
    },
    [state, dispatch, dispatchWithUndo, toast],
  )

  const exportMenu = useCallback(
    (x, y) => {
      const range = view === 'day' ? [anchor] : dates
      setMenu({
        x,
        y,
        header: 'Экспорт',
        items: [
          {
            label: 'Таблица CSV',
            icon: 'download',
            onClick: () => exportCSV(state, range),
          },
          {
            label: 'В календарь (.ics)',
            icon: 'calendar',
            onClick: () => exportICS(state, range),
          },
          {
            label: 'Резервная копия JSON',
            icon: 'download',
            onClick: () => exportJSON(state),
          },
          { separator: true },
          {
            label: 'Скопировать день текстом',
            icon: 'copy',
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(dayAsText(state, view === 'day' ? anchor : today))
                toast({ message: 'Скопировано в буфер обмена' })
              } catch {
                toast({ message: 'Браузер не дал доступ к буферу обмена', tone: 'danger' })
              }
            },
          },
        ],
      })
    },
    [state, view, anchor, dates, today, toast],
  )

  /* ── Горячие клавиши ─────────────────────────────────────────────────── */

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      if (typing) return

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? redo() : undo()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return

      switch (event.key) {
        case 'ArrowLeft':
          step(-1)
          break
        case 'ArrowRight':
          step(1)
          break
        case '1':
          setView('week')
          break
        case '2':
          setView('day')
          break
        case '3':
          setView('template')
          break
        case 't':
        case 'е':
          goToday()
          break
        default:
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [step, goToday, undo, redo])

  /* ── Экран ───────────────────────────────────────────────────────────── */

  const noBells = !bells.length

  // Порядок проверок важен: пока сессия не выяснена, показывать экран входа
  // нельзя — вошедший пользователь увидел бы форму логина на долю секунды.
  if (auth.cloudEnabled && auth.loading) return <Splash text="Проверяем сессию…" />
  if (auth.cloudEnabled && !auth.user) return <AuthScreen />
  if (auth.cloudEnabled && !ready) return <Splash text="Загружаем расписание…" />

  return (
    <div className="min-h-dvh">
      <TopBar
        view={view}
        onViewChange={setView}
        anchor={anchor}
        weekStart={weekStart}
        visibleDays={visibleDays}
        onStep={step}
        onToday={goToday}
        isCurrentPeriod={isCurrentPeriod}
        canUndo={canUndo}
        onUndo={undo}
        onPrint={() => window.print()}
        onExport={exportMenu}
        onSettings={() => setSettingsOpen(true)}
      />

      <main className="mx-auto max-w-[1600px] px-3 py-3 sm:px-5 sm:py-4">
        {syncError && (
          <div className="no-print mb-3 flex items-start gap-2 rounded-xl border border-red/25 bg-red/8 px-3 py-2.5 text-[12.5px] leading-relaxed text-night-200">
            <span className="mt-0.5 shrink-0 text-red">
              <Icon name="alert" size={14} />
            </span>
            <span>
              Изменения не сохранились: {syncError}. Они остались на экране —
              следующая правка отправит их снова.
            </span>
          </div>
        )}

        <PrintHeader
          state={state}
          view={view}
          anchor={anchor}
          weekStart={weekStart}
          visibleDays={visibleDays}
        />

        {noBells ? (
          <EmptyState
            icon="bell"
            title="Сначала настройте звонки"
            description="Расписание строится вокруг сетки звонков. Задайте время уроков — дальше можно раскладывать предметы."
            actions={[
              {
                label: 'Открыть настройки',
                icon: 'settings',
                primary: true,
                onClick: () => setSettingsOpen(true),
              },
            ]}
          />
        ) : view === 'week' ? (
          <WeekGrid
            state={state}
            days={days}
            bells={bells}
            today={today}
            now={now}
            clipboard={clipboard}
            compact={state.settings.compactCells}
            onOpenLesson={openLesson}
            onQuickAdd={quickAdd}
            onLessonMenu={lessonMenu}
            onDayMenu={dayMenu}
          />
        ) : view === 'day' ? (
          <DayView
            state={state}
            day={day}
            today={today}
            now={now}
            clipboard={clipboard}
            onOpenLesson={openLesson}
            onQuickAdd={quickAdd}
            onLessonMenu={lessonMenu}
            onDayMenu={dayMenu}
          />
        ) : (
          <TemplateGrid
            state={state}
            bells={bells}
            visibleDays={visibleDays}
            clipboard={clipboard}
            onEdit={openTemplate}
            onMenu={templateMenu}
          />
        )}

        {clipboardLesson && (
          <div className="no-print mt-3 flex items-center gap-2 rounded-xl border border-brand/25 bg-brand/8 px-3 py-2 text-[12.5px] text-night-200">
            <span className="text-brand">В буфере:</span>
            <span className="truncate font-medium">
              {subjectById(state, clipboardLesson.subjectId)?.name ?? 'урок'}
              {clipboardLesson.className ? ` · ${clipboardLesson.className}` : ''}
            </span>
            <button
              type="button"
              onClick={clipboard.clear}
              className="ml-auto rounded-md px-2 py-0.5 text-night-400 transition-colors hover:text-night-100"
            >
              очистить
            </button>
          </div>
        )}
      </main>

      <LessonDialog
        open={Boolean(dialog)}
        context={dialog}
        state={state}
        dispatch={dispatch}
        onClose={() => setDialog(null)}
        onDelete={deleteFromDialog}
      />

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        state={state}
        dispatch={dispatch}
        toast={toast}
      />

      <PopMenu
        open={Boolean(menu)}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        header={menu?.header}
        items={menu?.items ?? []}
        onClose={() => setMenu(null)}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        description={confirm?.description}
        details={confirm?.details}
        confirmLabel={confirm?.confirmLabel}
        secondaryLabel={confirm?.secondaryLabel}
        onSecondary={
          confirm?.onSecondary
            ? () => {
                confirm.onSecondary()
                setConfirm(null)
              }
            : undefined
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.onConfirm()
          setConfirm(null)
        }}
      />

      <Toasts />

      <ChatWidget />
    </div>
  )
}

function Splash({ text }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand">
        <Icon name="calendar" size={20} />
      </span>
      <p className="text-[13px] text-night-400">{text}</p>
    </div>
  )
}

const GENITIVE = [
  'понедельник',
  'вторник',
  'среду',
  'четверг',
  'пятницу',
  'субботу',
  'воскресенье',
]

function weekdayGenitive(weekday) {
  return GENITIVE[(weekday ?? 1) - 1]
}
