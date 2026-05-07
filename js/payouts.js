/* ==========================================================================
   PAYOUTS.JS — Cálculo do que cada professor tem a receber
   - Aulas pagas: status 'presente', 'falta', 'reposicao'
   - Aulas NÃO pagas: 'justificada'
   - Valor = rate_override (se houver) ou default_lesson_rate do professor
   ========================================================================== */

window.HT = window.HT || {};

HT.payouts = (() => {

  /* Aulas que GERAM pagamento ao professor: presente, falta (não justificada) e reposição.
     Justificada NÃO paga. */
  const PAID_STATUSES = new Set(['present','absent','makeup']);

  function _rateFor(studentId, teacherId, defaultRate, links) {
    const link = links.find(l => l.student_id === studentId && l.teacher_id === teacherId);
    if (link?.rate_override != null) return Number(link.rate_override);
    return defaultRate != null ? Number(defaultRate) : 0;
  }

  /**
   * Calcula payout do professor logado para o período {fromDate, toDate}.
   * Retorna { total, count, items: [{date, studentId, studentName, status, rate}], byStudent: {...} }
   */
  async function getMyPayout({ from, to } = {}) {
    const db = HT.supabase;
    const { data: { user } } = await db.auth.getUser();
    if (!user) return { total: 0, count: 0, items: [], byStudent: {} };

    /* Profile do prof — pega valor padrão */
    const { data: prof } = await db.from('profiles')
      .select('default_lesson_rate').eq('id', user.id).single();
    const defaultRate = prof?.default_lesson_rate;

    /* Vínculos com sobrescritas */
    const { data: links } = await db.from('student_teachers')
      .select('student_id, teacher_id, rate_override').eq('teacher_id', user.id);

    /* Frequência no período */
    let q = db.from('attendance')
      .select('id, student_id, date, status')
      .eq('teacher_id', user.id);
    if (from) q = q.gte('date', from);
    if (to)   q = q.lte('date', to);
    const { data: att, error } = await q.order('date', { ascending: false });
    if (error) throw error;

    /* Mapa nome dos alunos */
    const studentIds = [...new Set((att || []).map(a => a.student_id))];
    let nameMap = {};
    if (studentIds.length) {
      const { data: studs } = await db.from('students')
        .select('id, name').in('id', studentIds);
      (studs || []).forEach(s => { nameMap[s.id] = s.name; });
    }

    const items = [];
    const byStudent = {};
    let total = 0;
    let count = 0;

    (att || []).forEach(a => {
      const paid = PAID_STATUSES.has(a.status);
      const rate = paid ? _rateFor(a.student_id, user.id, defaultRate, links || []) : 0;
      if (paid) { total += rate; count += 1; }
      const item = {
        id: a.id, date: a.date, status: a.status,
        studentId: a.student_id,
        studentName: nameMap[a.student_id] || '(aluno removido)',
        rate, paid,
      };
      items.push(item);
      if (!byStudent[a.student_id]) {
        byStudent[a.student_id] = { studentId: a.student_id, studentName: item.studentName, count: 0, total: 0 };
      }
      if (paid) {
        byStudent[a.student_id].count += 1;
        byStudent[a.student_id].total += rate;
      }
    });

    return { total, count, items, byStudent: Object.values(byStudent) };
  }

  /**
   * (Admin) Agrega o payout de TODOS os professores no período {from, to}.
   * Retorna { grandTotal, paidLessons, totalLessons, justifiedLessons,
   *          teacherCount, byTeacher: [{ teacherId, teacherName, defaultRate,
   *                                       total, paidCount, totalCount, justifiedCount }] }
   */
  async function getAllTeachersPayout({ from, to } = {}) {
    const db = HT.supabase;

    /* Professores cadastrados */
    const { data: teachers, error: tErr } = await db.from('profiles')
      .select('id, name, default_lesson_rate')
      .eq('role', 'teacher');
    if (tErr) throw tErr;

    /* Vínculos com sobrescritas */
    const { data: links, error: lErr } = await db.from('student_teachers')
      .select('student_id, teacher_id, rate_override');
    if (lErr) throw lErr;

    /* Frequência no período */
    let q = db.from('attendance').select('id, student_id, teacher_id, date, status');
    if (from) q = q.gte('date', from);
    if (to)   q = q.lte('date', to);
    const { data: att, error: aErr } = await q;
    if (aErr) throw aErr;

    /* Mapa: teacherId → bucket */
    const byTeacher = {};
    (teachers || []).forEach(t => {
      byTeacher[t.id] = {
        teacherId:      t.id,
        teacherName:    t.name || '(sem nome)',
        defaultRate:    Number(t.default_lesson_rate || 0),
        total:          0,
        paidCount:      0,
        totalCount:     0,
        justifiedCount: 0,
      };
    });

    let grandTotal       = 0;
    let paidLessons      = 0;
    let totalLessons     = 0;
    let justifiedLessons = 0;

    (att || []).forEach(a => {
      const tdata = byTeacher[a.teacher_id];
      if (!tdata) return; /* aula com teacher inexistente — ignora */
      const paid = PAID_STATUSES.has(a.status);
      tdata.totalCount += 1;
      totalLessons    += 1;
      if (a.status === 'justified') {
        tdata.justifiedCount += 1;
        justifiedLessons    += 1;
      }
      if (paid) {
        const rate = _rateFor(a.student_id, a.teacher_id, tdata.defaultRate, links || []);
        tdata.paidCount += 1;
        tdata.total     += rate;
        paidLessons     += 1;
        grandTotal      += rate;
      }
    });

    return {
      grandTotal,
      paidLessons,
      totalLessons,
      justifiedLessons,
      teacherCount: (teachers || []).length,
      byTeacher: Object.values(byTeacher),
    };
  }

  return { getMyPayout, getAllTeachersPayout, PAID_STATUSES };
})();
