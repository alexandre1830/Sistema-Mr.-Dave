-- =========================================================================
-- PASTAS DE MATERIAIS — tabela + vínculo com materials
-- NÃO zera dados. Rodar no SQL Editor do Supabase.
-- =========================================================================

-- Tabela de pastas
create table if not exists material_folders (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  color       text        not null default '#032d6f',
  position    int         not null default 0,
  created_by  uuid        references profiles(id) on delete set null,
  created_at  timestamptz default now()
);

alter table material_folders enable row level security;

create policy "folders read"
  on material_folders for select
  to authenticated using (true);

create policy "folders admin write"
  on material_folders for all
  using (is_admin());

-- Adiciona folder_id na tabela materials (já existente)
alter table materials
  add column if not exists folder_id uuid
  references material_folders(id) on delete set null;
