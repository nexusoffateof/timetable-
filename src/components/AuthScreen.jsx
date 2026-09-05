import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Button from './ui/Button.jsx'
import Icon from './ui/Icon.jsx'
import { Field, TextInput } from './ui/Field.jsx'

/**
 * Вход и регистрация.
 *
 * Отдельный экран, а не модалка: пока пользователь не вошёл, показывать
 * под ним нечего — расписание живёт в его аккаунте.
 */
export default function AuthScreen() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const signUp = mode === 'signup'

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return

    setError(null)
    setNotice(null)

    if (!email.trim() || !password) {
      setError('Заполните почту и пароль')
      return
    }
    if (signUp && password.length < 8) {
      setError('Пароль должен быть не короче восьми символов')
      return
    }

    setBusy(true)
    try {
      const { data, error: authError } = signUp
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password })

      if (authError) {
        setError(humanError(authError.message))
        return
      }

      // Если в проекте включено подтверждение почты, сессии сразу не будет.
      if (signUp && !data.session) {
        setNotice('Аккаунт создан. Проверьте почту — там ссылка для подтверждения.')
      }
    } catch {
      setError('Не удалось связаться с сервером. Проверьте соединение.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand">
            <Icon name="calendar" size={20} />
          </span>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-night-50">Расписание</h1>
            <p className="text-[12.5px] text-night-400">Планировщик уроков для учителя</p>
          </div>
        </div>

        <form onSubmit={submit} className="panel space-y-4 p-5">
          <div className="flex gap-1 rounded-xl border border-night-700/60 bg-night-900/70 p-0.5">
            {[
              ['signin', 'Вход'],
              ['signup', 'Регистрация'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMode(id)
                  setError(null)
                  setNotice(null)
                }}
                className={`flex-1 rounded-[10px] py-1.5 text-[13px] font-medium transition-colors ${
                  mode === id
                    ? 'bg-night-700 text-night-50'
                    : 'text-night-400 hover:text-night-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <Field label="Почта">
            <TextInput
              type="email"
              autoComplete="email"
              value={email}
              placeholder="you@school.ru"
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field
            label="Пароль"
            hint={signUp ? 'Не короче восьми символов.' : undefined}
          >
            <TextInput
              type="password"
              autoComplete={signUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          {error && (
            <p className="flex items-start gap-2 rounded-xl border border-red/25 bg-red/8 p-3 text-[12.5px] leading-relaxed text-night-200">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-red" />
              {error}
            </p>
          )}
          {notice && (
            <p className="flex items-start gap-2 rounded-xl border border-green/25 bg-green/8 p-3 text-[12.5px] leading-relaxed text-night-200">
              <Icon name="check" size={14} className="mt-0.5 shrink-0 text-green" />
              {notice}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full justify-center"
            disabled={busy}
          >
            {busy ? 'Минуту…' : signUp ? 'Создать аккаунт' : 'Войти'}
          </Button>
        </form>

        <p className="mt-4 text-center text-[12px] leading-relaxed text-night-500">
          Расписание хранится в вашем аккаунте и доступно с любого устройства.
          Чужие расписания вам не видны, ваше — никому.
        </p>
      </div>
    </div>
  )
}

/** Сообщения Supabase приходят по-английски и техническим языком. */
function humanError(message = '') {
  if (/invalid login credentials/i.test(message)) return 'Неверная почта или пароль'
  if (/user already registered/i.test(message)) return 'Такой аккаунт уже есть — войдите'
  if (/password should be at least/i.test(message)) return 'Пароль слишком короткий'
  if (/unable to validate email|invalid format/i.test(message)) return 'Проверьте адрес почты'
  if (/email rate limit|over_email_send_rate_limit/i.test(message))
    return 'Слишком много попыток. Подождите минуту.'
  return message || 'Не удалось войти'
}
