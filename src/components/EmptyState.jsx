import Button from './ui/Button.jsx'
import Icon from './ui/Icon.jsx'

export default function EmptyState({ icon = 'calendar', title, description, actions }) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-night-800 text-night-400">
        <Icon name={icon} size={22} />
      </span>
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-[15px] font-semibold tracking-tight text-night-50">{title}</h3>
        <p className="text-[13px] leading-relaxed text-night-400">{description}</p>
      </div>
      {actions?.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant={action.primary ? 'primary' : 'secondary'}
              size="sm"
              icon={action.icon}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
