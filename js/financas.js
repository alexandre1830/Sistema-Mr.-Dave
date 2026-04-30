/* ==========================================================================
   FINANCAS.JS — Gestão financeira (Supabase async)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {

  /* Guarda de papel: professor não usa esta lógica (financas-teacher.js cuida) */
  try {
    const role = await HT.auth?.getRole();
    if (role === 'teacher') return;
  } catch {}

  const { utils, storage, modals } = HT;

  /* ====== Cache local ====== */
  let allStudents = [];
  let allPayments = [];

  /* ====== Helpers de busca no cache ====== */
  function findStudent(id) { return allStudents.find(s => s.id === id) || null; }

  /* ====== Estado ====== */
  let currentMonth    = utils.getCurrentMonth();
  let viewMode        = 'cards';   // 'cards' | 'table'
  const PAGE_SIZE     = 15;
  let  currentPage    = 1;
  let  sortField      = 'student';
  let  sortDir        = 'asc';
  let  pendingDeleteId = null;
  let  revenueChart    = null;
  let  statusChart     = null;

  /* ====== Refs ====== */
  const periodLabel = document.getElementById('currentPeriod');

  /* ====== Carregar todos os dados ====== */
  async function load() {
    [allStudents, allPayments] = await Promise.all([
      storage.getStudents(),
      storage.getPayments(),
    ]);
  }

  /* ====== Utilitário: IDs de alunos existentes ====== */
  function activeStudentIds() {
    return new Set(allStudents.map(s => s.id));
  }

  /* ====== Período ====== */
  function setPeriod(month) {
    currentMonth = month;
    if (periodLabel) periodLabel.textContent = utils.formatMonthYear(month);
    loadSummary();
    updateCharts();
    renderPayments();
  }

  document.getElementById('prevMonthBtn')?.addEventListener('click', () => setPeriod(utils.addMonths(currentMonth, -1)));
  document.getElementById('nextMonthBtn')?.addEventListener('click', () => setPeriod(utils.addMonths(currentMonth,  1)));

  /* ====== Resumo ====== */
  function loadSummary() {
    const valid    = activeStudentIds();
    const payments = allPayments
      .filter(p => p.reference === currentMonth && valid.has(p.studentId));
    const paid     = payments.filter(p => p.status === 'paid');
    const pending  = payments.filter(p => p.status === 'pending');
    const overdue  = payments.filter(p => p.status === 'overdue'
      || (p.status === 'pending' && utils.isOverdue(p.dueDate, p.status)));

    const totalPaid    = paid.reduce((s, p)    => s + Number(p.amount), 0);
    const totalPending = pending.reduce((s, p) => s + Number(p.amount), 0);
    const totalOverdue = overdue.reduce((s, p) => s + Number(p.amount), 0);
    const totalAll     = payments.reduce((s, p)=> s + Number(p.amount), 0);

    utils.setTextContent('finTotalMonth',   utils.formatCurrency(totalAll));
    utils.setTextContent('finPaidMonth',    utils.formatCurrency(totalPaid));
    utils.setTextContent('finPendingMonth', utils.formatCurrency(totalPending));
    utils.setTextContent('finOverdueMonth', utils.formatCurrency(totalOverdue));

    // Tendência vs mês anterior
    const prevMonthPayments = allPayments
      .filter(p => p.reference === utils.addMonths(currentMonth, -1) && p.status === 'paid' && valid.has(p.studentId));
    const prevTotal = prevMonthPayments.reduce((s, p) => s + Number(p.amount), 0);
    const trendEl   = document.getElementById('finTrendValue');
    const trendIcon = document.querySelector('.stat-trend i');
    if (trendEl && prevTotal > 0) {
      const pct = Math.round(((totalPaid - prevTotal) / prevTotal) * 100);
      trendEl.textContent = `${Math.abs(pct)}%`;
      if (trendIcon) {
        trendIcon.className = pct >= 0 ? 'fa-solid fa-arrow-trend-up' : 'fa-solid fa-arrow-trend-down';
        trendIcon.style.color = pct >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
      }
    } else if (trendEl) {
      trendEl.textContent = '—';
    }
  }

  /* ====== Gráficos ====== */
  function initCharts() {
    initRevenueChart();
    initStatusChart();
  }

  function initRevenueChart() {
    const canvas = document.getElementById('revenueChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const yearSel = document.getElementById('revenueChartYear');
    const year    = new Date().getFullYear();
    if (yearSel) {
      yearSel.innerHTML = [year-1, year, year+1].map(y =>
        `<option value="${y}"${y===year?' selected':''}>${y}</option>`).join('');
      yearSel.addEventListener('change', updateCharts);
    }

    const ctx = canvas.getContext('2d');
    revenueChart = new Chart(ctx, {
      type: 'bar',
      data: getRevenueData(year),
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: v => `R$ ${v.toLocaleString('pt-BR')}`,
              font: { size: 11 },
            },
            grid: { color: 'rgba(0,0,0,.05)' },
          },
          x: { ticks: { font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  function getRevenueData(year) {
    const months  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const valid   = activeStudentIds();
    const data    = months.map((_, i) => {
      const ref      = `${year}-${String(i+1).padStart(2,'0')}`;
      const payments = allPayments
        .filter(p => p.reference === ref && p.status === 'paid' && valid.has(p.studentId));
      return payments.reduce((s, p) => s + Number(p.amount), 0);
    });

    return {
      labels: months,
      datasets: [{
        data,
        backgroundColor: months.map((_, i) => {
          const thisMonth = i === new Date().getMonth() && year === new Date().getFullYear();
          return thisMonth ? 'rgba(3,45,111,.85)' : 'rgba(3,45,111,.4)';
        }),
        borderColor: 'rgba(3,45,111,1)',
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
      }],
    };
  }

  function initStatusChart() {
    const canvas = document.getElementById('statusChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    statusChart = new Chart(ctx, {
      type: 'doughnut',
      data: getStatusData(),
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${utils.formatCurrency(ctx.raw)}`,
            },
          },
        },
      },
    });

    renderStatusLegend();
  }

  function getStatusData() {
    const valid    = activeStudentIds();
    const payments = allPayments
      .filter(p => p.reference === currentMonth && valid.has(p.studentId));
    const paid     = payments.filter(p => p.status === 'paid').reduce((s,p)=>s+Number(p.amount),0);
    const pending  = payments.filter(p => p.status === 'pending').reduce((s,p)=>s+Number(p.amount),0);
    const overdue  = payments.filter(p => p.status === 'overdue').reduce((s,p)=>s+Number(p.amount),0);
    return {
      labels: ['Pago','Pendente','Em atraso'],
      datasets: [{
        data: [paid, pending, overdue],
        backgroundColor: ['#15803d','#b45309','#dc2626'],
        borderWidth: 0,
        hoverOffset: 6,
      }],
    };
  }

  function renderStatusLegend() {
    const legendEl = document.getElementById('statusChartLegend');
    if (!legendEl) return;
    const valid    = activeStudentIds();
    const payments = allPayments
      .filter(p => p.reference === currentMonth && valid.has(p.studentId));
    const items = [
      { label: 'Pago',       color: '#15803d', value: payments.filter(p=>p.status==='paid').reduce((s,p)=>s+Number(p.amount),0) },
      { label: 'Pendente',   color: '#b45309', value: payments.filter(p=>p.status==='pending').reduce((s,p)=>s+Number(p.amount),0) },
      { label: 'Em atraso',  color: '#dc2626', value: payments.filter(p=>p.status==='overdue').reduce((s,p)=>s+Number(p.amount),0) },
    ];
    legendEl.innerHTML = items.map(item => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${item.color}"></div>
        <span class="legend-label">${item.label}</span>
        <span class="legend-value">${utils.formatCurrency(item.value)}</span>
      </div>`).join('');
  }

  function updateCharts() {
    if (revenueChart) {
      const year = Number(document.getElementById('revenueChartYear')?.value) || new Date().getFullYear();
      revenueChart.data = getRevenueData(year);
      revenueChart.update();
    }
    if (statusChart) {
      statusChart.data = getStatusData();
      statusChart.update();
      renderStatusLegend();
    }
  }

  /* ====== Render Pagamentos ====== */
  function getFilteredPayments() {
    const q      = (document.getElementById('paymentSearch')?.value || '').toLowerCase();
    const status = document.getElementById('paymentStatusFilter')?.value || '';
    const valid  = activeStudentIds();

    return allPayments
      .filter(p => p.reference === currentMonth && valid.has(p.studentId))
      .filter(p => {
        if (status && p.status !== status) return false;
        if (q) {
          const s = findStudent(p.studentId);
          if (!s || !s.name.toLowerCase().includes(q)) return false;
        }
        return true;
      });
  }

  function renderPayments() {
    if (viewMode === 'cards') renderCards();
    else                      renderTable();
  }

  /* ---------- Cards ---------- */
  function renderCards() {
    const container = document.getElementById('paymentCardsGrid');
    const tableCard = document.getElementById('paymentsTableCard');
    if (container) container.style.display = '';
    if (tableCard) tableCard.style.display = 'none';

    const payments = getFilteredPayments();

    if (!container) return;

    if (!payments.length) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-receipt empty-state-icon"></i>
          <p class="empty-state-title">Nenhum pagamento em ${utils.formatMonthYear(currentMonth)}</p>
          <button class="btn btn--primary" id="addFirstPaymentBtn">
            <i class="fa-solid fa-plus"></i> Registrar Pagamento</button>
        </div>`;
      document.getElementById('addFirstPaymentBtn')
        ?.addEventListener('click', () => openPaymentForm());
      return;
    }

    // Agrupar por aluno
    const byStudent = {};
    payments.forEach(p => {
      if (!byStudent[p.studentId]) byStudent[p.studentId] = [];
      byStudent[p.studentId].push(p);
    });

    container.innerHTML = Object.entries(byStudent).map(([sid, plist]) => {
      const student = findStudent(sid);
      if (!student) return '';

      const rows = plist.map(p => `
        <div class="payment-record">
          <span class="payment-record-ref">${utils.formatMonthYear(p.reference)}</span>
          <span class="payment-record-amount">${utils.formatCurrency(p.amount)}</span>
          ${utils.statusBadge(p.status)}
          <div class="payment-record-actions">
            <button class="action-btn action-btn--edit" data-id="${p.id}" title="Editar">
              <i class="fa-solid fa-pen-to-square"></i></button>
            <button class="action-btn action-btn--delete" data-id="${p.id}" title="Excluir">
              <i class="fa-solid fa-trash"></i></button>
          </div>
        </div>`).join('');

      return `
        <div class="payment-card">
          <div class="payment-card-header">
            <div class="payment-card-avatar">${utils.getInitials(student.name)}</div>
            <div>
              <div class="payment-card-name">${student.name}</div>
              <div class="payment-card-fee">${student.monthlyFee ? utils.formatCurrency(student.monthlyFee)+'/mês' : ''}</div>
            </div>
          </div>
          <div class="payment-card-body">${rows}</div>
          <button class="payment-card-add" data-student-id="${sid}">
            <i class="fa-solid fa-plus"></i> Adicionar pagamento
          </button>
        </div>`;
    }).join('');

    container.querySelectorAll('.action-btn--edit').forEach(btn =>
      btn.addEventListener('click', () => openPaymentForm(btn.dataset.id)));
    container.querySelectorAll('.action-btn--delete').forEach(btn =>
      btn.addEventListener('click', () => confirmDelete(btn.dataset.id)));
    container.querySelectorAll('.payment-card-add').forEach(btn =>
      btn.addEventListener('click', () => openPaymentForm(null, btn.dataset.studentId)));
  }

  /* ---------- Tabela ---------- */
  function renderTable() {
    const container = document.getElementById('paymentCardsGrid');
    const tableCard = document.getElementById('paymentsTableCard');
    if (container) container.style.display = 'none';
    if (tableCard) tableCard.style.display = '';

    const filtered = getFilteredPayments();
    const sorted   = [...filtered].sort((a, b) => {
      let va, vb;
      if (sortField === 'student') {
        va = findStudent(a.studentId)?.name || '';
        vb = findStudent(b.studentId)?.name || '';
      } else if (sortField === 'reference') {
        va = a.reference; vb = b.reference;
      } else if (sortField === 'amount') {
        va = Number(a.amount); vb = Number(b.amount);
        return sortDir === 'asc' ? va - vb : vb - va;
      } else if (sortField === 'status') {
        va = a.status; vb = b.status;
      } else { va = a[sortField]||''; vb = b[sortField]||''; }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    const total  = sorted.length;
    const pages  = Math.ceil(total / PAGE_SIZE) || 1;
    currentPage  = Math.min(currentPage, pages);
    const page   = sorted.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);

    const tbody = document.getElementById('paymentsTableBody');
    if (tbody) {
      tbody.innerHTML = !page.length
        ? `<tr class="empty-row"><td colspan="8"><div class="empty-state">
            <i class="fa-solid fa-receipt empty-state-icon"></i><p>Nenhum pagamento</p></div></td></tr>`
        : page.map(p => {
            const s = findStudent(p.studentId);
            return `
              <tr>
                <td>${s?.name || '—'}</td>
                <td>${utils.formatMonthYear(p.reference)}</td>
                <td>${utils.formatCurrency(p.amount)}</td>
                <td class="text-small text-muted">${p.dueDate ? utils.formatDate(p.dueDate) : '—'}</td>
                <td>${utils.statusBadge(p.status)}</td>
                <td class="text-small text-muted">${p.paidDate ? utils.formatDate(p.paidDate) : '—'}</td>
                <td class="text-small text-muted">${utils.formatMethod(p.method)}</td>
                <td>
                  <div class="table-row-actions">
                    <button class="action-btn action-btn--edit" data-id="${p.id}" title="Editar">
                      <i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="action-btn action-btn--delete" data-id="${p.id}" title="Excluir">
                      <i class="fa-solid fa-trash"></i></button>
                  </div>
                </td>
              </tr>`;
          }).join('');

      tbody.querySelectorAll('.action-btn--edit').forEach(btn =>
        btn.addEventListener('click', () => openPaymentForm(btn.dataset.id)));
      tbody.querySelectorAll('.action-btn--delete').forEach(btn =>
        btn.addEventListener('click', () => confirmDelete(btn.dataset.id)));
    }

    // Paginação
    const info    = document.getElementById('paymentPaginationInfo');
    const pagesEl = document.getElementById('payPaginationPages');
    const prev    = document.getElementById('payPrevPage');
    const next    = document.getElementById('payNextPage');
    if (info)   info.textContent = total ? `${(currentPage-1)*PAGE_SIZE+1}–${Math.min(currentPage*PAGE_SIZE,total)} de ${total}` : '';
    if (prev)   prev.disabled = currentPage <= 1;
    if (next)   next.disabled = currentPage >= pages;
    if (pagesEl) {
      pagesEl.innerHTML = Array.from({length: Math.min(pages,7)}, (_,i) => {
        const p = i+1;
        return `<button class="page-btn${p===currentPage?' page-btn--active':''}" data-page="${p}">${p}</button>`;
      }).join('');
      pagesEl.querySelectorAll('.page-btn').forEach(btn =>
        btn.addEventListener('click', () => { currentPage=+btn.dataset.page; renderTable(); }));
    }
  }

  document.getElementById('payPrevPage')?.addEventListener('click', () => { currentPage--; renderTable(); });
  document.getElementById('payNextPage')?.addEventListener('click', () => { currentPage++; renderTable(); });

  /* Ordenação tabela */
  document.querySelectorAll('#paymentsTable .sortable').forEach(th => {
    th.addEventListener('click', () => {
      const f = th.dataset.sort;
      if (sortField === f) sortDir = sortDir==='asc'?'desc':'asc';
      else { sortField=f; sortDir='asc'; }
      currentPage=1;
      renderTable();
    });
  });

  /* Filtros */
  document.getElementById('paymentSearch')
    ?.addEventListener('input', utils.debounce(() => { currentPage=1; renderPayments(); }, 300));
  document.getElementById('paymentStatusFilter')
    ?.addEventListener('change', () => { currentPage=1; renderPayments(); });

  /* Toggle de visualização */
  document.getElementById('viewCards')?.addEventListener('click', () => {
    viewMode = 'cards';
    document.getElementById('viewCards')?.classList.add('view-toggle-btn--active');
    document.getElementById('viewTable')?.classList.remove('view-toggle-btn--active');
    renderPayments();
  });
  document.getElementById('viewTable')?.addEventListener('click', () => {
    viewMode = 'table';
    document.getElementById('viewTable')?.classList.add('view-toggle-btn--active');
    document.getElementById('viewCards')?.classList.remove('view-toggle-btn--active');
    renderPayments();
  });

  /* ====== Modal Pagamento ====== */
  function openPaymentForm(paymentId = null, preStudentId = null) {
    const form = document.getElementById('paymentForm');
    if (!form) return;
    form.reset();

    const payment = paymentId ? allPayments.find(p => p.id === paymentId) : null;
    document.getElementById('paymentId').value = payment?.id || '';
    document.getElementById('paymentModalTitle').textContent = payment ? 'Editar Pagamento' : 'Novo Pagamento';

    // Popular select de alunos
    const sel = document.getElementById('paymentStudent');
    sel.innerHTML = '<option value="">Selecione o aluno</option>'
      + allStudents.map(s =>
          `<option value="${s.id}"${(payment?.studentId||preStudentId)===s.id?' selected':''}>${s.name}</option>`
        ).join('');

    if (payment) {
      utils.setInputValue('paymentReference', payment.reference);
      utils.setInputValue('paymentAmount',    payment.amount);
      utils.setInputValue('paymentDueDate',   payment.dueDate);
      utils.setInputValue('paymentStatus',    payment.status);
      utils.setInputValue('paymentDate',      payment.paidDate || '');
      const methodRadio = document.querySelector(`#paymentForm input[name="method"][value="${payment.method}"]`);
      if (methodRadio) methodRadio.checked = true;
      utils.setInputValue('paymentNotes', payment.notes);
    } else {
      utils.setInputValue('paymentReference', currentMonth);
      if (preStudentId) {
        const s = findStudent(preStudentId);
        if (s?.monthlyFee) utils.setInputValue('paymentAmount', s.monthlyFee);
        if (s?.payDay) {
          const [y, m] = currentMonth.split('-');
          utils.setInputValue('paymentDueDate', `${y}-${m}-${String(s.payDay).padStart(2,'0')}`);
        }
      }
    }

    // Autocompletar ao trocar aluno
    sel.addEventListener('change', () => {
      const sid = sel.value;
      if (!sid || payment) return;
      const s = findStudent(sid);
      if (s?.monthlyFee) utils.setInputValue('paymentAmount', s.monthlyFee);
      if (s?.payDay) {
        const [y, m] = currentMonth.split('-');
        utils.setInputValue('paymentDueDate', `${y}-${m}-${String(s.payDay).padStart(2,'0')}`);
      }
    });

    modals.open('paymentModalOverlay');
  }

  document.getElementById('addPaymentBtn')?.addEventListener('click', () => openPaymentForm());
  document.getElementById('paymentModalCancel')?.addEventListener('click', () => modals.close('paymentModalOverlay'));
  document.getElementById('paymentModalClose')?.addEventListener('click', () => modals.close('paymentModalOverlay'));

  document.getElementById('paymentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const sid    = document.getElementById('paymentStudent').value;
    const ref    = document.getElementById('paymentReference').value;
    const amount = document.getElementById('paymentAmount').value;
    let valid = true;

    document.getElementById('paymentStudentError').textContent = '';
    document.getElementById('paymentRefError').textContent     = '';
    document.getElementById('paymentAmountError').textContent  = '';

    if (!sid)    { document.getElementById('paymentStudentError').textContent = 'Selecione o aluno.'; valid=false; }
    if (!ref)    { document.getElementById('paymentRefError').textContent     = 'Informe a referência.'; valid=false; }
    if (!amount) { document.getElementById('paymentAmountError').textContent  = 'Informe o valor.'; valid=false; }
    if (!valid)  return;

    const method   = document.querySelector('#paymentForm input[name="method"]:checked')?.value || '';
    const id       = document.getElementById('paymentId').value;
    const status   = document.getElementById('paymentStatus').value;
    const paidDate = document.getElementById('paymentDate').value || null;

    const saveBtn = document.getElementById('paymentModalSave');
    if (saveBtn) saveBtn.classList.add('is-loading');

    try {
      await storage.savePayment({
        id:        id || undefined,
        studentId: sid,
        reference: ref,
        amount:    Number(amount),
        dueDate:   document.getElementById('paymentDueDate').value || null,
        status,
        paidDate:  status === 'paid' ? (paidDate || utils.getCurrentDate()) : paidDate,
        method,
        notes:     document.getElementById('paymentNotes').value || '',
      });

      modals.close('paymentModalOverlay');
      utils.showToast(id ? 'Pagamento atualizado!' : 'Pagamento registrado!', 'success');
      allPayments = await storage.getPayments();
      loadSummary();
      updateCharts();
      renderPayments();
    } catch (err) {
      utils.showToast('Erro ao salvar pagamento. Tente novamente.', 'error');
      console.error(err);
    } finally {
      if (saveBtn) saveBtn.classList.remove('is-loading');
    }
  });

  /* ====== Excluir ====== */
  function confirmDelete(id) {
    pendingDeleteId = id;
    modals.open('deleteConfirmOverlay');
  }

  document.getElementById('deleteConfirm')?.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    try {
      await storage.deletePayment(pendingDeleteId);
      modals.close('deleteConfirmOverlay');
      utils.showToast('Pagamento excluído.', 'warning');
      pendingDeleteId = null;
      allPayments = await storage.getPayments();
      loadSummary();
      updateCharts();
      renderPayments();
    } catch (err) {
      utils.showToast('Erro ao excluir pagamento.', 'error');
      console.error(err);
    }
  });

  document.getElementById('deleteCancel')?.addEventListener('click', () => {
    modals.close('deleteConfirmOverlay');
    pendingDeleteId = null;
  });

  /* ====== Init ====== */
  await load();
  setPeriod(currentMonth);
  initCharts();
});
