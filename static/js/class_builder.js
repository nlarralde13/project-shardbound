// static/js/class_builder.js
const $ = (id) => document.getElementById(id);

/* ---------------- Console helpers ---------------- */
function ts() {
  const d = new Date();
  return d.toLocaleTimeString();
}
function appendConsole(label, data) {
  const hdr = `[${ts()}] ${label}`;
  let body = '';
  if (data !== undefined) {
    if (typeof data === 'string') body = data;
    else body = JSON.stringify(data, null, 2);
  }
  console.log(hdr + (body ? '\n' + body : ''));
}
function clearConsole() {
  /* console removed */
}

/* ---------------- API ---------------- */
const api = {
  async init() {
    const r = await fetch('/api/classes-admin/init', { method: 'POST', credentials: 'include' });
    if (!r.ok) throw new Error('init failed');
  },
  async list(status = 'draft') {
    const r = await fetch(`/api/classes-admin/list?status=${encodeURIComponent(status)}`, { credentials: 'include' });
    if (!r.ok) throw new Error('list failed');
    return r.json();
  },
  async get(cid, prefer = 'draft') {
    const r = await fetch(`/api/classes-admin/get/${encodeURIComponent(cid)}?prefer=${prefer}`, { credentials: 'include' });
    if (!r.ok) throw new Error('get failed');
    return r.json();
  },
  async create(payload) {
    const r = await fetch('/api/classes-admin/new', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(payload)
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = {}; }
    if (!r.ok) {
      appendConsole('CREATE ERROR (raw)', text);
      throw new Error(data.error || 'create failed');
    }
    return data;
  },
  async saveDraft(cid, doc) {
    const r = await fetch('/api/classes-admin/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ class_id: cid, status: 'draft', data: doc, validate: 0 })
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = {}; }
    if (!r.ok) {
      appendConsole('SAVE ERROR (raw)', text);
      throw new Error(data.detail?.message || data.error || 'save failed');
    }
    return data;
  },
  async validate(docOrRef) {
    const body = (docOrRef && docOrRef.class_id && docOrRef.data)
      ? docOrRef : { data: docOrRef };
    const r = await fetch('/api/classes-admin/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(body)
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = {}; }
    if (!r.ok) {
      // Build a rich error and also show raw body
      const err = new Error(data?.detail?.message || data.error || 'validation failed');
      err.detail = data.detail;
      err.raw = text;
      throw err;
    }
    return data;
  },
  async publish(cid, bump = 'patch') {
    const r = await fetch('/api/classes-admin/publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ class_id: cid, bump })
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = {}; }
    if (!r.ok) {
      appendConsole('PUBLISH ERROR (raw)', text);
      throw new Error(data.detail?.message || data.error || 'publish failed');
    }
    return data;
  },
  async yank(cid) {
    const r = await fetch('/api/classes-admin/yank', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ class_id: cid })
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = {}; }
    if (!r.ok) {
      appendConsole('YANK ERROR (raw)', text);
      throw new Error(data.detail?.message || data.error || 'yank failed');
    }
    return data;
  },
};

/* ---------------- State ---------------- */
let currentTab = 'draft';
let currentId = null;
let currentStatus = 'draft';
let currentDoc = null;

/* ---------------- UI helpers ---------------- */
function setMsg(t) { $('msg').textContent = t; }
function setStatus(text) { $('status').textContent = text; }
function setValidation(ok, msg = '') {
  const el = $('valBadge');
  if (ok === null) { el.textContent = '—'; el.className = ''; return; }
  el.textContent = ok ? 'OK' : 'Invalid';
  el.className = ok ? 'status-ok' : 'status-bad';
  if (msg) setMsg(msg);
}

function summarize(row) {
  const when = row.updated_at ? new Date(row.updated_at).toLocaleString() : '';
  return `
    <div class="item ${row.class_id === currentId ? 'active' : ''}" data-id="${row.class_id}" data-status="${row.status}">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div><strong>${row.class_id}</strong> <span class="dim">• ${row.name || ''}</span></div>
        <div class="dim">${row.version || ''}</div>
      </div>
      <div class="dim" style="font-size:11px;margin-top:4px;">${row.status} — ${when}</div>
    </div>`;
}

