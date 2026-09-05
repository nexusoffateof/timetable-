import { useMemo, useState } from 'react'
import Modal from './ui/Modal.jsx'
import Button from './ui/Button.jsx'
import Icon from './ui/Icon.jsx'
import Segmented from './ui/Segmented.jsx'
import SubjectPicker from './SubjectPicker.jsx'
import { Checkbox, ComboInput, Field, TextArea, TextInput, TimeInput } from './ui/Field.jsx'
import { WEEKDAYS_FULL, formatDayMonth, isValidTime } from '../lib/datetime.js'
import { knownClasses, subjectById } from '../lib/schedule.js'
import { uid } from '../lib/id.js'

/**
 * Начальное состояние формы выводится из контекста один раз при открытии.
 * Синхронизировать его эффектом не нужно: диалог монтируется заново на каждый
 * урок — за это отвечает key во внешнем компоненте.
 */
function initialForm(context) {
  if (context.mode === 'template') {
    const tpl = context.tpl
    return {
      subjectId: tpl?.subjectId ?? null,
      className: tpl?.className ?? '',
      room: tpl?.room ?? '',
      note: tpl?.note ?? '',
      topic: '',
      start: '',
      end: '',
    }
  }

  const lesson = context.slot?.lesson
  return {
    subjectId: lesson?.subjectId ?? null,
    className: lesson?.className ?? '',
    room: lesson?.room ?? '',
    topic: lesson?.topic ?? '',
    note: lesson?.note ?? '',
    start: lesson?.timeShifted ? lesson.start : '',
    end: lesson?.timeShifted ? lesson.end : '',
  }
}

/** Ключ монтирования: сменился урок — форма собирается с нуля. */
function contextKey(context) {
  return context.mode === 'template'
    ? `tpl:${context.weekday}:${context.bell.id}`
    : `date:${context.date}:${context.bell.id}`
}

/**
 * Редактор урока.
 *
 * Ключевой элемент — переключатель области действия. Пока он на виду,
 * пользователь понимает разницу между «замена в этот четверг» и «теперь так
 * каждый четверг». Без него два уровня расписания превращаются в лотерею.
 */
export default function LessonDialog({ open, context, ...rest }) {
  if (!open || !context) return null
  return <LessonForm key={contextKey(context)} context={context} {...rest} />
}

