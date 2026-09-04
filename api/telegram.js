/**
 * Вебхук Telegram-бота.
 *
 * Главная задача бота — понять, кому какое расписание принадлежит.
 * Схема привязки:
 *   1. На сайте пользователь получает одноразовый код (api/link-code.js).
 *   2. Отправляет боту /start КОД.
 *   3. Бот сохраняет пару chat_id ↔ user_id и гасит код.
 *
 * Токен бота живёт только здесь, в переменных окружения. Токен в браузере =
 * чужой человек управляет вашим ботом.
 *
 * Подключение вебхука (один раз, из терминала):
 *   curl "https://api.telegram.org/bot<ТОКЕН>/setWebhook" \
 *     -d url=https://<домен>/api/telegram \
 *     -d secret_token=<TELEGRAM_WEBHOOK_SECRET>
 */

import { serviceClient, localDate, addDays } from './_lib/supabase.js'
import { sendMessage, esc, TelegramError } from './_lib/telegram.js'
import { formatDay, HELP } from './_lib/format.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Только POST' })
  }

  // Telegram подписывает запросы общим секретом, заданным при setWebhook.
  // Без проверки эндпоинт может дёрнуть кто угодно.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).json({ error: 'Неверный секрет вебхука' })
  }

  const message = req.body?.message ?? req.body?.edited_message
  const chatId = message?.chat?.id
  const text = String(message?.text ?? '').trim()

  // Telegram повторяет доставку, пока не получит 200. Любую нештатную
  // ситуацию гасим здесь, иначе он будет долбить эндпоинт бесконечно.
  if (!chatId || !text) return res.status(200).json({ ok: true })

  const db = serviceClient()
  if (!db) {
    await safeSend(chatId, 'Бот не настроен: нет доступа к базе.')
    return res.status(200).json({ ok: true })
  }

  try {
    await route({ db, chatId, text, from: message.from })
  } catch (error) {
    console.error('Ошибка обработки сообщения:', error)
    await safeSend(chatId, 'Что-то пошло не так. Попробуйте ещё раз позже.')
  }

  return res.status(200).json({ ok: true })
}

async function route({ db, chatId, text, from }) {
  const [rawCommand, ...args] = text.split(/\s+/)
  const command = rawCommand.toLowerCase().split('@')[0]

  switch (command) {
    case '/start':
      return args[0]
        ? linkAccount({ db, chatId, code: args[0], from })
        : greet({ db, chatId })

    case '/today':
      return showDay({ db, chatId, offset: 0 })
    case '/tomorrow':
      return showDay({ db, chatId, offset: 1 })
    case '/week':
      return showWeek({ db, chatId })
    case '/stop':
      return unlink({ db, chatId })
    case '/help':
      return sendMessage(chatId, HELP)

    default:
      return sendMessage(
        chatId,
        'Не знаю такой команды. /help — что я умею.',
      )
  }
}

/* ── Привязка ──────────────────────────────────────────────────────────── */

