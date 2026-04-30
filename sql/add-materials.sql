-- =========================================================================
-- MATERIAIS — tabela de metadados + RLS
-- NÃO zera dados existentes. Rodar no SQL Editor do Supabase.
--
-- ANTES DE RODAR: criar o bucket no Supabase Dashboard
--   Storage → New Bucket → nome: "materials" → marcar "Public bucket"
--   (necessário para a pré-visualização via Microsoft Office Online Viewer)
-- =========================================================================

create table if not exists materials (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  file_path   text        not null,   -- caminho no bucket (ex: "abc123.pptx")
  file_name   text,                   -- nome original do arquivo
  file_size   bigint,                 -- tamanho em bytes
  mime_type   text,
  category    text,
  uploaded_by uuid        references profiles(id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table materials enable row level security;

-- Todos os usuários autenticados podem visualizar/baixar
create policy "materials read"
  on materials for select
  to authenticated
  using (true);

-- Somente admin pode inserir, editar e excluir
create policy "materials admin insert"
  on materials for insert
  with check (is_admin());

create policy "materials admin update"
  on materials for update
  using (is_admin());

create policy "materials admin delete"
  on materials for delete
  using (is_admin());
