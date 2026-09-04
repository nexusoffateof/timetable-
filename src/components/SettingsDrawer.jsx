import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from './ui/Button.jsx'
import Icon from './ui/Icon.jsx'
import ConfirmDialog from './ui/ConfirmDialog.jsx'
import {
  ComboInput,
  DateInput,
  Field,
  Select,
  Switch,
  TextInput,
  TimeInput,
} from './ui/Field.jsx'
import { SUBJECT_COLORS, nextColor } from '../lib/palette.js'
import { bellUsage, subjectUsage, DAY_KINDS } from '../lib/schedule.js'
import {
  addDaysISO,
  formatDayMonth,
  minutesToTime,
  timeToMinutes,
  todayISO,
} from '../lib/datetime.js'
import { exportJSON, importJSON } from '../lib/export.js'
import { createEmptyState, createSeedState } from '../data/seed.js'

const TABS = [
  { id: 'general', label: 'Общее', icon: 'settings' },
  { id: 'bells', label: 'Звонки', icon: 'bell' },
  { id: 'subjects', label: 'Предметы', icon: 'grid' },
  { id: 'calendar', label: 'Каникулы', icon: 'palm' },
  { id: 'reminders', label: 'Напоминания', icon: 'send' },
  { id: 'data', label: 'Данные', icon: 'download' },
  { id: 'help', label: 'Справка', icon: 'note' },
]

