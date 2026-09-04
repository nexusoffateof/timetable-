/** Тонкая обёртка над Telegram Bot API. */

const API = 'https://api.telegram.org'

export class TelegramError extends Error {
  constructor(message, { status, description, retryAfter } = {}) {
    super(message)
    this.name = 'TelegramError'
    this.status = status
    this.description = description
    this.retryAfter = retryAfter
    /** Пользователь заблокировал бота или удалил чат — связь мертва. */
    this.blocked =
      status === 403 ||
      /bot was blocked|user is deactivated|chat not found|bot was kicked/i.test(
        description ?? '',
      )
  }
}

export async function callTelegram(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new TelegramError('TELEGRAM_BOT_TOKEN не задан')

  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.ok === false) {
    throw new TelegramError(`Telegram ответил ошибкой на ${method}`, {
      status: response.status,
      description: data.description,
      retryAfter: data.parameters?.retry_after,
    })
  }
  return data.result
}

export function sendMessage(chatId, text, extra = {}) {
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...extra,
  })
}

/** Экранирование под parse_mode: HTML. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
