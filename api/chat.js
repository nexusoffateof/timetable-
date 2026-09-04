/**
 * Серверный посредник между виджетом чата и Anthropic Messages API.
 *
 * Зачем отдельная функция: ключ живёт только здесь, в переменных окружения
 * Vercel. Всё, что попало в код фронтенда, доступно любому, кто откроет
 * DevTools — ровно та ошибка, из-за которой в артефакте не работал импорт
 * со скриншота.
 *
 * Переменные окружения (Vercel → Settings → Environment Variables):
 *   ANTHROPIC_API_KEY — обязательна, без неё виджет честно скажет,
 *                       что помощник не подключён.
 */

import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-5'

/** Пределы на вход: эндпоинт публичный, без них его легко разорить. */
const MAX_MESSAGES = 20
const MAX_CHARS = 4000

const SYSTEM = `Ты — помощник внутри веб-приложения «Расписание»: планировщика
школьного расписания для учителя. Отвечай по-русски, коротко и по делу,
без вступлений и без предложений помочь ещё чем-нибудь.

Что умеет приложение:
— Два уровня расписания. «Шаблон» — постоянное расписание, повторяется каждую
  неделю. Режим «Неделя» — конкретные даты: замены, отмены, темы уроков,
  сдвинутое время. Правка одного дня не меняет шаблон, правка шаблона не стирает
  темы уроков. В форме урока за это отвечает переключатель «Куда сохранить».
— Три режима в шапке: Неделя, День, Шаблон. На телефоне по умолчанию «День».
— Урок: предмет, класс, кабинет, тема, личная заметка, своё время на дату.
  Правый клик или долгое нажатие открывает меню: изменить, копировать,
  отменить в этот день, вернуть как в расписании, убрать из расписания.
— Значки на карточке: оранжевая точка — в этот день урок отличается от
  постоянного расписания; часы — время сдвинуто на эту дату; листок — есть
  личная заметка; перечёркнутый круг — урок отменён.
— Настройки: звонки, предметы с цветами, каникулы и праздники диапазоном,
  напоминания, данные (копия и восстановление), справка.
— Экспорт: CSV для Excel, .ics для календаря телефона, JSON как резервная копия.
  Печать даёт светлую версию на A4, личные заметки на бумагу не идут.
— Горячие клавиши: стрелки — неделя, T — сегодня, 1/2/3 — режимы,
  Ctrl+Z — отменить.

Чего пока нет, и врать об этом нельзя: регистрации и входа, синхронизации между
устройствами, Telegram-бота с напоминаниями. Данные хранятся в localStorage
этого браузера. База в Supabase со схемой и политиками RLS уже подготовлена,
но приложение к ней ещё не подключено.

Ты не видишь расписание пользователя — оно не покидает его браузер. Если
спрашивают про конкретные уроки, скажи об этом и подскажи, где посмотреть.

Если ответа не знаешь — так и скажи, не выдумывай.`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Только POST' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(503).json({
      error: 'not_configured',
      message:
        'Помощник не подключён: в переменных окружения нет ANTHROPIC_API_KEY.',
    })
  }

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null
  if (!messages?.length) {
    return res.status(400).json({ error: 'bad_request', message: 'Нет сообщений' })
  }
  if (messages.length > MAX_MESSAGES) {
    return res.status(400).json({
      error: 'too_long',
      message: 'Диалог слишком длинный. Начните новый.',
    })
  }

  const clean = []
  for (const m of messages) {
    if (m?.role !== 'user' && m?.role !== 'assistant') continue
    const content = String(m.content ?? '').slice(0, MAX_CHARS)
    if (content.trim()) clean.push({ role: m.role, content })
  }
  if (!clean.length || clean[0].role !== 'user') {
    return res.status(400).json({ error: 'bad_request', message: 'Нет вопроса' })
  }

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.beta.messages.create({
      model: MODEL,
      // Ответ живёт в узкой панели сбоку — длинные простыни здесь вредны.
      max_tokens: 1024,
      // Вопросы про интерфейс простые, глубокое рассуждение им не нужно.
      output_config: { effort: 'low' },
      // Если модель откажется отвечать, запрос доигрывается на запасной,
      // а не обрывается пустотой.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: clean,
    })

    if (response.stop_reason === 'refusal') {
      return res.status(200).json({
        text: 'Не могу ответить на этот вопрос. Спросите что-нибудь про расписание.',
      })
    }

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    return res.status(200).json({ text: text || 'Пустой ответ, попробуйте переспросить.' })
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return res.status(503).json({ error: 'bad_key', message: 'Ключ API не принят.' })
    }
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({
        error: 'rate_limited',
        message: 'Слишком много запросов. Попробуйте через минуту.',
      })
    }
    console.error('Ошибка обращения к Anthropic:', error)
    return res.status(502).json({
      error: 'upstream',
      message: 'Помощник сейчас недоступен.',
    })
  }
}
