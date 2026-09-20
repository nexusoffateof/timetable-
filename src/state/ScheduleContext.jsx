import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { initState, reducer } from './scheduleReducer.js'
import { createSeedState, createEmptyState } from '../data/seed.js'
import * as storage from '../lib/storage.js'
import { useAuth } from './AuthContext.jsx'
import { loadAll, pushDiff, pickFirstDoc, isEmptyDoc, writeCompact } from '../lib/repo/cloud.js'

const ScheduleContext = createContext(null)
const ToastContext = createContext(null)

export function ScheduleProvider({ children }) {
  const { cloudEnabled, user } = useAuth()

  // Именно идентификатор, а не объект пользователя. Объект сессии
  // пересоздаётся при каждом обновлении токена — примерно раз в час и при
  // возврате на вкладку, — и эффект загрузки, завязанный на него, гонял бы
  // расписание из базы заново, показывая заставку поверх работы.
  const userId = user?.id ?? null

  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initState(cloudEnabled ? createEmptyState() : (storage.load() ?? createSeedState())),
  )

  const [toasts, setToasts] = useState([])
  const [ready, setReady] = useState(!cloudEnabled)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState(null)
  const timers = useRef(new Map())
  /** Последнее состояние, которое точно записано в базу. */
  const synced = useRef(null)

  const doc = state.doc

  /* ── Локальный режим: всё как раньше ─────────────────────────────────── */

  useEffect(() => {
    if (cloudEnabled) return
    storage.save(doc)
  }, [doc, cloudEnabled])

  // Вкладку могут закрыть до срабатывания отложенной записи.
  useEffect(() => {
    if (cloudEnabled) return
    const flush = () => storage.saveNow(doc)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [doc, cloudEnabled])

  /* ── Облачный режим ──────────────────────────────────────────────────── */

  useEffect(() => {
    if (!cloudEnabled) return

    let alive = true

    ;(async () => {
      if (!userId) {
        // Вышли из аккаунта: чужое расписание не должно остаться
        // ни на экране, ни в памяти до входа следующего.
        synced.current = null
        setReady(false)
        dispatch({ type: 'hydrate', doc: createEmptyState() })
        return
      }

      setReady(false)
      setSyncError(null)
      try {
        let cloud = await loadAll(userId)

        if (isEmptyDoc(cloud)) {
          // Локальное расписание переезжает в аккаунт один раз за браузер.
          // Иначе второй аккаунт на том же компьютере получил бы копию
          // расписания первого.
          const { doc: fresh, fromLocal } = pickFirstDoc({
            local: storage.load(),
            migrated: storage.migratedTo() !== null,
            fallback: createEmptyState(),
          })

          cloud = { ...fresh, settings: cloud.settings }
          await pushDiff(userId, emptyBaseline(), cloud)

          // Отметку ставим только после успешной записи: если запрос
          // не дошёл, следующая попытка должна повторить переезд.
          if (fromLocal) storage.markMigrated(userId)
        }

        if (!alive) return
        synced.current = cloud
        dispatch({ type: 'hydrate', doc: cloud })
        setReady(true)
      } catch (error) {
        if (!alive) return
        console.error('Не удалось загрузить расписание:', error)
        setSyncError(error.message ?? 'Не удалось загрузить расписание')
        setReady(true)
      }
    })()

    return () => {
      alive = false
    }
  }, [cloudEnabled, userId])

  // Отправка изменений. Сравнение с последним записанным состоянием, а не
  // перехват действий: так «отменить» и восстановление из копии
  // синхронизируются сами, без отдельной обработки.
  useEffect(() => {
    if (!cloudEnabled || !userId || !ready) return
    if (!synced.current || synced.current === doc) return

    writeCompact(doc.settings.compactCells)

    const timer = setTimeout(async () => {
      const baseline = synced.current
      setSyncing(true)
      try {
        await pushDiff(userId, baseline, doc)
        synced.current = doc
        setSyncError(null)
      } catch (error) {
        console.error('Не удалось сохранить изменения:', error)
        // Отметку не двигаем: следующая правка отправит и эти изменения тоже.
        setSyncError(error.message ?? 'Изменения не сохранились')
      } finally {
        setSyncing(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [doc, ready, userId, cloudEnabled])

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    ({ message, action, tone = 'default', duration = 5000 }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setToasts((list) => [...list.slice(-2), { id, message, action, tone }])
      timers.current.set(
        id,
        setTimeout(() => dismissToast(id), duration),
      )
      return id
    },
    [dismissToast],
  )

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const timer of map.values()) clearTimeout(timer)
      map.clear()
    }
  }, [])

  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])

  /** Действие + тост с откатом — единый способ делать удаления безопасными. */
  const dispatchWithUndo = useCallback(
    (action, message) => {
      dispatch(action)
      toast({ message, action: { label: 'Вернуть', onClick: () => dispatch({ type: 'undo' }) } })
    },
    [toast],
  )

  const value = useMemo(
    () => ({
      state: doc,
      dispatch,
      dispatchWithUndo,
      undo,
      redo,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      ready,
      syncing,
      syncError,
    }),
    [
      doc,
      dispatchWithUndo,
      undo,
      redo,
      state.past.length,
      state.future.length,
      ready,
      syncing,
      syncError,
    ],
  )

  const toastValue = useMemo(() => ({ toasts, toast, dismissToast }), [toasts, toast, dismissToast])

  return (
    <ScheduleContext.Provider value={value}>
      <ToastContext.Provider value={toastValue}>{children}</ToastContext.Provider>
    </ScheduleContext.Provider>
  )
}

export function useSchedule() {
  const ctx = useContext(ScheduleContext)
  if (!ctx) throw new Error('useSchedule вызван вне ScheduleProvider')
  return ctx
}

export function useToasts() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToasts вызван вне ScheduleProvider')
  return ctx
}

/** Пустая база отсчёта: с ней diff превращается в «записать всё». */
function emptyBaseline() {
  return { settings: null, bells: [], subjects: [], template: [], overrides: [], days: [] }
}
