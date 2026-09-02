import { useId } from 'react'

const CONTROL =
  'w-full rounded-xl border border-night-700/70 bg-night-900/70 px-3 py-2 text-sm text-night-100 placeholder:text-night-450 transition-colors duration-150 hover:border-night-650 focus:border-brand/70 focus:bg-night-900 focus:outline-none focus:ring-2 focus:ring-brand/25'

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-night-400">
          {label}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1.5 block text-[12px] text-red">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[12px] leading-snug text-night-450">{hint}</span>
      ) : null}
    </label>
  )
}

export function TextInput({ className = '', ...rest }) {
  return <input type="text" className={`${CONTROL} ${className}`} {...rest} />
}

export function TimeInput({ className = '', ...rest }) {
  return (
    <input
      type="time"
      className={`${CONTROL} num [&::-webkit-calendar-picker-indicator]:opacity-45 [&::-webkit-calendar-picker-indicator]:invert ${className}`}
      {...rest}
    />
  )
}

export function DateInput({ className = '', ...rest }) {
  return (
    <input
      type="date"
      className={`${CONTROL} num [&::-webkit-calendar-picker-indicator]:opacity-45 [&::-webkit-calendar-picker-indicator]:invert ${className}`}
      {...rest}
    />
  )
}

export function TextArea({ className = '', rows = 3, ...rest }) {
  return <textarea rows={rows} className={`${CONTROL} resize-y leading-relaxed ${className}`} {...rest} />
}

export function Select({ className = '', children, ...rest }) {
  return (
    <div className="relative">
      <select
        className={`${CONTROL} appearance-none pr-9 ${className}`}
        {...rest}
      >
        {children}
      </select>
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-night-400"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  )
}

/** Текстовое поле с подсказками из уже введённых значений. */
export function ComboInput({ options = [], className = '', ...rest }) {
  const id = useId()
  return (
    <>
      <input type="text" list={id} className={`${CONTROL} ${className}`} {...rest} />
      <datalist id={id}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  )
}

export function Checkbox({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-night-200">
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault()
            onChange(!checked)
          }
        }}
        className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150 ${
          checked ? 'border-brand bg-brand text-night-1000' : 'border-night-600 bg-night-800'
        }`}
      >
        {checked && (
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m20 6-11 11-5-5" />
          </svg>
        )}
      </span>
      {label}
    </label>
  )
}

export function Switch({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5.5 w-9.5 shrink-0 rounded-full border transition-colors duration-200 ${
          checked
            ? 'border-brand/60 bg-brand/85'
            : 'border-night-650 bg-night-750'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-night-1000 transition-transform duration-200 ${
            checked ? 'translate-x-4.5 bg-night-1000' : 'translate-x-0.5 bg-night-400'
          }`}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-night-100">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] leading-snug text-night-450">{hint}</span>}
      </span>
    </label>
  )
}
