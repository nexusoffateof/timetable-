import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Модалка с ловушкой фокуса: Tab не убегает на фон, Esc закрывает,
 * при закрытии фокус возвращается туда, откуда открыли.
 */
export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
  size = 'md',
  headerAccent,
}) {
  const panelRef = useRef(null)
  const restoreRef = useRef(null)

  useEffect(() => {
    if (!open) return

    restoreRef.current = document.activeElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const timer = setTimeout(() => {
      const first = panelRef.current?.querySelector('[data-autofocus]')
        ?? panelRef.current?.querySelector(FOCUSABLE)
      first?.focus()
    }, 40)

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose?.()
        return
      }
      if (event.key !== 'Tab') return

      const nodes = [...(panelRef.current?.querySelectorAll(FOCUSABLE) ?? [])].filter(
        (n) => n.offsetParent !== null,
      )
      if (!nodes.length) return

      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = overflow
      restoreRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  const width = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center no-print">
      <div
        className="absolute inset-0 animate-in-fade bg-night-1000/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`animate-in-pop relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-night-700/70 bg-night-850 shadow-[var(--shadow-pop)] sm:rounded-2xl ${width}`}
      >
        {headerAccent && (
          <div className="h-0.5 w-full" style={{ background: headerAccent }} />
        )}
        <header className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-tight text-night-50">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-night-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-night-400 transition-colors hover:bg-night-800 hover:text-night-100"
          >
            <Icon name="x" size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-1">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center gap-2 border-t border-night-700/60 bg-night-900/50 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