export default function SettingsDrawer({ open, onClose, state, dispatch, toast }) {
  const [tab, setTab] = useState('general')
  const [confirm, setConfirm] = useState(null)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !confirm) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
    }
  }, [open, onClose, confirm])

  if (!open) return null

  return createPortal(
    <div className="no-print fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 animate-in-fade bg-night-1000/70 backdrop-blur-sm" onClick={onClose} />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Настройки"
        className="animate-in-up relative flex h-full w-full max-w-xl flex-col border-l border-night-700/70 bg-night-850 shadow-[var(--shadow-pop)]"
      >
        <header className="flex items-center gap-3 border-b border-night-700/60 px-5 py-3.5">
          <h2 className="flex-1 text-[15px] font-semibold tracking-tight text-night-50">Настройки</h2>
          <Button variant="ghost" size="icon" icon="x" aria-label="Закрыть" onClick={onClose} />
        </header>

        {/* Перенос, а не горизонтальный скролл: скрытый скроллбар выглядел
            как обрезанная вкладка — последняя просто исчезала за краем. */}
        <nav className="flex flex-wrap gap-1 border-b border-night-700/60 px-3 py-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                tab === item.id
                  ? 'bg-night-750 text-night-50'
                  : 'text-night-400 hover:bg-night-800 hover:text-night-100'
              }`}
            >
              <Icon name={item.icon} size={14} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === 'general' && <GeneralTab state={state} dispatch={dispatch} />}
          {tab === 'bells' && <BellsTab state={state} dispatch={dispatch} setConfirm={setConfirm} />}
          {tab === 'subjects' && (
            <SubjectsTab state={state} dispatch={dispatch} setConfirm={setConfirm} />
          )}
          {tab === 'calendar' && <CalendarTab state={state} dispatch={dispatch} />}
          {tab === 'reminders' && <RemindersTab state={state} dispatch={dispatch} />}
          {tab === 'data' && (
            <DataTab state={state} dispatch={dispatch} setConfirm={setConfirm} toast={toast} />
          )}
          {tab === 'help' && <HelpTab />}
        </div>
      </aside>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        description={confirm?.description}
        details={confirm?.details}
        confirmLabel={confirm?.confirmLabel}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.onConfirm()
          setConfirm(null)
        }}
      />
    </div>,
    document.body,
  )
}

/* ── Общее ─────────────────────────────────────────────────────────────── */

const TIMEZONES = [
  'Europe/Kaliningrad',
  'Europe/Moscow',
  'Europe/Samara',
  'Asia/Yekaterinburg',
  'Asia/Omsk',
  'Asia/Krasnoyarsk',
  'Asia/Irkutsk',
  'Asia/Yakutsk',
  'Asia/Vladivostok',
  'Asia/Magadan',
  'Asia/Kamchatka',
  'Europe/Kyiv',
  'Europe/Minsk',
  'Asia/Almaty',
]

function GeneralTab({ state, dispatch }) {
  const set = (patch) => dispatch({ type: 'settings/update', patch })
  const zones = [...new Set([state.settings.timezone, ...TIMEZONES])]

  return (
    <div className="space-y-5">
      <Field label="Как вас зовут" hint="Появится в шапке при печати расписания.">
        <TextInput
          value={state.settings.teacherName}
          placeholder="Иванова Мария Петровна"
          onChange={(event) => set({ teacherName: event.target.value })}
        />
      </Field>

      <Field
        label="Часовой пояс"
        hint="По нему бот будет считать, когда слать напоминания. Определён автоматически — проверьте."
      >
        <Select
          value={state.settings.timezone}
          onChange={(event) => set({ timezone: event.target.value })}
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Дней в неделе">
        <Select
          value={state.settings.visibleDays}
          onChange={(event) => set({ visibleDays: Number(event.target.value) })}
        >
          <option value={5}>Пятидневка (Пн–Пт)</option>
          <option value={6}>Шестидневка (Пн–Сб)</option>
          <option value={7}>Вся неделя (Пн–Вс)</option>
        </Select>
      </Field>

      <div className="rounded-xl border border-night-700/60 bg-night-900/40 px-3 py-1">
        <Switch
          checked={state.settings.compactCells}
          onChange={(value) => dispatch({ type: 'settings/update', patch: { compactCells: value } })}
          label="Компактная сетка"
          hint="Уже колонки и ниже строки — вся неделя влезает без прокрутки."
        />
      </div>

      <Shortcuts />
    </div>
  )
}

const SHORTCUTS = [
  [['←', '→'], 'Предыдущая и следующая неделя. В режиме «День» — соседний день'],
  [['T'], 'Вернуться на сегодня'],
  [['1', '2', '3'], 'Неделя, День, Шаблон'],
  [['Ctrl', 'Z'], 'Отменить последнее действие'],
  [['Ctrl', '⇧', 'Z'], 'Вернуть отменённое'],
  [['Ctrl', 'P'], 'Печать'],
]

/** Раньше это висело строкой под сеткой и читалось как набор слов.
 *  Место справочной информации — в справке, а не в рабочем экране. */
function Shortcuts() {
  return (
    <div className="rounded-xl border border-night-700/60 bg-night-900/40 p-4">
      <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-night-400">
        Горячие клавиши
      </div>
      <dl className="space-y-2.5">
        {SHORTCUTS.map(([keys, description]) => (
          <div key={description} className="flex items-baseline gap-3">
            <dt className="flex shrink-0 gap-1">
              {keys.map((key) => (
                <kbd
                  key={key}
                  className="num rounded-md border border-night-650 bg-night-800 px-1.5 py-0.5 text-[11px] font-medium text-night-200"
                >
                  {key}
                </kbd>
              ))}
            </dt>
            <dd className="text-[12.5px] leading-snug text-night-300">{description}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-night-700/60 pt-3 text-[12.5px] leading-snug text-night-400">
        Правый клик по уроку — на телефоне долгое нажатие — открывает меню:
        копировать, отменить на день, убрать из расписания.
      </p>
    </div>
  )
}

/* ── Звонки ────────────────────────────────────────────────────────────── */

function BellsTab({ state, dispatch, setConfirm }) {
  const bells = [...state.bells].sort(
    (a, b) => (timeToMinutes(a.start) ?? 0) - (timeToMinutes(b.start) ?? 0),
  )

  const addBell = () => {
    const last = bells[bells.length - 1]
    const start = last ? timeToMinutes(last.end) + 10 : 8 * 60 + 30
    dispatch({
      type: 'bell/add',
      bell: { start: minutesToTime(start), end: minutesToTime(start + 45) },
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-night-400">
        Сетка звонков — основа расписания. Уроки встают в эти интервалы, а разовый
        сдвиг времени задаётся в самом уроке.
      </p>

      <div className="space-y-2">
        {bells.map((bell) => {
          const usage = bellUsage(state, bell.id)
          const total = usage.template + usage.overrides
          return (
            <div
              key={bell.id}
              className="flex items-center gap-2 rounded-xl border border-night-700/60 bg-night-900/40 p-2.5"
            >
              <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-night-800 text-[13px] font-semibold text-night-200">
                {bell.index}
              </span>
              <TimeInput
                value={bell.start}
                aria-label={`Начало ${bell.index} урока`}
                onChange={(event) =>
                  dispatch({ type: 'bell/update', id: bell.id, patch: { start: event.target.value } })
                }
                className="w-28"
              />
              <span className="text-night-500">–</span>
              <TimeInput
                value={bell.end}
                aria-label={`Конец ${bell.index} урока`}
                onChange={(event) =>
                  dispatch({ type: 'bell/update', id: bell.id, patch: { end: event.target.value } })
                }
                className="w-28"
              />
              <span className="num ml-auto hidden text-[11px] text-night-500 sm:block">
                {Math.max(0, timeToMinutes(bell.end) - timeToMinutes(bell.start))} мин
              </span>
              <Button
                variant="ghost"
                size="iconSm"
                icon="trash"
                aria-label="Удалить звонок"
                onClick={() =>
                  setConfirm({
                    title: `Удалить ${bell.index} урок?`,
                    description:
                      total > 0
                        ? 'Вместе со звонком исчезнут все уроки, которые в нём стоят.'
                        : 'Звонок пустой, уроки не пострадают.',
                    details:
                      total > 0
                        ? [
                            `В постоянном расписании: ${usage.template}`,
                            `Разовых изменений по датам: ${usage.overrides}`,
                          ]
                        : null,
                    onConfirm: () => dispatch({ type: 'bell/remove', id: bell.id }),
                  })
                }
              />
            </div>
          )
        })}
      </div>

      <Button variant="secondary" size="sm" icon="plus" onClick={addBell}>
        Добавить звонок
      </Button>
    </div>
  )
}

/* ── Предметы ──────────────────────────────────────────────────────────── */

function SubjectsTab({ state, dispatch, setConfirm }) {
  const [name, setName] = useState('')

  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    dispatch({
      type: 'subject/add',
      subject: { name: trimmed, color: nextColor(state.subjects) },
    })
    setName('')
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <TextInput
          value={name}
          placeholder="Новый предмет"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && add()}
        />
        <Button variant="primary" icon="plus" onClick={add} disabled={!name.trim()}>
          Добавить
        </Button>
      </div>

      <div className="space-y-2">
        {state.subjects.map((subject) => {
          const usage = subjectUsage(state, subject.id)
          const total = usage.template + usage.overrides
          return (
            <div
              key={subject.id}
              style={{ '--subject': subject.color }}
              className="space-y-2 rounded-xl border border-night-700/60 bg-night-900/40 p-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-7 w-1.5 shrink-0 rounded-full"
                  style={{ background: subject.color }}
                />
                <TextInput
                  value={subject.name}
                  aria-label="Название предмета"
                  onChange={(event) =>
                    dispatch({
                      type: 'subject/update',
                      id: subject.id,
                      patch: { name: event.target.value },
                    })
                  }
                />
                <TextInput
                  value={subject.room ?? ''}
                  placeholder="каб."
                  aria-label="Кабинет по умолчанию"
                  className="w-20"
                  onChange={(event) =>
                    dispatch({
                      type: 'subject/update',
                      id: subject.id,
                      patch: { room: event.target.value },
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="iconSm"
                  icon="trash"
                  aria-label="Удалить предмет"
                  onClick={() =>
                    setConfirm({
                      title: `Удалить «${subject.name}»?`,
                      description:
                        total > 0
                          ? 'Все уроки с этим предметом будут удалены из расписания.'
                          : 'Предмет нигде не используется.',
                      details:
                        total > 0
                          ? [
                              `В постоянном расписании: ${usage.template}`,
                              `Разовых уроков по датам: ${usage.overrides}`,
                            ]
                          : null,
                      onConfirm: () => dispatch({ type: 'subject/remove', id: subject.id }),
                    })
                  }
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pl-3.5">
                {SUBJECT_COLORS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    title={option.label}
                    aria-label={option.label}
                    onClick={() =>
                      dispatch({
                        type: 'subject/update',
                        id: subject.id,
                        patch: { color: option.value },
                      })
                    }
                    style={{ background: option.value }}
                    className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${
                      subject.color === option.value
                        ? 'ring-2 ring-night-50 ring-offset-2 ring-offset-night-900'
                        : ''
                    }`}
                  />
                ))}
                <span className="num ml-auto text-[11px] text-night-500">
                  {total ? `${total} в расписании` : 'не используется'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {!state.subjects.length && (
        <p className="rounded-xl border border-dashed border-night-700 py-6 text-center text-[13px] text-night-450">
          Предметов пока нет
        </p>
      )}
    </div>
  )
}

