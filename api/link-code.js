/**
 * Выдача одноразового кода привязки Telegram.
 *
 * Вызывается сайтом с токеном вошедшего пользователя:
 *   fetch('/api/link-code', { headers: { Authorization: `Bearer ${session.access_token}` } })
 *
 * user_id берётся из проверенного токена, а не из тела запроса — иначе любой
 * желающий привязал бы свой Telegram к чужому расписанию.
 */

import { serviceClient, anonClient } from './_lib/supabase.js'

/** Без похожих друг на друга символов: код диктуют и набирают руками. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
const TTL_MINUTES = 10

function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Только POST' })
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Нужен токен пользователя' })

  const auth = anonClient()
  const db = serviceClient()
  if (!auth || !db) {
    return res.status(503).json({ error: 'not_configured', message: 'Нет доступа к базе' })
  }

  const { data: userData, error: authError } = await auth.auth.getUser(token)
  if (authError || !userData?.user) {
    return res.status(401).json({ error: 'Токен не принят' })
  }
  const userId = userData.user.id

  // Прошлые невыданные коды гасим: активным должен быть ровно один.
  await db
    .from('telegram_link_codes')
    .delete()
    .eq('user_id', userId)
    .is('used_at', null)

  const code = generateCode()
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000).toISOString()

  const { error } = await db
    .from('telegram_link_codes')
    .insert({ code, user_id: userId, expires_at: expiresAt })

  if (error) {
    console.error('Не удалось создать код привязки:', error)
    return res.status(500).json({ error: 'db', message: 'Не удалось создать код' })
  }

  const bot = process.env.VITE_TELEGRAM_BOT ?? process.env.TELEGRAM_BOT ?? ''
  return res.status(200).json({
    code,
    expires_at: expiresAt,
    ttl_minutes: TTL_MINUTES,
    deep_link: bot ? `https://t.me/${bot}?start=${code}` : null,
  })
}
