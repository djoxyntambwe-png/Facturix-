(function () {
  'use strict';
  const CONFIG = { fonction: 'facturix-mentor', historique: 8, gardes: 20, questionMax: 500 };

  const $ = id => document.getElementById(id);
  const profil = () => FX.isPrest() ? 'prestataire' : 'commercant';
  const prompts = () => (window.FX_PROMPTS || {})[profil()] || {};
  let chat = [];
  const cle = () => 'facturix_chat_' + FX.user.id;

  function garder(t, me) { chat.push({ t, me }); localStorage.setItem(cle(), JSON.stringify(chat.slice(-CONFIG.gardes))); }

  function bulle(texte, moi) {
    const b = document.createElement('div');
    b.textContent = texte;
    b.style.cssText = 'white-space:pre-wrap;padding:10px 12px;border-radius:12px;max-width:88%;font-size:15px;line-height:1.45;' +
      (moi ? 'align-self:flex-end;background:#123b70;color:#fff' : 'align-self:flex-start;background:#f3f6fb;border:1px solid #dce3ed');
    $('chatBox').appendChild(b);
    $('chatBox').scrollTop = $('chatBox').scrollHeight;
    return b;
  }

  async function open() {
    const p = prompts();
    $('mentorLeft').textContent = FX.profile.plan === 'pro' ? 'PRO : 100 questions par mois.' : 'Plan gratuit : 3 questions par mois.';
    if (!$('chatBox').children.length) {
      chat = JSON.parse(localStorage.getItem(cle()) || '[]');
      if (chat.length) chat.forEach(m => bulle(m.t, m.me));
      else bulle(p.accueil || 'Bonjour ! Que veux-tu savoir sur ton activité ?', false);
    }
    $('chatChips').innerHTML = '';
    (p.questionsRapides || []).forEach(q => $('chatChips').appendChild(FX.mk(q, 'secondary', () => ask(q))));
    await FX.loadDashboard(); // met à jour les chiffres envoyés au mentor
  }

  async function ask(question) {
    const q = (question || '').trim().slice(0, CONFIG.questionMax);
    if (!q) return;
    $('mentorQ').value = '';
    bulle(q, true); garder(q, true);
    const attente = bulle('⏳ Le mentor réfléchit...', false);
    $('mentorBtn').disabled = true;
    const stats = { ...FX.stats(), periode_choisie: $('dashPeriod').selectedOptions[0].text, depenses_periode: $('dashExpCDF').textContent + ' · ' + $('dashExpUSD').textContent };
    const history = chat.slice(-(CONFIG.historique + 1), -1).map(m => ({ role: m.me ? 'user' : 'model', text: m.t }));
    const { data, error } = await FX.supabase.functions.invoke(CONFIG.fonction, {
      body: { question: q, profil: profil(), instructions: prompts().instructions || '', stats, history }
    });
    $('mentorBtn').disabled = false;
    if (error || !data?.answer) {
      let m = 'Le mentor est indisponible, réessaie dans un instant.';
      try {
        const j = await error.context.json();
        if (j.error === 'LIMIT') m = FX.profile.plan === 'pro' ? 'Limite du mois atteinte.' : '🔒 Limite gratuite atteinte (3 questions par mois). Passe PRO pour plus de conseils.';
        else if (j.detail) m += ' (' + String(j.detail).slice(0, 140) + ')';
      } catch (_) { /* pas de détail */ }
      attente.textContent = m; return;
    }
    attente.textContent = data.answer; garder(data.answer, false);
    if (typeof data.left === 'number') $('mentorLeft').textContent = `Il te reste ${data.left} question(s) ce mois-ci.`;
    $('chatBox').scrollTop = $('chatBox').scrollHeight;
  }

  function init() {
    $('mentorBtn').addEventListener('click', () => ask($('mentorQ').value));
    $('mentorQ').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ask($('mentorQ').value); } });
    $('chatReset').addEventListener('click', () => { localStorage.removeItem(cle()); chat = []; $('chatBox').innerHTML = ''; open(); });
    $('mentorOpen').addEventListener('click', () => FX.setPage('mentor'));
  }

  window.FX_IA = { init, open, ask, config: CONFIG };
})();
