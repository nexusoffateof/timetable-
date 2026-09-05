import { createClient } from '@supabase/supabase-js'

/**
 * Клиент Supabase для браузера.
 *
 * Ключ anon публичен по своей природе — он и должен быть в браузере.
 * Доступ к данным ограничивают политики RLS, а не секретность ключа.
 *
 * Если переменные не заданы, клиента нет и приложение работает как раньше,
 * на localStorage. Так сайт не ломается до того, как вы настроите базу.
 */

// import.meta.env подставляет Vite. В обычном Node его нет, а модуль
// подтягивается тестами через цепочку импортов — поэтому читаем осторожно.
const env = import.meta.env ?? {}
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY

export const supabase = url && key ? createClient(url, key) : null

export const cloudEnabled = Boolean(supabase)
