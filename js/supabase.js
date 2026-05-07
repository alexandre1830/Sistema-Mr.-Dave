/* ==========================================================================
   SUPABASE.JS — Inicialização do cliente Supabase
   ========================================================================== */

window.HT = window.HT || {};

/* --------------------------------------------------------------------------
   ⚙️  CONFIGURAÇÃO — substitua pelos valores do seu projeto Supabase
   Painel → Project Settings → API
   -------------------------------------------------------------------------- */
const SUPABASE_URL = 'https://oilaubdeododvmbeolwf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pbGF1YmRlb2RvZHZtYmVvbHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNDIzOTYsImV4cCI6MjA5MjkxODM5Nn0.MG7itiXmH15jerqufvsb_geyhgUI-mIiQyKhzkuVwwY';   // chave pública (anon/public)

HT.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession:    true,   // mantém sessão entre abas/reloads (localStorage)
    autoRefreshToken:  true,   // renova o JWT automaticamente
    detectSessionInUrl: true,  // suporte a magic-links e recuperação de senha
  },
});

/* Expostos para chamadas a Edge Functions etc. (a anon key já está no client). */
HT.supabaseUrl = SUPABASE_URL;
