import { createClient } from 'https://jsdelivr.net'
window.addEventListener('error', e => {
    if (e.filename && /app\.js|core-ia|prompt-/.test(e.filename)) {
    }
});

(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const fmt = n => (Number(n) || 0).toLocaleString('fr');
    const setStatus = (id, msg, type) => { /* ... */ };
    const SUPABASE_URL = 'https://gravdcorborgssicqkso.supabase.co'; 
    const SUPABASE_ANON_KEY = 'sb_publishable_vIZcbN1B5TA-vUqiC8Af0g_8a3bl5CE';
    
    // Tu crées et exportes le client de manière modulaire
    const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window._supabase = _supabase; // Cette ligne permet de ne pas casser le reste de ton code qui utilise déjà "window._supabase" ou "_supabase"

    let currentUser = null;
    let WID = null, ROLE = 'owner', LOCKED = false;
    let companyData = null;
    let catalogItems = [];
    let isSignup = false;
function saveDraft() {
  const draft = {
    number: $('invNumber').value,
    clientName: $('clientName').value,
    clientPhone: $('clientPhone').value,
    clientEmail: $('clientEmail').value,
    rows: readRows()
  };
  localStorage.setItem('facturix_draft', JSON.stringify(draft));
}

// Déclenche la sauvegarde automatique dès qu'on tape dans les infos client
['invNumber', 'clientName', 'clientPhone', 'clientEmail'].forEach(id => {
  $(id).addEventListener('input', saveDraft);
});


const currency = () => companyData?.currency || 'CDF';
const locCur = () => { const c = currency(); return c !== 'USD' ? c : (profile.currency !== 'USD' ? profile.currency : 'CDF'); };
function applyCurrency() {
  document.querySelectorAll('.currSymbol').forEach(el => el.textContent = currency());
  document.querySelectorAll('.locCur').forEach(el => el.textContent = locCur());
  const sel = $('expCurrency'), keep = sel.value;
  sel.innerHTML = [locCur(), 'USD'].map(c => `<option value="${c}">${c}</option>`).join('');
  if (keep) sel.value = keep;
}

/* ---------- AUTH ---------- */
function setAuthMode(signup) {
  isSignup = signup;
  $('authNameField').hidden = !signup;
  $('authExtra').hidden = !signup;
  $('forgotBtn').hidden = signup;
  $('authTitle').textContent = signup ? 'Créer ton compte FACTURIX' : 'Bienvenue sur FACTURIX';
  $('authSubmit').textContent = signup ? 'Créer mon compte' : 'Se connecter';
  $('switchAuth').textContent = signup ? 'J\'ai déjà un compte' : 'Créer un compte';
  $('authPassword').autocomplete = signup ? 'new-password' : 'current-password';
  setStatus('authMessage', '');
}
$('switchAuth').addEventListener('click', () => setAuthMode(!isSignup));

async function checkSession() {
  try {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) { currentUser = session.user; await openApp(); }
  } catch (err) { setStatus('authMessage', 'Erreur de connexion : ' + err.message, 'err'); }
}

function showLock() { $('appView').hidden = true; $('splash').hidden = true; $('lockView').hidden = false; }
$('lockOut').addEventListener('click', () => $('logoutBtn').click());
async function openApp() {
  $('authView').hidden = true;
  $('welcome').textContent = 'Bonjour, ' + (currentUser.user_metadata?.full_name || currentUser.email);
  const ctx = JSON.parse(localStorage.getItem('facturix_ctx') || 'null'), cached = !!ctx && ctx.uid === currentUser.id;
  const fresh = async () => {
    await loadProfile(); await Promise.all([loadCompanyData(), loadCatalog()]);
    localStorage.setItem('facturix_ctx', JSON.stringify({ uid: currentUser.id, profile, WID, ROLE, companyData, catalogItems }));
  };
  if (cached) { ({ profile, WID, ROLE, companyData, catalogItems } = ctx); applyCurrency(); if (navigator.onLine) fresh().then(() => { if (LOCKED) { showLock(); return; } applyProfile(); refreshBadge(); }).catch(() => {}); }
  else { $('splash').hidden = false; await fresh(); }
  if (LOCKED) { showLock(); return; }
  applyProfile();
  $('splash').hidden = true; $('appView').hidden = false;
  if (ROLE === 'aide') setPage('missions');
  resetInvoice(); flushQueue(); loadSuggestions(); setupRealtime(); startMissionRT(); refreshBadge();
  if (ROLE === 'owner') _supabase.rpc('purge_old_vouchers'); // supprime les bons de plus de 6 mois
}

let realtimeStarted = false;
function setupRealtime() {
  if (realtimeStarted) return;
  realtimeStarted = true;

  _supabase
    .channel('invoices-updates')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'invoices', filter: `user_id=eq.${WID}` },
      () => {
        const activeNav = document.querySelector('.nav button.active');
        if (activeNav && activeNav.dataset.page === 'historique') loadHistory();
        if (activeNav && activeNav.dataset.page === 'dashboard') loadDashboard();
      }
    )
    .subscribe();

  // Canal pour les dépenses (Mise à jour de la liste des dépenses et du Dashboard)
  _supabase
    .channel('expenses-updates')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'expenses', filter: `user_id=eq.${WID}` },
      () => {
        const activeNav = document.querySelector('.nav button.active');
        if (activeNav && activeNav.dataset.page === 'depenses') loadExpenses();
        if (activeNav && activeNav.dataset.page === 'dashboard') loadDashboard();
      }
    )
    .subscribe();
}


$('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  const btn = $('authSubmit');
  btn.disabled = true;
  try {
    if (isSignup) {
      if ($('isTeam').checked && !$('authTeam').value.trim()) throw new Error('Écris le code équipe donné par ton patron.');
      setStatus('authMessage', 'Création du compte...');
      const { data, error } = await _supabase.auth.signUp({
        email, password, options: { data: { full_name: $('authName').value.trim(), country: $('isTeam').checked ? '' : $('authCountry').value, business_type: $('isTeam').checked ? 'equipe' : document.querySelector('input[name=bt]:checked').value, team_code: $('isTeam').checked ? $('authTeam').value.trim().toUpperCase() : '' } }
      });
      if (error) throw error;
      if (data.session) { currentUser = data.user; await openApp(); }
      else {
        setAuthMode(false);
        setStatus('authMessage', 'Compte créé ! Vérifie ta boîte e-mail pour confirmer, puis connecte-toi.', 'ok');
      }
    } else {
      setStatus('authMessage', 'Connexion en cours...');
      const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user;
      await openApp();
    }
  } catch (err) {
    setStatus('authMessage', err.message, 'err');
  } finally { btn.disabled = false; }
});

$('logoutBtn').addEventListener('click', async () => {
  const btn = $('logoutBtn');
  btn.disabled = true;
  btn.textContent = 'Déconnexion...';
  localStorage.removeItem('facturix_draft');
  try {
    // On n'attend pas plus de 3 secondes (réseau lent ou coupé)
    await Promise.race([
      _supabase.auth.signOut(),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);
  } catch (err) { console.error(err); }
  // Sécurité : on efface la session stockée sur cet appareil, quoi qu'il arrive
  Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k));
  location.reload();
});

/* ---------- ENTREPRISE ---------- */
const companyFields = { coName: 'name', coPhone: 'phone', coEmail: 'email', coAddress: 'address', coCity: 'city', coCurrency: 'currency', coMessage: 'message', coRate: 'exchange_rate', coMomo: 'momo', coColor: 'brand_color', coTax: 'tax_id', coRccm: 'rccm', coLogo: 'logo_url' };

async function loadCompanyData() {
  try {
    const { data, error } = await _supabase.from('companies').select('*').eq('id', WID).maybeSingle();
    if (error) throw error;
    if (data) {
      companyData = data;
      Object.entries(companyFields).forEach(([id, k]) => { 
        // Condition ajoutée pour ignorer le champ logo lors du chargement textuel
        if (id !== 'coLogo' && data[k] && $(id)) {
          $(id).value = data[k]; 
        }
      });
    }
  } catch (err) { setStatus('companyStatus', 'Erreur de chargement : ' + err.message, 'err'); }
  applyCurrency();
}

$('companyForm').addEventListener('submit', async e => {
  e.preventDefault();
  setStatus('companyStatus', 'Enregistrement...');
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    const payload = { id: WID };
    
    // Modification ici : on ignore 'coLogo' dans cette boucle de texte
    Object.entries(companyFields).forEach(([id, k]) => {
      if (id !== 'coLogo' && $(id)) {
        payload[k] = $(id).value.trim();
      }
    });
    if (profile.plan !== 'pro') payload.brand_color = payload.tax_id = payload.rccm = null; // PRO

    payload.exchange_rate = parseFloat($('coRate').value) || 2300;

    // Gestion du fichier image (Logo)
    const fileInput = $('logoUpload');
    if (fileInput && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      if (file.size > 2 * 1024 * 1024) throw new Error('Le logo est trop lourd (2 Mo maximum).');
      const fileExt = file.name.split('.').pop();
      // On crée un nom de fichier unique basé sur l'ID de l'utilisateur
      const filePath = `${WID}/logo_${Date.now()}.${fileExt}`;

      // 1. Envoi du fichier dans le bucket "logos" sur Supabase Storage
      const { error: uploadError } = await _supabase.storage
        .from('logos')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      // 2. Récupération de son URL publique d'accès
      const { data: urlData } = _supabase.storage.from('logos').getPublicUrl(filePath);
      payload.logo_url = urlData.publicUrl;
    } else if (companyData && companyData.logo_url) {
      // Si aucun nouveau fichier n'est choisi, on conserve l'ancien logo
      payload.logo_url = companyData.logo_url;
    }

    // 3. Sauvegarde ou mise à jour dans la table des entreprises
    const { error } = await _supabase.from('companies').upsert(payload);
    if (error) throw error;

    setStatus('companyStatus', 'Enregistré avec succès !', 'ok');
    await loadCompanyData();
    await loadCatalog();
  } catch (err) {
    setStatus('companyStatus', 'Erreur : ' + err.message, 'err');
  } finally {
    btn.disabled = false;
  }
});


/* ---------- CATALOGUE ---------- */
async function loadCatalog() {
  const { data, error } = await _supabase.from('catalog').select('*').eq('user_id', WID).order('name');
  if (error) { setStatus('productStatus', 'Erreur : ' + error.message, 'err'); }
  catalogItems = data || [];

  const select = $('catalogSelect');
  select.innerHTML = '';
  select.appendChild(new Option('-- Ajouter depuis le catalogue --', ''));
  catalogItems.forEach(item => select.appendChild(new Option(`${item.name} (${item.price} ${currency()})`, item.id)));
  renderChips();

  const list = $('catalogList');
  list.innerHTML = '';
  if (!catalogItems.length) { list.innerHTML = '<p class="note">Ton catalogue est vide.</p>'; return; }
  catalogItems.forEach(item => {
    const row = document.createElement('div');
    row.className = 'catalog-item';
    const info = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = item.name;
    const meta = document.createElement('div');
    meta.className = 'note';
    meta.textContent = `${fmt(item.price)} ${currency()} / ${item.unit || 'unité'}` + (item.description ? ' — ' + item.description : '') + (item.stock != null ? ' · Stock : ' + item.stock + (item.stock <= 3 ? ' ⚠️' : '') : '');
    meta.append(' ', mk('+ Achat', 'secondary', () => buyStock(item)));
    info.append(strong, meta);
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn danger'; del.textContent = 'Supprimer';
    del.addEventListener('click', async () => {
      if (!confirm('Supprimer « ' + item.name + ' » du catalogue ?')) return;
      const { error } = await _supabase.from('catalog').delete().eq('id', item.id);
      if (error) { setStatus('productStatus', 'Erreur : ' + error.message, 'err'); return; }
      loadCatalog();
    });
    row.append(info, del);
    list.appendChild(row);
  });
}