async function loadList() {
  const rows = await api.list(currentTab);
  const q = $('filter').value.trim().toLowerCase();
  const filtered = rows.filter(r =>
    !q || (r.class_id?.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q))
  );
  $('list').innerHTML = filtered.map(summarize).join('') || '<div class="dim">No classes</div>';
  $('count').textContent = `${filtered.length} shown`;
  for (const el of $('list').querySelectorAll('.item')) {
    el.addEventListener('click', async () => {
      const cid = el.getAttribute('data-id');
      const prefer = el.getAttribute('data-status');
      const d = await api.get(cid, prefer);
      currentId = cid;
      fillEditor(d.status, d.data);
      document.querySelectorAll('.item').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      appendConsole('Load', { class_id: cid, status: d.status });
    });
  }
}

/* ---------------- Form <-> Doc sync ---------------- */
function defaultDoc(cid = '', name = '') {
  return {
    class_id: cid, version: '0.1.0', name, description: `Describe the ${name} class…`,
    tags: [], level_cap: 60, allowed_races: [],
    base_attributes: { str:10, dex:10, int:10, wis:10, con:10, cha:10 },
    per_level_gains: { hp:5, mp:2, stamina:3, stat_points:1 },
    skills: { athletics: { start:2, per_level:1 } },
    abilities: [
      { ability_id:'slash', name:'Slash', unlock_level:1, rank_cap:3, scaling:{ stat:'str', factor:1.1 } }
    ],
    starting_equipment: [ 'leather_jerkin_001', 'rusty_blade_001' ],
    notes: ''
  };
}
function ensureRequiredBlocks(doc) {
  if (!doc.base_attributes) doc.base_attributes = { str:10, dex:10, int:10, wis:10, con:10, cha:10 };
  if (!doc.per_level_gains) doc.per_level_gains = { hp:5, mp:2, stamina:3, stat_points:1 };
  if (!doc.abilities) doc.abilities = [];
  if (!doc.skills) doc.skills = {};
  if (!doc.starting_equipment) doc.starting_equipment = [];
  return doc;
}

function fillEditor(status, docIn) {
  currentStatus = status;
  const doc = ensureRequiredBlocks(structuredClone(docIn));
  currentDoc = doc;

  $('cid').value = doc.class_id || '';
  $('cver').value = doc.version || '0.1.0';
  $('cname').value = doc.name || '';
  $('clevel').value = doc.level_cap ?? 60;
  $('craces').value = (doc.allowed_races || []).join(', ');
  $('ctags').value = (doc.tags || []).join(', ');
  $('cdesc').value = doc.description || '';
  $('cnotes').value = doc.notes || '';

  $('attr_str').value = doc.base_attributes.str ?? 10;
  $('attr_dex').value = doc.base_attributes.dex ?? 10;
  $('attr_int').value = doc.base_attributes.int ?? 10;
  $('attr_wis').value = doc.base_attributes.wis ?? 10;
  $('attr_con').value = doc.base_attributes.con ?? 10;
  $('attr_cha').value = doc.base_attributes.cha ?? 10;

  $('gain_hp').value = doc.per_level_gains.hp ?? 5;
  $('gain_mp').value = doc.per_level_gains.mp ?? 2;
  $('gain_stamina').value = doc.per_level_gains.stamina ?? 3;
  $('gain_stat_points').value = doc.per_level_gains.stat_points ?? 1;

  renderSkills(doc.skills);
  renderAbilities(doc.abilities);
  renderEquipment(doc.starting_equipment);

  $('cjson').value = JSON.stringify(doc, null, 2);

  setStatus(status);
  setValidation(null);
  $('btnYank').disabled = (status !== 'published');
}

