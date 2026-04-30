-- =========================================================================
-- POLÍTICAS DE STORAGE para o bucket "materials"
-- O Supabase Storage usa RLS em storage.objects separadamente da tabela.
-- Rodar no SQL Editor do Supabase após criar o bucket "materials".
-- =========================================================================

-- Admin pode fazer upload
create policy "materials storage upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'materials'
    and (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Todos os usuários autenticados podem ler/baixar
create policy "materials storage read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'materials');

-- Admin pode excluir arquivos do storage
create policy "materials storage delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'materials'
    and (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Admin pode atualizar (substituir arquivo)
create policy "materials storage update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'materials'
    and (select role from public.profiles where id = auth.uid()) = 'admin'
  );