$('productForm').addEventListener('submit', async e => {
  e.preventDefault();
  setStatus('productStatus', 'Ajout...');
  const { error } = await _supabase.from('catalog').insert([{
    user_id: WID,
    name: $('prodName').value.trim(),
    price: parseFloat($('prodPrice').value),
    unit: $('prodUnit').value.trim() || 'unité',
    description: $('prodDesc').value.trim(),
    stock: $('prodStock').value === '' ? null : parseFloat($('prodStock').value)
  }]);
  if (error) { setStatus('productStatus', 'Erreur : ' + error.message, 'err'); return; }
  $('productForm').reset();
  $('prodUnit').value = 'unité';
  setStatus('productStatus', 'Article ajouté !', 'ok');
  loadCatalog();
});

/* ---------- FACTURE ---------- */
function docTitle() {
  if (profile.business_type === 'prestataire') $('docType').value = 'devis';
  const q = $('docType').value === 'devis';
  $('invTitle').textContent = q ? '🧾 Créer un devis' : '🧾 Créer une facture';
  $('saveInvoiceBtn').textContent = q ? 'Enregistrer le devis' : 'Enregistrer la facture';
  $('paidField').hidden = q;
  $('newInvoiceBtn').textContent = q ? 'Nouveau devis' : 'Nouvelle facture';
  $('quoteFields').hidden = !q;
  $('invNumLabel').textContent = q ? 'Numéro du devis *' : 'Numéro de facture *';
  $('tvaRate').value = VAT[profile.country] ?? 16;
  $('tvaRate').hidden = !$('tvaOn').checked;
  $('paidNow').checked = profile.business_type !== 'prestataire';
  const tvaAuto = profile.plan === 'pro' && profile.country === 'RDC' && !!companyData?.tax_id && !!companyData?.rccm; // RDC : TVA automatique et obligatoire
  $('tvaOn').checked = tvaAuto; $('tvaOn').disabled = tvaAuto; $('tvaRate').hidden = !tvaAuto;
}

async function generateInvoiceNumber() {
  docTitle();
  const year = new Date().getFullYear();
  const pre = (($('docType') && $('docType').value === 'devis') ? 'DEV' : 'FAC') + (ROLE === 'vendeur' ? '-V' + currentUser.id.slice(0, 3).toUpperCase() : '');
  const prefix = `${pre}-${year}-`;
  let next = 1;
  try {
    const { data, error } = await _supabase.from('invoices').select('number')
      .eq('user_id', WID).like('number', prefix + '%');
    if (error) throw error;
    (data || []).forEach(r => {
      const m = r.number.match(new RegExp('^' + pre + '-\\d{4}-(\\d+)$'));
      if (m) next = Math.max(next, parseInt(m[1], 10) + 1);
    });
    $('invNumber').value = prefix + String(next).padStart(4, '0');
  } catch (err) {
    // hors ligne : numéro provisoire, modifiable
    $('invNumber').value = prefix + Math.floor(1000 + Math.random() * 9000);
  }
}

// A Modifier dans loadDraft :
function loadDraft() {
  const saved = localStorage.getItem('facturix_draft');
  if (!saved) return false; // Renvoie false si vide
  try {
    const draft = JSON.parse(saved);
    $('invNumber').value = draft.number || '';
    $('clientName').value = draft.clientName || '';
    $('clientPhone').value = draft.clientPhone || '';
    $('clientEmail').value = draft.clientEmail || '';
    
    if (draft.rows && draft.rows.length > 0) {
      $('invoiceItemsTable').innerHTML = ''; 
      draft.rows.forEach(row => {
        addInvoiceRow(row.description, row.unit_price, row.quantity);
      });
      return true; // Brouillon chargé avec succès !
    }
  } catch (e) {
    console.error("Erreur lors du chargement du brouillon", e);
  }
  return false;
}

// À Modifier dans resetInvoice :
async function resetInvoice() {
  $('invoiceForm').reset();
  $('invoiceItemsTable').innerHTML = '';
  $('printArea').hidden = true;
  $('printInvoiceBtn').hidden = true;
  $('newInvoiceBtn').hidden = true;
  setStatus('invoiceStatus', '');
  await generateInvoiceNumber();
  
  const hasDraft = loadDraft(); // On tente de charger d'abord
  if (!hasDraft) {
    addInvoiceRow(); // On ne met la ligne vide que s'il n'y a PAS de brouillon !
  }
  calculateTotal();
}


function addInvoiceRow(desc = '', price = 0, qte = 1, kind = '') {
  const tbody = $('invoiceItemsTable');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="row-desc" placeholder="Description" required></td>
    <td><input class="row-qty" type="number" min="0.01" step="any" inputmode="decimal"></td>
    <td><input class="row-price" type="number" step="0.01" min="0" inputmode="decimal"></td>
    <td><strong class="row-total">0,00</strong></td>
    <td><button class="btn danger" type="button" style="padding:4px 8px">X</button></td>`;
  const d = tr.querySelector('.row-desc');
  d.value = desc; d.setAttribute('list', 'lineSuggest');
  tr.dataset.kind = kind;
  if (kind) { tr.firstElementChild.style.borderLeft = '5px solid ' + (kind === 'main_oeuvre' ? '#16865b' : '#d4a017'); d.placeholder = kind === 'main_oeuvre' ? "Ex. Installation, pose, réparation (main-d'œuvre)" : 'Ex. Câbles, peinture, pièces (fournitures)'; }
  if (kind === 'main_oeuvre') { const qi = tr.querySelector('.row-qty'); qi.hidden = true; tr.querySelector('.row-price').placeholder = 'Montant'; }
  d.addEventListener('change', () => { const sg = lineSugg[d.value], p = tr.querySelector('.row-price'); if (sg && !parseFloat(p.value)) { p.value = sg.price; calculateTotal(); } });
  tr.querySelector('.row-qty').value = qte;
  tr.querySelector('.row-price').value = price;

  // ✅ NOUVELLES LIGNES AVEC SAUVEGARDE DU BROUILLON :
  tr.querySelector('.btn').addEventListener('click', () => { tr.remove(); calculateTotal(); saveDraft(); });
  tr.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => { calculateTotal(); saveDraft(); }));

  tbody.appendChild(tr);
  calculateTotal();
}


$('addCustomBtn').addEventListener('click', () => addInvoiceRow());
$('addCatalogBtn').addEventListener('click', () => {
  const id = $('catalogSelect').value;
  const item = catalogItems.find(c => String(c.id) === id);
  if (item) { addInvoiceRow(item.name, item.price, 1); $('invoiceItemsTable').lastElementChild.dataset.cid = item.id; }
});

function readRows() {
  return [...document.querySelectorAll('#invoiceItemsTable tr')].map(tr => {
    const quantity = parseFloat(tr.querySelector('.row-qty').value) || 0;
    const unit_price = parseFloat(tr.querySelector('.row-price').value) || 0;
    return {
      description: tr.querySelector('.row-desc').value.trim(),
      kind: tr.dataset.kind || null,
      quantity, unit_price,
      total_price: Math.round(quantity * unit_price * 100) / 100
    };
  });
}

function calculateTotal() {
  const trs = document.querySelectorAll('#invoiceItemsTable tr');
  const rows = readRows();
  let grand = 0;
  rows.forEach((r, i) => { trs[i].querySelector('.row-total').textContent = fmt(r.total_price); grand += r.total_price; });
  const tv = tvaOf(taxableSum(rows));
  $('invoiceGrandTotal').textContent = fmt(grand + tv);
  $('tvaInfo').textContent = tv ? `Sous-total HT : ${fmt(grand)} · TVA ${tvaRate()} % : ${fmt(tv)}` : '';
  const sum = k => rows.filter(r => r.kind === k).reduce((a, r) => a + r.total_price, 0), lab = sum('main_oeuvre'), mat = sum('fourniture');
  $('kindTotals').textContent = (lab || mat) ? `Main-d'œuvre : ${fmt(lab)} · Fournitures : ${fmt(mat)}` : '';
  return grand;
}

$('invoiceForm').addEventListener('submit', async e => {
  e.preventDefault();
  const rows = readRows().filter(r => r.description);
  if (!rows.length) { setStatus('invoiceStatus', 'Ajoute au moins un article.', 'err'); return; }
  if (rows.some(r => r.quantity <= 0)) { setStatus('invoiceStatus', 'Chaque quantité doit être supérieure à 0.', 'err'); return; }

  const ht = Math.round(rows.reduce((s, r) => s + r.total_price, 0) * 100) / 100, total_amount = Math.round((ht + tvaOf(taxableSum(rows))) * 100) / 100;
  const btn = $('saveInvoiceBtn');
  btn.disabled = true;
  if (!navigator.onLine) { // hors-ligne : on garde sur le téléphone
    const p = { inv: { user_id: WID, number: $('invNumber').value.trim(), client_name: $('clientName').value.trim(), client_phone: $('clientPhone').value.trim(), client_email: $('clientEmail').value.trim(), total_amount, currency: currency(), doc_type: $('docType').value, status: statusNow(), ...quoteExtra() }, items: rows };
    localStorage.setItem('facturix_queue', JSON.stringify([...JSON.parse(localStorage.getItem('facturix_queue') || '[]'), p]));
    preparePrintArea({ ...p.inv, created_at: new Date().toISOString() }, rows);
    $('printInvoiceBtn').hidden = false; btn.disabled = false;
    setStatus('invoiceStatus', '📴 Hors-ligne : enregistré sur ton téléphone, envoi automatique au retour du réseau.', 'ok');
    return;
  }
  const lim = await checkLimit($('docType').value);
  if (lim) { setStatus('invoiceStatus', lim, 'err'); btn.disabled = false; return; }
  setStatus('invoiceStatus', 'Enregistrement...');

  try {
    const { data: inv, error } = await _supabase.from('invoices').insert([{
      user_id: WID,
      number: $('invNumber').value.trim(),
      client_name: $('clientName').value.trim(),
      client_phone: $('clientPhone').value.trim(),
      client_email: $('clientEmail').value.trim(),
      total_amount,
      currency: currency(),
      doc_type: $('docType').value,
      status: statusNow(),
      ...quoteExtra()
    }]).select().single();
    if (error) throw error;

    const items = rows.map(r => ({ invoice_id: inv.id, ...r }));
    const { error: itemsError } = await _supabase.from('invoice_items').insert(items);
    if (itemsError) {
      await _supabase.from('invoices').delete().eq('id', inv.id); // évite une facture vide
      throw itemsError;
    }

    if ($('docType').value === 'facture') await decStock();
    showUsage();
    setStatus('invoiceStatus', ($('docType').value === 'devis' ? 'Devis enregistré' : 'Facture enregistrée') + ' ! Tu peux l\'imprimer ou l\'envoyer par WhatsApp depuis « ' + (isPrest() ? 'Mes devis' : 'Mes factures') + ' ».', 'ok');
    localStorage.removeItem('facturix_draft'); // Nettoie le brouillon local
    preparePrintArea(inv, items);
    $('printInvoiceBtn').hidden = false;
    $('newInvoiceBtn').hidden = false;
  } catch (err) {
    const dup = /duplicate|unique/i.test(err.message) ? ' (ce numéro existe déjà, change-le)' : '';
    setStatus('invoiceStatus', 'Erreur : ' + err.message + dup, 'err');
  } finally { btn.disabled = false; }
});

