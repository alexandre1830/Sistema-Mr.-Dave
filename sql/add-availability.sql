-- =========================================================================
-- HEY, TEACHER! — Tabela de disponibilidade dos professores
-- Rodar NO SQL Editor do Supabase SEM resetar o banco (adiciona apenas).
-- =========================================================================

drop table if exists teacher_availability cascade;

create table teacher_availability (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references profiles(id) on delete cascade,
  title        text,
  type         text not null default 'available' check (type in ('available','blocked')),
  is_recurring boolean not null default true,
  day_of_week  int check (day_of_week between 0 and 6), -- 0=Dom … 6=Sáb (para recorrente)
  specific_date date,                                    -- (para evento único)
  start_time   time not null,
  end_time     time not null,
  notes        text,
  created_at   timestamptz default now()
);

alter table teacher_availability enable row level security;

-- Admin: acesso total
create policy "avail admin all" on teacher_availability for all
  using (is_admin()) with check (is_admin());

-- Professor: lê e escreve apenas os próprios registros
create policy "avail teacher read" on teacher_availability for select
  using (teacher_id = auth.uid());
create policy "avail teacher insert" on teacher_availability for insert
  with check (teacher_id = auth.uid());
create policy "avail teacher update" on teacher_availability for update
  using (teacher_id = auth.uid());
create policy "avail teacher delete" on teacher_availability for delete
  using (teacher_id = auth.uid());
