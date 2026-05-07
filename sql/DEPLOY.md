# Deploy SQL — Mr-Dave / Hey, Teacher!

Este documento lista a ordem canônica de execução dos arquivos SQL e os
passos manuais necessários no painel do Supabase.

## Ordem canônica de execução

Todos os arquivos `add-*.sql` (exceto `schema.sql`) são **idempotentes**
— podem ser rodados múltiplas vezes sem efeito colateral.

| # | Arquivo | Quando rodar | Tipo |
|---|---|---|---|
| 1 | `schema.sql` | Bootstrap do banco. **DESTRUTIVO** (faz `drop cascade`) | One-shot |
| 2 | `add-availability.sql` | Após bootstrap | Idempotente |
| 3 | `add-error-logs.sql` | Após bootstrap | Idempotente |
| 4 | `add-materials.sql` | Após criar bucket "materials" no Storage | Idempotente |
| 5 | `add-indexes.sql` | A qualquer momento (recomendado: assim que possível) | Idempotente |
| 6 | `schedule-monthly-payments.sql` | Após deploy da Edge Function | Idempotente |
| 7 | `audit-rls.sql` | Diagnóstico contínuo (apenas `SELECT`) | Read-only |

---

## 0. Bootstrap inicial (apenas em banco vazio)

**Onde:** Painel Supabase → SQL Editor

**O que rodar:** `sql/schema.sql`

**Resultado:** Cria todas as tabelas core, funções `is_admin()`,
`current_role_name()`, `handle_new_user()`, e o trigger que cria
automaticamente o `profile` quando um usuário é criado em `auth.users`.

**Passos pós-bootstrap:**

1. Crie o primeiro usuário pelo painel Supabase: Auth → Users → Add user
2. Promova-o a admin no SQL Editor:
   ```sql
   update profiles set role = 'admin' where email = 'SEU_EMAIL_AQUI';
   ```
3. Faça login no sistema — esse usuário será o administrador.

⚠️ **NÃO rode `schema.sql` em produção depois do bootstrap inicial** — apaga
todos os dados.

---

## 1. Disponibilidade dos professores

**Onde:** Painel Supabase → SQL Editor

**O que rodar:** `sql/add-availability.sql`

**Resultado:** Cria a tabela `teacher_availability` e suas RLS. Idempotente
(usa `create table if not exists` + `drop policy if exists` antes do
`create policy`).

---

## 2. Centralização de erros do front-end

**Onde:** Painel Supabase → SQL Editor

**O que rodar:** `sql/add-error-logs.sql`

**Resultado:** Cria a tabela `error_logs`. O módulo `js/errors.js` passa a
persistir erros não tratados nessa tabela. Antes da migration rodar, falha
silenciosamente — sem impacto no app.

---

## 3. Materiais (arquivos compartilhados)

### 3.1 — Criar o bucket no Storage

**Onde:** Painel Supabase → Storage → New bucket

**Configuração:**
- Nome: `materials`
- Marque **Public bucket** (necessário para a pré-visualização via Office Online Viewer)

### 3.2 — Rodar a migration

**Onde:** Painel Supabase → SQL Editor

**O que rodar:** `sql/add-materials.sql`

**Resultado:** Cria as tabelas `material_folders`, `materials`, todas as
RLS dessas tabelas e as policies de `storage.objects` para o bucket
"materials". Tudo idempotente.

---

## 4. Índices de performance

**Onde:** Painel Supabase → SQL Editor

**O que rodar:** `sql/add-indexes.sql`

**Resultado:** Cria índices em FKs muito consultadas (especialmente
`student_teachers.teacher_id`, `attendance.teacher_id`,
`attendance(teacher_id, date)`, `payments(status, due_date)`).

Sem esses índices, as queries de RLS faziam seq scan em todas as
páginas que listam alunos/aulas/pagamentos — pode dar speedup de
até 10× em bancos com mais de algumas centenas de registros.