function preparePrintArea(inv, items) {
  // A. Gestion de l'affichage dynamique du logo de l'entreprise
  const logoImg = $('pCoLogo');
  if (companyData && companyData.logo_url) {
    logoImg.src = companyData.logo_url;
    logoImg.style.display = 'block';
  } else {
    logoImg.style.display = 'none';
  }

  // B. Gestion du Taux de change alternatif en bas de facture
  const cur = inv.currency || currency();
  const rate = Number(companyData?.exchange_rate) || 2300;
  
  // Si la facture originale est en USD, on convertit en CDF. Si elle est en CDF, on convertit en USD.
  const altTotal = cur === 'USD' ? (inv.total_amount * rate) : (inv.total_amount / rate);
  const loc = (profile.currency && profile.currency !== 'USD') ? profile.currency : 'CDF';
  const altCurr = cur === 'USD' ? loc : 'USD';
  
  const altTotalEl = $('pAlternativeTotal');
  if (altTotalEl) {
    altTotalEl.textContent = `Soit environ : ${fmt(altTotal)} ${altCurr} (Taux : 1 USD = ${fmt(rate)} ${loc})`;
  }

  // C. Remplissage des coordonnées de l'entreprise et du client
  $('pCoName').textContent = companyData?.name || 'Mon Entreprise';
  $('pCoDetails').textContent = [companyData?.address, companyData?.city].filter(Boolean).join(', ') +
    (companyData?.phone ? ' | Tél: ' + companyData.phone : '') +
    (companyData?.email ? ' | ' + companyData.email : '');
  $('pInvNumber').textContent = inv.number;
  $('pDocTitle').textContent = inv.doc_type === 'devis' ? 'DEVIS (PROFORMA)' : 'FACTURE';
  $('pDocTitle').style.color = $('pCoName').style.color = companyData?.brand_color || '';
  $('pInvDate').textContent = 'Date : ' + new Date(inv.created_at || Date.now()).toLocaleDateString('fr-FR');
  $('pClientName').textContent = inv.client_name;
  $('pClientDetails').textContent = 'Tél: ' + (inv.client_phone || '-') + ' | E-mail: ' + (inv.client_email || '-');

  // D. Remplissage du tableau des articles de la facture
  const tbody = $('pItemsTable');
  tbody.innerHTML = '';
  items.forEach(it => {
    const tr = document.createElement('tr');
    [it.description, it.quantity, fmt(it.unit_price), fmt(it.total_price)].forEach(v => {
      const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // E. Affichage du montant total final
  $('pGrandTotal').textContent = fmt(inv.total_amount);
  const sumK = k => items.filter(i => i.kind === k).reduce((a, i) => a + Number(i.total_price || 0), 0), lab = sumK('main_oeuvre'), mat = sumK('fourniture'), ex = [];
  if (Number(inv.tva_rate) > 0) ex.push(`Sous-total HT : ${fmt(inv.total_amount - inv.tva_amount)} ${cur}  ·  TVA ${inv.tva_rate} % (articles) : ${fmt(inv.tva_amount)} ${cur}  ·  Total TTC ci-dessus`);
  if (Number(inv.labor_discount) > 0) ex.push(`Remise négociée sur la main-d'œuvre : −${fmt(inv.labor_discount)} ${cur}`);
  if (lab || mat) ex.push(`Main-d'œuvre : ${fmt(lab)} ${cur}  ·  Fournitures${inv.doc_type === 'devis' ? ' (estimation)' : ''} : ${fmt(mat)} ${cur}`);
  if (inv.doc_type === 'devis') {
    if (inv.deposit_pct || Number(inv.supplies_amount) > 0) ex.push(`À payer à l'approbation : ${fmt(depositOf(inv))} ${cur}` + (Number(inv.labor_amount) > 0 ? ` (fournitures en totalité + ${inv.deposit_pct || 0} % de la main-d'œuvre)` : ''));
    if (inv.valid_days) ex.push(`Devis valable ${inv.valid_days} jours.`);
  }
  if (inv.note) ex.push(inv.note);
  if (inv.doc_type !== 'devis' && Number(inv.paid_amount) > 0 && inv.status !== 'payée') ex.push(`Déjà payé : ${fmt(inv.paid_amount)} ${cur}  ·  Reste à payer : ${fmt(inv.total_amount - inv.paid_amount)} ${cur}`);
  if (companyData?.tax_id) ex.push('NIF : ' + companyData.tax_id + (companyData.rccm ? '  ·  RCCM : ' + companyData.rccm : ''));
  $('pExtra').textContent = ex.join('\n');
  document.querySelectorAll('.pCurr').forEach(el => el.textContent = cur);
  $('pCoMessage').textContent = (companyData?.message || 'Merci pour votre confiance !') + (companyData?.momo ? '  ·  Mobile Money : ' + companyData.momo : '');
  $('printArea').hidden = false;
}

$('printInvoiceBtn').addEventListener('click', () => window.print());
$('newInvoiceBtn').addEventListener('click', () => { localStorage.removeItem('facturix_draft'); resetInvoice(); });

/* ---------- HISTORIQUE ---------- */
async function loadHistory() {
  const box = $('historyList');
  box.innerHTML = '<p class="note">Chargement de ton historique...</p>';
  const { data, error } = await _supabase.from('invoices').select('*').eq('user_id', WID).order('created_at', { ascending: false });
  if (error) { box.innerHTML = ''; const p = document.createElement('p'); p.className = 'status err'; p.textContent = 'Erreur : ' + error.message; box.appendChild(p); return; }
  if (!data.length) { box.innerHTML = '<p class="note">Aucune facture pour le moment.</p>'; return; }
  box.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'catalog-list';
  data.filter(histMatch).forEach(inv => {
    const row = document.createElement('div');
    row.className = 'catalog-item';
    const info = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = inv.number + ' — ' + inv.client_name;
    const meta = document.createElement('div');
    meta.className = 'note';
    const late = inv.doc_type !== 'devis' && inv.status !== 'payée' ? Math.floor((Date.now() - new Date(inv.created_at)) / 86400000) : 0;
    const exp = inv.doc_type === 'devis' && inv.valid_days && ['brouillon', 'envoyé', 'negociation'].includes(inv.status) && (Date.now() - new Date(inv.created_at)) / 86400000 > inv.valid_days;
    meta.textContent = (exp ? '⌛ expiré · ' : '') + (late >= 7 ? '⏰ ' + late + ' j · ' : '') + (inv.doc_type === 'devis' ? 'Devis' : 'Facture') + ' · ' + (inv.status === 'negociation' ? '💬 négociation' : isPrest() && inv.status === 'approuvé' ? 'en cours' : (inv.status || '')) + (inv.status === 'partielle' ? ' (reste ' + fmt(inv.total_amount - (inv.paid_amount || 0)) + ')' : '') + ' · ' + new Date(inv.created_at).toLocaleDateString('fr-FR') + ' · ' + fmt(inv.total_amount) + ' ' + (inv.currency || 'CDF');
    info.append(strong, meta);
    const view = document.createElement('button');
    view.type = 'button'; view.className = 'btn secondary'; view.textContent = 'Voir / Imprimer';
    view.addEventListener('click', () => openInvoice(inv));
    const acts = document.createElement('div');
    acts.className = 'actions';
    acts.append(view, mk('WhatsApp', 'success', () => sendWhatsApp(inv, false)), mk('Dupliquer', 'secondary', () => duplicateDoc(inv)), mk('Copier le lien', 'secondary', () => { if (navigator.clipboard) navigator.clipboard.writeText(location.origin + location.pathname + '?d=' + inv.public_token); alert('Lien copié !'); }));
    const open = inv.status !== 'approuvé' && inv.status !== 'payée';
    if (inv.doc_type === 'devis' && inv.status === 'approuvé') acts.append(mk("Main-d'œuvre reçue", 'primary', () => recordLabor(inv)), mk('Confier à une aide', 'secondary', () => missionFromDevis(inv)));
    if (inv.doc_type === 'devis' && inv.status === 'negociation') acts.append(mk('💬 Négociation', 'primary', () => openNego(inv)));
    if (inv.client_phone) acts.append(mk('📞 Appeler', 'secondary', () => { location.href = 'tel:' + inv.client_phone.replace(/\s/g, ''); }));
    if (inv.doc_type === 'devis' && open && inv.status !== 'negociation') acts.append(mk('Approuver', 'primary', () => approveQuote(inv)));
    if (open) acts.append(mk('Rappel', 'secondary', () => { if (needPro('Les relances WhatsApp')) sendWhatsApp(inv, true); }));
    if (inv.doc_type !== 'devis' && open) acts.append(mk('Paiement', 'primary', () => recordPayment(inv)));
    if (inv.doc_type !== 'devis' && open) acts.append(mk('Payée', 'secondary', async () => { await _supabase.from('invoices').update({ status: 'payée' }).eq('id', inv.id); loadHistory(); }));
    row.append(info, acts);
    list.appendChild(row);
  });
  box.appendChild(list);
}

async function openInvoice(inv) {
  const { data: items, error } = await _supabase.from('invoice_items').select('*').eq('invoice_id', inv.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  setPage('facture');
  preparePrintArea(inv, items || []);
  $('printInvoiceBtn').hidden = false;
  $('newInvoiceBtn').hidden = false;
  $('printArea').scrollIntoView({ behavior: 'smooth' });
}

function periodStart() {
  const p = $('dashPeriod').value, now = new Date();
  if (p === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === 'year') return new Date(now.getFullYear(), 0, 1);
  return null; // depuis le début
}

async function loadDashboard() {
  const cdfEl = $('dashTotalCDF');
  const usdEl = $('dashTotalUSD');
  const countEl = $('dashCount');
  
  if (countEl) countEl.textContent = "Calcul en cours...";

  try {
    // Récupère le montant et la devise de toutes les factures de l'utilisateur connecté
    let q = _supabase.from('invoices').select('total_amount, currency, status, client_name, paid_amount, labor_amount, supplies_amount, own_supplies').eq('user_id', WID).eq('doc_type', isPrest() ? 'devis' : 'facture');
    if (isPrest()) q = q.in('status', ['approuvé', 'terminé']);
    const start = periodStart();
    if (start) q = q.gte('created_at', start.toISOString());
    const { data, error } = await q;

    if (error) throw error;

    let totalCDF = 0;
    let totalUSD = 0;

    if (data) {
      data.forEach(inv => {
        if (inv.currency === 'USD') {
          totalUSD += revOf(inv);
        } else {
          totalCDF += revOf(inv);
        }
      });
    }

    if (cdfEl) cdfEl.textContent = fmt(totalCDF) + ' ' + locCur();
    if (usdEl) usdEl.textContent = fmt(totalUSD) + ' USD';
    if (countEl) countEl.textContent = `${data ? data.length : 0} ${isPrest() ? 'mission(s)' : 'facture(s)'} sur la période.`;
    await loadDashboardExpenses(totalCDF, totalUSD);
    showCash(isPrest() ? (data || []).map(r => ({ ...r, total_amount: countedOf(r) })) : data);
    await loadAdvanced();

  } catch (err) {
    if (countEl) countEl.textContent = "Erreur de chargement : " + err.message;
  }
}


/* ---------- DÉPENSES ---------- */
const todayStr = () => new Date().toLocaleDateString('en-CA'); // AAAA-MM-JJ
const expenseHint = msg => /expenses|relation|schema cache/i.test(msg) ? ' (crée d\'abord la table « expenses » dans Supabase)' : '';

async function loadExpenses() {
  if (!$('expDate').value) $('expDate').value = todayStr();
  const list = $('expenseList');
  list.innerHTML = '<p class="note">Chargement...</p>';
  const { data, error } = await _supabase.from('expenses').select('*').eq('user_id', WID)
    .order('expense_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) { list.innerHTML = ''; setStatus('expenseStatus', 'Erreur : ' + error.message + expenseHint(error.message), 'err'); return; }

  const totals = { CDF: 0, USD: 0 };
  (data || []).forEach(x => { totals[x.currency === 'USD' ? 'USD' : 'CDF'] += Number(x.amount) || 0; });
  $('expenseTotals').textContent = 'Total des dépenses : ' + fmt(totals.CDF) + ' ' + locCur() + ' · ' + fmt(totals.USD) + ' USD';

  list.innerHTML = '';
  if (!data.length) { list.innerHTML = '<p class="note">Aucune dépense enregistrée.</p>'; return; }
  data.forEach(x => {
    const row = document.createElement('div');
    row.className = 'catalog-item';
    const info = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = x.description;
    const meta = document.createElement('div');
    meta.className = 'note';
    meta.textContent = new Date(x.expense_date + 'T00:00:00').toLocaleDateString('fr-FR') + ' · ' + (x.category || 'Autre') + ' · ' + fmt(x.amount) + ' ' + (x.currency || 'CDF');
    info.append(strong, meta);
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn danger'; del.textContent = 'Supprimer';
    del.addEventListener('click', async () => {
      if (!confirm('Supprimer cette dépense ?')) return;
      const { error } = await _supabase.from('expenses').delete().eq('id', x.id);
      if (error) { setStatus('expenseStatus', 'Erreur : ' + error.message, 'err'); return; }
      loadExpenses();
    });
    row.append(info, del);
    list.appendChild(row);
  });
}

$('expenseForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  setStatus('expenseStatus', 'Ajout...');
  const { error } = await _supabase.from('expenses').insert([{
    user_id: WID,
    description: $('expDesc').value.trim(),
    category: $('expCategory').value,
    amount: parseFloat($('expAmount').value),
    currency: $('expCurrency').value,
    expense_date: $('expDate').value
  }]);
  btn.disabled = false;
  if (error) { setStatus('expenseStatus', 'Erreur : ' + error.message + expenseHint(error.message), 'err'); return; }
  $('expDesc').value = ''; $('expAmount').value = '';
  setStatus('expenseStatus', 'Dépense ajoutée !', 'ok');
  loadExpenses();
});

async function loadDashboardExpenses(salesCDF, salesUSD) {
  let expCDF = 0, expUSD = 0;
  try {
    let q = _supabase.from('expenses').select('amount, currency').eq('user_id', WID);
    const start = periodStart();
    if (start) q = q.gte('expense_date', start.toLocaleDateString('en-CA'));
    const { data, error } = await q;
    if (error) throw error;
    (data || []).forEach(x => { if (x.currency === 'USD') expUSD += Number(x.amount) || 0; else expCDF += Number(x.amount) || 0; });
  } catch (err) { /* table absente : on affiche 0 */ }
  $('dashExpCDF').textContent = fmt(expCDF) + ' ' + locCur();
  $('dashExpUSD').textContent = fmt(expUSD) + ' USD';
  const setProfit = (id, val, cur) => {
    const el = $(id);
    el.textContent = fmt(val) + ' ' + cur;
    el.style.color = val < 0 ? 'var(--red)' : 'var(--green)';
  };
  setProfit('dashProfitCDF', salesCDF - expCDF, locCur());
  setProfit('dashProfitUSD', salesUSD - expUSD, 'USD');
}

/* ---------- PROFIL, PLANS, WHATSAPP ---------- */
const COUNTRIES = { 'RDC':'CDF','Congo-Brazzaville':'XAF','Cameroun':'XAF','Gabon':'XAF','Sénégal':'XOF',"Côte d'Ivoire":'XOF','Mali':'XOF','Bénin':'XOF','Nigeria':'NGN','Ghana':'GHS','Kenya':'KES','Tanzanie':'TZS','Ouganda':'UGX','Rwanda':'RWF','Afrique du Sud':'ZAR','Maroc':'MAD','Égypte':'EGP','Autre pays':'USD' };
const LIMITS = { facture: 10, devis: 5 }; // plan gratuit, par mois
const ADMIN_WA = '243977790082'; // WhatsApp pour les abonnements PRO
const PAY = [['M-Pesa', '0811116506'], ['Airtel Money', '0977790082'], ['Orange Money', '0851405180']]; // numéros de paiement PRO
let profile = { business_type: 'commercant', plan: 'free', currency: 'CDF', country: 'RDC' };
Object.keys(COUNTRIES).forEach(c => $('authCountry').appendChild(new Option(c, c)));
$('coCurrency').innerHTML = [...new Set(['USD', ...Object.values(COUNTRIES)])].map(c => `<option value="${c}">${c}</option>`).join('');

async function loadProfile0() {
  const md = currentUser.user_metadata || {};
  const get = () => _supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
  let { data } = await get();
  // Le type choisi à l'inscription fait foi : si la base n'est pas d'accord, elle se resynchronise
  if (!data || (md.business_type && md.business_type !== data.business_type)) {
    await _supabase.rpc('sync_my_profile');
    data = (await get()).data || data;
  }
  if (data) { profile = { ...profile, ...data }; return; }
  // Secours (SQL pas encore lancé) : valeurs de l'inscription, sans rien enregistrer
  const c = COUNTRIES[md.country] ? md.country : 'RDC';
  profile = { ...profile, business_type: md.business_type || 'commercant', country: c, currency: COUNTRIES[c], plan: 'free' };
}

function applyProfile() {
  if (!companyData || !companyData.currency) { companyData = { ...(companyData || {}), currency: profile.currency }; $('coCurrency').value = profile.currency; applyCurrency(); }
  const until = profile.plan_until ? new Date(profile.plan_until) : null;
  if (profile.plan === 'pro' && until && until < new Date()) profile.plan = 'free'; // PRO terminé
  const pro = profile.plan === 'pro', prest = profile.business_type === 'prestataire';
  const days = pro && until ? Math.ceil((until - new Date()) / 86400000) : null;
  $('docTypeField').hidden = true;
  ['catalogSelect', 'addCatalogBtn', 'addCustomBtn'].forEach(i => $(i).hidden = prest);
  $('addLaborBtn').hidden = $('addMaterialBtn').hidden = !prest;
  $('coColor').disabled = $('coTax').disabled = $('coRccm').disabled = !pro;
  $('catSearch').hidden = prest;
  showUsage();
  document.querySelector('.nav button').textContent = prest ? 'Nouveau devis' : 'Nouvelle facture';
  document.querySelector('.nav button[data-page="historique"]').textContent = prest ? 'Mes devis' : 'Mes factures';
  document.querySelectorAll('.salesLbl').forEach(e => e.textContent = prest ? "Main-d'œuvre reçue" : 'Total Ventes');
  $('cashTitle').textContent = prest ? "💰 Main-d'œuvre : reçu / à recevoir" : '💰 Encaissé / À encaisser';
  if (prest) $('histFilter').innerHTML = '<option value="">Tout</option><option value="attente">En attente de réponse</option><option value="cours">En cours</option><option value="fini">Terminés</option>';
  $('inviteRole').innerHTML = prest ? '<option value="aide">Aide / personnel</option>' : '<option value="vendeur">Vendeur</option><option value="associe">Associé</option>';
  $('teamHelp').textContent = prest ? "Crée un code pour une aide (personnel). Elle crée son compte avec ce code, puis ne voit que ses propres devis : jamais tes revenus ni tes dépenses." : $('teamHelp').textContent;
  $('proListCom').hidden = prest; $('proListPrest').hidden = !prest;
  $('planBar').textContent = pro ? ('Plan PRO ✅' + (until ? ` · jusqu'au ${until.toLocaleDateString('fr-FR')}` : '') + (days !== null && days <= 5 ? ` ⚠️ fin dans ${days} jour(s)` : '')) : (prest ? `Plan Gratuit · ${LIMITS.devis} devis par mois` : `Plan Gratuit · ${LIMITS.facture} factures par mois`);
  if (ROLE !== 'owner') $('planBar').textContent = `👥 ${ROLE === 'vendeur' ? 'Vendeur' : ROLE === 'aide' ? 'Aide' : 'Associé'} · ${companyData?.name || 'ton entreprise'}`;
  $('proBtn').hidden = ROLE !== 'owner' || (pro && !(days !== null && days <= 7));
  $('proBtn').textContent = pro ? '🔄 Renouveler' : '⭐ Passer PRO';
  const hide = ROLE === 'aide' ? ['facture', 'historique', 'entreprise', 'catalogue', 'depenses', 'dashboard', 'equipe', 'mentor', 'pro'] : ROLE === 'vendeur' ? ['entreprise', 'catalogue', 'depenses', 'dashboard', 'equipe', 'mentor'] : ROLE === 'associe' ? ['equipe'] : [];
  document.querySelectorAll('.nav button').forEach(b => b.hidden = hide.includes(b.dataset.page) || (prest && b.dataset.page === 'catalogue'));
}

function needPro(what) {
  if (profile.plan === 'pro') return true;
  alert(what + ' : fonction du plan PRO. Appuie sur « Passer PRO » en haut.');
  return false;
}

async function checkLimit(type) {
  if (profile.plan === 'pro') return '';
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  const { count } = await _supabase.from('invoices').select('id', { count: 'exact', head: true })
    .eq('user_id', WID).eq('doc_type', type).gte('created_at', start);
  return (count || 0) >= LIMITS[type] ? `Limite du plan gratuit atteinte (${LIMITS[type]} ${type === 'devis' ? 'devis' : 'factures'} par mois). Passe PRO pour continuer.` : '';
}

const mk = (txt, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = txt; b.addEventListener('click', fn); return b; };

function sendWhatsApp(inv, reminder, mode) {
  const link = location.origin + location.pathname + '?d=' + inv.public_token;
  const isQ = inv.doc_type === 'devis', nom = isQ ? 'devis' : 'facture', pro = profile.plan === 'pro';
  const co = companyData?.name || 'notre entreprise', momo = companyData?.momo, cur = inv.currency || currency();
  const tot = Number(inv.total_amount) || 0, paid = Number(inv.paid_amount) || 0, due = tot - paid;
  const hello = pro && inv.client_name ? `Bonjour ${inv.client_name},` : 'Bonjour,';
  const pay = pro && momo ? `\nPaiement Mobile Money : ${momo} (${co})` : '';
  let txt;
  if (mode === 'recu') txt = `${hello}\nNous confirmons la réception de ${fmt(paid)} ${cur} pour la ${nom} n°${inv.number}. ` + (due > 0 ? `Reste à payer : ${fmt(due)} ${cur}.${pay}` : 'Elle est entièrement réglée. Merci pour votre confiance !') + `\n${link}`;
  else if (reminder) txt = `${hello}\nRappel : votre ${nom} n°${inv.number} est en attente` + (!isQ && paid > 0 ? ` (reste ${fmt(due)} ${cur})` : '') + `. Merci de régulariser.${pay}\n${link}`;
  else if (isQ) txt = `${hello}\nVoici votre devis n°${inv.number} de la part de ${co} : ${fmt(tot)} ${cur}.` + (pro && inv.deposit_pct ? `\nPour démarrer : ${fmt(depositOf(inv))} ${cur} à l'approbation (fournitures en totalité + ${inv.deposit_pct || 0} % de la main-d'œuvre).` : '') + `${pay}\nAccepte-le ou propose ton prix ici : ${link}`;
  else txt = `${hello}\nVoici votre facture n°${inv.number} de la part de ${co} : ${fmt(tot)} ${cur}.${pay}\nConsultez-la ici : ${link}`;
  const ph = (inv.client_phone || '').trim();
  const to = waNumber(ph);
  window.open(`https://wa.me/${to}?text=${encodeURIComponent(txt)}`, '_blank');
  if (isQ && inv.status === 'brouillon') _supabase.from('invoices').update({ status: 'envoyé' }).eq('id', inv.id).then(loadHistory);
}

async function recordPayment(inv) {
  if (!needPro('Le suivi des acomptes et paiements')) return;
  const due = inv.total_amount - (inv.paid_amount || 0);
  const a = parseFloat(prompt(`Montant reçu (reste à payer : ${fmt(due)} ${inv.currency}) :`));
  if (!(a > 0)) return;
  const paid = Math.min(inv.total_amount, (Number(inv.paid_amount) || 0) + a), status = paid >= inv.total_amount ? 'payée' : 'partielle';
  const { error } = await _supabase.from('invoices').update({ paid_amount: paid, status }).eq('id', inv.id);
  if (error) { alert('Erreur : ' + error.message); return; }
  if (confirm('Paiement enregistré. Envoyer un reçu au client sur WhatsApp ?')) sendWhatsApp({ ...inv, paid_amount: paid, status }, false, 'recu');
  loadHistory();
}

async function approveQuote(inv) {
  if (isPrest()) {
    const { error } = await _supabase.from('invoices').update({ status: 'approuvé' }).eq('id', inv.id);
    alert(error ? 'Erreur : ' + error.message : 'Devis approuvé : la mission est en cours.' + (inv.deposit_pct ? ` Acompte attendu : ${fmt(depositOf(inv))} ${inv.currency}.` : ''));
    loadHistory(); return;
  }
  if (!needPro('La conversion automatique en facture')) return;
  const { error } = await _supabase.rpc('convert_quote', { p_id: inv.id });
  alert(error ? 'Erreur : ' + error.message : 'Devis approuvé : la facture a été créée automatiquement !' + (inv.deposit_pct ? ` Acompte attendu : ${fmt(depositOf(inv))} ${inv.currency}.` : ''));
  loadHistory();
}

$('docType').addEventListener('change', generateInvoiceNumber);
$('proBtn').addEventListener('click', () => setPage('pro'));
$('forgotBtn').addEventListener('click', async () => {
  const email = $('authEmail').value.trim();
  if (!email) { setStatus('authMessage', 'Écris d\'abord ton e-mail ci-dessus.', 'err'); return; }
  const { error } = await _supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  setStatus('authMessage', error ? error.message : 'Un lien de réinitialisation t\'a été envoyé par e-mail.', error ? 'err' : 'ok');
});
let recovering = /type=recovery/.test(location.hash + location.search);
function showReset() { recovering = true; $('authView').hidden = true; $('appView').hidden = true; $('resetView').hidden = false; }
_supabase.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') showReset(); });
$('resetForm').addEventListener('submit', async e => {
  e.preventDefault();
  if ($('newPw').value !== $('newPw2').value) { setStatus('resetMsg', 'Les deux mots de passe sont différents.', 'err'); return; }
  setStatus('resetMsg', 'Enregistrement...');
  const { error } = await _supabase.auth.updateUser({ password: $('newPw').value });
  if (error) { setStatus('resetMsg', /session/i.test(error.message) ? 'Lien expiré : redemande « Mot de passe oublié ».' : error.message, 'err'); return; }
  setStatus('resetMsg', 'Mot de passe changé ! Retour à la connexion...', 'ok');
  await _supabase.auth.signOut();
  setTimeout(() => { location.href = location.origin + location.pathname; }, 1200);
});

async function showPublic(token) {
  $('authView').hidden = true; $('appView').hidden = false;
  document.querySelectorAll('.topline,.nav,section.card:not(#page-facture)').forEach(e => e.hidden = true);
  document.querySelector('#page-facture > .no-print').hidden = true;
  const { data, error } = await _supabase.rpc('get_public_doc', { p_token: token });
  if (error || !data || !data.doc) { alert('Document introuvable.'); return; }
  companyData = data.company || {};
  profile = { ...profile, currency: data.doc.currency !== 'USD' ? data.doc.currency : 'CDF' };
  preparePrintArea(data.doc, data.items);
  const bar = document.createElement('div');
  bar.className = 'actions no-print'; bar.style.marginTop = '16px';
  bar.append(mk('Imprimer / PDF', 'primary', () => window.print()));
  const d = data.doc, offers = data.offers || [], lastO = offers[offers.length - 1], open = d.doc_type === 'devis' && !['approuvé', 'terminé'].includes(d.status);
  if (offers.length) {
    const t = document.createElement('div'); t.className = 'note no-print'; t.style.cssText = 'white-space:pre-wrap;margin-top:12px';
    t.textContent = '💬 Négociation :\n' + offers.map(o => `${o.side === 'client' ? 'Toi' : 'Prestataire'} : ${fmt(o.amount)} ${d.currency}${o.message ? ' — ' + o.message : ''}`).join('\n');
    $('page-facture').appendChild(t);
  }
  if (open) {
    if (lastO && lastO.side === 'prestataire') bar.append(mk(`✅ J'accepte ${fmt(lastO.amount)} ${d.currency}`, 'success', async () => {
      const { error } = await _supabase.rpc('client_accept_offer', { p_token: token });
      alert(error ? 'Erreur : ' + error.message : "Merci ! C'est accepté, le prestataire est informé.");
      if (!error) location.reload();
    }));
    bar.append(mk("J'accepte le prix du devis", lastO ? 'secondary' : 'success', async () => {
      const { error } = await _supabase.rpc('approve_public_quote', { p_token: token });
      alert(error ? 'Erreur : ' + error.message : 'Merci ! Le prestataire est informé.');
    }));
    bar.append(mk('💬 Je propose un autre prix', 'secondary', async () => {
      const base = Number(d.labor_orig ?? d.labor_amount) || 0, idea = Math.round(base * 0.9 / 100) * 100;
      const a = parseFloat(prompt(`Main-d'œuvre demandée : ${fmt(base)} ${d.currency}.\nTon prix proposé pour la main-d'œuvre (idée : -10 %) :`, idea));
      if (!(a > 0)) return;
      const msg = prompt('Un petit mot pour le prestataire (facultatif) :') || '';
      const { error } = await _supabase.rpc('submit_offer', { p_token: token, p_amount: a, p_message: msg });
      if (error) { alert('Erreur : ' + error.message); return; }
      if (confirm('Proposition envoyée ✅ Prévenir le prestataire sur WhatsApp ?')) window.open(`https://wa.me/${waNumber(companyData?.phone)}?text=` + encodeURIComponent(`Bonjour, pour le devis n°${d.number}, je propose ${fmt(a)} ${d.currency} pour la main-d'œuvre.${msg ? ' ' + msg : ''}`), '_blank');
      location.reload();
    }));
  }
  $('page-facture').appendChild(bar);
}

/* ---------- ÉQUIPE, STOCK, OBJECTIF, GRAPHIQUE, HORS-LIGNE ---------- */
async function loadProfile() {
  const code = (currentUser.user_metadata?.team_code || '').trim();
  const getTm = () => _supabase.from('team_invites').select('owner_id, role').eq('member_id', currentUser.id).maybeSingle();
  const [, tmRes] = await Promise.all([loadProfile0(), getTm()]);
  WID = currentUser.id; ROLE = 'owner'; LOCKED = false;
  let tm = tmRes.data;
  if (!tm && code) { const j = (await _supabase.rpc('join_team', { p_code: code })).data; if (j) tm = (await getTm()).data; }
  if (code && !tm) alert('Code équipe invalide ou déjà utilisé. Demande un nouveau code à ton patron.');
  if (tm) {
    WID = tm.owner_id; ROLE = tm.role;
    const { data: op } = await _supabase.from('profiles').select('plan, plan_until, business_type, currency, country').eq('id', WID).maybeSingle();
    if (op) profile = { ...profile, ...op };
    LOCKED = !(op && op.plan === 'pro' && (!op.plan_until || new Date(op.plan_until) > new Date()));
    if (!LOCKED) { const { data: tc } = await _supabase.rpc('team_company'); if (tc) companyData = tc; }
  }
}

async function loadTeam() {
  const box = $('teamList'); box.innerHTML = '';
  const { data } = await _supabase.from('team_invites').select('*').eq('owner_id', currentUser.id).order('created_at', { ascending: false });
  (data || []).forEach(t => {
    const row = document.createElement('div'); row.className = 'catalog-item';
    const info = document.createElement('div');
    info.textContent = `${t.code} · ${t.role === 'vendeur' ? 'Vendeur' : t.role === 'aide' ? 'Aide' : 'Associé'} · ${t.member_id ? 'connecté ✅' : 'en attente'}`;
    row.append(info, mk('Retirer', 'danger', async () => { await _supabase.from('team_invites').delete().eq('code', t.code); loadTeam(); }));
    box.appendChild(row);
  });
}
$('inviteBtn').addEventListener('click', async () => {
  if (!needPro('Le multi-utilisateurs')) return;
  const AL = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I
  const code = [...crypto.getRandomValues(new Uint8Array(6))].map(n => AL[n % AL.length]).join('');
  const { error } = await _supabase.from('team_invites').insert([{ code, owner_id: currentUser.id, role: $('inviteRole').value }]);
  if (error) alert(error.message); else { alert('Code équipier : ' + code + '\nIl doit cocher « J\'ai un code équipe » en créant son compte.'); loadTeam(); }
});

async function buyStock(item) {
  const q = parseFloat(prompt('Quantité achetée de « ' + item.name + ' » :'));
  if (!(q > 0)) return;
  const cost = parseFloat(prompt('Prix d\'achat total (' + currency() + ') — laisse vide si inconnu :')) || 0;
  await _supabase.from('catalog').update({ stock: (Number(item.stock) || 0) + q }).eq('id', item.id);
  if (cost > 0) await _supabase.from('expenses').insert([{ user_id: WID, description: 'Achat ' + item.name, category: 'Achat de marchandises', amount: cost, currency: currency(), expense_date: todayStr() }]);
  loadCatalog();
}

async function decStock() {
  const items = [...document.querySelectorAll('#invoiceItemsTable tr')].map(tr => {
    const it = catalogItems.find(c => String(c.id) === tr.dataset.cid);
    return it && it.stock != null ? { id: String(it.id), qty: parseFloat(tr.querySelector('.row-qty').value) || 0 } : null;
  }).filter(Boolean);
  if (items.length) await _supabase.rpc('adjust_stock', { p_items: items });
  loadCatalog();
}

async function loadAdvanced() {
  const cur = currency(), now = new Date(), pro = profile.plan === 'pro';
  const months = [...Array(6)].map((_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
  const idx = d => months.findIndex(m => m.getFullYear() === d.getFullYear() && m.getMonth() === d.getMonth());
  const [inv, exp] = await Promise.all([
    _supabase.from('invoices').select('client_name,total_amount,currency,created_at,paid_amount,labor_amount,supplies_amount,own_supplies').eq('user_id', WID).eq('doc_type', isPrest() ? 'devis' : 'facture').gte('created_at', months[0].toISOString()),
    _supabase.from('expenses').select('amount,currency,expense_date').eq('user_id', WID).gte('expense_date', months[0].toLocaleDateString('en-CA'))
  ]);
  const net = [0, 0, 0, 0, 0, 0], sales = [0, 0, 0, 0, 0, 0], clients = {};
  (inv.data || []).forEach(r => { if (r.currency !== cur) return; const i = idx(new Date(r.created_at)); if (i < 0) return; const v = revOf(r); sales[i] += v; net[i] += v; clients[r.client_name] = (clients[r.client_name] || 0) + v; });
  (exp.data || []).forEach(r => { if (r.currency !== cur) return; const i = idx(new Date(r.expense_date + 'T00:00:00')); if (i >= 0) net[i] -= Number(r.amount) || 0; });
  const goal = Number(companyData?.goal) || 0, pct = goal ? Math.min(100, Math.round(sales[5] / goal * 100)) : 0;
  $('goalBar').style.width = pct + '%';
  $('goalText').textContent = goal ? `${fmt(sales[5])} / ${fmt(goal)} ${cur} (${pct} %)` : 'Aucun objectif défini.';
  $('goalBtn').hidden = ROLE === 'vendeur' || ROLE === 'aide';
  const mfr = months.map(m => m.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })), parMois = {};
  mfr.forEach((n, i) => { parMois[n] = { revenu_ou_ventes: Math.round(sales[i]), benefice_net: Math.round(net[i]) }; });
  lastStats = {
    aujourd_hui: now.toLocaleDateString('fr-FR'), type_activite: isPrest() ? "prestataire de services (revenu = main-d'œuvre reçue)" : 'commerçant', devise: cur,
    mois_en_cours: mfr[5], mois_precedent: mfr[4], par_mois: parMois,
    meilleurs_clients: Object.entries(clients).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([nom, total]) => ({ nom, total: Math.round(total) })),
    objectif_du_mois: goal, articles_stock_bas: catalogItems.filter(c => c.stock != null && c.stock <= 3).map(c => c.name)
  };
  $('proDashBox').hidden = !pro; $('proLock').hidden = pro;
  if (!pro) return;
  loadProStats();
  const max = Math.max(1, ...net.map(Math.abs));
  $('profitChart').innerHTML = net.map((v, i) => {
    const h = Math.round(Math.abs(v) / max * 45), y = v >= 0 ? 55 - h : 55;
    return `<rect x="${i * 50 + 10}" y="${y}" width="30" height="${h}" rx="3" fill="${v >= 0 ? '#16865b' : '#bd3542'}"/><text x="${i * 50 + 25}" y="115" font-size="10" text-anchor="middle" fill="#6b7a90">${months[i].toLocaleDateString('fr-FR', { month: 'short' })}</text><text x="${i * 50 + 25}" y="${v >= 0 ? y - 3 : y + h + 11}" font-size="8" text-anchor="middle" fill="#253449">${Math.round(v).toLocaleString('fr-FR')}</text>`;
  }).join('') + '<line x1="0" x2="300" y1="55" y2="55" stroke="#dce3ed"/>';
  const top = Object.entries(clients).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const box = $('topClients'); box.textContent = '';
  if (!top.length) box.textContent = 'Pas encore de ventes.';
  top.forEach(([n, v], i) => { const p = document.createElement('div'); p.textContent = `${i + 1}. ${n} — ${fmt(v)} ${cur}`; box.appendChild(p); });
}
$('goalBtn').addEventListener('click', async () => {
  const g = parseFloat(prompt('Objectif de ventes du mois (' + currency() + ') :'));
  if (!(g > 0)) return;
  const { error } = await _supabase.from('companies').update({ goal: g }).eq('id', WID);
  if (error) { alert(error.message); return; }
  companyData = { ...(companyData || {}), goal: g }; loadAdvanced();
});

async function flushQueue() {
  const q = JSON.parse(localStorage.getItem('facturix_queue') || '[]');
  if (!q.length || !navigator.onLine) return;
  const left = [];
  for (const p of q) {
    const { data: inv, error } = await _supabase.from('invoices').insert([p.inv]).select().single();
    if (error) { left.push(p); continue; }
    await _supabase.from('invoice_items').insert(p.items.map(r => ({ invoice_id: inv.id, ...r })));
  }
  localStorage.setItem('facturix_queue', JSON.stringify(left));
  if (left.length < q.length) alert((q.length - left.length) + ' document(s) envoyé(s) au serveur !');
}
window.addEventListener('online', flushQueue);

/* ---------- RECHERCHE PRODUIT ---------- */
const norm = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function renderChips() {
  const box = $('catalogChips'); box.innerHTML = '';
  if (isPrest()) return;
  const q = norm($('catSearch').value.trim());
  catalogItems.filter(i => !q || norm(i.name).includes(q)).slice(0, 12).forEach(item => box.appendChild(mk(item.name, 'secondary', () => quickAdd(item))));
  if (q && !box.children.length) box.textContent = 'Aucun produit trouvé.';
}
$('catSearch').addEventListener('input', renderChips);

/* ---------- MISSIONS / JOURNÉES, RAPPORTS, BONS DE PAIEMENT ---------- */
const STEP = { envoyee: '📨 Envoyée', en_cours: '▶️ En cours', terminee: '🏁 Terminée', verifiee: '✅ Vérifiée', payee: '💵 Payée', recue: '🧾 Reçue' };
const CALLCODE = { 'RDC': '243', 'Congo-Brazzaville': '242', 'Cameroun': '237', 'Gabon': '241', 'Sénégal': '221', "Côte d'Ivoire": '225', 'Mali': '223', 'Bénin': '229', 'Nigeria': '234', 'Ghana': '233', 'Kenya': '254', 'Tanzanie': '255', 'Ouganda': '256', 'Rwanda': '250', 'Afrique du Sud': '27', 'Maroc': '212', 'Égypte': '20' };
const waNumber = p => {
  const d = String(p || '').replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) return d.slice(1);
  if (d.startsWith('00')) return d.slice(2);
  const cc = CALLCODE[profile.country] || '';
  if (cc && d.startsWith(cc) && d.length >= cc.length + 8) return d;
  return cc ? cc + d.replace(/^0+/, '') : d;
};
const depositOf = inv => { const lab = Number(inv.labor_amount) || 0, sup = Number(inv.supplies_amount) || 0, pct = Number(inv.deposit_pct) || 0; return (lab > 0 || sup > 0) ? sup + (Number(inv.tva_amount) || 0) + lab * pct / 100 : (Number(inv.total_amount) || 0) * pct / 100; };
const isHelper = () => ROLE === 'aide' || ROLE === 'vendeur';
let pendingItems = [], pendingDevis = null, misRT = false;
const dFr = d => d ? new Date(d).toLocaleDateString('fr-FR') : '';

async function misAct(id, action) {
  const { error } = await _supabase.rpc('mission_action', { p_id: id, p_action: action });
  if (error) alert(error.message);
  loadMissions(); refreshBadge();
}
function showVoucher(m) {
  $('vText').textContent = `BON DE PAIEMENT n° ${m.voucher_no || ''}\n\nEntreprise : ${companyData?.name || ''}\nBénéficiaire : ${m.assignee_name || ''}\nObjet : ${m.title}\nMontant payé : ${fmt(m.pay_amount)} ${m.currency}\nPayé le : ${dFr(m.paid_at)}\nReçu le : ${dFr(m.received_at)}\n\nSignature : ______________________`;
  document.body.classList.add('vopen'); $('voucherArea').hidden = false;
}
$('vPrint').addEventListener('click', () => window.print());
$('vWa').addEventListener('click', () => window.open('https://wa.me/?text=' + encodeURIComponent($('vText').textContent), '_blank'));
$('vClose').addEventListener('click', () => { $('voucherArea').hidden = true; document.body.classList.remove('vopen'); });
function syncPayUI() {
  const pct = $('misPayType').value === 'percent';
  $('misPayLbl').textContent = pct ? 'Pourcentage (%)' : 'Montant';
  $('misBaseBox').hidden = !(pct && isPrest());
}
async function loadMissions() {
  const helper = isHelper(), owner = ROLE === 'owner';
  $('misTitle').textContent = helper ? (isPrest() ? '📋 Mes missions' : '📋 Ma journée') : (isPrest() ? '📋 Missions' : '📋 Journées de vente');
  $('misNew').hidden = !owner; $('misReport').hidden = !helper; $('repBox').hidden = !owner;
  if (owner) {
    $('misName').placeholder = isPrest() ? 'Ex. Peinture chez Don' : 'Ex. Vente du samedi';
    const { data: team } = await _supabase.from('team_invites').select('member_id, member_name, role').eq('owner_id', currentUser.id).not('member_id', 'is', null);
    $('misAssignee').innerHTML = '';
    (team || []).forEach(t => $('misAssignee').appendChild(new Option((t.member_name || 'Équipier') + ' (' + (t.role === 'aide' ? 'aide' : t.role === 'vendeur' ? 'vendeur' : 'associé') + ')', t.member_id)));
    if (!team || !team.length) $('misAssignee').appendChild(new Option("Crée d'abord un code dans « Équipe »", ''));
    syncPayUI();
  }
  const list = $('misList'); list.textContent = '';
  const { data } = await _supabase.from('missions').select('*').order('created_at', { ascending: false }).limit(50);
  if (!data || !data.length) list.textContent = 'Aucune ' + (isPrest() ? 'mission' : 'journée') + ' pour le moment.';
  (data || []).forEach(m => {
    if (m.status === 'recue') return;
    const box = document.createElement('details'); box.open = helper && ['envoyee', 'en_cours', 'payee'].includes(m.status);
    const sum = document.createElement('summary'); sum.textContent = `${m.title} · ${STEP[m.status] || m.status}`;
    const body = document.createElement('div'); body.className = 'note'; body.style.whiteSpace = 'pre-wrap';
    const pay = m.pay_amount != null ? `${fmt(m.pay_amount)} ${m.currency}` : (m.pay_type === 'percent' ? `${m.pay_value} % ${m.kind === 'journee' ? 'des ventes de la journée' : 'de la main-d\'œuvre'}` : `${fmt(m.pay_value)} ${m.currency} (fixe)`);
    const items = (m.items || []).map(i => '• ' + i.d + (i.k === 'fourniture' ? ` × ${i.q} (à acheter)` : '')).join('\n');
    body.textContent = [!helper && m.assignee_name ? 'Confiée à : ' + m.assignee_name : '', m.details || '', items, 'Paiement : ' + pay + (m.due_date ? ' · prévu le ' + dFr(m.due_date) : ''),
      m.started_at ? 'Commencée : ' + dFr(m.started_at) : '', m.finished_at ? 'Terminée : ' + dFr(m.finished_at) : '',
      m.kind === 'journee' && m.result_amount != null ? 'Ventes de la journée : ' + fmt(m.result_amount) + ' ' + m.currency : '',
      owner && m.status === 'verifiee' && m.due_date && m.due_date <= todayStr() ? '⏰ Paiement dû' : ''].filter(Boolean).join('\n');
    const acts = document.createElement('div'); acts.className = 'actions'; acts.style.marginTop = '8px';
    if (helper) {
      if (m.status === 'envoyee') acts.append(mk('▶️ Commencer', 'success', () => misAct(m.id, 'start')));
      if (['envoyee', 'en_cours'].includes(m.status)) acts.append(mk('🏁 Terminer', 'primary', () => misAct(m.id, 'finish')));
      if (m.status === 'payee') acts.append(mk('💵 Paiement reçu', 'success', () => misAct(m.id, 'receive')));
    } else {
      if (m.status === 'terminee') acts.append(mk('✅ Vérifier', 'success', () => misAct(m.id, 'verify')));
      if (m.status === 'verifiee') acts.append(mk('💵 Marquer payé', 'primary', () => misAct(m.id, 'pay')));
      if (m.status === 'envoyee') acts.append(mk('Supprimer', 'danger', async () => { await _supabase.from('missions').delete().eq('id', m.id); loadMissions(); }));
    }
    if (m.status === 'recue') acts.append(mk('🧾 Bon de paiement', 'secondary', () => showVoucher(m)));
    box.append(sum, body, acts); list.appendChild(box);
  });
  const vs = (data || []).filter(m => m.status === 'recue'), vl = $('vouchList');
  $('vouchBox').hidden = !vs.length; vl.textContent = '';
  vs.forEach(m => { const r = document.createElement('div'); r.className = 'catalog-item'; const t = document.createElement('div'); t.textContent = `${m.voucher_no || ''} · ${m.title} · ${fmt(m.pay_amount)} ${m.currency} · ${dFr(m.received_at)}`; r.append(t, mk('Voir', 'secondary', () => showVoucher(m))); vl.appendChild(r); });
  if (owner) loadReports();
}
$('misPayType').addEventListener('change', syncPayUI);
$('misSend').addEventListener('click', async () => {
  const to = $('misAssignee').value, title = $('misName').value.trim();
  if (!to || !title) { setStatus('misStatus', 'Choisis une personne et écris un titre.', 'err'); return; }
  if (pendingDevis) { const { data: ex } = await _supabase.from('missions').select('id').eq('devis_id', pendingDevis).neq('status', 'recue').limit(1); if (ex && ex.length && !confirm("Ce devis a déjà été envoyé en mission. L'envoyer encore ?")) return; }
  $('misSend').disabled = true;
  const type = $('misPayType').value;
  const { error } = await _supabase.from('missions').insert([{ owner_id: currentUser.id, assignee_id: to, assignee_name: $('misAssignee').selectedOptions[0].textContent.replace(/ \(.*\)$/, ''), kind: isPrest() ? 'mission' : 'journee', title, details: $('misDetails').value.trim(), items: pendingItems, devis_id: pendingDevis, pay_type: type, pay_value: parseFloat($('misPayValue').value) || 0, pay_base: type === 'percent' && isPrest() ? (parseFloat($('misBase').value) || 0) : 0, currency: currency(), due_date: $('misDue').value || null }]);
  $('misSend').disabled = false;
  if (error) { setStatus('misStatus', error.message, 'err'); return; }
  setStatus('misStatus', 'Envoyée ✅', 'ok');
  pendingItems = []; pendingDevis = null; $('misName').value = ''; $('misDetails').value = ''; $('misPayValue').value = ''; $('misBase').value = '';
  loadMissions();
});
async function missionFromDevis(inv) {
  const { data } = await _supabase.from('invoice_items').select('description, quantity, kind').eq('invoice_id', inv.id);
  pendingItems = (data || []).map(i => ({ d: i.description, q: i.quantity, k: i.kind || 'main_oeuvre' })); pendingDevis = inv.id;
  setPage('missions');
  await loadMissions();
  $('misName').value = `${inv.client_name} — ${inv.number}`; $('misPayType').value = 'percent'; $('misBase').value = inv.labor_amount || ''; syncPayUI();
  setStatus('misStatus', 'Choisis la personne, le pourcentage, puis envoie.', 'ok');
}
$('repSend').addEventListener('click', async () => {
  const body = $('repText').value.trim();
  if (!body) return;
  const name = currentUser.user_metadata?.full_name || currentUser.email;
  const { error } = await _supabase.from('reports').insert([{ owner_id: WID, author_id: currentUser.id, author_name: name, body }]);
  if (error) { alert(error.message); return; }
  $('repText').value = '';
  const ph = waNumber(companyData?.phone);
  if (ph.length >= 9) window.open(`https://wa.me/${ph}?text=` + encodeURIComponent(`📝 Rapport de ${name} :\n${body}`), '_blank');
  else alert(ROLE === 'owner' ? 'Rapport enregistré.' : 'Rapport enregistré ✅ Ton patron le verra dans son application.');
});
async function loadReports() {
  const { data } = await _supabase.from('reports').select('*').eq('owner_id', currentUser.id).order('created_at', { ascending: false }).limit(20);
  const box = $('repList'); box.textContent = (data || []).length ? '' : 'Aucun rapport.';
  (data || []).forEach(r => { const d = document.createElement('div'); d.className = 'catalog-item'; d.style.whiteSpace = 'pre-wrap'; d.textContent = `${r.read ? '' : '🆕 '}${r.author_name} · ${dFr(r.created_at)}\n${r.body}`; box.appendChild(d); });
  if ((data || []).some(r => !r.read)) { await _supabase.from('reports').update({ read: true }).eq('owner_id', currentUser.id).eq('read', false); refreshBadge(); }
}
async function refreshBadge() {
  const btn = document.querySelector('.nav button[data-page="missions"]');
  if (!btn || !currentUser) return;
  const cnt = async (t, f) => (await f(_supabase.from(t).select('id', { count: 'exact', head: true }))).count || 0;
  let n = 0;
  if (ROLE === 'owner') n = await cnt('missions', q => q.eq('owner_id', currentUser.id).eq('status', 'terminee')) + await cnt('reports', q => q.eq('owner_id', currentUser.id).eq('read', false));
  else if (isHelper()) n = await cnt('missions', q => q.eq('assignee_id', currentUser.id).in('status', ['envoyee', 'payee']));
  const base = isPrest() ? (isHelper() ? 'Mes missions' : 'Missions') : (isHelper() ? 'Ma journée' : 'Journées');
  btn.textContent = '📋 ' + base + (n ? ` (${n})` : '');
}
function startMissionRT() {
  if (misRT) return; misRT = true;
  const on = () => { refreshBadge(); const a = document.querySelector('.nav button.active'); if (a && a.dataset.page === 'missions') loadMissions(); };
  _supabase.channel('mis').on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, on).on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, on).subscribe();
}

/* ---------- NÉGOCIATION DE LA MAIN-D'ŒUVRE ---------- */
let neg = null;
async function openNego(inv) {
  const { data: offers } = await _supabase.from('quote_offers').select('*').eq('quote_id', inv.id).order('created_at');
  const orig = Number(inv.labor_orig ?? inv.labor_amount) || 0, last = (offers || []).slice(-1)[0], min = Number(inv.labor_min) || 0;
  neg = { inv, orig, last };
  const rows = (offers || []).map(o => `${o.side === 'client' ? '👤 Client' : '🛠️ Toi'} : ${fmt(o.amount)} ${inv.currency}${o.message ? ' — ' + o.message : ''}${o.accepted ? ' ✅ accepté' : ''}`);
  $('negText').textContent = [`Devis ${inv.number} · ${inv.client_name}`, `Main-d'œuvre demandée : ${fmt(orig)} ${inv.currency}`, min ? `Ton minimum (privé) : ${fmt(min)} ${inv.currency}` : '', '', ...rows,
    last && last.side === 'client' && min && Number(last.amount) < min ? '\n⚠️ Cette offre est sous ton minimum.' : ''].join('\n');
  const fromClient = !!last && last.side === 'client';
  $('negAccept').hidden = $('negMid').hidden = !fromClient;
  $('negArea').hidden = false;
}
async function sendCounter(amount, msg) {
  const { error } = await _supabase.rpc('counter_offer', { p_quote: neg.inv.id, p_amount: amount, p_message: msg || null });
  if (error) { alert('Erreur : ' + error.message); return; }
  const link = location.origin + location.pathname + '?d=' + neg.inv.public_token;
  if (confirm('Contre-offre enregistrée. Prévenir le client sur WhatsApp ?')) window.open(`https://wa.me/${waNumber(neg.inv.client_phone)}?text=` + encodeURIComponent(`Bonjour ${neg.inv.client_name}, pour la main-d'œuvre du devis n°${neg.inv.number}, je te propose ${fmt(amount)} ${neg.inv.currency}. Réponds ici : ${link}`), '_blank');
  $('negArea').hidden = true; loadHistory();
}
const midOf = (a, b) => Math.round((a + b) / 2 / 100) * 100;
$('negMid').addEventListener('click', () => sendCounter(midOf(neg.orig, Number(neg.last.amount)), 'On se met d\'accord au milieu'));
$('negKeep').addEventListener('click', () => sendCounter(neg.orig, 'Je maintiens mon prix'));
$('negCounter').addEventListener('click', () => {
  const a = parseFloat(prompt(`Ta contre-offre pour la main-d'œuvre (${neg.inv.currency}) :`, neg.last ? midOf(neg.orig, Number(neg.last.amount)) : neg.orig));
  if (a > 0) sendCounter(a, prompt('Un petit mot pour le client (facultatif) :') || '');
});
$('negAccept').addEventListener('click', async () => {
  const { error } = await _supabase.rpc('accept_offer', { p_offer: neg.last.id });
  alert(error ? 'Erreur : ' + error.message : `Accepté : main-d'œuvre à ${fmt(neg.last.amount)} ${neg.inv.currency}. La mission peut commencer.`);
  $('negArea').hidden = true; loadHistory();
});
$('negClose').addEventListener('click', () => { $('negArea').hidden = true; });

/* ---------- PRESTATAIRE : revenu = main-d'œuvre reçue ---------- */
let cashInfo = {};
const isPrest = () => profile.business_type === 'prestataire';
const countedOf = r => (Number(r.labor_amount) || 0) + (r.own_supplies ? (Number(r.supplies_amount) || 0) : 0);
const revOf = r => isPrest() ? Math.min(Number(r.paid_amount) || 0, countedOf(r)) : (Number(r.total_amount) || 0);
const kindSums = () => {
  const r = readRows().filter(x => x.description), sum = f => r.filter(f).reduce((a, x) => a + x.total_price, 0);
  return { labor_amount: sum(x => x.kind !== 'fourniture'), supplies_amount: sum(x => x.kind === 'fourniture'), own_supplies: $('ownSupplies').checked };
};
async function recordLabor(inv) {
  const counted = countedOf(inv), due = counted - (Number(inv.paid_amount) || 0);
  if (counted <= 0) { alert("Ce devis ne contient pas de main-d'œuvre à compter."); return; }
  if (due <= 0) { alert("La main-d'œuvre est déjà entièrement reçue."); return; }
  let a = due;
  if (profile.plan === 'pro') { a = parseFloat(prompt(`Montant reçu (reste à recevoir : ${fmt(due)} ${inv.currency}) :`, due)); if (!(a > 0)) return; }
  else if (!confirm(`Confirmer la réception de ${fmt(due)} ${inv.currency} (main-d'œuvre) ?`)) return;
  const paid = Math.min(counted, (Number(inv.paid_amount) || 0) + a);
  const { error } = await _supabase.from('invoices').update({ paid_amount: paid, status: paid >= counted ? 'terminé' : 'approuvé' }).eq('id', inv.id);
  if (error) alert('Erreur : ' + error.message);
  loadHistory();
}

/* Le mentor IA vit dans js/mentor-ia/ ; app.js lui fournit les chiffres (lastStats) */
let lastStats = {};

/* ---------- ÉCRAN PRO ---------- */
PAY.forEach(([op, num]) => {
  const row = document.createElement('div'); row.className = 'catalog-item';
  const info = document.createElement('div'); info.textContent = op + ' : ' + num;
  row.append(info, mk('Copier', 'secondary', () => { if (navigator.clipboard) navigator.clipboard.writeText(num); alert('Numéro copié : ' + num); }));
  $('payList').appendChild(row);
});
const paid = plan => window.open(`https://wa.me/${ADMIN_WA}?text=` + encodeURIComponent(`Bonjour, j'ai payé le plan PRO FACTURIX (${plan}). E-mail de mon compte : ${currentUser.email}. Je t'envoie la capture du paiement.`), '_blank');
$('payMonthBtn').addEventListener('click', () => paid('mensuel, 2 $'));
$('payYearBtn').addEventListener('click', () => paid('annuel, 20 $'));

/* ---------- TVA, VENTE RAPIDE, STATS PRO ---------- */
// Taux indicatifs : à vérifier selon la loi en vigueur (modifiables dans la facture)
const VAT = { 'RDC': 16, 'Congo-Brazzaville': 18.9, 'Cameroun': 19.25, 'Gabon': 18, 'Sénégal': 18, "Côte d'Ivoire": 18, 'Mali': 18, 'Bénin': 18, 'Nigeria': 7.5, 'Ghana': 15, 'Kenya': 16, 'Tanzanie': 18, 'Ouganda': 18, 'Rwanda': 18, 'Afrique du Sud': 15, 'Maroc': 20, 'Égypte': 14 };
const taxableSum = rows => rows.filter(x => x.kind !== 'main_oeuvre').reduce((a, x) => a + x.total_price, 0);
const tvaRate = () => $('tvaOn').checked ? (parseFloat($('tvaRate').value) || 0) : 0;
const tvaOf = g => Math.round(g * tvaRate()) / 100;
const tvaExtra = () => {
  const r = tvaRate(); if (!r) return {};
  const ht = taxableSum(readRows().filter(x => x.description));
  return { tva_rate: r, tva_amount: Math.round(ht * r) / 100 };
};
const quoteExtra = () => ({ ...quoteExtra0(), ...tvaExtra() });
$('tvaOn').addEventListener('change', () => {
  if ($('tvaOn').checked && profile.plan !== 'pro') { $('tvaOn').checked = false; needPro('La TVA'); return; }
  if ($('tvaOn').checked && (!companyData?.tax_id || (profile.country === 'RDC' && !companyData?.rccm))) { $('tvaOn').checked = false; alert("Pour activer la TVA, enregistre ton N° d'impôt" + (profile.country === 'RDC' ? ' et ton RCCM' : '') + ' dans « Mon entreprise ».'); return; }
  $('tvaRate').hidden = !$('tvaOn').checked; calculateTotal();
});
$('tvaRate').addEventListener('input', calculateTotal);

function quickAdd(item) {
  document.querySelectorAll('#invoiceItemsTable tr').forEach(tr => { if (!tr.querySelector('.row-desc').value.trim()) tr.remove(); });
  const row = [...document.querySelectorAll('#invoiceItemsTable tr')].find(tr => tr.dataset.cid === String(item.id));
  if (row) { const q = row.querySelector('.row-qty'); q.value = (parseFloat(q.value) || 0) + 1; calculateTotal(); return; }
  addInvoiceRow(item.name, item.price, 1);
  $('invoiceItemsTable').lastElementChild.dataset.cid = item.id;
}

async function loadProStats() {
  const prest = profile.business_type === 'prestataire', d = new Date(), start = new Date(d.getFullYear(), d.getMonth() - 5, 1).toISOString();
  $('topItemsTitle').textContent = prest ? '🛠️ Services les plus demandés (6 mois)' : '📦 Plus vendus (6 mois)';
  $('quoteBox').hidden = !prest;
  const { data } = await _supabase.from('invoice_items').select('description, quantity, invoices!inner(created_at, doc_type)')
    .eq('invoices.doc_type', prest ? 'devis' : 'facture').gte('invoices.created_at', start).limit(1000);
  const agg = {};
  (data || []).forEach(r => { const k = (r.description || '').trim(); if (k) agg[k] = (agg[k] || 0) + (Number(r.quantity) || 0); });
  const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 5), box = $('topItems');
  lastStats.plus_vendus_ou_demandes = top.map(([nom, quantite]) => ({ nom, quantite }));
  box.textContent = top.length ? '' : 'Pas encore de données.';
  top.forEach(([n, q], i) => { const p = document.createElement('div'); p.textContent = `${i + 1}. ${n} — ×${(+q).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`; box.appendChild(p); });
  if (!prest) return;
  const { data: qs } = await _supabase.from('invoices').select('status').eq('user_id', WID).eq('doc_type', 'devis').gte('created_at', start);
  const n = (qs || []).length, ok = (qs || []).filter(x => x.status === 'approuvé').length, wait = (qs || []).filter(x => ['brouillon', 'envoyé', 'negociation'].includes(x.status)).length;
  lastStats.devis = { total: n, approuves: ok, en_attente: wait };
  $('quoteStats').textContent = n ? `${n} devis · ${ok} approuvés (${Math.round(ok / n * 100)} %) · ${wait} en attente de réponse` : 'Pas encore de devis.';
}

