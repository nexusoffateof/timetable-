import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'

/**
 * Плавающее меню у точки клика. Само отодвигается от краёв экрана,
 * закрывается по Esc, клику мимо и скроллу.
 */
export default function PopMenu({ open, x, y, onClose, items, header }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const margin = 8
    setPos({
      left: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin)),
    })
  }, [open, x, y, items])

  useEffect(() => {
    if (!open) return
    const close = () => onClose()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="no-print fixed inset-0 z-[55]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      <div
        ref={ref}
        role="menu"
        style={{ left: pos.left, top: pos.top }}
        onClick={(event) => event.stopPropagation()}
        className="animate-in-pop absolute min-w-52 overflow-hidden rounded-xl border border-night-700/80 bg-night-850/95 py-1 shadow-[var(--shadow-pop)] backdrop-blur-md"
      >
        {header && (
          <div className="truncate border-b border-night-700/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-night-450">
            {header}
          </div>
        )}
        {items.map((item, index) =>
          item.separator ? (
            <div key={`sep-${index}`} className="my-1 h-px bg-night-700/60" />
          ) : (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onClick?.()
                onClose()
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors disabled:opacity-35 ${
                item.tone === 'danger'
                  ? 'text-red hover:bg-red/12'
                  : item.active
                    ? 'bg-night-750 text-night-50'
                    : 'text-night-200 hover:bg-night-750 hover:text-night-50'
              }`}
            >
              {item.icon ? (
                <Icon name={item.icon} size={15} className="text-night-400" />
              ) : (
                <span className="w-[15px]" />
              )}
              <span className="flex-1 truncate">{item.label}</span>
              {item.hint && <span className="num text-[11px] text-night-500">{item.hint}</span>}
              {item.active && <Icon name="check" size={14} className="text-brand" />}
            </button>
          ),
        )}
      </div>
    </div>,
    document.body,
  )
}
