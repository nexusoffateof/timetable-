# Бот и напоминания: подключение

Код готов и покрыт тестами. Осталось выдать ему доступы и включить.

## Что уже есть

| Файл | Что делает |
|---|---|
| `api/telegram.js` | Вебхук бота: `/start КОД`, `/today`, `/tomorrow`, `/week`, `/stop`, `/help` |
| `api/reminders.js` | Рассылка напоминаний, вызывается по расписанию |
| `api/link-code.js` | Выдача одноразового кода привязки сайту |
| `.github/workflows/reminders.yml` | Запуск рассылки каждые 5 минут |
| `supabase/schema.sql` | Таблицы, RLS, `resolved_lessons()`, `due_reminders()` |

## Чего пока нет

**Сайт не подключён к Supabase, и авторизации нет.** Это значит: получить код
привязки из интерфейса пока негде — нет вошедшего пользователя, к которому
можно привязать Telegram. `api/link-code.js` написан и ждёт, но вызывать его
некому.

Порядок такой: сначала пятый этап (клиент к базе, вход), потом привязка
заработает сама. Проверить бота до этого можно кодом, созданным вручную —
см. ниже.

---

## 1. Бот

`@BotFather` в Telegram → `/newbot` → имя и username → токен.

## 2. Переменные окружения Vercel

Settings → Environment Variables. **Ни одна из них не должна начинаться
с `VITE_`** — Vite подставляет такие значения прямо в бандл, и они окажутся
в DevTools у любого посетителя.

| Переменная | Где взять |
|---|---|
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | там же, ключ `service_role` |
| `SUPABASE_ANON_KEY` | там же, ключ `anon` |
| `TELEGRAM_BOT_TOKEN` | от `@BotFather` |
| `TELEGRAM_WEBHOOK_SECRET` | придумать: `openssl rand -hex 16` |
| `CRON_SECRET` | придумать так же |

Публичное имя бота задаётся отдельно и в браузер попадать может:
`VITE_TELEGRAM_BOT` — username без `@`. По нему виджет чата соберёт ссылку.

## 3. Вебхук

После деплоя, один раз:

```bash
curl "https://api.telegram.org/bot<ТОКЕН>/setWebhook" \
  -d url=https://<домен>/api/telegram \
  -d secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

Проверка: `curl "https://api.telegram.org/bot<ТОКЕН>/getWebhookInfo"` —
в ответе должен быть ваш URL и `pending_update_count: 0`.

## 4. Расписание запуска

**На бесплатном тарифе Vercel cron разрешён не чаще раза в сутки.** Для
напоминания за 15 минут этого мало, а деплой с расписанием `*/5` на Hobby
просто не пройдёт. Поэтому рассылку запускает GitHub Actions.

Settings → Secrets and variables → Actions:

- `REMINDERS_URL` — `https://<домен>/api/reminders`
- `CRON_SECRET` — то же значение, что в Vercel

Первый запуск можно сделать руками: вкладка Actions → «Напоминания об
уроках» → Run workflow.

<details>
<summary>Если у вас платный тариф Vercel</summary>

Создайте `vercel.json` в корне и удалите workflow:

```json
{
  "crons": [{ "path": "/api/reminders", "schedule": "*/5 * * * *" }]
}
```

Vercel сам добавит заголовок `Authorization: Bearer $CRON_SECRET`.
</details>

---

## Как проверить до подключения авторизации

Код привязки можно создать вручную. В SQL Editor Supabase:

```sql
-- Понадобится существующий пользователь. Если их ещё нет, заведите
-- через Authentication → Users → Add user.
insert into public.telegram_link_codes (code, user_id, expires_at)
select 'TEST01', id, now() + interval '30 minutes'
from auth.users limit 1;
```

Отправьте боту `/start TEST01` — он должен ответить «Готово, аккаунт
привязан». Дальше `/today` покажет расписание этого пользователя.

Проверить рассылку, не дожидаясь утра понедельника: поставьте урок на
14 минут вперёд по своему поясу и запустите workflow руками.

```sql
update public.profiles
   set timezone = 'Europe/Moscow', reminder_lead_minutes = 15
 where id = (select user_id from public.telegram_links limit 1);

insert into public.lesson_overrides (user_id, on_date, bell_id, subject_id, class_name, topic, starts_at, ends_at)
select p.id,
       (now() at time zone p.timezone)::date,
       b.id, s.id, '8А', 'Проверка напоминания',
       ((now() at time zone p.timezone) + interval '14 minutes')::time,
       ((now() at time zone p.timezone) + interval '59 minutes')::time
from public.profiles p
join public.bells b on b.user_id = p.id and b.position = 1
join public.subjects s on s.user_id = p.id
where p.id = (select user_id from public.telegram_links limit 1)
limit 1
on conflict (user_id, on_date, bell_id) do update
   set starts_at = excluded.starts_at, ends_at = excluded.ends_at, status = 'planned';

-- Что увидит рассылка:
select * from public.due_reminders(6);
```

---

## Что закрыто в коде

**Часовые пояса.** Момент урока считает база: `now() at time zone
profiles.timezone` даёт настенные часы конкретного учителя, и уже в них
складываются дата и время урока. Проверено на разнице, где сервер и учитель
находятся в разных календарных сутках — реализация «по UTC» там молча
не прислала бы ничего.

**Дубли.** Сначала заявка, потом отправка: строка в `reminder_log`
вставляется до обращения к Telegram, поэтому параллельный запуск упирается
в конфликт первичного ключа и пропускает урок. Если отправка сорвалась,
заявка снимается и следующий запуск попробует снова.

**Заблокированный бот.** Telegram отвечает 403 — связь удаляется, заявка
остаётся: повторять бессмысленно.

**Устойчивость.** Каждая отправка в своём try/catch: недоступность одного
чата не отменяет рассылку остальным.

**Выходные и каникулы.** Отсекает `resolved_lessons()`: в отмеченные дни
постоянное расписание не разворачивается, отменённые уроки отсеиваются
по статусу.

## Безопасность

- Токен бота и `service_role` живут только в переменных окружения сервера.
- `/api/telegram` проверяет секрет вебхука — иначе эндпоинт мог бы дёрнуть
  кто угодно и от чьего угодно имени.
- `/api/reminders` проверяет `CRON_SECRET`.
- `/api/link-code` берёт `user_id` из проверенного токена, а не из тела
  запроса: иначе любой привязал бы свой Telegram к чужому расписанию.
- Код привязки одноразовый, живёт 10 минут, гасится после успешной привязки.
