-- =========================================================================
-- ÍNDICES — performance de RLS e queries quentes
-- Idempotente. Rodar no SQL Editor do Supabase. NÃO zera dados.
--
-- Motivação: as policies RLS fazem subqueries do tipo
--   exists (select 1 from student_teachers where teacher_id = auth.uid() ...)
-- Sem índices nas FKs, isso vira seq scan a cada linha lida.
-- =========================================================================

-- ----- ATTENDANCE (tabela mais quente do sistema) ------------------------
create index if not exists idx_attendance_teacher_id on attendance(teacher_id);
create index if not exists idx_attendance_student_id on attendance(student_id);
create index if not exists idx_attendance_class_id   on attendance(class_id);
create index if not exists idx_attendance_date       on attendance(date);

-- Composto para queries de payout do professor por período
create index if not exists idx_attendance_teacher_date
  on attendance(teacher_id, date);

-- ----- STUDENT_TEACHERS (consultada por TODAS as policies de teacher) ---
create index if not exists idx_st_teacher_id on student_teachers(teacher_id);
create index if not exists idx_st_student_id on student_teachers(student_id);

-- ----- STUDENTS ----------------------------------------------------------
create index if not exists idx_students_class_id on students(class_id);

-- ----- CLASSES -----------------------------------------------------------
create index if not exists idx_classes_teacher_id on classes(teacher_id);

-- ----- PAYMENTS ----------------------------------------------------------
create index if not exists idx_payments_student_id on payments(student_id);
create index if not exists idx_payments_reference  on payments(reference);

-- Composto para o cron `mark-overdue-payments` (filtra status + due_date)
create index if not exists idx_payments_status_due
  on payments(status, due_date) where status = 'pending';

-- ----- STUDENT_PROGRESS --------------------------------------------------
create index if not exists idx_sp_student_id on student_progress(student_id);
create index if not exists idx_sp_content_id on student_progress(content_id);

-- ----- TEACHER_AVAILABILITY ---------------------------------------------
create index if not exists idx_avail_teacher_day
  on teacher_availability(teacher_id, day_of_week);

-- ----- MATERIALS ---------------------------------------------------------
create index if not exists idx_materials_folder_id on materials(folder_id);

-- =========================================================================
-- VERIFICAÇÃO (opcional)
-- select schemaname, tablename, indexname from pg_indexes
--   where schemaname = 'public' and indexname like 'idx_%' order by tablename;
-- =========================================================================
