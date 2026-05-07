-- =========================================================================
-- MATERIAIS — tabelas (folders + materials), RLS e storage policies
-- Idempotente. Rodar no SQL Editor do Supabase. NÃO zera dados.
--
-- ANTES DE RODAR:
--   1. Storage → New Bucket → nome: "materials" → marcar "Public bucket"
--      (necessário para a pré-visualização via Microsoft Office Online Viewer)
-- =========================================================================


-- =========================================================================
-- 1) TABELA: material_folders (pastas)
-- =========================================================================
create table if not exists material_folders (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  color       text        not null default '#032d6f',
  position    int         not null default 0,
  created_by  uuid        references profiles(id) on delete set null,
  created_at  timestamptz default now()
);

alter table material_folders enable row level security;

drop policy if exists "folders read"        on material_folders;
drop policy if exists "folders admin write" on material_folders;

create policy "folders read"
  on material_folders for select
  to authenticated using (true);

create policy "folders admin write"
  on material_folders for all
  using (is_admin()) with check (is_admin());


-- =========================================================================
-- 2) TABELA: materials (arquivos)
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
  folder_id   uuid        references material_folders(id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Para bancos pré-existentes onde a tabela já existia sem folder_id:
alter table materials
  add column if not exists folder_id uuid
  references material_folders(id) on delete set null;

alter table materials enable row level security;

drop policy if exists "materials read"          on materials;
drop policy if exists "materials admin insert"  on materials;
drop policy if exists "materials admin update"  on materials;
drop policy if exists "materials admin delete"  on materials;

-- Todos os autenticados podem visualizar/baixar
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


-- =========================================================================
-- 3) STORAGE POLICIES (bucket "materials")
-- O Supabase Storage usa RLS em storage.objects separadamente da tabela.
-- Usamos public.is_admin() para manter consistência com o resto do schema.
-- =========================================================================

drop policy if exists "materials storage upload" on storage.objects;
drop policy if exists "materials storage read"   on storage.objects;
drop policy if exists "materials storage update" on storage.objects;
drop policy if exists "materials storage delete" on storage.objects;

-- Admin pode fazer upload
create policy "materials storage upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'materials'
    and public.is_admin()
  );

-- Todos os autenticados podem ler/baixar
create policy "materials storage read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'materials');

-- Admin pode atualizar (substituir arquivo)
create policy "materials storage update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'materials'
    and public.is_admin()
  );

-- Admin pode excluir arquivos do storage
create policy "materials storage delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'materials'
    and public.is_admin()
  );
