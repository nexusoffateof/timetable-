import { createPortal } from 'react-dom'
import { useToasts } from '../../state/ScheduleContext.jsx'
import Icon from './Icon.jsx'

const TONES = {
  default: 'border-night-650 bg-night-800',
  success: 'border-green/30 bg-night-800',
  danger: 'border-red/30 bg-night-800',
}

export default function Toasts() {
  const { toasts, dismissToast } = useToasts()
  if (!toasts.length) return null

  return createPortal(
    <div // На узком экране кнопка чата стоит в правом нижнем углу и
      // перекрывалась тостом — поднимаем стопку выше неё.
      className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pb-[max(4.5rem,env(safe-area-inset-bottom))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`animate-in-up pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border px-3.5 py-2.5 shadow-[var(--shadow-pop)] ${TONES[toast.tone] ?? TONES.default}`}
        >
          <span className="min-w-0 flex-1 truncate text-[13px] text-night-100">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action.onClick()
                dismissToast(toast.id)
              }}
              className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-semibold text-brand transition-colors hover:bg-brand/12"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => dismissToast(toast.id)}
            className="shrink-0 rounded-md p-1 text-night-450 transition-colors hover:text-night-100"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
