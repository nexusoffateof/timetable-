import { useState } from 'react'
import { SUBJECT_COLORS, nextColor } from '../lib/palette.js'
import { Select, TextInput } from './ui/Field.jsx'
import Button from './ui/Button.jsx'
import Icon from './ui/Icon.jsx'

/** Выбор предмета с созданием нового на месте — иначе за каждым новым
 *  предметом придётся ходить в настройки и терять заполненную форму. */
export default function SubjectPicker({ subjects, value, onChange, onCreate }) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(() => nextColor(subjects))

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = onCreate({ name: trimmed, color })
    onChange(id)
    setName('')
    setColor(nextColor([...subjects, { color }]))
    setCreating(false)
  }

  const current = subjects.find((s) => s.id === value)

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          {current && (
            <span
              className="pointer-events-none absolute left-3 top-1/2 z-10 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
              style={{ background: current.color }}
            />
          )}
          <Select
            value={value ?? ''}
            onChange={(event) => onChange(event.target.value || null)}
            className={current ? 'pl-8' : ''}
            data-autofocus
          >
            <option value="">— выберите предмет —</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="secondary"
          size="icon"
          icon={creating ? 'x' : 'plus'}
          title={creating ? 'Отменить' : 'Новый предмет'}
          onClick={() => setCreating((v) => !v)}
        />
      </div>

      {creating && (
        <div className="animate-in-up space-y-2 rounded-xl border border-night-700/70 bg-night-900/60 p-3">
          <TextInput
            value={name}
            autoFocus
            placeholder="Название предмета"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              }
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {SUBJECT_COLORS.map((option) => (
              <button
                key={option.id}
                type="button"
                title={option.label}
                onClick={() => setColor(option.value)}
                style={{ background: option.value }}
                className={`h-6 w-6 rounded-full transition-transform duration-150 hover:scale-110 ${
                  color === option.value
                    ? 'ring-2 ring-night-50 ring-offset-2 ring-offset-night-900'
                    : ''
                }`}
              />
            ))}
          </div>
          <Button variant="primary" size="sm" icon="check" onClick={submit} disabled={!name.trim()}>
            Добавить предмет
          </Button>
        </div>
      )}

      {!subjects.length && !creating && (
        <p className="flex items-center gap-1.5 text-[12px] text-night-450">
          <Icon name="alert" size={13} />
          Предметов пока нет — создайте первый.
        </p>
      )}
    </div>
  )
}