Idempotente (usa `create index if not exists`). Pode rodar a qualquer
momento, mesmo com dados em produção — operação online.

---

## 5. Geração automática de cobranças

### 5.1 — Deploy da Edge Function

```bash
cd Mr-Dave
supabase functions deploy generate-monthly-payments
```

### 5.2 — Definir o segredo do cron

```bash
# Gere um valor aleatório longo (uuid, openssl, etc.)
supabase secrets set CRON_SECRET=<valor-aleatório-longo>
```

### 5.3 — Habilitar extensões e Vault

**Onde:** Painel Supabase

1. Database → Extensions: habilite `pg_cron` e `pg_net`
2. Database → Vault → New Secret e cadastre:
   - `cron_secret` = o **mesmo valor** de `CRON_SECRET` acima
   - `project_url` = `https://<seu-projeto>.supabase.co`

### 5.4 — Agendar via pg_cron

**Onde:** Painel Supabase → SQL Editor

**O que rodar:** `sql/schedule-monthly-payments.sql`

**Resultado:** Agenda dois jobs no pg_cron:
- Dia 1 de cada mês às 06:00 UTC → cria pagamentos `pending` para todos
  os alunos ativos com `monthly_fee` configurado.
- Diariamente às 03:15 UTC → marca pagamentos `pending` vencidos
  como `overdue`.

### 5.5 — Disparo manual

Admin pode clicar em **Finanças → Gerar do mês** a qualquer momento para
gerar cobranças do mês visível. Idempotente (alunos que já têm pagamento
para a referência são ignorados).

### 5.6 — Verificar agendamento

```sql
select jobname, schedule, command from cron.job;
```

Devem aparecer as duas linhas: `generate-monthly-payments` e
`mark-overdue-payments`.

---

## 6. Auditoria de RLS (diagnóstico contínuo)

**Onde:** Painel Supabase → SQL Editor

**O que rodar:** `sql/audit-rls.sql`

Os blocos `SELECT` listam:
- todas as policies cadastradas
- tabelas sem RLS habilitada
- tabelas sem nenhuma policy

⚠️ **Read-only** — não modifica nada. Pode rodar a qualquer momento.

---

## Checklist final

- [ ] `schema.sql` rodado (uma única vez)
- [ ] Primeiro admin criado e promovido via SQL
- [ ] `add-availability.sql` rodado
- [ ] `add-error-logs.sql` rodado
- [ ] Bucket `materials` criado no Storage (público)
- [ ] `add-materials.sql` rodado
- [ ] **`add-indexes.sql` rodado**
- [ ] Edge Function `generate-monthly-payments` deployada
- [ ] `CRON_SECRET` configurado nos secrets da function
- [ ] Vault: `cron_secret` + `project_url` cadastrados
- [ ] Extensões `pg_cron` e `pg_net` habilitadas
- [ ] `schedule-monthly-payments.sql` rodado
- [ ] `select * from cron.job` mostra as duas tarefas
- [ ] Teste manual do botão "Gerar do mês"

---

## Manutenção futura

### Adicionar uma nova migration

1. Crie `sql/add-<nome>.sql` seguindo o padrão idempotente:
   - `create table if not exists ...`
   - `drop policy if exists ... ; create policy ...`
   - `create index if not exists ...`
   - SECURITY DEFINER functions sempre com `set search_path = public`
2. Adicione na seção "Ordem canônica" deste arquivo.
3. Rode no SQL Editor da produção.

### Re-bootstrap (resetar banco)

⚠️ **Apaga todos os dados.** Útil apenas em ambiente de desenvolvimento.

```
1. Rodar schema.sql
2. Rodar TODAS as migrations da seção "Ordem canônica" (passos 1-5)
3. Recriar admin manualmente
```

### Convenção de nomes de policies

`<table_abrev> <role> <command>` — ex: `att teacher insert`,
`materials admin update`. Mantém policies organizadas e fáceis de buscar
via `pg_policies`.
