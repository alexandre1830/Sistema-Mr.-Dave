/* ==========================================================================
   FINANCAS-TEACHER.JS — Renderiza a view de payout do professor.
   - Detecta papel: se 'admin', não faz nada (financas.js cuida).
   - Se 'teacher', esconde view admin, mostra view teacher e calcula payout
     do mês exibido no seletor de período.
   ========================================================================== */

(() => {

  function fmtBR(n) { return Number(n || 0).toFixed(2).replace('.', ','); }

  const escapeHTML = s => HT.utils.escapeHTML(s);

  const STATUS_LABEL = {
    present:   'Presente',
    absent:    'Falta',
    justified: 'Justificada',
    makeup:    'Reposição',
  };

  /* Mês em foco — sincroniza com o período exibido no topo */
  let currentMonth = new Date(); /* primeiro dia do mês corrente */
  currentMonth.setDate(1);

  function periodBounds(d) {
    const y = d.getFullYear(), m = d.getMonth();
    const from = `${y}-${String(m+1).padStart(2,'0')}-01`;
    const last = new Date(y, m+1, 0).getDate();
    const to   = `${y}-${String(m+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
    return { from, to, label: d.toLocaleDateString('pt-BR', { month:'long', year:'numeric' }) };
  }

  function setPeriodLabel(label) {
    const el = document.getElementById('currentPeriod');
    if (el) el.textContent = label.charAt(0).toUpperCase() + label.slice(1);
  }

  async function render() {
    const { from, to, label } = periodBounds(currentMonth);
    setPeriodLabel(label);

    const data = await HT.payouts.getMyPayout({ from, to });

    document.getElementById('payoutTotal').textContent     = `R$ ${fmtBR(data.total)}`;
    document.getElementById('payoutCount').textContent     = data.count;
    document.getElementById('payoutTotalLessons').textContent =
      data.items.length;
    document.getElementById('payoutJustified').textContent =
      data.items.filter(i => i.status === 'justified').length;

    /* Por aluno */
    const byBody = document.getElementById('payoutByStudentBody');
    if (!data.byStudent.length) {
      byBody.innerHTML = `<tr class="empty-row"><td colspan="3">
        <div class="empty-state empty-state--sm"><p>Sem aulas no período.</p></div></td></tr>`;
    } else {
      byBody.innerHTML = data.byStudent
        .sort((a,b) => b.total - a.total)
        .map(s => `<tr>
          <td>${escapeHTML(s.studentName)}</td>
          <td>${s.count}</td>
          <td><strong>R$ ${fmtBR(s.total)}</strong></td>
        </tr>`).join('');
    }

    /* Itens detalhados */
    const itemsBody = document.getElementById('payoutItemsBody');
    if (!data.items.length) {
      itemsBody.innerHTML = `<tr class="empty-row"><td colspan="4">
        <div class="empty-state empty-state--sm"><p>Sem aulas no período.</p></div></td></tr>`;
    } else {
      itemsBody.innerHTML = data.items.map(i => `
        <tr>
          <td>${i.date.split('-').reverse().join('/')}</td>
          <td>${escapeHTML(i.studentName)}</td>
          <td>${STATUS_LABEL[i.status] || i.status}</td>
          <td>${i.paid ? `R$ ${fmtBR(i.rate)}` : '<span style="opacity:.6">—</span>'}</td>
        </tr>`).join('');
    }
  }

  function bindPeriodNav() {
    document.getElementById('prevMonthBtn')?.addEventListener('click', () => {
      currentMonth.setMonth(currentMonth.getMonth() - 1);
      render();
    });
    document.getElementById('nextMonthBtn')?.addEventListener('click', () => {
      currentMonth.setMonth(currentMonth.getMonth() + 1);
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    let role = 'teacher';
    try { role = (await HT.auth?.getRole()) || 'teacher'; } catch {}

    if (role !== 'teacher') return;  /* admin: financas.js já cuida */

    /* Esconde view admin + botão "Novo Pagamento" */
    document.getElementById('adminFinanceView').style.display = 'none';
    document.getElementById('teacherFinanceView').style.display = '';
    document.getElementById('addPaymentBtn')?.style.setProperty('display','none');

    bindPeriodNav();
    try { await render(); } catch (err) {
      console.error('Erro ao calcular payout:', err);
    }
  });

})();
