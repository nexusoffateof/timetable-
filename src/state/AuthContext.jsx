import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, cloudEnabled } from '../lib/supabase.js'

const AuthContext = createContext(null)

/**
 * Сессия пользователя.
 *
 * Пока Supabase не настроен (нет переменных окружения), режим «локальный»:
 * приложение работает как раньше, на localStorage, и экрана входа нет.
 * Так сайт не превращается в форму логина до того, как база подключена.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(cloudEnabled)

  useEffect(() => {
    if (!cloudEnabled) return

    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session ?? null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null)
      setLoading(false)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(
    () => ({
      cloudEnabled,
      loading,
      session,
      user: session?.user ?? null,
      accessToken: session?.access_token ?? null,
      signOut: () => supabase?.auth.signOut(),
    }),
    [loading, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth вызван вне AuthProvider')
  return ctx
}
