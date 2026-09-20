-- ═══════════════════════════════════════════════════════════════════════════
--  Проверка изоляции: каждый учитель видит и правит только своё
--
--  Политики RLS легко написать так, что они выглядят правильно и ничего
--  не закрывают: `using (true)`, забытая политика на insert, открытый
--  анонимный доступ. Проверяется это только одним способом — выполнить
--  запросы приложения от имени настоящих пользователей и посмотреть,
--  что вернулось.
--
--  Скрипт ничего не меняет: единственная запись, попытка подложить строку
--  в чужой аккаунт, либо отвергается политикой, либо убирается тут же.
--
--  Запуск: Supabase → SQL Editor → вставить целиком → Run.
--  Подставьте почты двух аккаунтов в первых строках блока.
-- ═══════════════════════════════════════════════════════════════════════════

create temp table if not exists проверка(шаг text, итог text, ожидание text) on commit drop;
truncate проверка;

-- Итоги пишутся, когда скрипт уже переключился на роль пользователя,
-- а своих прав на временную таблицу у той роли нет.
grant insert on проверка to authenticated, anon;

do $$
declare
  почта_a text := 'teacher-a@example.com';
  почта_b text := 'teacher-b@example.com';

  a uuid; b uuid;
  n int; подложенный uuid; msg text; r text;
begin
  select id into a from auth.users where email = почта_a;
  select id into b from auth.users where email = почта_b;

  if a is null or b is null then
    raise exception 'Не найден один из аккаунтов: % / %', почта_a, почта_b;
  end if;

  ---------------------------------------------------------------------------
  -- Чтение: то же, что делает loadAll при входе
  ---------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  select count(*) into n from public.subjects where user_id <> a;
  insert into проверка values ('A видит чужие предметы', n || ' строк', '0 строк');

  select count(*) into n from public.template_lessons where user_id <> a;
  insert into проверка values ('A видит чужие уроки', n || ' строк', '0 строк');

  select count(*) into n from public.lesson_overrides where user_id <> a;
  insert into проверка values ('A видит чужие замены', n || ' строк', '0 строк');

  select count(*) into n from public.profiles where id <> a;
  insert into проверка values ('A видит чужие профили', n || ' строк', '0 строк');

  select count(*) into n from public.bells where user_id = a;
  insert into проверка values ('A видит свои звонки', n || ' строк', 'больше нуля');

  reset role;

  ---------------------------------------------------------------------------
  -- Запись в чужой аккаунт
  ---------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  begin
    insert into public.subjects (user_id, name) values (b, 'подложено проверкой')
      returning id into подложенный;
    r := 'прошло';
  exception when others then
    get stacked diagnostics msg = message_text;
    r := 'отклонено: ' || msg;
  end;
  insert into проверка values ('A пишет предмет в аккаунт B', r, 'отклонено политикой');

  begin
    delete from public.bells where user_id = b;
    get diagnostics n = row_count;
  exception when others then
    n := -1;
  end;
  insert into проверка values ('A удаляет звонки B', n || ' строк удалено', '0 строк');

  begin
    update public.profiles set teacher_name = 'подложено проверкой' where id = b;
    get diagnostics n = row_count;
  exception when others then
    n := -1;
  end;
  insert into проверка values ('A переименовывает профиль B', n || ' строк изменено', '0 строк');

  reset role;

  -- Если политика всё-таки пропустила вставку, убираем её за собой,
  -- иначе проверка оставила бы мусор в чужом аккаунте.
  if подложенный is not null then
    delete from public.subjects where id = подложенный;
  end if;

  ---------------------------------------------------------------------------
  -- Анонимный доступ: ключ anon лежит в браузере у любого посетителя
  ---------------------------------------------------------------------------
  set local role anon;
  begin
    select count(*) into n from public.subjects;
    r := 'вернулось ' || n || ' строк';
  exception when others then
    get stacked diagnostics msg = message_text;
    r := 'отказ: ' || msg;
  end;
  reset role;
  insert into проверка values ('аноним читает предметы', r, 'отказ');
end $$;

select шаг, итог, ожидание from проверка;
