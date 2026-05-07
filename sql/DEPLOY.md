# Deploy das novas features

Este documento lista os passos manuais necessários no Supabase para
ativar as features adicionadas (paginação, error tracking, geração
automática de cobranças, auditoria de RLS).

---

## 1. Error logs (centralizar erros front-end no banco)

**Onde:** Painel Supabase → SQL Editor

**O que rodar:** `sql/add-error-logs.sql`

**Resultado:** O módulo `js/errors.js` passa a persistir erros não
tratados em `error_logs`. Antes da migração rodar, falha
silenciosamente — sem impacto no app.

---

## 2. Auditoria de RLS (verificar isolamento de dados por papel)

**Onde:** Painel Supabase → SQL Editor

**O que rodar:** `sql/audit-rls.sql`

Os blocos `SELECT` listam todas as policies, tabelas sem RLS e tabelas
sem policy. Os blocos `do $$` no final são idempotentes — só criam
policies defensivas que ainda não existirem.

Os "testes funcionais" no comentário do arquivo devem ser executados
manualmente para validar com um JWT de teacher.

---

## 3. Geração automática de cobranças

### 3.1 — Deploy da Edge Function

```bash
cd Mr-Dave
supabase functions deploy generate-monthly-payments
```

### 3.2 — Definir o segredo do cron

```bash
# Gere um valor aleatório longo (uuid, openssl, etc.)
supabase secrets set CRON_SECRET=<valor-aleatório-longo>
```

### 3.3 — Agendar via pg_cron

**Onde:** Painel Supabase → SQL Editor

1. Habilite as extensões `pg_cron` e `pg_net` (Database → Extensions)
2. Vá em Database → Vault → New Secret e cadastre:
   - `cron_secret` = o mesmo valor de CRON_SECRET acima
   - `project_url` = `https://<seu-projeto>.supabase.co`
3. Rode `sql/schedule-monthly-payments.sql`

A função vai rodar:
- Dia 1 de cada mês às 06:00 UTC → cria pagamentos `pending` para
  todos os alunos ativos com `monthly_fee` configurado.
- Diariamente às 03:15 UTC → marca pagamentos `pending` vencidos
  como `overdue`.

### 3.4 — Disparo manual

Admin pode clicar em **Finanças → Gerar do mês** a qualquer momento
para gerar cobranças do mês visível. Idempotente (alunos que já
têm pagamento são ignorados).

---

## 4. Paginação no servidor (backend pronto)

`storage.js` ganhou três métodos paginados:

- `getStudentsPage({ page, pageSize, search, level, classId })`
- `getAttendancePage({ page, pageSize, dateFrom, dateTo, status, ... })`
- `getPaymentsPage({ page, pageSize, reference, status, studentId })`

Cada um retorna `{ items, total, page, pageSize }` usando
`.range(from, to)` + `count: 'exact'`.

**Próximo passo opcional (UI):** os módulos de UI (`alunos.js`,
`frequencia.js`, `financas.js`) ainda fazem `getStudents()` /
`getPayments()` (todos os registros). Para escalar para milhares
de registros, refatorar essas chamadas para `getXxxPage()` e
recarregar a cada mudança de filtro/página. Não é regressão —
o backend já está pronto.

---

## 5. Pendentes de reposição

`storage.getPendingMakeups()` retorna alunos com mais
faltas justificadas do que reposições registradas.

Renderizado automaticamente no Dashboard (`#pendingMakeupsSection`),
oculto se não houver pendências.

Para professor: filtrado pela RLS (vê apenas as próprias).
Para admin: visão consolidada da escola.

---

## 6. Exports

- **Finanças → Exportar:** baixa CSV com pagamentos do mês visível
  (incluindo totais).
- **Aluno → aba Progresso → Imprimir / PDF:** abre nova janela com
  relatório formatado pronto para impressão ou "Salvar como PDF".

---

## Checklist final

- [ ] `add-error-logs.sql` rodado
- [ ] `audit-rls.sql` rodado e checklist confirmado
- [ ] Edge Function `generate-monthly-payments` deployada
- [ ] `CRON_SECRET` configurado nos secrets da function
- [ ] Vault `cron_secret` + `project_url` cadastrados
- [ ] `schedule-monthly-payments.sql` rodado
- [ ] Verificado em `select * from cron.job` que as duas tarefas
      estão agendadas
- [ ] Teste manual do botão "Gerar do mês"
