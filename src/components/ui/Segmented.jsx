import Icon from './Icon.jsx'

/** Переключатель режимов. Активный сегмент — на подложке, без рамок-коробок. */
export default function Segmented({ value, onChange, options, size = 'md', stretch = false, className = '' }) {
  const pad = size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3 text-sm'
  return (
    <div
      role="tablist"
      className={`${stretch ? 'flex w-full' : 'inline-flex'} items-center gap-0.5 rounded-xl border border-night-700/60 bg-night-900/70 p-0.5 ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            title={option.title ?? option.label}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-all duration-150 ${
              stretch ? 'min-w-0 flex-1' : ''
            } ${pad} ${
              active
                ? 'bg-night-700 text-night-50 shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset]'
                : 'text-night-400 hover:text-night-100 hover:bg-night-800/70'
            }`}
          >
            {option.icon && <Icon name={option.icon} size={15} />}
            <span className={`truncate ${option.hideLabelOnMobile ? 'hidden sm:inline' : ''}`}>
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
