import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon.jsx'
import Button from '../ui/Button.jsx'

/**
 * Боковой чат: выбор между Telegram-ботом и помощником по сайту.
 *
 * Весь виджет помечен no-print — на бумаге ему делать нечего.
 *
 * Помощник ходит в /api/chat, а не напрямую в API: ключ живёт в переменных
 * окружения сервера. Ключ во фронтенде виден любому, кто откроет DevTools.
 */

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT ?? ''

const GREETING = 'Здравствуйте! Что хотите использовать?'

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)

  const listRef = useRef(null)
  const inputRef = useRef(null)
  const launcherRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        launcherRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (mode === 'assistant') inputRef.current?.focus()
  }, [mode])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending])

  const send = useCallback(async () => {
    const question = input.trim()
    if (!question || pending) return

    const next = [...messages, { role: 'user', content: question }]
    setMessages(next)
    setInput('')
    setPending(true)
    setError(null)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(data.message ?? 'Помощник сейчас недоступен.')
        return
      }
      setMessages([...next, { role: 'assistant', content: data.text }])
    } catch {
      setError('Не удалось связаться с помощником. Проверьте соединение.')
    } finally {
      setPending(false)
    }
  }, [input, messages, pending])

  const back = () => {
    setMode(null)
    setError(null)
  }

  return (
    <div className="no-print">
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Открыть чат"
          className="animate-in-pop fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-night-1000 shadow-[0_10px_30px_-8px_rgba(122,162,247,0.7)] transition-transform duration-150 hover:scale-105 active:scale-95 sm:bottom-5 sm:right-5"
        >
          <Icon name="chat" size={22} strokeWidth={2} />
        </button>
      )}

      {open && (
        <aside
          role="dialog"
          aria-label="Чат"
          className="animate-in-pop fixed inset-x-2 bottom-2 z-40 flex max-h-[min(38rem,calc(100dvh-1rem))] flex-col overflow-hidden rounded-2xl border border-night-700/70 bg-night-850/95 shadow-[var(--shadow-pop)] backdrop-blur-xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[23rem]"
        >
          <header className="flex items-center gap-2 border-b border-night-700/60 px-4 py-3">
            {mode && (
              <button
                type="button"
                onClick={back}
                aria-label="Назад"
                className="-ml-1.5 rounded-lg p-1 text-night-400 transition-colors hover:bg-night-800 hover:text-night-100"
              >
                <Icon name="chevronLeft" size={18} />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-night-50">
                {mode === 'telegram' ? 'Telegram-бот' : mode === 'assistant' ? 'Помощник' : 'Чат'}
              </div>
              {mode === 'assistant' && (
                <div className="text-[11px] text-night-450">отвечает на вопросы по сайту</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Закрыть чат"
              className="-mr-1.5 rounded-lg p-1 text-night-400 transition-colors hover:bg-night-800 hover:text-night-100"
            >
              <Icon name="x" size={18} />
            </button>
          </header>

          {mode === null && <Welcome onPick={setMode} />}
          {mode === 'telegram' && <TelegramPane />}
          {mode === 'assistant' && (
            <AssistantPane
              messages={messages}
              pending={pending}
              error={error}
              input={input}
              setInput={setInput}
              send={send}
              listRef={listRef}
              inputRef={inputRef}
            />
          )}
        </aside>
      )}
    </div>
  )
}

/* ── Экран выбора ──────────────────────────────────────────────────────── */

function Welcome({ onPick }) {
  return (
    <div className="space-y-3 p-4">
      <p className="text-[13.5px] leading-relaxed text-night-100">{GREETING}</p>

      <Choice
        icon="telegram"
        title="Telegram-бот"
        body="Напоминания об уроках и расписание на сегодня прямо в мессенджере."
        onClick={() => onPick('telegram')}
      />
      <Choice
        icon="sparkle"
        title="Помощник"
        body="Задать вопрос по сайту или по боту: как что устроено, где что искать."
        onClick={() => onPick('assistant')}
      />
    </div>
  )
}

function Choice({ icon, title, body, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/choice flex w-full items-start gap-3 rounded-xl border border-night-700/70 bg-night-900/50 p-3 text-left transition-colors duration-150 hover:border-brand/40 hover:bg-night-800/70"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand">
        <Icon name={icon} size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-night-50">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-night-400">{body}</span>
      </span>
      <Icon
        name="chevronRight"
        size={16}
        className="mt-2 text-night-600 transition-transform duration-150 group-hover/choice:translate-x-0.5 group-hover/choice:text-brand"
      />
    </button>
  )
}

/* ── Telegram ──────────────────────────────────────────────────────────── */

function TelegramPane() {
  if (!BOT_USERNAME) {
    return (
      <div className="space-y-3 p-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-yellow/25 bg-yellow/8 p-3">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-yellow" />
          <p className="text-[12.5px] leading-relaxed text-night-200">
            Бот ещё не подключён. Это шестой этап: сначала расписание переезжает
            в базу, потом бот учится понимать, кому какое расписание принадлежит.
          </p>
        </div>
        <div className="space-y-2 text-[12.5px] leading-relaxed text-night-400">
          <p>Когда бот появится, здесь будет:</p>
          <ul className="space-y-1.5 pl-1">
            {[
              'Кнопка привязки — одноразовый код, который вы отправите боту',
              'Расписание на сегодня и на завтра по команде',
              'Напоминание за 15 минут до урока',
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-night-600">—</span>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="rounded-xl border border-night-700/60 bg-night-900/40 p-3 text-[12px] leading-relaxed text-night-450">
          Порядок подключения расписан в <code className="num text-night-300">docs/ROADMAP.md</code>.
          Таблицы и функция выборки напоминаний в базе уже готовы.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-[12.5px] leading-relaxed text-night-300">
        Бот присылает напоминания об уроках и расписание на сегодня. Чтобы он
        понял, кому писать, аккаунт нужно привязать один раз.
      </p>
      <a
        href={`https://t.me/${BOT_USERNAME}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-night-1000 transition-colors hover:bg-[#8fb2f9]"
      >
        <Icon name="telegram" size={16} />
        Открыть @{BOT_USERNAME}
      </a>
    </div>
  )
}

/* ── Помощник ──────────────────────────────────────────────────────────── */

const SUGGESTIONS = [
  'Чем шаблон отличается от режима «Неделя»?',
  'Что означает оранжевая точка на уроке?',
  'Как отметить каникулы?',
]

function AssistantPane({ messages, pending, error, input, setInput, send, listRef, inputRef }) {
  return (
    <>
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {!messages.length && (
          <div className="space-y-3">
            <p className="text-[12.5px] leading-relaxed text-night-400">
              Отвечаю на вопросы про это приложение и про будущего бота.
              Само расписание я не вижу — оно не покидает ваш браузер.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => setInput(text)}
                  className="w-full rounded-lg border border-night-700/60 px-3 py-2 text-left text-[12px] text-night-300 transition-colors hover:border-night-600 hover:bg-night-800/60 hover:text-night-100"
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
                message.role === 'user'
                  ? 'rounded-br-md bg-brand/85 text-night-1000'
                  : 'rounded-bl-md bg-night-800 text-night-100'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-2xl rounded-bl-md bg-night-800 px-3 py-3">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-night-400"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-xl border border-red/25 bg-red/8 p-3 text-[12px] leading-relaxed text-night-200">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-red" />
            {error}
          </p>
        )}
      </div>

      <div className="border-t border-night-700/60 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            placeholder="Ваш вопрос…"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            className="max-h-28 min-h-9 flex-1 resize-none rounded-xl border border-night-700/70 bg-night-900/70 px-3 py-2 text-[12.5px] text-night-100 placeholder:text-night-450 focus:border-brand/70 focus:outline-none focus:ring-2 focus:ring-brand/25"
          />
          <Button
            variant="primary"
            size="icon"
            icon="send"
            aria-label="Отправить"
            disabled={!input.trim() || pending}
            onClick={send}
          />
        </div>
      </div>
    </>
  )
}
