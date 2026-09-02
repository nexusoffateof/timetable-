import { useEffect, useState } from 'react'
import { nowMinutes, todayISO } from './datetime.js'

/**
 * Текущие «сейчас» для маркеров активного урока.
 * Тик раз в 30 секунд: точнее не нужно, а перерисовок меньше.
 */
export function useNow() {
  const [now, setNow] = useState(() => ({ minutes: nowMinutes(), date: todayISO() }))

  useEffect(() => {
    const id = setInterval(() => {
      setNow((prev) => {
        const minutes = nowMinutes()
        const date = todayISO()
        return prev.minutes === minutes && prev.date === date ? prev : { minutes, date }
      })
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  return now
}
