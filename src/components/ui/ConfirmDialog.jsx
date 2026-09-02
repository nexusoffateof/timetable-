import Modal from './Modal.jsx'
import Button from './Button.jsx'
import Icon from './Icon.jsx'

/** Единственный способ что-то безвозвратно удалить — через это окно. */
export default function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  details,
  confirmLabel = 'Удалить',
  secondaryLabel,
  onSecondary,
  tone = 'danger',
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <div className="flex gap-3 pb-2">
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            tone === 'danger' ? 'bg-red/12 text-red' : 'bg-yellow/12 text-yellow'
          }`}
        >
          <Icon name="alert" size={19} />
        </span>
        <div className="min-w-0 space-y-2 pt-0.5">
          <p className="text-sm leading-relaxed text-night-200">{description}</p>
          {details?.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-night-700/60 bg-night-900/60 p-3 text-[13px] text-night-300">
              {details.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-night-500">•</span>
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-2 pb-4">
        <Button variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
        {secondaryLabel && onSecondary && (
          <Button variant="secondary" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        )}
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} data-autofocus>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