/* ── Каникулы и праздники ──────────────────────────────────────────────── */

function CalendarTab({ state, dispatch }) {
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [kind, setKind] = useState('vacation')
  const [label, setLabel] = useState('')

  const marked = [...state.days].sort((a, b) => a.date.localeCompare(b.date))

  const apply = () => {
    if (from > to) return
    const dates = []
    for (let date = from; date <= to; date = addDaysISO(date, 1)) dates.push(date)
    dispatch({ type: 'day/setRange', dates, kind, label: label.trim() })
    setLabel('')
  }

  return (
    <div className="space-y-5">
      <p className="text-[13px] leading-relaxed text-night-400">
        В отмеченные дни уроки из постоянного расписания не показываются — и бот
        не будет о них напоминать. Разовое занятие в такой день всё равно можно
        добавить вручную.
      </p>

      <div className="space-y-3 rounded-xl border border-night-700/60 bg-night-900/40 p-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="С">
            <DateInput value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="По">
            <DateInput value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Что это">
            <Select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="vacation">Каникулы</option>
              <option value="holiday">Праздник</option>
              <option value="special">Особый день</option>
              <option value="normal">Снять отметку</option>
            </Select>
          </Field>
          <Field label="Подпись">
            <TextInput
              value={label}
              placeholder="Осенние каникулы"
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
        </div>
        <Button variant="primary" size="sm" icon="check" onClick={apply} disabled={from > to}>
          Применить
        </Button>
      </div>

      <div className="space-y-2">
        {marked.map((day) => (
          <div
            key={day.date}
            className="flex items-center gap-2.5 rounded-xl border border-night-700/60 bg-night-900/40 px-3 py-2"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: DAY_KINDS[day.kind]?.color ?? '#8b93bd' }}
            />
            <span className="num text-[13px] text-night-100">{formatDayMonth(day.date)}</span>
            <span className="truncate text-[12.5px] text-night-400">
              {day.label || DAY_KINDS[day.kind]?.label}
            </span>
            <Button
              variant="ghost"
              size="iconSm"
              icon="x"
              className="ml-auto"
              aria-label="Снять отметку"
              onClick={() => dispatch({ type: 'day/set', date: day.date, kind: 'normal' })}
            />
          </div>
        ))}
        {!marked.length && (
          <p className="rounded-xl border border-dashed border-night-700 py-6 text-center text-[13px] text-night-450">
            Отмеченных дней нет
          </p>
        )}
      </div>
    </div>
  )
}

