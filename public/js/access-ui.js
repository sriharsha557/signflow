// Users & access: users, roles & permissions, workspace security policy, activity log; My account security.
import { api, esc, icon, toast, modal, fmtDate, timeAgo, confirmBox } from './common.js';

export const hasPerm = (me, p) => (me?.permissions || []).includes(p);
const ACTION_LABEL = {
  'login.success': 'Signed in', 'login.failed': 'Failed sign-in', 'login.locked': 'Account locked', 'login.blocked': 'Sign-in blocked', 'mfa.failed': 'Failed 2FA code',
  'mfa.enabled': '2FA turned on', 'mfa.disabled': '2FA turned off', 'mfa.recovery_regenerated': 'New recovery codes', 'password.changed': 'Password changed', 'password.set': 'Password set',
  'session.revoked': 'Session signed out', 'user.invited': 'User invited', 'user.role_changed': 'Role changed', 'user.disabled': 'User disabled', 'user.enabled': 'User enabled',
  'user.signed_out': 'User signed out', 'user.password_reset': 'Password reset', 'user.mfa_reset': '2FA reset', 'user.removed': 'User removed', 'role.created': 'Role created',
  'role.updated': 'Role updated', 'role.deleted': 'Role deleted', 'policy.updated': 'Security policy changed', 'access.blocked_ip': 'Blocked by IP allowlist',
  'audit.exported': 'Activity log exported', 'document.downloaded': 'Document downloaded', 'document.deleted': 'Document deleted', 'account.created': 'Workspace created',
};
const RISKY = /failed|locked|blocked|disabled|removed|deleted|reset|mfa.disabled/;
const statusBadge = (s) => `<span class="badge ${s === 'active' ? 'b-completed' : s === 'invited' ? 'b-in_progress' : 'b-declined'}">${esc({ active: 'Active', invited: 'Invited', disabled: 'Disabled' }[s] || s)}</span>`;

function linkModal(title, text, link) {
  const m = modal(`<div class="mh"><h2>${esc(title)}</h2></div><div class="mb stack"><p class="muted" style="margin:0">${esc(text)}</p>
    <div class="row"><input type="text" id="lnk" readonly value="${esc(link)}"><button class="btn" id="cp">${icon('copy')} Copy</button></div>
    <p class="small muted" style="margin:0">The link works once and expires in 72 hours. Share it only with this person.</p></div><div class="mf"><button class="btn primary" data-close>Done</button></div>`);
  m.el.querySelector('#cp').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { m.el.querySelector('#lnk').select(); } };
}

// ================================================================ Users & access page
export async function accessPage(main, me, tab = 'users') {
  const tabs = [['users', 'Users', 'team.view'], ['roles', 'Roles & permissions', 'team.view'], ['security', 'Security policy', 'security.manage'], ['activity', 'Activity log', 'audit.view']].filter(([, , p]) => hasPerm(me, p));
  if (!tabs.some(([k]) => k === tab)) tab = tabs[0]?.[0];
  main.innerHTML = `<div class="topbar"><div><h1>Users & access</h1><p class="muted" style="margin:4px 0 0">Who can sign in, what each role can do, and how the workspace is protected.</p></div></div>
    <div class="content"><div class="tabs">${tabs.map(([k, l]) => `<a href="#/access/${k}" class="${tab === k ? 'active' : ''}">${l}</a>`).join('')}</div><div id="ap"></div></div>`;
  const box = main.querySelector('#ap');
  if (tab === 'users') return usersTab(box, me);
  if (tab === 'roles') return rolesTab(box, me);
  if (tab === 'security') return policyTab(box, me);
  if (tab === 'activity') return activityTab(box);
}

