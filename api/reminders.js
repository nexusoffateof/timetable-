/**
 * Рассылка напоминаний. Запускается по расписанию (cron), не сервером,
 * который висит постоянно.
 *
 * Три классические ловушки закрыты так:
 *
 * 1. Часовые пояса — на стороне базы. due_reminders() считает момент урока
 *    как «дата + время» в личном поясе учителя (now() at time zone
 *    profiles.timezone). Сервер про UTC здесь не вспоминает.
 *
 * 2. Дубли — «сначала застолби, потом отправь». Cron ходит чаще, чем ширина
 *    окна, поэтому один урок попал бы в выборку несколько раз. Строка в
 *    reminder_log вставляется ДО отправки: параллельный запуск упрётся
 *    в конфликт первичного ключа и пропустит урок. Если отправка сорвалась,
 *    заявка снимается — следующий запуск попробует снова.
 *
 * 3. Каникулы и отмены — тоже в due_reminders(): в отмеченные дни шаблон не
 *    разворачивается, отменённые уроки отсеиваются по статусу.
 *
 * Недоступность Telegram у одного человека не роняет рассылку остальным:
 * каждая отправка в своём try/catch.
 */

import { serviceClient } from './_lib/supabase.js'
import { sendMessage, TelegramError } from './_lib/telegram.js'
import { formatReminder } from './_lib/format.js'

/**
 * Ширина окна выборки в минутах. Должна быть чуть больше периода cron,
 * иначе урок проскочит между запусками: cron раз в 5 минут — окно 6.
 */
const WINDOW_MINUTES = Number(process.env.REMINDER_WINDOW_MINUTES ?? 6)

export default async function handler(req, res) {
  // Vercel Cron присылает Authorization: Bearer <CRON_SECRET>.
  // Без проверки рассылку мог бы запустить кто угодно и когда угодно.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const header = req.headers.authorization ?? ''
    if (header !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Не авторизовано' })
    }
  }

  const db = serviceClient()
  if (!db) {
    return res.status(503).json({ error: 'not_configured', message: 'Нет доступа к базе' })
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ error: 'not_configured', message: 'Нет токена бота' })
  }

  const { data: due, error } = await db.rpc('due_reminders', {
    p_window_minutes: WINDOW_MINUTES,
  })

  if (error) {
    console.error('Не удалось получить выборку напоминаний:', error)
    return res.status(502).json({ error: 'db', message: error.message })
  }

  const stats = { найдено: due?.length ?? 0, отправлено: 0, пропущено: 0, ошибок: 0, отвязано: 0 }

  for (const row of due ?? []) {
    // Заявка. Конфликт первичного ключа означает, что этот урок уже
    // застолбил другой запуск — молча пропускаем.
    const { error: claimError } = await db.from('reminder_log').insert({
      user_id: row.user_id,
      on_date: row.on_date,
      bell_id: row.bell_id,
    })

    if (claimError) {
      if (claimError.code === '23505') stats.пропущено += 1
      else {
        stats.ошибок += 1
        console.error('Не удалось застолбить напоминание:', claimError)
      }
      continue
    }

    try {
      await sendMessage(row.chat_id, formatReminder(row))
      stats.отправлено += 1
    } catch (sendError) {
      stats.ошибок += 1

      if (sendError instanceof TelegramError && sendError.blocked) {
        // Бот заблокирован или чат удалён: повторять бессмысленно.
        // Заявку оставляем, связь убираем.
        await db.from('telegram_links').delete().eq('chat_id', row.chat_id)
        stats.отвязано += 1
        console.warn(`Связь с чатом ${row.chat_id} снята: ${sendError.description}`)
        continue
      }

      // Временная неудача: снимаем заявку, следующий запуск попробует снова.
      await db
        .from('reminder_log')
        .delete()
        .eq('user_id', row.user_id)
        .eq('on_date', row.on_date)
        .eq('bell_id', row.bell_id)

      console.error('Не удалось отправить напоминание:', sendError.description ?? sendError.message)
    }
  }

  return res.status(200).json({ ok: true, окно: WINDOW_MINUTES, ...stats })
}
