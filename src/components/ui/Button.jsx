import Icon from './Icon.jsx'

const VARIANTS = {
  primary:
    'bg-brand text-night-1000 font-semibold hover:bg-[#8fb2f9] active:bg-[#6d97f5] shadow-[0_1px_0_0_rgba(255,255,255,0.18)_inset,0_6px_20px_-10px_rgba(122,162,247,0.9)]',
  secondary:
    'bg-night-750/80 text-night-100 hover:bg-night-700 border border-night-700/70',
  ghost: 'text-night-300 hover:text-night-50 hover:bg-night-750/70',
  danger:
    'bg-red/12 text-red border border-red/30 hover:bg-red/20 hover:border-red/50',
  quiet: 'text-night-400 hover:text-night-100 hover:bg-night-800/80',
}

const SIZES = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9.5 px-3.5 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
  icon: 'h-9 w-9 justify-center rounded-lg',
  iconSm: 'h-7 w-7 justify-center rounded-md',
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  children,
  className = '',
  ...rest
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center whitespace-nowrap transition-[background-color,border-color,color,transform,box-shadow] duration-150 disabled:opacity-40 disabled:pointer-events-none active:translate-y-px ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' || size === 'iconSm' ? 15 : 17} />}
      {children}
      {iconRight && <Icon name={iconRight} size={15} />}
    </button>
  )
}
