-- =========================================================================
-- AUTOMAÇÃO MENSAL — Geração de cobranças + atualização de "overdue"
-- =========================================================================
-- 1. Cria pagamentos `pending` no dia 1 de cada mês (chama a Edge Function).
-- 2. Marca pagamentos como `overdue` automaticamente quando vencem.
--
-- PRÉ-REQUISITOS:
--  - Habilitar pg_cron (Database → Extensions no painel Supabase)
--  - Habilitar pg_net (idem) → para invocar Edge Function via HTTP
--  - Configurar a variável CRON_SECRET na Edge Function E aqui (vault).
-- =========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ----- 1) Configurar segredos (rodar UMA vez, com seus valores) ----------
-- Use Database → Vault no painel do Supabase para guardar:
--    cron_secret           = (mesmo valor da env CRON_SECRET da function)
--    project_url           = https://<seu-projeto>.supabase.co
--
-- Depois exponha-os para o pg_cron:
--   select vault.create_secret('SEU_CRON_SECRET_AQUI', 'cron_secret');
--   select vault.create_secret('https://SEU_PROJETO.supabase.co', 'project_url');

-- ----- 2) Função utilitária que invoca a Edge Function ------------------
create or replace function _invoke_generate_monthly_payments() returns void
  language plpgsql security definer as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    raise warning 'Vault secrets project_url/cron_secret não configurados.';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/generate-monthly-payments',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'X-Cron-Secret',  v_secret
    ),
    body    := '{}'::jsonb
  );
end $$;

-- ----- 3) Agendar para todo dia 1 às 06:00 UTC --------------------------
select cron.unschedule('generate-monthly-payments') where exists (
  select 1 from cron.job where jobname = 'generate-monthly-payments'
);

select cron.schedule(
  'generate-monthly-payments',
  '0 6 1 * *',                               -- dia 1 do mês, 06:00 UTC
  $$ select _invoke_generate_monthly_payments(); $$
);

-- ----- 4) Atualização automática de status "overdue" --------------------
-- Roda diariamente: pagamentos pending com due_date < hoje viram overdue.
select cron.unschedule('mark-overdue-payments') where exists (
  select 1 from cron.job where jobname = 'mark-overdue-payments'
);

select cron.schedule(
  'mark-overdue-payments',
  '15 3 * * *',                              -- diário, 03:15 UTC
  $$ update payments set status = 'overdue'
       where status = 'pending'
         and due_date is not null
         and due_date < current_date; $$
);

-- ----- VERIFICAR JOBS ATIVOS ---------------------------------------------
-- select jobname, schedule, command from cron.job;
