/* ==========================================================================
   MODALS.JS — Abertura/fechamento de modais
   ========================================================================== */

window.HT = window.HT || {};

HT.modals = (() => {

  const openModals = new Set();

  function open(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('is-open');
    openModals.add(overlayId);
    document.body.style.overflow = 'hidden';

    // Focar no primeiro input ou botão
    setTimeout(() => {
      const focusable = overlay.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])');
      focusable?.focus();
    }, 250);
  }

  function close(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('is-open');
    openModals.delete(overlayId);
    if (openModals.size === 0) document.body.style.overflow = '';
  }

  function closeAll() {
    [...openModals].forEach(id => close(id));
  }

  function isOpen(overlayId) {
    return openModals.has(overlayId);
  }

  /* ---------- Fechar ao clicar fora ---------- */
  document.addEventListener('click', (e) => {
    if (!e.target.classList.contains('modal-overlay')) return;
    const overlay = e.target;
    if (overlay.id) close(overlay.id);
  });

  /* ---------- Fechar com Escape ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || openModals.size === 0) return;
    const last = [...openModals].pop();
    close(last);
  });

  /* ---------- Bind automático de botões .modal-close ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const overlay = btn.closest('.modal-overlay');
        if (overlay?.id) close(overlay.id);
      });
    });
  });

  return { open, close, closeAll, isOpen };
})();