async function usersTab(box, me) {
  const [users, { roles }] = await Promise.all([api('/api/org/users'), api('/api/org/roles')]);
  const manage = hasPerm(me, 'team.manage');
  const assignable = roles.filter((r) => r.key !== 'owner');
  box.innerHTML = `<div class="stack" style="gap:16px">
    <div class="row wrap"><input type="text" id="uq" placeholder="Search name or email" style="max-width:280px"><span class="spacer"></span>${manage ? `<button class="btn primary" id="add">${icon('plus')} Invite user</button>` : ''}</div>
    <div class="card" style="overflow-x:auto"><table class="tbl"><thead><tr><th>User</th><th>Role</th><th>Status</th><th class="hide-m">2FA</th><th class="hide-m">Last sign-in</th>${manage ? '<th></th>' : ''}</tr></thead><tbody id="ub"></tbody></table></div></div>`;
  const draw = (q = '') => {
    box.querySelector('#ub').innerHTML = users.filter((u) => (u.name + u.email).toLowerCase().includes(q.toLowerCase())).map((u) => `<tr style="cursor:default">
      <td><b>${esc(u.name)}</b>${u.id === me.id ? ' <span class="chip">you</span>' : ''}<div class="small muted">${esc(u.email)}</div></td>
      <td>${manage && u.role.key !== 'owner' && u.id !== me.id ? `<select data-role="${u.id}" style="height:32px;width:auto">${assignable.map((r) => `<option value="${r.id}" ${r.id === u.role.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>` : `<span class="chip">${esc(u.role.name)}</span>`}</td>
      <td>${statusBadge(u.status)}</td>
      <td class="hide-m">${u.totp_enabled ? `<span style="color:#15803d">${icon('check')}</span>` : '<span class="small muted">Off</span>'}</td>
      <td class="hide-m small">${u.last_login_at ? `${timeAgo(u.last_login_at)}<div class="muted">${esc(u.last_login_ip || '')}</div>` : '<span class="muted">Never</span>'}</td>
      ${manage ? `<td>${u.role.key === 'owner' || u.id === me.id ? '' : `<button class="btn sm" data-menu="${u.id}">Manage</button>`}</td>` : ''}</tr>`).join('');
    box.querySelectorAll('[data-role]').forEach((sel) => (sel.onchange = async () => {
      const u = users.find((x) => x.id === Number(sel.dataset.role));
      const r = roles.find((x) => x.id === Number(sel.value));
      if (!(await confirmBox('Change role?', `${u.name} becomes ${r.name} and is signed out so the new permissions apply.`, 'Change role'))) { sel.value = u.role.id; return; }
      try { await api(`/api/org/users/${u.id}`, { method: 'PUT', body: { role_id: r.id } }); toast(`${u.name} is now ${r.name}`); usersTab(box, me); } catch (e) { toast(e.message, true); sel.value = u.role.id; }
    }));
    box.querySelectorAll('[data-menu]').forEach((b) => (b.onclick = () => userMenu(users.find((u) => u.id === Number(b.dataset.menu)))));
  };
  draw();
  box.querySelector('#uq').oninput = (e) => draw(e.target.value);
  box.querySelector('#add')?.addEventListener('click', () => {
    const m = modal(`<div class="mh"><h2>Invite a user</h2></div><form class="mb stack" id="f">
      <label class="field"><span>Full name</span><input type="text" name="name" required></label>
      <label class="field"><span>Work email</span><input type="email" name="email" required></label>
      <label class="field"><span>Role</span><select name="role_id">${assignable.map((r) => `<option value="${r.id}" ${r.key === 'member' ? 'selected' : ''}>${esc(r.name)} — ${esc(r.description || '')}</option>`).join('')}</select></label>
      <p class="small muted" style="margin:0">They get an email with a one-time link to set their own password. No passwords are shared.</p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Send invitation</button></div></form>`);
    m.el.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await api('/api/org/users', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); m.close(); linkModal('Invitation sent', `We emailed ${r.user.email}. You can also share this link with them directly:`, r.invite_link); usersTab(box, me); }
      catch (err) { if (!err.upgrade) toast(err.message, true); }
    };
  });
  function userMenu(u) {
    const acts = [
      u.status === 'invited' ? ['resend-invite', 'Resend invitation', 'mail', 'Creates a fresh 72-hour link.'] : null,
      u.status === 'disabled' ? ['enable', 'Enable account', 'check', 'They can sign in again.'] : ['disable', 'Disable account', 'x', 'Signs them out everywhere and blocks sign-in. Their documents are kept.'],
      ['signout', 'Sign out everywhere', 'logout', 'Ends all of their sessions.'],
      ['reset-password', 'Reset password', 'shield', 'Signs them out and emails a link to set a new password.'],
      u.totp_enabled ? ['reset-2fa', 'Reset two-factor', 'shield', 'For a lost phone. They set up 2FA again at next sign-in if required.'] : null,
      ['remove', 'Delete user', 'trash', u.documents ? `Not available: they own ${u.documents} document(s). Disable instead.` : 'Permanently removes the account.'],
    ].filter(Boolean);
    const m = modal(`<div class="mh"><div><h2>${esc(u.name)}</h2><div class="small muted">${esc(u.email)} · ${esc(u.role.name)}</div></div></div><div class="mb stack" style="gap:8px">
      ${acts.map(([k, l, ic, d]) => `<button class="btn" style="justify-content:flex-start;height:auto;padding:10px 12px;text-align:left" data-a="${k}" ${k === 'remove' && u.documents ? 'disabled' : ''}>${icon(ic)}<span><b>${l}</b><br><span class="small muted" style="font-weight:400">${esc(d)}</span></span></button>`).join('')}</div>
      <div class="mf"><button class="btn" data-close>Close</button></div>`);
    m.el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
      const a = b.dataset.a;
      if (['disable', 'remove', 'reset-2fa', 'reset-password'].includes(a) && !(await confirmBox(b.querySelector('b').textContent + '?', `This affects ${u.name}.`, 'Continue', a !== 'reset-password'))) return;
      try {
        const r = a === 'remove' ? await api(`/api/org/users/${u.id}`, { method: 'DELETE' }) : await api(`/api/org/users/${u.id}/${a}`, { method: 'POST' });
        m.close();
        if (r.invite_link) linkModal(a === 'reset-password' ? 'Reset link sent' : 'Invitation re-sent', `We emailed ${u.email}. You can also share this link:`, r.invite_link); else toast('Done');
        usersTab(box, me);
      } catch (e) { toast(e.message, true); }
    }));
  }
}

async function rolesTab(box, me) {
  const { roles, permissions, mine, isOwner } = await api('/api/org/roles');
  const manage = hasPerm(me, 'roles.manage');
  const groups = [...new Set(Object.values(permissions).map((p) => p.group))];
  box.innerHTML = `<div class="stack" style="gap:16px">
    <div class="row wrap"><p class="muted" style="margin:0;flex:1">Built-in roles cover most teams. Create a custom role when you need a different mix. You can only grant permissions you have yourself.</p>${manage ? `<button class="btn primary" id="nr">${icon('plus')} New role</button>` : ''}</div>
    <div class="card" style="overflow-x:auto"><table class="tbl matrix"><thead><tr><th style="min-width:220px">Permission</th>${roles.map((r) => `<th style="text-align:center">${esc(r.name)}<div class="small muted" style="text-transform:none;letter-spacing:0;font-weight:500">${r.users} user${r.users === 1 ? '' : 's'}${r.system ? '' : ' · custom'}</div></th>`).join('')}</tr></thead>
    <tbody>${groups.map((g) => `<tr class="grp"><td colspan="${roles.length + 1}">${esc(g)}</td></tr>${Object.entries(permissions).filter(([, p]) => p.group === g).map(([k, p]) => `<tr style="cursor:default"><td><b class="small">${esc(p.label)}</b><div class="small muted">${esc(p.hint)}</div></td>
      ${roles.map((r) => `<td style="text-align:center">${r.permissions.includes(k) ? `<span class="tick">${icon('check')}</span>` : '<span class="muted">–</span>'}</td>`).join('')}</tr>`).join('')}`).join('')}
    <tr style="cursor:default"><td></td>${roles.map((r) => `<td style="text-align:center">${!r.system && manage ? `<button class="btn sm" data-edit="${r.id}">Edit</button>` : r.system ? '<span class="small muted">Built-in</span>' : ''}</td>`).join('')}</tr></tbody></table></div></div>`;
  const editor = (role) => {
    const m = modal(`<div class="mh"><h2>${role ? `Edit ${esc(role.name)}` : 'New role'}</h2></div><form class="mb stack" id="rf">
      <label class="field"><span>Role name</span><input type="text" name="name" value="${esc(role?.name || '')}" required maxlength="40"></label>
      <label class="field"><span>Description</span><input type="text" name="description" value="${esc(role?.description || '')}" maxlength="160"></label>
      ${groups.map((g) => `<div><div class="small muted" style="font-weight:700;margin-bottom:6px">${esc(g)}</div>${Object.entries(permissions).filter(([, p]) => p.group === g).map(([k, p]) => { const can = isOwner || mine.includes(k);
        return `<label class="check" style="align-items:flex-start;margin:0 0 6px;${can ? '' : 'opacity:.5'}"><input type="checkbox" name="p" value="${k}" ${role?.permissions.includes(k) ? 'checked' : ''} ${can ? '' : 'disabled'} style="margin-top:3px"><span><b class="small">${esc(p.label)}</b><br><span class="small muted">${esc(p.hint)}</span></span></label>`; }).join('')}</div>`).join('')}
      <div class="row">${role ? `<button type="button" class="btn danger" id="del">${icon('trash')} Delete role</button>` : ''}<span class="spacer"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save role</button></div></form>`, { wide: true });
    m.el.querySelector('#rf').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target;
      const body = { name: f.name.value, description: f.description.value, permissions: [...f.querySelectorAll('[name=p]:checked')].map((x) => x.value) };
      try { await api(role ? `/api/org/roles/${role.id}` : '/api/org/roles', { method: role ? 'PUT' : 'POST', body }); m.close(); toast(role ? 'Role updated. Its users are signed out so changes apply.' : 'Role created'); rolesTab(box, me); } catch (err) { toast(err.message, true); }
    };
    m.el.querySelector('#del')?.addEventListener('click', async () => { if (!(await confirmBox('Delete role?', 'Move its users to another role first.', 'Delete', true))) return; try { await api(`/api/org/roles/${role.id}`, { method: 'DELETE' }); m.close(); toast('Role deleted'); rolesTab(box, me); } catch (err) { toast(err.message, true); } });
  };
  box.querySelector('#nr')?.addEventListener('click', () => editor(null));
  box.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editor(roles.find((r) => r.id === Number(b.dataset.edit)))));
}

async function policyTab(box) {
  const p = await api('/api/org/security');
  box.innerHTML = `<form class="stack" id="pf" style="gap:16px;max-width:760px">
    <div class="card card-b stack"><h2>Two-factor authentication</h2>
      <p class="small muted" style="margin:0">${p.users_with_2fa} of ${p.users_total} active users have 2FA on. Users who need it are asked to set it up at their next sign-in and can't use the workspace until they do.</p>
      ${[['off', 'Optional', 'Each person chooses.'], ['admins', 'Required for admins', 'Anyone who can manage users, roles or security must use 2FA.'], ['all', 'Required for everyone', 'Recommended for HR, legal and finance teams.']].map(([v, l, d]) => `<label class="check" style="align-items:flex-start"><input type="radio" name="require_2fa" value="${v}" ${p.require_2fa === v ? 'checked' : ''} style="margin-top:3px"><span><b>${l}</b><br><span class="small muted">${d}</span></span></label>`).join('')}</div>
    <div class="card card-b stack"><h2>IP allowlist</h2>
      <p class="small muted" style="margin:0">Only allow sign-in and API access from these addresses or ranges (one per line, e.g. <code>203.0.113.10</code> or <code>10.0.0.0/8</code>). Leave empty to allow any network. Signers opening signing links are not affected.</p>
      <textarea name="ip_allowlist" rows="4" placeholder="Any network">${esc(p.ip_allowlist || '')}</textarea>
      <p class="small" style="margin:0">Your current address: <code>${esc(p.your_ip)}</code> <button type="button" class="btn sm ghost" id="addip">Add it</button></p></div>
    <div class="card card-b stack"><h2>Passwords and sessions</h2>
      <div class="row wrap"><label class="field" style="flex:1;min-width:200px"><span>Minimum password length</span><input type="number" name="password_min" min="10" max="64" value="${p.password_min}"></label>
        <label class="field" style="flex:1;min-width:200px"><span>Sign out after inactivity (hours)</span><input type="number" name="session_hours" min="1" max="168" value="${p.session_hours}"></label></div>
      <p class="small muted" style="margin:0">Passwords must also mix letters and numbers, avoid common passwords and not contain the person's email or name. Five wrong attempts lock an account for 15 minutes.</p></div>
    <div><button class="btn primary">Save security policy</button></div></form>`;
  box.querySelector('#addip').onclick = () => { const t = box.querySelector('[name=ip_allowlist]'); t.value = (t.value.trim() + '\n' + p.your_ip).trim(); };
  box.querySelector('#pf').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    try { await api('/api/org/security', { method: 'PUT', body: { require_2fa: f.require_2fa.value, ip_allowlist: f.ip_allowlist.value, password_min: f.password_min.value, session_hours: f.session_hours.value } }); toast('Security policy saved'); policyTab(box); }
    catch (err) { toast(err.message, true); }
  };
}

async function activityTab(box) {
  box.innerHTML = `<div class="stack" style="gap:12px"><div class="row wrap"><input type="text" id="aq" placeholder="Filter by person, action, IP…" style="max-width:320px"><span class="spacer"></span><a class="btn" id="csv" href="/api/org/activity.csv">${icon('download')} Export CSV</a></div><div class="card" id="al" style="overflow-x:auto"></div></div>`;
  const load = async (q = '') => {
    const rows = await api(`/api/org/activity?q=${encodeURIComponent(q)}`);
    box.querySelector('#csv').href = `/api/org/activity.csv?q=${encodeURIComponent(q)}`;
    box.querySelector('#al').innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>When</th><th>Who</th><th>Event</th><th class="hide-m">Details</th><th class="hide-m">IP</th></tr></thead><tbody>
      ${rows.map((r) => `<tr style="cursor:default"><td class="small">${fmtDate(r.created_at)}</td><td class="small">${esc(r.actor || '—')}</td><td><span class="badge ${RISKY.test(r.action) ? 'b-declined' : 'b-draft'}">${esc(ACTION_LABEL[r.action] || r.action)}</span>${r.target && r.target !== r.actor ? `<div class="small muted">${esc(r.target)}</div>` : ''}</td>
        <td class="hide-m small">${esc(r.details || '')}</td><td class="hide-m small mono">${esc(r.ip || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No matching events.</div>';
  };
  let t; box.querySelector('#aq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value), 250); };
  load();
}

// ================================================================ My account security
export async function accountSecurity(pane, { forced } = {}) {
  const a = await api('/api/account');
  pane.innerHTML = `<div class="stack" style="gap:16px">
    ${forced === 'mfa_setup_required' ? `<div class="card card-b" style="border-color:var(--primary)"><b>Your workspace requires two-factor authentication.</b><div class="small muted">Set it up below to continue.</div></div>` : ''}
    ${forced === 'password_change_required' ? `<div class="card card-b" style="border-color:var(--primary)"><b>Please choose a new password to continue.</b></div>` : ''}
    <div class="card"><div class="card-h"><h2>Two-factor authentication</h2><span class="spacer"></span>${a.user.totp_enabled ? '<span class="badge b-completed">On</span>' : '<span class="badge b-draft">Off</span>'}</div><div class="card-b stack">
      ${a.user.totp_enabled ? `<p class="small" style="margin:0">Sign-ins need a 6-digit code from your authenticator app. ${a.recovery_left} recovery code(s) left.</p>
        <div class="row wrap"><button class="btn" id="regen">${icon('shield')} New recovery codes</button>${a.mfaRequired ? '<span class="small muted">Required by your workspace</span>' : `<button class="btn danger" id="off">Turn off</button>`}</div>`
      : `<p class="small" style="margin:0">Protect your account with an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.</p><div><button class="btn primary" id="on">${icon('shield')} Set up two-factor</button></div>`}</div></div>
    <div class="card"><div class="card-h"><h2>Password</h2></div><form class="card-b stack" id="pw" style="max-width:460px">
      <label class="field"><span>Current password</span><input type="password" name="current_password" autocomplete="current-password" required></label>
      <label class="field"><span>New password</span><input type="password" name="new_password" autocomplete="new-password" required minlength="${a.policy.password_min || 10}"></label>
      <p class="small muted" style="margin:0">At least ${a.policy.password_min || 10} characters with letters and numbers. Changing it signs out your other devices.${a.password_changed_at ? ` Last changed ${fmtDate(a.password_changed_at, false)}.` : ''}</p>
      <div><button class="btn primary">Change password</button></div></form></div>
    <div class="card"><div class="card-h"><h2>Where you're signed in</h2><span class="spacer"></span>${a.sessions.length > 1 ? '<button class="btn sm" id="others">Sign out other devices</button>' : ''}</div>
      ${a.sessions.map((s) => `<div class="list-item" style="cursor:default"><span style="color:var(--primary)">${icon('eye')}</span><div style="flex:1;min-width:0"><div class="t">${esc(browserName(s.user_agent))}${s.current ? ' <span class="chip">this device</span>' : ''}</div>
        <div class="small muted">${esc(s.ip || '')} · active ${timeAgo(s.last_seen || s.created_at)}</div></div>${s.current ? '' : `<button class="btn sm ghost" data-sid="${s.sid}">Sign out</button>`}</div>`).join('')}</div></div>`;
  const reload = () => accountSecurity(pane, { forced: forced && a.user.totp_enabled ? null : forced });
  pane.querySelector('#on')?.addEventListener('click', () => setup2fa(async () => { if (forced) location.reload(); else reload(); }));
  pane.querySelector('#off')?.addEventListener('click', () => {
    const m = modal(`<div class="mh"><h2>Turn off two-factor?</h2></div><form class="mb stack" id="f"><label class="field"><span>Password</span><input type="password" name="password" required></label><label class="field"><span>Current 6-digit code</span><input type="text" name="code" inputmode="numeric" maxlength="6" required></label>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-close>Cancel</button><button class="btn danger">Turn off</button></div></form>`);
    m.el.querySelector('#f').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/account/2fa/disable', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); m.close(); toast('Two-factor turned off'); reload(); } catch (err) { toast(err.message, true); } };
  });
  pane.querySelector('#regen')?.addEventListener('click', () => {
    const m = modal(`<div class="mh"><h2>New recovery codes</h2></div><form class="mb stack" id="f"><p class="small muted" style="margin:0">Your old codes stop working.</p><label class="field"><span>Current 6-digit code</span><input type="text" name="code" inputmode="numeric" maxlength="6" required></label>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Generate</button></div></form>`);
    m.el.querySelector('#f').onsubmit = async (e) => { e.preventDefault(); try { const r = await api('/api/account/2fa/recovery-codes', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); m.close(); showCodes(r.recovery_codes); reload(); } catch (err) { toast(err.message, true); } };
  });
  pane.querySelector('#pw').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/account/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Password changed'); if (forced) location.reload(); else reload(); } catch (err) { toast(err.message, true); }
  };
  pane.querySelector('#others')?.addEventListener('click', async () => { await api('/api/account/sessions/revoke-others', { method: 'POST' }); toast('Other devices signed out'); reload(); });
  pane.querySelectorAll('[data-sid]').forEach((b) => (b.onclick = async () => { await api(`/api/account/sessions/${b.dataset.sid}`, { method: 'DELETE' }); toast('Device signed out'); reload(); }));
}
const browserName = (ua = '') => {
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} on ${os}` : b;
};
async function setup2fa(done) {
  let s;
  try { s = await api('/api/account/2fa/setup', { method: 'POST' }); } catch (e) { return toast(e.message, true); }
  const m = modal(`<div class="mh"><h2>Set up two-factor authentication</h2></div><form class="mb stack" id="f">
    <ol class="small" style="margin:0;padding-left:18px;line-height:1.7"><li>Open your authenticator app and add an account.</li><li>Scan this QR code, or type the key.</li><li>Enter the 6-digit code it shows.</li></ol>
    <div class="row wrap" style="gap:18px;align-items:center"><img src="${s.qr}" alt="QR code for your authenticator app" width="180" height="180" style="border-radius:8px;border:1px solid var(--border);background:#fff">
      <div class="stack" style="flex:1;min-width:180px"><div class="small muted">Setup key</div><code class="mono" style="font-size:14px">${esc(s.secret)}</code></div></div>
    <label class="field"><span>6-digit code</span><input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Turn on</button></div></form>`);
  m.el.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('/api/account/2fa/enable', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); m.close(); showCodes(r.recovery_codes, done); toast('Two-factor authentication is on'); }
    catch (err) { toast(err.message, true); }
  };
}
function showCodes(codes, after) {
  const m = modal(`<div class="mh"><h2>Save your recovery codes</h2></div><div class="mb stack"><p class="small muted" style="margin:0">Each code signs you in once if you lose your phone. Store them somewhere safe, like a password manager. You won't see them again.</p>
    <div class="codes">${codes.map((c) => `<code>${esc(c)}</code>`).join('')}</div></div>
    <div class="mf"><button class="btn" id="cp">${icon('copy')} Copy</button><button class="btn primary" id="ok">I've saved them</button></div>`);
  m.el.querySelector('#cp').onclick = async () => { try { await navigator.clipboard.writeText(codes.join('\n')); toast('Copied'); } catch { toast('Copy failed — write them down', true); } };
  m.el.querySelector('#ok').onclick = () => { m.close(); after?.(); };
}
