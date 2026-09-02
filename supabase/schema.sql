-- ═══════════════════════════════════════════════════════════════════════════
--  Схема базы для планировщика расписания
--
--  Повторяет модель, которая уже работает во фронтенде:
--    bells            — сетка звонков
--    subjects         — предметы
--    template_lessons — постоянное расписание (день недели × звонок)
--    lesson_overrides — что происходит в конкретную дату
--    day_marks        — каникулы, праздники, особые дни
--
--  RLS включён на каждой таблице без исключений. Ключ Supabase лежит в
--  браузере и публичен по своей природе: без политик любой желающий
--  вычитывает всю базу целиком. Это не паранойя, а самая частая дыра
--  в проектах на Supabase.
--
--  Запуск: Supabase → SQL Editor → вставить целиком → Run.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Профиль ────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  teacher_name          text        not null default '',
  -- IANA-таймзона. Момент напоминания считается из пары «дата + время урока»
  -- именно в ней. Хранить смещение в часах нельзя: сломается на переводе часов.
  timezone              text        not null default 'Europe/Moscow',
  visible_days          smallint    not null default 6 check (visible_days between 5 and 7),
  reminder_lead_minutes smallint    not null default 15 check (reminder_lead_minutes between 1 and 240),
  reminders_enabled     boolean     not null default true,
  created_at            timestamptz not null default now()
);

-- Профиль заводится сам при регистрации, иначе первый же запрос упрётся в пустоту.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Звонки ─────────────────────────────────────────────────────────────────

create table if not exists public.bells (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  position   smallint not null,
  starts_at  time not null,
  ends_at    time not null,
  created_at timestamptz not null default now(),
  constraint bells_order check (ends_at > starts_at),
  unique (user_id, position)
);

create index if not exists bells_user_idx on public.bells (user_id, starts_at);

-- ── Предметы ───────────────────────────────────────────────────────────────

create table if not exists public.subjects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  short      text not null default '',
  color      text not null default '#7aa2f7',
  room       text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists subjects_user_idx on public.subjects (user_id);

-- ── Постоянное расписание ──────────────────────────────────────────────────

