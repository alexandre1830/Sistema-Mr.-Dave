-- =========================================================================
-- ERROR LOGS — armazenamento centralizado de erros front-end
-- Rodar no SQL Editor do Supabase.
-- =========================================================================

create table if not exists error_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  message     text not null,
  stack       text,
  context     jsonb default '{}'::jsonb,
  resolved    boolean not null default false,
  created_at  timestamptz default now()
);

create index if not exists error_logs_user_idx    on error_logs(user_id);
create index if not exists error_logs_created_idx on error_logs(created_at desc);
create index if not exists error_logs_unresolved  on error_logs(resolved) where resolved = false;

alter table error_logs enable row level security;

-- Qualquer usuário autenticado pode INSERIR seus próprios erros
create policy "errlog self insert" on error_logs for insert
  with check (auth.uid() is not null and (user_id is null or user_id = auth.uid()));

-- Apenas admin pode LER ou ATUALIZAR
create policy "errlog admin read"   on error_logs for select using (is_admin());
create policy "errlog admin update" on error_logs for update using (is_admin());
create policy "errlog admin delete" on error_logs for delete using (is_admin());

-- Limpeza automática: descarta logs com mais de 90 dias
-- (Rodar manualmente ou via pg_cron — opcional)
--
-- create extension if not exists pg_cron;
-- select cron.schedule('purge-old-error-logs', '0 3 * * *',
--   $$ delete from error_logs where created_at < now() - interval '90 days'; $$);