/* ---------- USAGE (gratuit) ET EXPORT EXCEL (PRO) ---------- */
async function showUsage() {
  if (profile.plan === 'pro' || ROLE !== 'owner') return;
  const d = new Date(), start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  const cnt = async t => (await _supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('user_id', WID).eq('doc_type', t).gte('created_at', start)).count || 0;
  const [f, q] = await Promise.all([cnt('facture'), cnt('devis')]);
  $('planBar').textContent = (isPrest() ? `Plan Gratuit · ce mois : ${q}/${LIMITS.devis} devis` : `Plan Gratuit · ce mois : ${f}/${LIMITS.facture} factures`);
}
$('csvBtn').addEventListener('click', async () => {
  if (!needPro("L'export Excel")) return;
  const { data } = await _supabase.from('invoices').select('number,doc_type,status,client_name,client_phone,total_amount,paid_amount,currency,created_at').eq('user_id', WID).order('created_at', { ascending: false });
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const head = ['Numéro', 'Type', 'Statut', 'Client', 'Téléphone', 'Total', 'Payé', 'Devise', 'Date'];
  const rows = (data || []).map(r => [r.number, r.doc_type, r.status, r.client_name, r.client_phone, r.total_amount, r.paid_amount, r.currency, new Date(r.created_at).toLocaleDateString('fr-FR')].map(esc).join(';'));
  const blob = new Blob(['\ufeff' + [head.map(esc).join(';'), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'factures-facturix.csv'; a.click();
});

/* ---------- DEVIS : SUGGESTIONS, ACOMPTE, DUPLICATION ---------- */
const quoteExtra0 = () => $('docType').value === 'devis' ? { valid_days: parseInt($('qValid').value) || 15, deposit_pct: parseFloat($('qDeposit').value) || 0, note: $('qNote').value.trim(), ...kindSums(), labor_min: parseFloat($('qMin').value) || null } : {};
let lineSugg = {};
async function loadSuggestions() {
  const dl = $('lineSuggest'); dl.innerHTML = '';
  const { data } = await _supabase.from('invoice_items').select('description, unit_price').limit(300);
  (data || []).forEach(r => { if (r.description && !lineSugg[r.description]) lineSugg[r.description] = { price: r.unit_price }; });
  ["Main-d'œuvre", 'Déplacement / transport', 'Diagnostic', 'Installation', 'Réparation', 'Maintenance', 'Formation', 'Livraison', ...Object.keys(lineSugg)].forEach(t => dl.appendChild(new Option(t)));
}
$('addLaborBtn').addEventListener('click', () => addInvoiceRow('', 0, 1, 'main_oeuvre'));
$('addMaterialBtn').addEventListener('click', () => addInvoiceRow('', 0, 1, 'fourniture'));

async function duplicateDoc(inv) {
  const { data: items } = await _supabase.from('invoice_items').select('*').eq('invoice_id', inv.id);
  setPage('facture');
  await resetInvoice();
  $('docType').value = inv.doc_type === 'devis' ? 'devis' : 'facture';
  await generateInvoiceNumber();
  $('clientName').value = inv.client_name || ''; $('clientPhone').value = inv.client_phone || ''; $('clientEmail').value = inv.client_email || '';
  $('invoiceItemsTable').innerHTML = '';
  (items || []).forEach(it => addInvoiceRow(it.description, it.unit_price, it.quantity, it.kind || ''));
  if (inv.doc_type === 'devis') { $('qValid').value = inv.valid_days || 15; $('qDeposit').value = inv.deposit_pct ?? 50; $('qNote').value = inv.note || ''; $('ownSupplies').checked = !!inv.own_supplies; }
  calculateTotal();
  setStatus('invoiceStatus', 'Document copié : change le client si besoin, puis enregistre.', 'ok');
}

$('isTeam').addEventListener('change', () => { $('ownerFields').hidden = $('isTeam').checked; $('teamField').hidden = !$('isTeam').checked; });

/* ---------- ENCAISSÉ, FILTRES, RÉSEAU ---------- */
const statusNow = () => $('docType').value === 'devis' ? 'brouillon' : ($('paidNow').checked ? 'payée' : 'impayée');

function showCash(rows) {
  const t = { CDF: [0, 0], USD: [0, 0] }; // [encaissé, à encaisser]
  (rows || []).forEach(r => { const tot = Number(r.total_amount) || 0, p = r.status === 'payée' ? tot : Math.min(tot, Number(r.paid_amount) || 0), b = t[r.currency === 'USD' ? 'USD' : 'CDF']; b[0] += p; b[1] += tot - p; });
  cashInfo = { [isPrest() ? 'recu' : 'encaisse']: { local: Math.round(t.CDF[0]), usd: Math.round(t.USD[0]) }, [isPrest() ? 'a_recevoir' : 'a_encaisser']: { local: Math.round(t.CDF[1]), usd: Math.round(t.USD[1]) } };
  const owe = {};
  (rows || []).forEach(r => { if (r.status !== 'payée') { const k = r.client_name + ' (' + (r.currency === 'USD' ? 'USD' : locCur()) + ')'; owe[k] = (owe[k] || 0) + (Number(r.total_amount) || 0) - (Number(r.paid_amount) || 0); } });
  const topOwe = Object.entries(owe).sort((a, b) => b[1] - a[1]).slice(0, 3);
  $('cashText').textContent = ['CDF', 'USD'].map(c => `${c === 'CDF' ? locCur() : c} : ✅ ${fmt(t[c][0])} ${isPrest() ? 'reçu' : 'encaissé'} · ⏳ ${fmt(t[c][1])} ${isPrest() ? 'à recevoir' : 'à encaisser'}`).join('\n') + (topOwe.length ? '\n\n👥 À relancer :\n' + topOwe.map(([n, v]) => `${n} : ${fmt(v)}`).join('\n') : '');
}

function histMatch(inv) {
  const q = $('histSearch').value.trim().toLowerCase(), f = $('histFilter').value;
  if (q && !(inv.number + ' ' + inv.client_name).toLowerCase().includes(q)) return false;
  if (f === 'attente') return ['brouillon', 'envoyé', 'negociation'].includes(inv.status);
  if (f === 'cours') return inv.status === 'approuvé';
  if (f === 'fini') return inv.status === 'terminé';
  if (f === 'devis' || f === 'facture') return inv.doc_type === f;
  if (f === 'payee') return inv.doc_type !== 'devis' && inv.status === 'payée';
  if (f === 'impayee') return inv.doc_type !== 'devis' && inv.status !== 'payée';
  return true;
}
let histTimer;
$('histSearch').addEventListener('input', () => { clearTimeout(histTimer); histTimer = setTimeout(loadHistory, 300); });
$('histFilter').addEventListener('change', loadHistory);

const netState = () => { $('netBadge').hidden = navigator.onLine; };
window.addEventListener('online', netState); window.addEventListener('offline', netState); netState();

/* ---------- APPLICATION INSTALLABLE (PWA) ---------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
$('installBtn').addEventListener('click', async () => { if (installEvt) { installEvt.prompt(); installEvt = null; $('installBtn').hidden = true; } });
if (/iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone) $('installHint').hidden = false;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  // Nouvelle version installée : l'application se recharge une fois toute seule
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!sessionStorage.getItem('fx_reload')) { sessionStorage.setItem('fx_reload', '1'); location.reload(); } });
}

/* ---------- NAVIGATION ---------- */
function setPage(target) {
  document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('active', x.dataset.page === target));
  
  ['entreprise', 'catalogue', 'facture', 'historique', 'politique', 'dashboard', 'depenses', 'equipe', 'pro', 'mentor', 'missions'].forEach(p => { 
    const el = $('page-' + p);
    if (el) el.hidden = (p !== target); 
  });
  
  if (target === 'historique') loadHistory();
  if (target === 'depenses') loadExpenses();
  if (target === 'equipe') loadTeam();
  if (target === 'mentor' && window.FX_IA) FX_IA.open();
  if (target === 'missions') loadMissions();
  if (target === 'dashboard') loadDashboard(); // Déclenche le calcul automatique
}


$('dashPeriod').addEventListener('change', loadDashboard);
document.querySelectorAll('.nav button').forEach(b => b.addEventListener('click', () => setPage(b.dataset.page)));

/* ---------- PASSERELLE POUR LES MODULES (js/mentor-ia) ---------- */
window.FX = {
  $, mk, supabase: _supabase, loadDashboard, setPage, isPrest,
  get profile() { return profile; },
  get user() { return currentUser; },
  stats: () => ({ ...lastStats, ...cashInfo })
};
if (window.FX_IA) FX_IA.init();

const pubToken = new URLSearchParams(location.search).get('d');
if (recovering) showReset(); else if (pubToken) showPublic(pubToken); else checkSession();
})();