/* ── Напоминания ───────────────────────────────────────────────────────── */

function RemindersTab({ state, dispatch }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-night-700/60 bg-night-900/40 px-3 py-1">
        <Switch
          checked={state.settings.remindersEnabled}
          onChange={(value) =>
            dispatch({ type: 'settings/update', patch: { remindersEnabled: value } })
          }
          label="Напоминания об уроках"
          hint="Настройки сохранятся сейчас и подхватятся, когда подключится бот."
        />
      </div>

      <Field label="За сколько предупреждать" hint="Минут до начала урока.">
        <Select
          value={state.settings.reminderLeadMinutes}
          onChange={(event) =>
            dispatch({
              type: 'settings/update',
              patch: { reminderLeadMinutes: Number(event.target.value) },
            })
          }
        >
          {[5, 10, 15, 20, 30, 45, 60].map((minutes) => (
            <option key={minutes} value={minutes}>
              за {minutes} минут
            </option>
          ))}
        </Select>
      </Field>

      <div className="space-y-3 rounded-xl border border-brand/25 bg-brand/8 p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-brand">
          <Icon name="send" size={15} />
          Telegram пока не подключён
        </div>
        <p className="text-[12.5px] leading-relaxed text-night-300">
          Бот появится на шестом этапе — после базы данных. Пока расписание
          хранится только в этом браузере, и напоминать некому: чтобы писать вам
          в Telegram, серверу нужен доступ к расписанию, а не вкладке.
        </p>
        <p className="text-[12.5px] leading-relaxed text-night-400">
          Порядок и подводные камни расписаны в <code className="num text-night-200">docs/ROADMAP.md</code>.
        </p>
      </div>

      <div className="rounded-xl border border-night-700/60 bg-night-900/40 p-4">
        <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-night-400">
          Часовой пояс расчёта
        </div>
        <div className="num text-[13px] text-night-100">{state.settings.timezone}</div>
        <p className="mt-2 text-[12px] leading-relaxed text-night-450">
          Сервер живёт по UTC. Момент отправки будет считаться из пары «дата + время
          урока» именно в этом поясе — иначе напоминания придут со сдвигом.
        </p>
      </div>
    </div>
  )
}