create table if not exists public.template_lessons (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- ISO-нумерация: 1 — понедельник, 7 — воскресенье.
  weekday    smallint not null check (weekday between 1 and 7),
  bell_id    uuid not null references public.bells (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete cascade,
  class_name text not null default '',
  room       text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now(),
  -- В одном звонке одного дня недели может стоять только один урок.
  unique (user_id, weekday, bell_id)
);

create index if not exists template_user_idx on public.template_lessons (user_id, weekday);

-- ── Конкретные даты ────────────────────────────────────────────────────────

do $$ begin
  create type public.lesson_status as enum ('planned', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.lesson_overrides (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  on_date    date not null,
  bell_id    uuid not null references public.bells (id) on delete cascade,
  status     public.lesson_status not null default 'planned',
  -- null означает «как в постоянном расписании». Пустая строка — осознанно пусто.
  subject_id uuid references public.subjects (id) on delete cascade,
  class_name text,
  room       text,
  note       text,
  topic      text not null default '',
  starts_at  time,
  ends_at    time,
  created_at timestamptz not null default now(),
  unique (user_id, on_date, bell_id)
);

create index if not exists overrides_user_date_idx on public.lesson_overrides (user_id, on_date);

-- ── Характер дня ───────────────────────────────────────────────────────────

do $$ begin
  create type public.day_kind as enum ('normal', 'holiday', 'vacation', 'special');
exception when duplicate_object then null;
end $$;

create table if not exists public.day_marks (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  on_date date not null,
  kind    public.day_kind not null default 'normal',
  label   text not null default '',
  unique (user_id, on_date)
);

create index if not exists day_marks_user_idx on public.day_marks (user_id, on_date);

-- ── Telegram ───────────────────────────────────────────────────────────────

create table if not exists public.telegram_links (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  chat_id    bigint not null unique,
  username   text,
  linked_at  timestamptz not null default now()
);

-- Одноразовые коды привязки. Живут минуты, гасятся после использования.
create table if not exists public.telegram_link_codes (
  code       text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at    timestamptz
);

create index if not exists link_codes_user_idx on public.telegram_link_codes (user_id);

-- Защита от дублей: cron ходит чаще, чем длится окно напоминания,
-- поэтому «уже отправили» надо помнить явно.
create table if not exists public.reminder_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  on_date date not null,
  bell_id uuid not null references public.bells (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, on_date, bell_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
--  Row Level Security
--
--  Каждый видит и правит только свои строки. service_role (ключ бота и cron,
--  живущий только на сервере) политики обходит — это его штатное поведение.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles            enable row level security;
alter table public.bells               enable row level security;
alter table public.subjects            enable row level security;
alter table public.template_lessons    enable row level security;
alter table public.lesson_overrides    enable row level security;
alter table public.day_marks           enable row level security;
alter table public.telegram_links      enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.reminder_log        enable row level security;

drop policy if exists bells_select_own on public.bells;
drop policy if exists bells_insert_own on public.bells;
drop policy if exists bells_update_own on public.bells;
drop policy if exists bells_delete_own on public.bells;

create policy bells_select_own on public.bells
  for select using (auth.uid() = user_id);
create policy bells_insert_own on public.bells
  for insert with check (auth.uid() = user_id);
create policy bells_update_own on public.bells
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy bells_delete_own on public.bells
  for delete using (auth.uid() = user_id);

drop policy if exists subjects_select_own on public.subjects;
drop policy if exists subjects_insert_own on public.subjects;
drop policy if exists subjects_update_own on public.subjects;
drop policy if exists subjects_delete_own on public.subjects;

create policy subjects_select_own on public.subjects
  for select using (auth.uid() = user_id);
create policy subjects_insert_own on public.subjects
  for insert with check (auth.uid() = user_id);
create policy subjects_update_own on public.subjects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy subjects_delete_own on public.subjects
  for delete using (auth.uid() = user_id);

drop policy if exists template_lessons_select_own on public.template_lessons;
drop policy if exists template_lessons_insert_own on public.template_lessons;
drop policy if exists template_lessons_update_own on public.template_lessons;
drop policy if exists template_lessons_delete_own on public.template_lessons;

create policy template_lessons_select_own on public.template_lessons
  for select using (auth.uid() = user_id);
create policy template_lessons_insert_own on public.template_lessons
  for insert with check (auth.uid() = user_id);
create policy template_lessons_update_own on public.template_lessons
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy template_lessons_delete_own on public.template_lessons
  for delete using (auth.uid() = user_id);

drop policy if exists lesson_overrides_select_own on public.lesson_overrides;
drop policy if exists lesson_overrides_insert_own on public.lesson_overrides;
drop policy if exists lesson_overrides_update_own on public.lesson_overrides;
drop policy if exists lesson_overrides_delete_own on public.lesson_overrides;

create policy lesson_overrides_select_own on public.lesson_overrides
  for select using (auth.uid() = user_id);
create policy lesson_overrides_insert_own on public.lesson_overrides
  for insert with check (auth.uid() = user_id);
create policy lesson_overrides_update_own on public.lesson_overrides
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy lesson_overrides_delete_own on public.lesson_overrides
  for delete using (auth.uid() = user_id);

drop policy if exists day_marks_select_own on public.day_marks;
drop policy if exists day_marks_insert_own on public.day_marks;
drop policy if exists day_marks_update_own on public.day_marks;
drop policy if exists day_marks_delete_own on public.day_marks;

create policy day_marks_select_own on public.day_marks
  for select using (auth.uid() = user_id);
create policy day_marks_insert_own on public.day_marks
  for insert with check (auth.uid() = user_id);
create policy day_marks_update_own on public.day_marks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy day_marks_delete_own on public.day_marks
  for delete using (auth.uid() = user_id);

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Привязку Telegram пользователь видит и может отвязать. Создаёт её бот.
drop policy if exists telegram_links_select_own on public.telegram_links;
drop policy if exists telegram_links_delete_own on public.telegram_links;
create policy telegram_links_select_own on public.telegram_links
  for select using (auth.uid() = user_id);
create policy telegram_links_delete_own on public.telegram_links
  for delete using (auth.uid() = user_id);

-- Код привязки пользователь заводит себе сам и читает только свой.
drop policy if exists link_codes_select_own on public.telegram_link_codes;
drop policy if exists link_codes_insert_own on public.telegram_link_codes;
create policy link_codes_select_own on public.telegram_link_codes
  for select using (auth.uid() = user_id);
create policy link_codes_insert_own on public.telegram_link_codes
  for insert with check (auth.uid() = user_id);

-- reminder_log пишет только cron под service_role: политик для клиента нет,
-- поэтому из браузера таблица недоступна вовсе.

-- ═══════════════════════════════════════════════════════════════════════════
--  Сборка расписания на дату
--
--  Та же логика наложения, что и во фронтенде, но на стороне базы: бот не
--  должен повторять её на JavaScript, иначе два источника правды разъедутся.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.resolved_lessons(p_user uuid, p_date date)
returns table (
  bell_id       uuid,
  bell_position smallint,
  starts_at     time,
  ends_at      time,
  subject_id   uuid,
  subject_name text,
  class_name   text,
  room         text,
  topic        text,
  note         text,
  status       public.lesson_status,
  source       text
)
language sql
stable
security invoker
set search_path = public
as $$
  with mark as (
    select kind from public.day_marks where user_id = p_user and on_date = p_date
  ),
  template_allowed as (
    select coalesce(
      (select kind not in ('holiday', 'vacation') from mark),
      true
    ) as allowed
  )
  select
    b.id,
    b.position,
    coalesce(o.starts_at, b.starts_at)                  as starts_at,
    coalesce(o.ends_at, b.ends_at)                      as ends_at,
    coalesce(o.subject_id, t.subject_id)                as subject_id,
    s.name                                              as subject_name,
    coalesce(o.class_name, t.class_name, '')            as class_name,
    coalesce(o.room, t.room, '')                        as room,
    coalesce(o.topic, '')                               as topic,
    coalesce(o.note, t.note, '')                        as note,
    coalesce(o.status, 'planned')                       as status,
    case
      when o.id is null then 'template'
      when t.id is null then 'added'
      else 'override'
    end                                                 as source
  from public.bells b
  cross join template_allowed ta
  left join public.template_lessons t
    on t.user_id = p_user
   and t.bell_id = b.id
   and t.weekday = extract(isodow from p_date)::smallint
   and ta.allowed
  left join public.lesson_overrides o
    on o.user_id = p_user
   and o.bell_id = b.id
   and o.on_date = p_date
  left join public.subjects s
    on s.id = coalesce(o.subject_id, t.subject_id)
  where b.user_id = p_user
    and coalesce(o.subject_id, t.subject_id) is not null
  order by starts_at;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Напоминания
--
--  Три ловушки этапа 7 закрыты прямо здесь:
--
--  1. Часовые пояса. `now() at time zone p.timezone` даёт местные настенные
--     часы пользователя. Дата урока и время урока складываются уже в них,
--     сервер про UTC не вспоминает. Смещение берётся из базы таймзон,
--     поэтому перевод часов и «Москва +3» не ломают расчёт.
--
--  2. Дубли. Cron ходит чаще, чем ширина окна, поэтому один и тот же урок
--     попал бы в выборку несколько раз. Отсекаем по reminder_log.
--
--  3. Выходные и каникулы. Их убирает resolved_lessons: в отмеченные дни
--     постоянное расписание не разворачивается, отменённые уроки отсеиваются
--     по status.
--
--  Вызывать под service_role из cron. После успешной отправки писать
--  строку в reminder_log — тогда повтор невозможен.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.due_reminders(p_window_minutes int default 6)
returns table (
  user_id      uuid,
  chat_id      bigint,
  on_date      date,
  bell_id      uuid,
  starts_at    time,
  subject_name text,
  class_name   text,
  room         text,
  topic        text,
  minutes_left int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    tl.chat_id,
    local.today,
    r.bell_id,
    r.starts_at,
    r.subject_name,
    r.class_name,
    r.room,
    r.topic,
    (extract(epoch from ((local.today + r.starts_at) - local.now_ts)) / 60)::int
  from public.profiles p
  join public.telegram_links tl on tl.user_id = p.id
  cross join lateral (
    select
      (now() at time zone p.timezone)              as now_ts,
      (now() at time zone p.timezone)::date        as today
  ) local
  cross join lateral public.resolved_lessons(p.id, local.today) r
  where p.reminders_enabled
    and r.status = 'planned'
    -- урок ещё впереди и уже попал в окно предупреждения
    and (local.today + r.starts_at) > local.now_ts
    and (local.today + r.starts_at)
        <= local.now_ts + make_interval(mins => p.reminder_lead_minutes)
    and (local.today + r.starts_at)
        >  local.now_ts + make_interval(mins => p.reminder_lead_minutes - p_window_minutes)
    and not exists (
      select 1 from public.reminder_log rl
      where rl.user_id = p.id
        and rl.on_date = local.today
        and rl.bell_id = r.bell_id
    );
$$;

-- Права на таблицы. В Supabase они обычно выдаются автоматически, но явная
-- выдача не мешает и спасает проекты с изменёнными default privileges.
-- Данные всё равно закрыты политиками RLS выше — grant без политики ничего не даёт.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  public.bells,
  public.subjects,
  public.template_lessons,
  public.lesson_overrides,
  public.day_marks
to authenticated;

grant select, update on public.profiles to authenticated;
grant select, delete on public.telegram_links to authenticated;
grant select, insert on public.telegram_link_codes to authenticated;

-- Бот и cron ходят под service_role: ему нужны таблицы, которых нет у клиента.
grant all on public.reminder_log, public.telegram_links, public.telegram_link_codes
  to service_role;

-- due_reminders дёргает только cron. Клиенту он ни к чему: функция
-- security definer и обходит RLS, отдавая чужие chat_id.
revoke execute on function public.due_reminders(int) from anon, authenticated, public;
grant execute on function public.due_reminders(int) to service_role;
grant execute on function public.resolved_lessons(uuid, date) to authenticated, service_role;
