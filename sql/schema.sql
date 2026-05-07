-- =========================================================================
-- HEY, TEACHER! — Schema com papéis (admin / professor)
-- Modelo: ÚNICA escola, com 1+ admins e N professores.
-- Rodar inteiro no SQL Editor do Supabase. ZERA o banco.
-- =========================================================================

-- ----- 0) Limpa tudo (CUIDADO: apaga dados!) ----------------------------
drop table if exists student_progress    cascade;
drop table if exists progress_contents   cascade;
drop table if exists progress_categories cascade;
drop table if exists payments            cascade;
drop table if exists attendance          cascade;
drop table if exists student_teachers    cascade;
drop table if exists students            cascade;
drop table if exists classes             cascade;
drop table if exists profiles            cascade;

drop function if exists is_admin()          cascade;
drop function if exists current_role_name() cascade;
drop function if exists handle_new_user()   cascade;

-- ----- 1) PROFILES (criada ANTES das funções auxiliares) ----------------
create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  role                text not null default 'teacher' check (role in ('admin','teacher')),
  name                text,
  email               text,
  phone               text,
  subject             text,
  bio                 text,
  photo               text,
  default_lesson_rate numeric(10,2),
  active              boolean not null default true,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ----- 2) Funções auxiliares de papel (profiles já existe aqui) ---------
-- Usa language plpgsql para evitar validação antecipada da query
create or replace function current_role_name() returns text
  language plpgsql stable security definer set search_path = public as $$
begin
  return (select role from profiles where id = auth.uid());
end $$;

create or replace function is_admin() returns boolean
  language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
end $$;

-- ----- 3) RLS de PROFILES (usa is_admin() que agora existe) -------------
alter table profiles enable row level security;

create policy "profile self read"   on profiles for select using (id = auth.uid() or is_admin());
create policy "profile self update" on profiles for update using (id = auth.uid() or is_admin());
create policy "profile insert"      on profiles for insert with check (id = auth.uid() or is_admin());
create policy "profile admin del"   on profiles for delete using (is_admin());

-- Trigger: ao criar usuário no auth.users, cria profile automaticamente.
-- IMPORTANTE: role é fixado em 'teacher' (segurança: impede auto-promoção
-- via OTP/magic-link). Admin é promovido manualmente via SQL.
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name, role, default_lesson_rate)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'teacher',
    case
      when (new.raw_user_meta_data->>'default_lesson_rate') is not null
        then (new.raw_user_meta_data->>'default_lesson_rate')::numeric
      else null
    end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----- 4) CLASSES -------------------------------------------------------
create table classes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  level      text,
  schedules  jsonb default '[]'::jsonb,
  notes      text,
  teacher_id uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
alter table classes enable row level security;

create policy "classes admin all"    on classes for all
  using (is_admin()) with check (is_admin());
create policy "classes teacher read" on classes for select
  using (teacher_id = auth.uid());

-- ----- 5) STUDENTS ------------------------------------------------------
create table students (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  age            int,
  email          text,
  phone          text,
  class_id       uuid references classes(id) on delete set null,
  level          text,
  schedules      jsonb default '[]'::jsonb,
  monthly_fee    numeric(10,2),
  pay_day        int,
  contract_start date,
  contract_end   date,
  notes          text,
  created_at     timestamptz default now()
);
alter table students enable row level security;

create policy "students admin all" on students for all
  using (is_admin()) with check (is_admin());
-- policy "students teacher read" criada após student_teachers existir (ver abaixo)

-- ----- 6) STUDENT_TEACHERS (M:N) ----------------------------------------
create table student_teachers (
  student_id    uuid references students(id) on delete cascade,
  teacher_id    uuid references profiles(id) on delete cascade,
  rate_override numeric(10,2),
  created_at    timestamptz default now(),
  primary key (student_id, teacher_id)
);
alter table student_teachers enable row level security;

create policy "st admin all"    on student_teachers for all
  using (is_admin()) with check (is_admin());