/* ── Данные ────────────────────────────────────────────────────────────── */

function DataTab({ state, dispatch, setConfirm, toast }) {
  const fileRef = useRef(null)

  const counts = [
    ['Звонков', state.bells.length],
    ['Предметов', state.subjects.length],
    ['Уроков в постоянном расписании', state.template.length],
    ['Изменений по датам', state.overrides.length],
    ['Отмеченных дней', state.days.length],
  ]

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-night-700/60 bg-night-900/40 p-4">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-night-400">
          Что сейчас в базе
        </div>
        <dl className="space-y-1.5">
          {counts.map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-2 text-[13px]">
              <dt className="text-night-300">{label}</dt>
              <span className="min-w-0 flex-1 border-b border-dashed border-night-700/70" />
              <dd className="num font-medium text-night-100">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[12px] leading-relaxed text-night-450">
          Данные лежат в localStorage этого браузера. Другое устройство их не увидит,
          очистка истории — сотрёт. Делайте резервную копию.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon="download" onClick={() => exportJSON(state)}>
          Скачать копию
        </Button>
        <Button variant="secondary" size="sm" icon="upload" onClick={() => fileRef.current?.click()}>
          Восстановить из файла
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            try {
              const doc = await importJSON(file)
              setConfirm({
                title: 'Заменить расписание?',
                description: 'Текущее расписание будет заменено содержимым файла.',
                confirmLabel: 'Заменить',
                onConfirm: () => {
                  dispatch({ type: 'replace', doc })
                  toast({ message: 'Расписание восстановлено из файла' })
                },
              })
            } catch (error) {
              toast({ message: error.message, tone: 'danger' })
            }
          }}
        />
      </div>

      <div className="space-y-2 rounded-xl border border-red/20 bg-red/5 p-4">
        <div className="text-[13px] font-semibold text-red">Опасная зона</div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            icon="repeat"
            onClick={() =>
              setConfirm({
                title: 'Очистить расписание?',
                description:
                  'Останутся звонки и предметы. Уроки, замены и отметки дней будут удалены.',
                confirmLabel: 'Очистить',
                onConfirm: () => {
                  dispatch({
                    type: 'replace',
                    doc: { ...state, template: [], overrides: [], days: [] },
                  })
                  toast({ message: 'Расписание очищено' })
                },
              })
            }
          >
            Очистить уроки
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="sparkle"
            onClick={() =>
              setConfirm({
                title: 'Загрузить пример?',
                description: 'Текущее расписание будет заменено демонстрационной неделей.',
                confirmLabel: 'Загрузить',
                onConfirm: () => {
                  dispatch({ type: 'replace', doc: createSeedState() })
                  toast({ message: 'Загружен пример расписания' })
                },
              })
            }
          >
            Загрузить пример
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon="trash"
            onClick={() =>
              setConfirm({
                title: 'Удалить всё?',
                description:
                  'Расписание, предметы и звонки будут стёрты. Отменить это можно только из резервной копии.',
                confirmLabel: 'Удалить всё',
                onConfirm: () => {
                  dispatch({ type: 'replace', doc: createEmptyState() })
                  toast({ message: 'Всё удалено' })
                },
              })
            }
          >
            Удалить всё
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ── Справка ───────────────────────────────────────────────────────────── */