function LessonForm({ context, state, dispatch, onClose, onDelete }) {
  const [form, setForm] = useState(() => initialForm(context))
  const [scope, setScope] = useState(context.mode === 'template' ? 'template' : 'date')
  const [customTime, setCustomTime] = useState(
    () => Boolean(context.slot?.lesson?.timeShifted),
  )
  const [error, setError] = useState(null)

  const classes = useMemo(() => knownClasses(state), [state])

  const { mode, date, bell, weekday, slot } = context
  const isTemplateMode = mode === 'template'
  const weekdayIndex = isTemplateMode ? weekday : context.weekday
  const hasOverride = Boolean(slot?.override)
  const cancelled = slot?.source === 'cancelled'
  const existing = isTemplateMode ? Boolean(context.tpl?.subjectId) : Boolean(slot?.lesson)

  const patch = (next) => setForm((prev) => ({ ...prev, ...next }))

  const createSubject = ({ name, color }) => {
    const id = uid()
    dispatch({ type: 'subject/add', subject: { id, name, color, short: '', room: '' } })
    return id
  }

  const save = () => {
    if (!form.subjectId) {
      setError('Выберите предмет')
      return
    }
    if (customTime && (!isValidTime(form.start) || !isValidTime(form.end))) {
      setError('Время нужно в формате ЧЧ:ММ')
      return
    }
    if (customTime && form.start >= form.end) {
      setError('Конец урока должен быть позже начала')
      return
    }

    if (scope === 'template') {
      dispatch({
        type: 'template/upsert',
        weekday: weekdayIndex,
        bellId: bell.id,
        patch: {
          subjectId: form.subjectId,
          className: form.className.trim(),
          room: form.room.trim(),
          note: form.note.trim(),
        },
      })

      // Правка шаблона поверх разовой замены: разовые отличия убираем,
      // тему урока — оставляем, она принадлежит дате, а не расписанию.
      if (!isTemplateMode && hasOverride) {
        dispatch({
          type: 'override/upsert',
          date,
          bellId: bell.id,
          patch: {
            status: 'planned',
            subjectId: null,
            className: null,
            room: null,
            note: null,
            start: null,
            end: null,
            topic: form.topic.trim(),
          },
        })
      } else if (!isTemplateMode && form.topic.trim()) {
        dispatch({
          type: 'override/upsert',
          date,
          bellId: bell.id,
          patch: { topic: form.topic.trim() },
        })
      }
    } else {
      const tpl = slot?.template
      const diff = (value, base) => {
        const trimmed = typeof value === 'string' ? value.trim() : value
        if (!tpl) return trimmed || null
        return trimmed === (base ?? '') ? null : trimmed || null
      }

      dispatch({
        type: 'override/upsert',
        date,
        bellId: bell.id,
        patch: {
          status: 'planned',
          subjectId: tpl && form.subjectId === tpl.subjectId ? null : form.subjectId,
          className: diff(form.className, tpl?.className),
          room: diff(form.room, tpl?.room),
          note: diff(form.note, tpl?.note),
          topic: form.topic.trim(),
          start: customTime ? form.start : null,
          end: customTime ? form.end : null,
        },
      })
    }

    onClose()
  }

  const subject = subjectById(state, form.subjectId)
  const weekdayName = WEEKDAYS_FULL[(weekdayIndex ?? 1) - 1]

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      headerAccent={subject?.color}
      title={existing ? 'Урок' : 'Новый урок'}
      subtitle={
        isTemplateMode
          ? `Постоянное расписание · ${weekdayName} · ${bell.index} урок`
          : `${formatDayMonth(date)} · ${weekdayName} · ${bell.index} урок · ${bell.start}–${bell.end}`
      }
      footer={
        <>
          {existing && (
            <Button variant="danger" size="sm" icon="trash" onClick={() => onDelete(context)}>
              Удалить
            </Button>
          )}
          {!isTemplateMode && existing && !cancelled && (
            <Button
              variant="ghost"
              size="sm"
              icon="ban"
              onClick={() => {
                dispatch({ type: 'override/cancel', date, bellId: bell.id })
                onClose()
              }}
            >
              Отменить урок
            </Button>
          )}
          {!isTemplateMode && cancelled && (
            <Button
              variant="ghost"
              size="sm"
              icon="rotate"
              onClick={() => {
                dispatch({ type: 'override/restore', date, bellId: bell.id })
                onClose()
              }}
            >
              Вернуть урок
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" size="sm" icon="check" onClick={save}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {!isTemplateMode && (
          <div className="rounded-xl border border-night-700/60 bg-night-900/50 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-night-400">
              <Icon name="swap" size={13} />
              Куда сохранить
            </div>
            <Segmented
              size="sm"
              stretch
              value={scope}
              onChange={setScope}
              options={[
                { value: 'date', label: `Только ${formatDayMonth(date)}`, icon: 'calendar' },
                { value: 'template', label: `Каждый ${weekdayName.toLowerCase()}`, icon: 'repeat' },
              ]}
            />
            <p className="mt-2 text-[12px] leading-snug text-night-450">
              {scope === 'date'
                ? 'Замена на один день. Постоянное расписание останется прежним.'
                : 'Изменится постоянное расписание — во всех неделях сразу.'}
            </p>
          </div>
        )}

        <Field label="Предмет">
          <SubjectPicker
            subjects={state.subjects}
            value={form.subjectId}
            onChange={(id) => {
              const picked = subjectById(state, id)
              patch({ subjectId: id, room: form.room || picked?.room || '' })
              setError(null)
            }}
            onCreate={createSubject}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Класс">
            <ComboInput
              value={form.className}
              options={classes}
              placeholder="8А"
              onChange={(event) => patch({ className: event.target.value })}
            />
          </Field>
          <Field label="Кабинет">
            <TextInput
              value={form.room}
              placeholder="212"
              onChange={(event) => patch({ room: event.target.value })}
            />
          </Field>
        </div>

        {isTemplateMode ? (
          <div className="flex items-start gap-2 rounded-xl border border-night-700/60 bg-night-900/40 px-3 py-2.5 text-[12px] leading-snug text-night-450">
            <Icon name="clock" size={14} className="mt-px text-night-500" />
            <span>
              Тема урока и своё время задаются на конкретную дату — в режиме «Неделя».
              Здесь хранится только постоянная часть.
            </span>
          </div>
        ) : (
          <>
            <Field
              label="Тема урока"
              hint="Привязана к этой дате, а не к дню недели."
            >
              <TextInput
                value={form.topic}
                placeholder="Квадратные уравнения. Теорема Виета"
                onChange={(event) => patch({ topic: event.target.value })}
              />
            </Field>

            <div className="rounded-xl border border-night-700/60 bg-night-900/40 p-3">
              <Checkbox
                checked={customTime}
                label="Своё время в этот день"
                onChange={(next) => {
                  setCustomTime(next)
                  if (next && !form.start) patch({ start: bell.start, end: bell.end })
                }}
              />
              {customTime && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Начало">
                    <TimeInput
                      value={form.start}
                      onChange={(event) => patch({ start: event.target.value })}
                    />
                  </Field>
                  <Field label="Конец">
                    <TimeInput
                      value={form.end}
                      onChange={(event) => patch({ end: event.target.value })}
                    />
                  </Field>
                </div>
              )}
            </div>
          </>
        )}

        <Field label="Личная заметка" hint="Видна только вам. В печать не идёт.">
          <TextArea
            rows={2}
            value={form.note}
            placeholder="Принести карточки, у Петрова освобождение"
            onChange={(event) => patch({ note: event.target.value })}
          />
        </Field>

        {!isTemplateMode && hasOverride && (
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'override/remove', date, bellId: bell.id })
              onClose()
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-night-700 py-2 text-[12.5px] text-night-400 transition-colors hover:border-night-600 hover:text-night-100"
          >
            <Icon name="rotate" size={14} />
            Вернуть как в постоянном расписании
          </button>
        )}

        {error && (
          <p className="flex items-center gap-1.5 text-[12.5px] text-red">
            <Icon name="alert" size={14} />
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