create policy "st teacher read" on student_teachers for select
  using (teacher_id = auth.uid());

-- policy de students que depende de student_teachers (criada agora que a tabela existe)
create policy "students teacher read" on students for select
  using (exists (
    select 1 from student_teachers st
    where st.student_id = students.id and st.teacher_id = auth.uid()
  ));

-- ----- 7) ATTENDANCE ----------------------------------------------------
create table attendance (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid references students(id) on delete cascade,
  class_id       uuid references classes(id) on delete set null,
  teacher_id     uuid references profiles(id) on delete set null,
  date           date not null,
  status         text not null check (status in ('present','absent','justified','makeup')),
  lesson_content text,
  notes          text,
  created_at     timestamptz default now()
);
alter table attendance enable row level security;

create policy "att admin all"          on attendance for all
  using (is_admin()) with check (is_admin());
create policy "att teacher read"       on attendance for select
  using (teacher_id = auth.uid());
create policy "att teacher insert"     on attendance for insert with check (
  teacher_id = auth.uid()
  and exists (
    select 1 from student_teachers st
    where st.student_id = attendance.student_id and st.teacher_id = auth.uid()
  )
);
create policy "att teacher update"     on attendance for update using (teacher_id = auth.uid());
create policy "att teacher delete"     on attendance for delete using (teacher_id = auth.uid());

-- ----- 8) PAYMENTS (mensalidade da escola — só admin) -------------------
create table payments (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  reference  text not null,
  amount     numeric(10,2) not null,
  due_date   date,
  status     text not null check (status in ('paid','pending','overdue','cancelled')),
  paid_date  date,
  method     text,
  notes      text,
  created_at timestamptz default now()
);
alter table payments enable row level security;
create policy "pay admin only" on payments for all
  using (is_admin()) with check (is_admin());

-- ----- 9) PROGRESSO -----------------------------------------------------
create table progress_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  position   int default 0,
  created_at timestamptz default now()
);
alter table progress_categories enable row level security;
create policy "pc admin all"    on progress_categories for all
  using (is_admin()) with check (is_admin());
create policy "pc teacher read" on progress_categories for select
  using (auth.uid() is not null);

create table progress_contents (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references progress_categories(id) on delete cascade,
  title       text not null,
  description text,
  position    int default 0,
  created_at  timestamptz default now()
);
alter table progress_contents enable row level security;
create policy "pcontent admin all"    on progress_contents for all
  using (is_admin()) with check (is_admin());
create policy "pcontent teacher read" on progress_contents for select
  using (auth.uid() is not null);

create table student_progress (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  content_id uuid references progress_contents(id) on delete cascade,
  status     text not null,
  date       date not null,
  notes      text,
  created_at timestamptz default now()
);
alter table student_progress enable row level security;
create policy "sp admin all" on student_progress for all
  using (is_admin()) with check (is_admin());
create policy "sp teacher read"   on student_progress for select using (
  exists (select 1 from student_teachers st
          where st.student_id = student_progress.student_id and st.teacher_id = auth.uid())
);
create policy "sp teacher insert" on student_progress for insert with check (
  exists (select 1 from student_teachers st
          where st.student_id = student_progress.student_id and st.teacher_id = auth.uid())
);
create policy "sp teacher update" on student_progress for update using (
  exists (select 1 from student_teachers st
          where st.student_id = student_progress.student_id and st.teacher_id = auth.uid())
);
create policy "sp teacher delete" on student_progress for delete using (
  exists (select 1 from student_teachers st
          where st.student_id = student_progress.student_id and st.teacher_id = auth.uid())
);

-- =========================================================================
-- PRONTO! Após rodar este script:
--  1. Crie o primeiro usuário pelo painel Supabase (Auth > Users > Add user)
--  2. Rode no SQL Editor:
--       update profiles set role = 'admin' where email = 'SEU_EMAIL_AQUI';
--  3. Faça login no sistema — será o administrador.
-- =========================================================================
