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
import { createSeedState } from '../data/seed.js'
import * as storage from '../lib/storage.js'

const ScheduleContext = createContext(null)
const ToastContext = createContext(null)

export function ScheduleProvider({ children }) {
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => initState(storage.load() ?? createSeedState()),
  )

  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const doc = state.doc

  useEffect(() => {
    storage.save(doc)
  }, [doc])

  // Вкладку могут закрыть до срабатывания отложенной записи.
  useEffect(() => {
    const flush = () => storage.saveNow(doc)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [doc])

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
    }),
    [doc, dispatchWithUndo, undo, redo, state.past.length, state.future.length],
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