function docFromForm() {
  const cid = $('cid').value.trim();
  const out = ensureRequiredBlocks(structuredClone(currentDoc || defaultDoc()));

  out.class_id = cid;
  out.version = $('cver').value.trim() || '0.1.0';
  out.name = $('cname').value.trim();
  out.level_cap = parseInt($('clevel').value || '60', 10);
  out.allowed_races = $('craces').value.split(',').map(s => s.trim()).filter(Boolean);
  out.tags = $('ctags').value.split(',').map(s => s.trim()).filter(Boolean);
  out.description = $('cdesc').value;
  out.notes = $('cnotes').value;

  out.base_attributes = {
    str: parseInt($('attr_str').value || '10', 10),
    dex: parseInt($('attr_dex').value || '10', 10),
    int: parseInt($('attr_int').value || '10', 10),
    wis: parseInt($('attr_wis').value || '10', 10),
    con: parseInt($('attr_con').value || '10', 10),
    cha: parseInt($('attr_cha').value || '10', 10),
  };

  out.per_level_gains = {
    hp: parseInt($('gain_hp').value || '5', 10),
    mp: parseInt($('gain_mp').value || '2', 10),
    stamina: parseInt($('gain_stamina').value || '3', 10),
    stat_points: parseInt($('gain_stat_points').value || '1', 10),
  };

  out.skills = skillsFromTable();
  out.abilities = abilitiesFromTable();
  out.starting_equipment = equipmentFromChips();

  return out;
}

function syncFormToJSON() {
  const doc = docFromForm();
  $('cjson').value = JSON.stringify(doc, null, 2);
  return doc;
}
function syncJSONToForm() {
  try {
    const parsed = JSON.parse($('cjson').value);
    fillEditor(currentStatus, ensureRequiredBlocks(parsed));
    setMsg('Applied JSON to form.');
    appendConsole('Apply JSON → Form', parsed);
  } catch {
    setMsg('Invalid JSON.');
    appendConsole('Apply JSON → Form ERROR', 'Invalid JSON');
  }
}

