-- =========================================================================
-- FIX: Atualiza handle_new_user para ler default_lesson_rate do metadata
-- e fixa role = 'teacher' (segurança: impede auto-promoção via OTP).
-- Rodar no SQL Editor do Supabase — NÃO zera dados.
-- =========================================================================

create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name, role, default_lesson_rate)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'teacher',   -- sempre teacher; admin é promovido manualmente via SQL
    case
      when (new.raw_user_meta_data->>'default_lesson_rate') is not null
        then (new.raw_user_meta_data->>'default_lesson_rate')::numeric
      else null
    end
  )
  on conflict (id) do nothing;
  return new;
end $$;