const STEPS = [
  [
    'Проверьте звонки',
    'Вкладка «Звонки». Расписание строится вокруг них: уроки встают в эти интервалы. Пока времена не ваши, всё остальное настраивать рано.',
  ],
  [
    'Заведите предметы',
    'Вкладка «Предметы» или кнопка «+» прямо в форме урока. Цвет предмета — это то, по чему вы будете читать сетку взглядом, поэтому берите разные.',
  ],
  [
    'Заполните постоянное расписание',
    'Режим «Шаблон» в шапке. Здесь лежит то, что повторяется каждую неделю: «по средам вторым уроком алгебра в 9В». Тем уроков тут нет — они привязаны к датам.',
  ],
  [
    'Работайте в режиме «Неделя»',
    'Это основной экран. Клик по уроку открывает форму: тема, класс, кабинет, заметка. Переключатель «Куда сохранить» решает главное — правка идёт на один день или во все недели сразу.',
  ],
  [
    'Отмечайте каникулы и праздники',
    'Вкладка «Каникулы», можно диапазоном. В отмеченные дни уроки из постоянного расписания не показываются, и напоминания по ним не придут.',
  ],
  [
    'Печатайте и выгружайте',
    'Кнопка печати даёт светлую версию на A4, личные заметки на бумагу не идут. Экспорт — таблица CSV для Excel, файл .ics для календаря телефона и резервная копия JSON.',
  ],
]

const LEGEND = [
  ['dot-orange', 'Оранжевая точка', 'В этот день урок не такой, как в постоянном расписании: замена или разовое занятие.'],
  ['clock', 'Часы', 'Время урока сдвинуто именно на эту дату.'],
  ['note', 'Листок', 'К уроку есть личная заметка. В печать она не попадает.'],
  ['ban', 'Перечёркнутый круг', 'Урок отменён в этот день. В расписании он остаётся.'],
]

function HelpTab() {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-[13px] font-semibold text-night-50">С чего начать</h3>
        <ol className="space-y-3">
          {STEPS.map(([title, body], index) => (
            <li key={title} className="flex gap-3">
              <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-night-800 text-[12px] font-semibold text-brand">
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-night-100">{title}</div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-night-400">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="mb-3 text-[13px] font-semibold text-night-50">Значки на уроке</h3>
        <dl className="space-y-2.5 rounded-xl border border-night-700/60 bg-night-900/40 p-4">
          {LEGEND.map(([icon, title, body]) => (
            <div key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                {icon === 'dot-orange' ? (
                  <span className="h-2 w-2 rounded-full bg-orange" />
                ) : (
                  <Icon
                    name={icon}
                    size={14}
                    className={icon === 'ban' ? 'text-red' : icon === 'clock' ? 'text-orange' : 'text-night-300'}
                  />
                )}
              </span>
              <div className="min-w-0">
                <dt className="text-[12.5px] font-medium text-night-100">{title}</dt>
                <dd className="text-[12.5px] leading-relaxed text-night-400">{body}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-night-50">Два уровня расписания</h3>
        <p className="text-[12.5px] leading-relaxed text-night-400">
          Постоянное расписание — то, что повторяется каждую неделю. Конкретная дата —
          то, что реально произошло: замена, отмена, тема урока, сдвинутое время.
          Они хранятся отдельно, поэтому правка одного дня не ломает расписание,
          а правка расписания не стирает темы уроков.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-night-400">
          Если урок в конкретный день помечен оранжевой точкой, а вы хотите вернуть
          всё как в расписании — откройте урок и нажмите «Вернуть как в постоянном
          расписании».
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-night-50">Где лежат данные</h3>
        <p className="text-[12.5px] leading-relaxed text-night-400">
          Пока — в этом браузере. Другое устройство их не увидит, очистка истории
          сотрёт. Делайте резервную копию во вкладке «Данные».
        </p>
      </section>
    </div>
  )
}