/* ---------------- Skills editor ---------------- */
function renderSkills(skillsObj) {
  const tbody = $('skillsTable').querySelector('tbody');
  tbody.innerHTML = '';
  const entries = Object.entries(skillsObj || {});
  if (entries.length === 0) entries.push(['athletics', { start: 2, per_level: 1 }]);
  for (const [key, val] of entries) addSkillRow(key, val.start ?? 0, val.per_level ?? 0);
}
function addSkillRow(key = '', start = 0, perLevel = 0) {
  const tbody = $('skillsTable').querySelector('tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="sk_key" placeholder="athletics" value="${key}"></td>
    <td><input class="sk_start" type="number" step="0.1" value="${start}"></td>
    <td><input class="sk_per" type="number" step="0.1" value="${perLevel}"></td>
    <td><button class="btn small ghost sk_del">Remove</button></td>
  `;
  tr.querySelector('.sk_del').addEventListener('click', () => { tr.remove(); syncFormToJSON(); });
  ['sk_key','sk_start','sk_per'].forEach(cls => tr.querySelector(`.${cls}`).addEventListener('input', () => syncFormToJSON()));
  tbody.appendChild(tr);
}
function skillsFromTable() {
  const rows = Array.from($('skillsTable').querySelectorAll('tbody tr'));
  const obj = {};
  for (const tr of rows) {
    const k = tr.querySelector('.sk_key').value.trim();
    if (!k) continue;
    const start = parseFloat(tr.querySelector('.sk_start').value || '0');
    const per = parseFloat(tr.querySelector('.sk_per').value || '0');
    obj[k] = { start, per_level: per };
  }
  return obj;
}

/* ---------------- Abilities editor ---------------- */
const SCALING_STATS = ['str','dex','int','wis','con','cha'];

function renderAbilities(list) {
  const tbody = $('abilitiesTable').querySelector('tbody');
  tbody.innerHTML = '';
  if (!list || list.length === 0) addAbilityRow({ ability_id:'slash', name:'Slash', unlock_level:1, rank_cap:3, scaling:{stat:'str', factor:1.1} });
  else for (const a of list) addAbilityRow(a);
}
function addAbilityRow(a = {}) {
  const tbody = $('abilitiesTable').querySelector('tbody');
  const tr = document.createElement('tr');
  const statOpts = SCALING_STATS.map(s => `<option ${a.scaling?.stat===s?'selected':''}>${s}</option>`).join('');
  tr.innerHTML = `
    <td><input class="ab_id" value="${a.ability_id ?? ''}" placeholder="slash"></td>
    <td><input class="ab_name" value="${a.name ?? ''}" placeholder="Slash"></td>
    <td><input class="ab_unlock" type="number" min="1" value="${a.unlock_level ?? 1}"></td>
    <td><input class="ab_rankcap" type="number" min="1" max="10" value="${a.rank_cap ?? 3}"></td>
    <td><select class="ab_scalestat">${statOpts}</select></td>
    <td><input class="ab_scalefac" type="number" step="0.1" min="0" value="${a.scaling?.factor ?? 1}"></td>
    <td><button class="btn small ghost ab_del">Remove</button></td>
  `;
  tr.querySelector('.ab_del').addEventListener('click', () => { tr.remove(); syncFormToJSON(); });
  ['ab_id','ab_name','ab_unlock','ab_rankcap','ab_scalestat','ab_scalefac'].forEach(cls => {
    tr.querySelector(`.${cls}`).addEventListener('input', () => syncFormToJSON());
  });
  tbody.appendChild(tr);
}
function abilitiesFromTable() {
  const rows = Array.from($('abilitiesTable').querySelectorAll('tbody tr'));
  const out = [];
  for (const tr of rows) {
    const ability_id = tr.querySelector('.ab_id').value.trim();
    const name = tr.querySelector('.ab_name').value.trim();
    if (!ability_id || !name) continue;
    const unlock_level = parseInt(tr.querySelector('.ab_unlock').value || '1', 10);
    const rank_cap = parseInt(tr.querySelector('.ab_rankcap').value || '1', 10);
    const stat = tr.querySelector('.ab_scalestat').value;
    const factor = parseFloat(tr.querySelector('.ab_scalefac').value || '1');
    out.push({ ability_id, name, unlock_level, rank_cap, scaling: { stat, factor } });
  }
  return out;
}

/* ---------------- Equipment chips ---------------- */
function renderEquipment(list) {
  const box = $('equipChips'); box.innerHTML = '';
  (list || []).forEach(id => addEquipChip(id));
}
function addEquipChip(id) {
  if (!id) return;
  const box = $('equipChips');
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.innerHTML = `<span>${id}</span><button title="remove">✕</button>`;
  chip.querySelector('button').addEventListener('click', () => { chip.remove(); syncFormToJSON(); });
  box.appendChild(chip);
}
function equipmentFromChips() {
  return Array.from($('equipChips').querySelectorAll('.chip span')).map(s => s.textContent.trim()).filter(Boolean);
}

/* ---------------- Boot & wiring ---------------- */
let currentPayloadCache = null;

async function boot() {
  try { await api.init(); } catch {}
  await loadList();

  $('tabDrafts').addEventListener('click', async () => {
    currentTab = 'draft';
    $('tabDrafts').classList.remove('ghost'); $('tabPublished').classList.add('ghost');
    await loadList();
  });
  $('tabPublished').addEventListener('click', async () => {
    currentTab = 'published';
    $('tabPublished').classList.remove('ghost'); $('tabDrafts').classList.add('ghost');
    await loadList();
  });
  $('filter').addEventListener('input', loadList);

  $('btnNew').addEventListener('click', async () => {
    const cid = prompt('New class_id (e.g., paladin):'); if (!cid) return;
    const name = prompt('Display name (e.g., Paladin):'); if (!name) return;
    try {
      const out = await api.create({ class_id: cid.trim(), name: name.trim() });
      currentId = cid.trim();
      fillEditor('draft', out.data);
      setMsg('Draft created.');
      appendConsole('Create Draft', out.data);
      await loadList();
    } catch (e) { setMsg(e.message || 'create failed'); }
  });

  $('btnInit').addEventListener('click', async () => {
    try { await api.init(); setMsg('Content folders ready.'); appendConsole('Init', 'OK'); } catch(e){ setMsg('Init failed'); }
  });

  $('btnValidate').addEventListener('click', async () => {
    try {
      const doc = syncFormToJSON();
      currentPayloadCache = doc;
      const res = await api.validate(doc);
      setValidation(true, 'Validation OK');
      appendConsole('Validation OK', { class_id: doc.class_id, version: doc.version });
    } catch (e) {
      setValidation(false);
      const info = e.detail ? {
        message: e.detail.message,
        path: e.detail.path,
        validator: e.detail.validator,
        validator_value: e.detail.validator_value
      } : { message: e.message };
      appendConsole('Validation ERROR', info);
      if (e.raw) appendConsole('Validation RAW', e.raw);
      setMsg(info.message || 'Invalid');
    }
  });

  $('btnSave').addEventListener('click', async () => {
    if (!currentId) { setMsg('Select or create a draft first.'); return; }
    try {
      const doc = syncFormToJSON();
      currentPayloadCache = doc;
      const out = await api.saveDraft(doc.class_id, doc);
      fillEditor(out.status, out.data);
      setMsg('Saved.');
      appendConsole('Save Draft', { class_id: doc.class_id, version: doc.version });
    } catch (e) {
      appendConsole('Save ERROR', e.message || 'Save failed');
      setMsg(e.message || 'Save failed');
    }
  });

  $('btnPublish').addEventListener('click', async () => {
    if (!currentId) { setMsg('Select a draft first.'); return; }
    try {
      const b = $('bump').value || 'patch';
      const out = await api.publish(currentId, b);
      fillEditor(out.status, out.data);
      setMsg('Published.');
      appendConsole('Publish', { class_id: currentId, bump: b, version: out.data?.version });
      currentTab = 'published';
      $('tabPublished').classList.remove('ghost'); $('tabDrafts').classList.add('ghost');
      await loadList();
    } catch (e) {
      appendConsole('Publish ERROR', e.message || 'Publish failed');
      setMsg(e.message || 'Publish failed');
    }
  });

  $('btnYank').addEventListener('click', async () => {
    if (!currentId) return;
    try {
      await api.yank(currentId);
      setMsg('Moved back to drafts.');
      appendConsole('Yank', { class_id: currentId });
      currentTab = 'draft';
      $('tabDrafts').classList.remove('ghost'); $('tabPublished').classList.add('ghost');
      await loadList();
      const d = await api.get(currentId, 'draft');
      fillEditor(d.status, d.data);
    } catch (e) {
      appendConsole('Yank ERROR', e.message || 'Yank failed');
      setMsg(e.message || 'Yank failed');
    }
  });

  // JSON sync buttons
  $('btnToJSON').addEventListener('click', () => { const doc = syncFormToJSON(); appendConsole('Form → JSON', { class_id: doc.class_id }); setMsg('Form → JSON'); });
  $('btnFromJSON').addEventListener('click', () => { syncJSONToForm(); });


  // skills/abilities/equipment adders
  $('btnAddSkill').addEventListener('click', () => { addSkillRow('', 0, 0); syncFormToJSON(); });
  $('btnAddAbility').addEventListener('click', () => {
    addAbilityRow({ ability_id:'', name:'', unlock_level:1, rank_cap:1, scaling:{ stat:'str', factor:1 }});
    syncFormToJSON();
  });
  $('btnAddEquip').addEventListener('click', () => {
    const v = $('equipInput').value.trim();
    if (v) { addEquipChip(v); $('equipInput').value=''; syncFormToJSON(); }
  });
}

boot();
