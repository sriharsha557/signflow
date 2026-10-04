import { api, esc, icon, toast, FIELD_TYPES, renderPdf, confirmBox } from './common.js';
import { complianceEditor } from './compliance-ui.js';

const COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4d7c0f'];

/**
 * Field-placement editor shared by documents and templates.
 * mode: 'document' | 'template'
 */
export async function openEditor(root, { mode, id, navigate }) {
  const isDoc = mode === 'document';
  const data = await api(isDoc ? `/api/documents/${id}` : `/api/templates/${id}`);
  if (isDoc && data.status !== 'draft') return navigate(`#/documents/${id}`);

  const S = {
    meta: isDoc
      ? { title: data.title, message: data.message || '', sequential: !!data.sequential, expiry_days: data.expiry_days || 15 }
      : { name: data.name, description: data.description || '', category: data.category || 'General', message: data.message || '', sequential: !!data.sequential },
    assignees: (isDoc ? data.recipients : data.roles).map((r, i) => ({ name: r.name, email: r.email || '', role: r.role, order_index: r.order_index ?? i, color: r.color || COLORS[i % COLORS.length], _id: r.id })),
    fields: [],
    active: 0,
    sel: null,
    armed: null,
    dirty: false,
  };
  S.fields = data.fields.map((f) => ({
    type: f.type, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, required: !!f.required, label: f.label || '',
    assignee: isDoc ? S.assignees.findIndex((a) => a._id === f.recipient_id) : f.role_index,
  })).filter((f) => f.assignee >= 0);
  if (!S.assignees.length) S.assignees.push(blankAssignee(0));

  function blankAssignee(i) {
    return { name: isDoc ? '' : `Signer ${i + 1}`, email: '', role: 'signer', order_index: i, color: COLORS[i % COLORS.length] };
  }

  root.innerHTML = `
  <div class="editor">
    <aside class="side left">
      <div class="ebar">
        <a class="btn ghost sm" href="${isDoc ? '#/documents' : '#/templates'}" title="Back">${icon('back')}</a>
        <input type="text" id="e-title" value="${esc(isDoc ? S.meta.title : S.meta.name)}" placeholder="${isDoc ? 'Document title' : 'Template name'}" style="height:34px;font-weight:650">
      </div>
      <div class="sec">
        <h3>${icon('users')} ${isDoc ? 'Recipients' : 'Roles'}</h3>
        <label class="check small" style="margin-bottom:10px"><input type="checkbox" id="e-seq" ${S.meta.sequential ? 'checked' : ''}> Set signing order</label>
        <div id="e-recips"></div>
        <button class="btn sm block" id="e-add">${icon('plus')} Add ${isDoc ? 'recipient' : 'role'}</button>
      </div>
      <div class="sec">
        <h3>${icon('pen')} Fields</h3>
        <div class="small muted" style="margin-bottom:8px">Placing fields for:</div>
        <div class="assignee-pick" id="e-pick"></div>
        <div class="palette" id="e-palette"></div>
        <p class="small muted" style="margin:10px 0 0">Drag a field onto the page, or click it and then click where it should go.</p>
      </div>
      ${isDoc ? '<div class="sec stack" id="e-comp"></div>' : ''}
      <div class="sec stack">
        <h3>${icon('mail')} ${isDoc ? 'Message & expiry' : 'Template details'}</h3>
        ${isDoc ? '' : `
          <label class="field"><span>Category</span><input type="text" id="e-cat" value="${esc(S.meta.category)}"></label>
          <label class="field"><span>Description</span><textarea id="e-desc" style="min-height:60px">${esc(S.meta.description)}</textarea></label>`}
        <label class="field"><span>Message to recipients</span><textarea id="e-msg" placeholder="Optional note included in the email">${esc(S.meta.message)}</textarea></label>
        ${isDoc ? `<label class="field"><span>Expires after (days)</span><input type="number" min="1" max="365" id="e-exp" value="${S.meta.expiry_days}"></label>` : ''}
      </div>
    </aside>
    <main class="canvas" id="e-canvas">
      <div class="ebar">
        <span class="small muted" id="e-hint">${data.fields.length ? '' : 'Add recipients, then place a signature field for each signer.'}</span>
        <span class="spacer"></span>
        <button class="btn" id="e-save">${icon('save')} Save</button>
        ${isDoc ? `<button class="btn primary" id="e-send">${icon('send')} Send for signature</button>` : `<button class="btn primary" id="e-done">${icon('check')} Save & close</button>`}
      </div>
      <div class="pages" id="e-pages"><div class="empty">Loading document…</div></div>
    </main>
    <aside class="side right" id="e-props"></aside>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const pagesEl = $('#e-pages');
  const editorEl = root.querySelector('.editor');
  let pages = [];

  // ---------- recipients ----------
  function renderRecipients() {
    const box = $('#e-recips');
    box.innerHTML = S.assignees.map((a, i) => `
      <div class="recip ${i === S.active ? 'active' : ''}" style="--c:${a.color}" data-i="${i}">
        <div class="head" data-act="activate">
          <span class="num">${S.meta.sequential ? a.order_index + 1 : i + 1}</span>
          <strong class="small" style="flex:1">${esc(a.name || (isDoc ? 'New recipient' : 'Role'))}</strong>
          <span class="small muted">${S.fields.filter((f) => f.assignee === i).length} fields</span>
          ${S.assignees.length > 1 ? `<button class="btn ghost sm" data-act="del" title="Remove">${icon('x')}</button>` : ''}
        </div>
        <input type="text" data-k="name" placeholder="${isDoc ? 'Full name' : 'Role name (e.g. Client)'}" value="${esc(a.name)}">
        ${isDoc ? `<input type="email" data-k="email" placeholder="Email address" value="${esc(a.email)}">` : ''}
        <div class="row">
          <select data-k="role">
            <option value="signer" ${a.role === 'signer' ? 'selected' : ''}>Needs to sign</option>
            <option value="approver" ${a.role === 'approver' ? 'selected' : ''}>Needs to approve</option>
            <option value="viewer" ${a.role === 'viewer' ? 'selected' : ''}>Receives a copy</option>
          </select>
          ${S.meta.sequential ? `<input type="number" min="1" data-k="order_index" value="${a.order_index + 1}" style="width:64px" title="Signing order">` : ''}
        </div>
      </div>`).join('');
    renderPick();
  }
  $('#e-recips').addEventListener('input', (e) => {
    const card = e.target.closest('.recip'); if (!card) return;
    const a = S.assignees[card.dataset.i];
    const k = e.target.dataset.k;
    if (k === 'order_index') a.order_index = Math.max(0, Number(e.target.value) - 1);
    else a[k] = e.target.value;
    S.dirty = true;
    if (k === 'name') { card.querySelector('.head strong').textContent = a.name || 'New recipient'; renderPick(); renderFields(); }
  });
  $('#e-recips').addEventListener('change', (e) => { if (e.target.dataset.k === 'role') { renderPick(); renderPalette(); } });
  $('#e-recips').addEventListener('click', async (e) => {
    const card = e.target.closest('.recip'); if (!card) return;
    const i = Number(card.dataset.i);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'del') {
      if (S.fields.some((f) => f.assignee === i) && !(await confirmBox('Remove recipient?', 'Their fields will be removed too.', 'Remove', true))) return;
      S.assignees.splice(i, 1);
      S.fields = S.fields.filter((f) => f.assignee !== i).map((f) => ({ ...f, assignee: f.assignee > i ? f.assignee - 1 : f.assignee }));
      S.active = Math.min(S.active, S.assignees.length - 1); S.sel = null; S.dirty = true;
      renderAll();
    } else if (act === 'activate') { S.active = i; renderRecipients(); renderPalette(); }
  });
  $('#e-add').onclick = () => {
    const i = S.assignees.length;
    const used = new Set(S.assignees.map((a) => a.color));
    const a = blankAssignee(i);
    a.color = COLORS.find((c) => !used.has(c)) || a.color;
    a.order_index = S.assignees.length ? Math.max(...S.assignees.map((x) => x.order_index)) + 1 : 0;
    S.assignees.push(a); S.active = i; S.dirty = true;
    renderRecipients(); renderPalette();
    $('#e-recips').lastElementChild.querySelector('input').focus();
  };
  $('#e-seq').onchange = (e) => { S.meta.sequential = e.target.checked; S.dirty = true; renderRecipients(); };

  function renderPick() {
    $('#e-pick').innerHTML = S.assignees.map((a, i) => `<button class="${i === S.active ? 'on' : ''}" style="--c:${a.color}" data-i="${i}"><i></i>${esc(a.name || `Recipient ${i + 1}`)}</button>`).join('');
  }
  $('#e-pick').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.active = Number(b.dataset.i); renderRecipients(); renderPalette(); };

  // ---------- palette ----------
  function renderPalette() {
    const a = S.assignees[S.active];
    const pal = $('#e-palette');
    if (a.role === 'viewer') { pal.innerHTML = '<p class="small muted" style="grid-column:1/-1;margin:0">This person only receives a copy, so they have no fields.</p>'; return; }
    pal.innerHTML = Object.entries(FIELD_TYPES).map(([k, t]) => `<div class="pal ${S.armed === k ? 'armed' : ''}" data-type="${k}" style="--c:${a.color}">${icon(t.icon)}${t.label}</div>`).join('');
  }

  let drag = null;
  $('#e-palette').addEventListener('pointerdown', (e) => {
    const p = e.target.closest('.pal'); if (!p) return;
    e.preventDefault();
    drag = { kind: 'new', type: p.dataset.type, sx: e.clientX, sy: e.clientY, moved: false, ghost: null };
  });

  function placeField(type, layer, cx, cy) {
    const pg = pages[Number(layer.dataset.page) - 1];
    const def = FIELD_TYPES[type];
    const r = layer.getBoundingClientRect();
    const w = def.w / pg.wPt, h = def.h / pg.hPt;
    const x = clamp((cx - r.left) / r.width - w / 2, 0, 1 - w);
    const y = clamp((cy - r.top) / r.height - h / 2, 0, 1 - h);
    S.fields.push({ type, page: pg.num, x, y, w, h, required: type !== 'checkbox', label: '', assignee: S.active });
    S.sel = S.fields.length - 1; S.dirty = true;
    renderFields(); renderProps(); renderRecipients();
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const layerAt = (x, y) => document.elementsFromPoint(x, y).find((el) => el.classList?.contains('layer'));

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  function onMove(e) {
    if (!drag) return;
    if (drag.kind === 'new') {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
      drag.moved = true;
      if (!drag.ghost) {
        drag.ghost = document.createElement('div');
        drag.ghost.className = 'fld';
        const a = S.assignees[S.active];
        drag.ghost.style.cssText = `--c:${a.color};position:fixed;pointer-events:none;z-index:999;width:${FIELD_TYPES[drag.type].w}px;height:${FIELD_TYPES[drag.type].h}px`;
        drag.ghost.innerHTML = `<span class="lbl">${icon(FIELD_TYPES[drag.type].icon)}${FIELD_TYPES[drag.type].label}</span>`;
        document.body.appendChild(drag.ghost);
      }
      drag.ghost.style.left = e.clientX - drag.ghost.offsetWidth / 2 + 'px';
      drag.ghost.style.top = e.clientY - drag.ghost.offsetHeight / 2 + 'px';
    } else {
      const f = S.fields[drag.idx];
      const r = drag.layer.getBoundingClientRect();
      const dx = (e.clientX - drag.sx) / r.width, dy = (e.clientY - drag.sy) / r.height;
      if (drag.kind === 'move') {
        f.x = clamp(drag.ox + dx, 0, 1 - f.w); f.y = clamp(drag.oy + dy, 0, 1 - f.h);
      } else {
        f.w = clamp(drag.ow + dx, 0.015, 1 - f.x); f.h = clamp(drag.oh + dy, 0.012, 1 - f.y);
      }
      drag.el.style.left = f.x * 100 + '%'; drag.el.style.top = f.y * 100 + '%';
      drag.el.style.width = f.w * 100 + '%'; drag.el.style.height = f.h * 100 + '%';
      S.dirty = true;
    }
  }
  function onUp(e) {
    if (!drag) return;
    if (drag.kind === 'new') {
      drag.ghost?.remove();
      if (drag.moved) { const layer = layerAt(e.clientX, e.clientY); if (layer) placeField(drag.type, layer, e.clientX, e.clientY); }
      else { S.armed = S.armed === drag.type ? null : drag.type; editorEl.classList.toggle('placing', !!S.armed); $('#e-hint').textContent = S.armed ? `Click on the page to place "${FIELD_TYPES[S.armed].label}" (Esc to cancel)` : ''; renderPalette(); }
    }
    drag = null;
  }

  pagesEl.addEventListener('pointerdown', (e) => {
    const fe = e.target.closest('.fld');
    if (fe) {
      e.preventDefault();
      const idx = Number(fe.dataset.idx);
      const f = S.fields[idx];
      if (S.sel !== idx) { S.sel = idx; S.active = f.assignee; root.querySelectorAll('.fld.sel').forEach((x) => x.classList.remove('sel')); fe.classList.add('sel'); renderProps(); renderRecipients(); renderPalette(); }
      drag = { kind: e.target.classList.contains('rz') ? 'resize' : 'move', idx, el: fe, layer: fe.parentElement, sx: e.clientX, sy: e.clientY, ox: f.x, oy: f.y, ow: f.w, oh: f.h };
      return;
    }
    const layer = e.target.closest('.layer');
    if (layer && S.armed) { placeField(S.armed, layer, e.clientX, e.clientY); return; }
    if (layer && S.sel !== null) { S.sel = null; renderFields(); renderProps(); }
  });

  const onKey = (e) => {
    if (!document.body.contains(root.querySelector('.editor'))) return document.removeEventListener('keydown', onKey);
    if (e.key === 'Escape') { S.armed = null; editorEl.classList.remove('placing'); $('#e-hint').textContent = ''; renderPalette(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel !== null && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { removeSel(); }
  };
  document.addEventListener('keydown', onKey);

  function removeSel() {
    S.fields.splice(S.sel, 1); S.sel = null; S.dirty = true;
    renderFields(); renderProps(); renderRecipients();
  }

  // ---------- fields ----------
  function renderFields() {
    root.querySelectorAll('.layer').forEach((l) => (l.innerHTML = ''));
    S.fields.forEach((f, i) => {
      const layer = root.querySelector(`.layer[data-page="${f.page}"]`);
      if (!layer) return;
      const a = S.assignees[f.assignee];
      const el = document.createElement('div');
      el.className = 'fld' + (S.sel === i ? ' sel' : '');
      el.dataset.idx = i;
      el.style.cssText = `--c:${a.color};left:${f.x * 100}%;top:${f.y * 100}%;width:${f.w * 100}%;height:${f.h * 100}%`;
      el.title = `${FIELD_TYPES[f.type].label} — ${a.name || 'recipient'}`;
      el.innerHTML = `<span class="lbl">${icon(FIELD_TYPES[f.type].icon)}${f.type === 'checkbox' ? '' : esc(f.label || FIELD_TYPES[f.type].label)}</span>${f.required ? '<span class="req">*</span>' : ''}<span class="rz"></span>`;
      layer.appendChild(el);
    });
  }

  function renderProps() {
    const box = $('#e-props');
    editorEl.classList.toggle('has-sel', S.sel !== null);
    if (S.sel === null) {
      const counts = S.assignees.map((a, i) => `<div class="row small" style="margin:6px 0"><span class="num" style="width:10px;height:10px;border-radius:50%;background:${a.color}"></span>${esc(a.name || 'Recipient ' + (i + 1))}<span class="spacer"></span>${S.fields.filter((f) => f.assignee === i).length}</div>`).join('');
      box.innerHTML = `<div class="sec"><h3>Field properties</h3><p class="small muted">Select a field on the page to edit it.</p></div><div class="sec"><h3>Fields per ${isDoc ? 'recipient' : 'role'}</h3>${counts}</div>
        <div class="sec small muted">Tips:<br>• Drag fields to move, drag the corner to resize.<br>• Press Delete to remove the selected field.<br>• Date fields are filled automatically when signed.</div>`;
      return;
    }
    const f = S.fields[S.sel];
    box.innerHTML = `<div class="sec stack">
      <div class="row"><h3 style="margin:0">${icon(FIELD_TYPES[f.type].icon)} ${FIELD_TYPES[f.type].label}</h3><span class="spacer"></span><button class="btn ghost sm" id="p-close">${icon('x')}</button></div>
      <label class="field"><span>Assigned to</span><select id="p-as">${S.assignees.map((a, i) => a.role === 'viewer' ? '' : `<option value="${i}" ${i === f.assignee ? 'selected' : ''}>${esc(a.name || 'Recipient ' + (i + 1))}</option>`).join('')}</select></label>
      ${['text', 'company', 'title', 'checkbox'].includes(f.type) ? `<label class="field"><span>Label / placeholder</span><input type="text" id="p-label" value="${esc(f.label)}" placeholder="${FIELD_TYPES[f.type].label}"></label>` : ''}
      ${f.type === 'date' ? '' : `<label class="check"><input type="checkbox" id="p-req" ${f.required ? 'checked' : ''}> Required</label>`}
      <div class="small muted">Page ${f.page}</div>
      <div class="row"><button class="btn sm" id="p-dup">${icon('copy')} Duplicate</button><button class="btn sm danger" id="p-del">${icon('trash')} Delete</button></div>
    </div>`;
    box.querySelector('#p-close').onclick = () => { S.sel = null; renderFields(); renderProps(); };
    box.querySelector('#p-as').onchange = (e) => { f.assignee = Number(e.target.value); S.dirty = true; renderFields(); renderRecipients(); };
    box.querySelector('#p-label')?.addEventListener('input', (e) => { f.label = e.target.value; S.dirty = true; renderFields(); });
    box.querySelector('#p-req')?.addEventListener('change', (e) => { f.required = e.target.checked; S.dirty = true; renderFields(); });
    box.querySelector('#p-del').onclick = removeSel;
    box.querySelector('#p-dup').onclick = () => { S.fields.push({ ...f, y: Math.min(1 - f.h, f.y + f.h + 0.01) }); S.sel = S.fields.length - 1; S.dirty = true; renderFields(); renderProps(); renderRecipients(); };
  }

  function renderAll() { renderRecipients(); renderPalette(); renderFields(); renderProps(); }

  // ---------- meta + save ----------
  $('#e-title').oninput = (e) => { S.meta[isDoc ? 'title' : 'name'] = e.target.value; S.dirty = true; };
  $('#e-msg').oninput = (e) => { S.meta.message = e.target.value; S.dirty = true; };
  $('#e-exp')?.addEventListener('input', (e) => { S.meta.expiry_days = Number(e.target.value); S.dirty = true; });
  $('#e-cat')?.addEventListener('input', (e) => { S.meta.category = e.target.value; S.dirty = true; });
  $('#e-desc')?.addEventListener('input', (e) => { S.meta.description = e.target.value; S.dirty = true; });

  async function save(quiet) {
    const body = { ...S.meta, fields: S.fields };
    if (isDoc) Object.assign(body, { recipients: S.assignees, jurisdictions: S.comp.jurisdictions, category: S.comp.category, value_band: S.comp.value_band, controls: S.comp.controls, access_code: S.comp.access_code || '' });
    if (isDoc) body.recipients = S.assignees; else body.roles = S.assignees;
    await api(isDoc ? `/api/documents/${id}` : `/api/templates/${id}`, { method: 'PUT', body });
    S.dirty = false;
    if (!quiet) toast('Saved');
  }
  $('#e-save').onclick = () => save().catch((e) => toast(e.message, true));
  $('#e-done')?.addEventListener('click', async () => { try { await save(true); toast('Template saved'); navigate('#/templates'); } catch (e) { toast(e.message, true); } });
  $('#e-send')?.addEventListener('click', async () => {
    for (const [i, a] of S.assignees.entries()) {
      if (!a.name.trim() || !/^\S+@\S+\.\S+$/.test(a.email)) { S.active = i; renderRecipients(); return toast(`Enter a name and valid email for recipient ${i + 1}`, true); }
      if (a.role === 'signer' && !S.fields.some((f) => f.assignee === i && f.type === 'signature')) { S.active = i; renderAll(); return toast(`Place a signature field for ${a.name}`, true); }
    }
    const a = S.comp.assessment;
    if (a?.blocked) return toast(`Can't send: ${a.reasons.join(' ')}`, true);
    if (a && !a.canSend) return toast(`Add the required checks first: ${a.missingControls.join(', ')}`, true);
    if (S.comp.controls.includes('access_code') && !S.comp.has_access_code && !(S.comp.access_code || '').trim()) return toast('Type the access code you will share with recipients', true);
    const ok = await confirmBox('Send for signature?', `${S.assignees.length} recipient(s) will be emailed${S.meta.sequential ? ' one after another in the order you set' : ' at the same time'}.`, 'Send now');
    if (!ok) return;
    const btn = $('#e-send'); btn.disabled = true;
    try { await save(true); await api(`/api/documents/${id}/send`, { method: 'POST' }); toast('Sent for signature'); navigate(`#/documents/${id}`); }
    catch (e) { toast(e.message, true); btn.disabled = false; }
  });
  window.onbeforeunload = () => (S.dirty ? true : undefined);
  window.__pageCleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.removeEventListener('keydown', onKey);
    window.onbeforeunload = null;
  };
  window.__isDirty = () => S.dirty;
  if (isDoc) {
    S.comp = { jurisdictions: data.jurisdictions || [], category: data.category || 'commercial', value_band: data.value_band || 'lt10k', controls: data.controls || ['email'], has_access_code: data.has_access_code, access_code: '' };
    const paintSendState = () => {
      const a = S.comp.assessment; const btn = $('#e-send');
      btn.classList.toggle('blocked', !!(a && (!a.canSend)));
      btn.title = a?.blocked ? 'This document type cannot be e-signed in the selected jurisdiction' : a && !a.canSend ? 'Add the required signer checks first' : '';
    };
    complianceEditor($('#e-comp'), S.comp, (st, quiet) => { S.dirty = true; if (!quiet) paintSendState(); });
    paintSendState();
  }

  renderAll();
  pages = await renderPdf(isDoc ? `/api/documents/${id}/file` : `/api/templates/${id}/file`, pagesEl, { maxWidth: 860 });
  renderFields();
}
