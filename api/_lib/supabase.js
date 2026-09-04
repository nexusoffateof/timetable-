import { createClient } from '@supabase/supabase-js'

/**
 * Клиенты Supabase для серверных функций.
 *
 * service_role обходит RLS и видит всю базу целиком — он живёт только здесь,
 * в переменных окружения Vercel, и никогда не должен иметь префикс VITE_:
 * Vite подставляет такие значения прямо в бандл.
 */

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL

/** Клиент бота и cron: полный доступ, политики RLS не применяются. */
export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Проверка токена пользователя: под ним работают запросы от сайта. */
export function anonClient() {
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Сегодняшняя дата в часовом поясе пользователя.
 *
 * Сервер живёт по UTC, учитель — нет. В UTC+10 «сегодня» наступает на десять
 * часов раньше, и наивный вызов вернул бы вчерашний день. Локаль en-CA даёт
 * ISO-формат YYYY-MM-DD без ручной сборки строки.
 */
export function localDate(timezone, at = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at)
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at)
  }
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
