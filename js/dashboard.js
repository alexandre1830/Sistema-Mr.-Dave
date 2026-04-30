/* ==========================================================================
   DASHBOARD.JS — Lógica da página principal
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {

  const { utils, storage, calendar } = HT;

  /* ---------- Data atual no topbar ---------- */
  const dateEl = document.getElementById('currentDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  /* ---------- Carregar dados por papel ---------- */
  const month = utils.getCurrentMonth();
  const role  = await HT.auth.getRole();

  let students, classes, attendance;
  /* Dados exclusivos por papel */
  let payments      = [];   /* admin: pagamentos recebidos */
  let teacherProfile = null; /* teacher: perfil com default_lesson_rate */
  let studentRates   = {};   /* teacher: { studentId → rateOverride } */

  if (role === 'admin') {
    [students, classes, attendance, payments] = await Promise.all([
      storage.getStudents(),
      storage.getClasses(),
      storage.getAttendance(),
      storage.getPayments(),
    ]);
  } else {
    /* Professor: pagamentos são bloqueados por RLS; calcula ganhos pela frequência */
    [students, classes, attendance, teacherProfile, studentRates] = await Promise.all([
      storage.getStudents(),
      storage.getClasses(),
      storage.getAttendance(),
      storage.getProfile(),
      storage.getMyStudentRates(),
    ]);
  }

  /* Injeta dados no calendar para evitar chamadas duplicadas ao Supabase */
  calendar.setData(students, classes);

  /* ---------- Cards de resumo ---------- */
  function loadStats() {
    const monthAtt = attendance.filter(r => r.date.startsWith(month));

    utils.setTextContent('statStudents', students.length);
    utils.setTextContent('statClasses',  classes.length);

    if (role === 'admin') {
      /* Admin: frequência = total de registros individuais */
      utils.setTextContent('statLessons', monthAtt.length);

      /* Admin: receita = pagamentos com status "paid" no mês */
      const monthPaid = payments.filter(p => p.reference === month && p.status === 'paid');
      const revenue   = monthPaid.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      utils.setTextContent('statRevenue', utils.formatCurrency(revenue));

    } else {
      /* ── Professor ── */
      const defaultRate = Number(teacherProfile?.defaultLessonRate) || 0;

      /* Separa registros válidos (presente ou justificado) */
      const validAtt = monthAtt.filter(r => r.status === 'present' || r.status === 'justified');

      /* --- Turmas: agrupa por (classId, date) → uma sessão por chave --- */
      const classSessionMap = new Map(); /* key → [rateOverrides dos alunos presentes] */
      validAtt
        .filter(r => r.classId)
        .forEach(r => {
          const key = `${r.classId}|${r.date}`;
          if (!classSessionMap.has(key)) classSessionMap.set(key, []);
          const override = studentRates[r.studentId];
          if (override != null) classSessionMap.get(key).push(Number(override));
        });

      /* Pagamento por sessão de turma:
         taxa = max(defaultRate, maior rate_override dos alunos presentes) */
      const classEarnings = [...classSessionMap.values()].reduce((sum, overrides) => {
        const sessionRate = overrides.length
          ? Math.max(defaultRate, ...overrides)
          : defaultRate;
        return sum + sessionRate;
      }, 0);

      /* --- Aulas individuais: um pagamento por aluno por aula --- */
      const indivAtt = validAtt.filter(r => !r.classId);
      const indivEarnings = indivAtt.reduce((sum, r) => {
        const rate = studentRates[r.studentId] != null
          ? Number(studentRates[r.studentId])
          : defaultRate;
        return sum + rate;
      }, 0);

      /* Frequência: sessões de turma únicas + aulas individuais */
      utils.setTextContent('statLessons', classSessionMap.size + indivAtt.length);

      /* Pagamento total */
      const earnings = classEarnings + indivEarnings;

      /* Atualizar label e link do card */
      const labelEl = document.getElementById('statRevenueLabel');
      const cardEl  = document.getElementById('statRevenueCard');
      if (labelEl) labelEl.textContent = 'Pagamento do Mês';
      if (cardEl)  cardEl.href = 'financas-teacher.html';

      utils.setTextContent('statRevenue', utils.formatCurrency(earnings));
    }
  }

  /* ---------- Próximas aulas ---------- */
  async function loadUpcoming() {
    const container = document.getElementById('upcomingList');
    if (!container) return;

    const upcoming = await calendar.getUpcoming(6);

    if (!upcoming.length) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-regular fa-calendar-xmark empty-state-icon"></i>
          <p>Nenhuma aula agendada</p>
        </div>`;
      return;
    }

    container.innerHTML = upcoming.map(ev => {
      const dt      = new Date(ev.start);
      const time    = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const date    = dt.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
      const isToday = ev.start.startsWith(utils.getCurrentDate());

      const levelShort = utils.formatLevelShort(ev.extendedProps.level);
      const typeLabel  = ev.extendedProps.type === 'class' ? 'Turma' : 'Individual';
      const subLabel   = levelShort || (ev.extendedProps.type === 'class' ? 'Turma' : '—');

      return `
        <div class="upcoming-item">
          <div class="upcoming-time">${isToday ? 'Hoje' : date}<br>${time}</div>
          <div class="upcoming-info">
            <div class="upcoming-name">${ev.title}</div>
            <div class="upcoming-class">${subLabel}</div>
          </div>
          <span class="upcoming-badge">${typeLabel}</span>
        </div>`;
    }).join('');
  }

  /* ---------- Init ---------- */
  loadStats();
  await Promise.all([
    calendar.init('calendar'),
    loadUpcoming(),
  ]);
});