async function linkAccount({ db, chatId, code, from }) {
  const normalized = code.trim().toUpperCase()

  const { data: row } = await db
    .from('telegram_link_codes')
    .select('code, user_id, expires_at, used_at')
    .eq('code', normalized)
    .maybeSingle()

  if (!row) {
    return sendMessage(chatId, 'Код не найден. Получите новый на сайте.')
  }
  if (row.used_at) {
    return sendMessage(chatId, 'Этот код уже использован. Получите новый на сайте.')
  }
  if (new Date(row.expires_at) < new Date()) {
    return sendMessage(chatId, 'Срок действия кода истёк. Получите новый на сайте.')
  }

  // chat_id уникален: если этот чат был привязан к другому аккаунту,
  // старую связь надо снять, иначе upsert упрётся в ограничение.
  await db.from('telegram_links').delete().eq('chat_id', chatId)

  const { error: linkError } = await db.from('telegram_links').upsert(
    {
      user_id: row.user_id,
      chat_id: chatId,
      username: from?.username ?? null,
      linked_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (linkError) {
    console.error('Не удалось сохранить привязку:', linkError)
    return sendMessage(chatId, 'Не удалось привязать аккаунт. Попробуйте позже.')
  }

  // Код одноразовый. Гасим только после успешной привязки, иначе при сбое
  // пользователь остался бы и без связи, и без кода.
  await db
    .from('telegram_link_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code', normalized)

  return sendMessage(
    chatId,
    `Готово, аккаунт привязан.\n\nБуду присылать напоминания перед уроками. ${HELP}`,
  )
}

async function unlink({ db, chatId }) {
  const { data } = await db
    .from('telegram_links')
    .delete()
    .eq('chat_id', chatId)
    .select('user_id')

  return sendMessage(
    chatId,
    data?.length
      ? 'Аккаунт отвязан, напоминания приходить не будут. Чтобы вернуть — /start с новым кодом.'
      : 'Этот чат и не был привязан.',
  )
}

async function greet({ db, chatId }) {
  const user = await userByChat(db, chatId)
  if (user) return sendMessage(chatId, `С возвращением. ${HELP}`)

  return sendMessage(
    chatId,
    `Здравствуйте. Я присылаю напоминания об уроках.\n\n` +
      `Чтобы начать, откройте расписание на сайте, получите код привязки ` +
      `и отправьте мне <code>/start КОД</code>.`,
  )
}

/* ── Расписание ────────────────────────────────────────────────────────── */

/**
 * Два отдельных запроса вместо вложенного profiles(timezone).
 *
 * Вложенный требует, чтобы PostgREST однозначно вывел связь из внешних ключей
 * и держал схему в свежем кеше. У user_id теперь два внешних ключа —
 * на auth.users и на profiles, — и проверить поведение снаружи неоткуда.
 * Лишний round-trip раз в команду дешевле, чем бот, падающий на каждом /today.
 */
async function userByChat(db, chatId) {
  const { data: link } = await db
    .from('telegram_links')
    .select('user_id')
    .eq('chat_id', chatId)
    .maybeSingle()

  if (!link) return null

  const { data: profile } = await db
    .from('profiles')
    .select('timezone')
    .eq('id', link.user_id)
    .maybeSingle()

  return {
    userId: link.user_id,
    timezone: profile?.timezone ?? 'Europe/Moscow',
  }
}

async function showDay({ db, chatId, offset }) {
  const user = await userByChat(db, chatId)
  if (!user) return sendMessage(chatId, 'Сначала привяжите аккаунт: /start КОД')

  // Дата берётся в поясе учителя, а не сервера: в UTC+10 «сегодня»
  // наступает на десять часов раньше, чем в UTC.
  const date = addDays(localDate(user.timezone), offset)
  return sendMessage(chatId, await dayText(db, user.userId, date))
}

async function showWeek({ db, chatId }) {
  const user = await userByChat(db, chatId)
  if (!user) return sendMessage(chatId, 'Сначала привяжите аккаунт: /start КОД')

  const start = localDate(user.timezone)
  const chunks = []
  for (let i = 0; i < 7; i++) {
    chunks.push(await dayText(db, user.userId, addDays(start, i), { short: true }))
  }
  return sendMessage(chatId, chunks.join('\n\n'))
}

async function dayText(db, userId, date, { short = false } = {}) {
  const { data: mark } = await db
    .from('day_marks')
    .select('kind, label')
    .eq('user_id', userId)
    .eq('on_date', date)
    .maybeSingle()

  const off = mark && (mark.kind === 'holiday' || mark.kind === 'vacation')
  const dayLabel = off ? mark.label || (mark.kind === 'holiday' ? 'Праздник' : 'Каникулы') : null

  const { data: lessons, error } = await db.rpc('resolved_lessons', {
    p_user: userId,
    p_date: date,
  })

  if (error) {
    console.error('Не удалось собрать расписание:', error)
    return `Не удалось получить расписание на ${esc(date)}.`
  }

  const rows = short ? (lessons ?? []).filter((l) => l.status !== 'cancelled') : lessons
  return formatDay(date, rows, { dayLabel })
}

async function safeSend(chatId, text) {
  try {
    await sendMessage(chatId, text)
  } catch (error) {
    if (!(error instanceof TelegramError)) throw error
    console.error('Не удалось отправить сообщение:', error.description ?? error.message)
  }
}
