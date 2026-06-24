/* FLMS - File & Lead Movement System
   Static PWA version for GitHub Pages. Data is saved in browser localStorage.
   For real multi-user shared database, connect Firebase/Auth later.
*/

const APP_KEY = 'flms-pwa-db-v1';
const SESSION_KEY = 'flms-current-user-v1';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const fmtDate = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: value.includes('T') ? 'short' : undefined }) : '-';
const escapeHtml = (str = '') => String(str).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

let db = loadDB();
let currentUser = loadCurrentUser();
let currentRoute = location.hash.replace('#', '') || 'dashboard';
let currentLeadId = null;
let adminTab = 'users';
let reportType = 'leads';
let deferredPrompt = null;

function seedDB() {
  const createdAt = now();
  const adminId = uid('usr');
  const userId = uid('usr');
  const managerId = uid('usr');
  const branchId = uid('br');
  const products = [
    { id: uid('prd'), name: 'Gold Loan', active: true, createdAt },
    { id: uid('prd'), name: 'Personal Loan', active: true, createdAt },
    { id: uid('prd'), name: 'Business Loan', active: true, createdAt },
    { id: uid('prd'), name: 'Home Loan', active: true, createdAt }
  ];
  const stages = [
    'Lead Generated', 'Customer Contacted', 'Interested', 'Document Collection', 'Login / File Created',
    'CIBIL / Eligibility Check', 'Field Investigation', 'Legal / Technical / Valuation', 'Sanction',
    'Agreement / Documentation', 'Disbursement', 'Post-disbursement Compliance', 'Closed / Completed', 'Rejected'
  ].map((name, index) => ({ id: uid('stg'), name, order: index + 1, active: true, terminal: ['Closed / Completed', 'Rejected'].includes(name), createdAt }));
  const documents = [
    'Aadhaar Card', 'PAN Card', 'Customer Photo', 'Address Proof', 'Income Proof', 'Bank Statement', 'Property Documents', 'Gold Ornaments Details'
  ].map((name, i) => ({ id: uid('doc'), name, productId: i >= 6 ? products[i === 7 ? 0 : 3].id : '', required: true, active: true, createdAt }));
  const complianceParams = ['Agreement Completed', 'NACH / ECS Completed', 'Insurance Updated', 'Welcome Call Done', 'Document Dispatch Done', 'Original Document Received']
    .map(name => ({ id: uid('cmp'), name, active: true, createdAt }));
  const pendingReasons = ['Customer Not Available', 'Document Pending', 'Approval Pending', 'Technical Pending', 'Legal Pending', 'System Issue', 'Rejected by Customer']
    .map(name => ({ id: uid('rsn'), name, active: true, createdAt }));

  return {
    meta: { version: 1, createdAt, updatedAt: createdAt },
    settings: { appName: 'FLMS', branchLabel: 'Branch', currency: '₹' },
    users: [
      { id: adminId, name: 'Admin User', email: 'admin@flms.local', password: 'Admin@12345', role: 'admin', branchId, active: true, createdAt },
      { id: managerId, name: 'Branch Manager', email: 'manager@flms.local', password: 'Manager@123', role: 'manager', branchId, active: true, createdAt },
      { id: userId, name: 'Field User', email: 'user@flms.local', password: 'User@123', role: 'user', branchId, active: true, createdAt }
    ],
    branches: [{ id: branchId, name: 'Main Branch', active: true, createdAt }],
    products,
    leadSources: ['Walk-in', 'Cold Call', 'Referral', 'Campaign', 'Existing Customer'].map(name => ({ id: uid('src'), name, active: true, createdAt })),
    stages,
    documents,
    complianceParams,
    pendingReasons,
    leads: [],
    movements: [],
    leadDocuments: [],
    disbursements: [],
    complianceRecords: [],
    followUps: [],
    auditLogs: []
  };
}

function loadDB() {
  try {
    const raw = localStorage.getItem(APP_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn('DB load failed', e); }
  const fresh = seedDB();
  localStorage.setItem(APP_KEY, JSON.stringify(fresh));
  return fresh;
}

function saveDB() {
  db.meta.updatedAt = now();
  localStorage.setItem(APP_KEY, JSON.stringify(db));
}

function loadCurrentUser() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function setCurrentUser(user) {
  currentUser = user ? { id: user.id, name: user.name, email: user.email, role: user.role, branchId: user.branchId } : null;
  if (currentUser) localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
  else localStorage.removeItem(SESSION_KEY);
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function audit(action, entityType, entityId, oldValue = null, newValue = null) {
  db.auditLogs.unshift({ id: uid('aud'), action, entityType, entityId, oldValue, newValue, performedBy: currentUser?.id || 'system', performedAt: now() });
  if (db.auditLogs.length > 1000) db.auditLogs.length = 1000;
}

function can(permission) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  if (permission === 'viewReports') return ['admin', 'manager'].includes(currentUser.role);
  if (permission === 'manageAdmin') return currentUser.role === 'admin';
  if (permission === 'assignLead') return ['admin', 'manager'].includes(currentUser.role);
  if (permission === 'viewAllBranch') return ['admin', 'manager'].includes(currentUser.role);
  return true;
}

function getById(collection, id) { return db[collection].find(x => x.id === id); }
function activeItems(collection) { return db[collection].filter(x => x.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name))); }
function stageName(id) { return getById('stages', id)?.name || '-'; }
function productName(id) { return getById('products', id)?.name || '-'; }
function branchName(id) { return getById('branches', id)?.name || '-'; }
function userName(id) { return getById('users', id)?.name || '-'; }
function sourceName(id) { return getById('leadSources', id)?.name || '-'; }
function reasonName(id) { return getById('pendingReasons', id)?.name || '-'; }

function visibleLeads() {
  let leads = db.leads.filter(l => !l.isDeleted);
  if (currentUser?.role === 'user') leads = leads.filter(l => l.assignedTo === currentUser.id || l.createdBy === currentUser.id);
  if (currentUser?.role === 'manager') leads = leads.filter(l => l.branchId === currentUser.branchId);
  return leads.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

function isOverdue(date) {
  if (!date) return false;
  return new Date(date + 'T23:59:59') < new Date();
}

function statusBadge(status) {
  const map = {
    New: 'blue', Active: 'blue', Pending: 'amber', Disbursed: 'green', Completed: 'green', Rejected: 'red', Closed: 'gray'
  };
  return `<span class="badge ${map[status] || 'gray'}">${escapeHtml(status || 'Active')}</span>`;
}

function roleBadge(role) {
  return `<span class="badge ${role === 'admin' ? 'purple' : role === 'manager' ? 'blue' : 'gray'}">${escapeHtml(role)}</span>`;
}

function navigate(route, leadId = null) {
  currentRoute = route;
  currentLeadId = leadId;
  location.hash = leadId ? `${route}/${leadId}` : route;
  render();
}

window.addEventListener('hashchange', () => {
  const [route, id] = (location.hash.replace('#', '') || 'dashboard').split('/');
  currentRoute = route;
  currentLeadId = id || null;
  render();
});

function pageTitle() {
  const titles = {
    dashboard: ['Dashboard', 'Live file movement, pending work, disbursement and compliance summary'],
    leads: ['Leads & Files', 'Create leads and move files from generation to disbursement'],
    lead: ['File Details', 'Timeline, documents, disbursement and compliance'],
    admin: ['Admin Setup', 'Configure users, branches, products, stages and parameters'],
    reports: ['Reports', 'Filter, review and export movement data'],
    audit: ['Audit Logs', 'Every important action is recorded here'],
    backup: ['Backup & Restore', 'Export or import full local database backup']
  };
  return titles[currentRoute] || titles.dashboard;
}

function navButtons() {
  const items = [
    ['dashboard', '📊', 'Dashboard'],
    ['leads', '📁', 'Files'],
    ...(can('viewReports') ? [['reports', '📈', 'Reports']] : []),
    ...(can('manageAdmin') ? [['admin', '⚙️', 'Admin']] : []),
    ...(can('manageAdmin') ? [['audit', '🧾', 'Audit']] : []),
    ['backup', '💾', 'Backup']
  ];
  return items.map(([route, icon, label]) => `<button class="${currentRoute === route ? 'active' : ''}" onclick="navigate('${route}')"><span class="icon">${icon}</span>${label}</button>`).join('');
}

function mobileNavButtons() {
  const items = [
    ['dashboard', '📊', 'Home'],
    ['leads', '📁', 'Files'],
    ...(can('viewReports') ? [['reports', '📈', 'Reports']] : []),
    ...(can('manageAdmin') ? [['admin', '⚙️', 'Admin']] : [])
  ];
  return items.slice(0, 5).map(([route, icon, label]) => `<button class="${currentRoute === route ? 'active' : ''}" onclick="navigate('${route}')"><span class="mi">${icon}</span>${label}</button>`).join('');
}

function renderShell(content) {
  const [title, subtitle] = pageTitle();
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="logo">F</div>
          <div><div class="brand-title">${escapeHtml(db.settings.appName || 'FLMS')}</div><div class="brand-subtitle">File & Lead Movement</div></div>
        </div>
        <nav class="nav">${navButtons()}</nav>
        <div class="sidebar-footer">
          <div class="user-chip"><b>${escapeHtml(currentUser.name)}</b><span>${escapeHtml(currentUser.email)} · ${escapeHtml(currentUser.role)}</span></div>
          <button class="btn full ghost" onclick="logout()">Logout</button>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div><h1>${title}</h1><p>${subtitle}</p></div>
          <div class="btn-row">
            <button class="btn" onclick="installApp()">Install App</button>
            <button class="btn" onclick="logout()">Logout</button>
          </div>
        </header>
        <section class="content">${content}</section>
      </main>
      <nav class="mobile-bottom">${mobileNavButtons()}</nav>
      ${currentRoute !== 'lead' ? `<button class="fab" title="Add Lead" onclick="openLeadModal()">+</button>` : ''}
    </div>
  `;
}

function render() {
  if (!currentUser) {
    $('#app').innerHTML = renderLogin();
    return;
  }
  let content = '';
  if (currentRoute === 'dashboard') content = renderDashboard();
  else if (currentRoute === 'leads') content = renderLeads();
  else if (currentRoute === 'lead') content = renderLeadDetail(currentLeadId);
  else if (currentRoute === 'admin' && can('manageAdmin')) content = renderAdmin();
  else if (currentRoute === 'reports' && can('viewReports')) content = renderReports();
  else if (currentRoute === 'audit' && can('manageAdmin')) content = renderAudit();
  else if (currentRoute === 'backup') content = renderBackup();
  else content = renderDashboard();
  $('#app').innerHTML = renderShell(content);
}

function renderLogin() {
  return `
  <section class="login-page">
    <div class="login-hero">
      <div class="brand" style="color:#0f172a"><div class="logo" style="background:#1d4ed8;color:#fff">F</div><div><div class="brand-title">FLMS</div><div class="brand-subtitle" style="color:#475569">PWA for file movement tracking</div></div></div>
      <h1>Track every file from lead to disbursement.</h1>
      <p>Admin creates branches, users, products, stages, document checklist and compliance parameters. Staff updates file movement with permanent audit history.</p>
      <div class="grid grid-3" style="margin-top:24px;max-width:820px">
        <div class="card tight"><b>Lead Movement</b><p class="muted small">Stage-wise tracking and follow-up dates.</p></div>
        <div class="card tight"><b>Disbursement</b><p class="muted small">Capture sanction, EMI, ROI and loan account.</p></div>
        <div class="card tight"><b>Compliance</b><p class="muted small">Post-disbursement checklist with pending reasons.</p></div>
      </div>
    </div>
    <div class="login-panel">
      <form class="login-card" onsubmit="login(event)">
        <h2>Login</h2>
        <p class="muted">Static GitHub Pages version stores data in this browser.</p>
        <div class="demo-box"><b>Default Admin:</b><br>Email: admin@flms.local<br>Password: Admin@12345</div>
        <div class="field"><label>Email</label><input class="input" id="loginEmail" type="email" value="admin@flms.local" required /></div><br>
        <div class="field"><label>Password</label><input class="input" id="loginPassword" type="password" value="Admin@12345" required /></div><br>
        <button class="btn primary full" type="submit">Login</button>
        <div class="divider"></div>
        <p class="small muted">For real multi-user cloud sync, connect Firebase Auth + Firestore. This code is ready for GitHub Pages static hosting.</p>
      </form>
    </div>
  </section>`;
}

function login(event) {
  event.preventDefault();
  const email = $('#loginEmail').value.trim().toLowerCase();
  const password = $('#loginPassword').value;
  const user = db.users.find(u => u.email.toLowerCase() === email && u.password === password && u.active !== false);
  if (!user) return toast('Invalid login or inactive user');
  setCurrentUser(user);
  audit('login', 'user', user.id);
  saveDB();
  navigate('dashboard');
}

function logout() {
  setCurrentUser(null);
  currentRoute = 'dashboard';
  location.hash = '';
  render();
}

function renderDashboard() {
  const leads = visibleLeads();
  const todayFollow = leads.filter(l => l.nextFollowUpDate === today()).length;
  const overdue = leads.filter(l => isOverdue(l.nextFollowUpDate) && !['Completed', 'Rejected', 'Closed'].includes(l.status)).length;
  const disbursed = leads.filter(l => l.status === 'Disbursed' || stageName(l.currentStageId) === 'Disbursement').length;
  const compliancePending = leads.filter(l => l.status !== 'Completed' && stageName(l.currentStageId).includes('Compliance')).length;
  const active = leads.filter(l => !['Completed', 'Rejected', 'Closed'].includes(l.status)).length;
  const stageCounts = activeItems('stages').map(st => ({ name: st.name, count: leads.filter(l => l.currentStageId === st.id).length })).filter(x => x.count > 0);
  const maxStage = Math.max(1, ...stageCounts.map(x => x.count));
  const recent = leads.slice(0, 8);
  return `
    <div class="grid grid-4">
      ${kpi('Total Files', leads.length, '📁', 'All visible leads/files')}
      ${kpi('Active Files', active, '⚡', 'Not closed or rejected')}
      ${kpi('Disbursed', disbursed, '✅', 'Disbursement stage/status')}
      ${kpi('Compliance Pending', compliancePending, '🧾', 'Post-disbursement pending')}
      ${kpi('Today Follow-ups', todayFollow, '📞', 'Due today')}
      ${kpi('Overdue Follow-ups', overdue, '⏰', 'Past due date')}
      ${kpi('Rejected', leads.filter(l => l.status === 'Rejected').length, '🚫', 'Rejected files')}
      ${kpi('Products', activeItems('products').length, '🏦', 'Active loan products')}
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title"><h2>Stage-wise Movement</h2><button class="btn" onclick="navigate('reports')">View Reports</button></div>
        ${stageCounts.length ? `<div class="bar-list">${stageCounts.map(x => `<div class="bar-row"><div class="bar-head"><b>${escapeHtml(x.name)}</b><span>${x.count}</span></div><div class="bar-bg"><div class="bar-fill" style="width:${Math.round((x.count / maxStage) * 100)}%"></div></div></div>`).join('')}</div>` : `<div class="empty">No file movement yet. Add your first lead.</div>`}
      </div>
      <div class="card">
        <div class="card-title"><h2>Recent Files</h2><button class="btn primary" onclick="openLeadModal()">Add Lead</button></div>
        ${recent.length ? renderMiniLeadList(recent) : `<div class="empty">No leads available.</div>`}
      </div>
    </div>`;
}

function kpi(label, value, icon, desc) {
  return `<div class="card kpi"><div><div class="muted small">${escapeHtml(label)}</div><div class="big-number">${value}</div><div class="muted small">${escapeHtml(desc)}</div></div><div class="bubble">${icon}</div></div>`;
}

function renderMiniLeadList(leads) {
  return `<div class="timeline">${leads.map(l => `<div class="timeline-card" style="cursor:pointer" onclick="navigate('lead','${l.id}')"><b>${escapeHtml(l.customerName)}</b><div class="muted small">${escapeHtml(l.mobile)} · ${escapeHtml(productName(l.productId))} · ${escapeHtml(stageName(l.currentStageId))}</div><div style="margin-top:8px">${statusBadge(l.status)}</div></div>`).join('')}</div>`;
}

function renderLeads() {
  const leads = visibleLeads();
  return `
    <div class="card">
      <div class="card-title">
        <div><h2>Lead & File Register</h2><p class="muted small">Search, filter, open file details or create a new lead.</p></div>
        <div class="btn-row"><button class="btn" onclick="exportLeadsCSV()">Export CSV</button><button class="btn primary" onclick="openLeadModal()">+ New Lead</button></div>
      </div>
      <div class="grid grid-4" style="margin-bottom:14px">
        <input class="input" id="leadSearch" placeholder="Search customer/mobile" oninput="filterLeadTable()" />
        <select class="select" id="stageFilter" onchange="filterLeadTable()"><option value="">All stages</option>${activeItems('stages').map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select>
        <select class="select" id="productFilter" onchange="filterLeadTable()"><option value="">All products</option>${activeItems('products').map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>
        <select class="select" id="statusFilter" onchange="filterLeadTable()"><option value="">All status</option>${['New','Active','Pending','Disbursed','Completed','Rejected','Closed'].map(s => `<option>${s}</option>`).join('')}</select>
      </div>
      <div id="leadTable">${renderLeadTable(leads)}</div>
    </div>`;
}

function renderLeadTable(leads) {
  if (!leads.length) return `<div class="empty">No leads found. Create your first lead.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Product</th><th>Stage</th><th>Status</th><th>Assigned</th><th>Follow-up</th><th>Updated</th><th>Action</th></tr></thead><tbody>
    ${leads.map(l => `<tr data-search="${escapeHtml((l.customerName + ' ' + l.mobile + ' ' + productName(l.productId)).toLowerCase())}" data-stage="${l.currentStageId}" data-product="${l.productId}" data-status="${l.status}">
      <td><b>${escapeHtml(l.customerName)}</b><div class="muted small">${escapeHtml(l.mobile)}${l.alternateMobile ? ' / ' + escapeHtml(l.alternateMobile) : ''}</div></td>
      <td>${escapeHtml(productName(l.productId))}<div class="muted small">${escapeHtml(sourceName(l.leadSourceId))}</div></td>
      <td><span class="badge blue">${escapeHtml(stageName(l.currentStageId))}</span></td>
      <td>${statusBadge(l.status)}</td>
      <td>${escapeHtml(userName(l.assignedTo))}<div class="muted small">${escapeHtml(branchName(l.branchId))}</div></td>
      <td>${l.nextFollowUpDate ? `<span class="badge ${isOverdue(l.nextFollowUpDate) ? 'red' : l.nextFollowUpDate === today() ? 'amber' : 'gray'}">${escapeHtml(l.nextFollowUpDate)}</span>` : '-'}</td>
      <td>${fmtDate(l.updatedAt || l.createdAt)}</td>
      <td><div class="btn-row"><button class="btn" onclick="navigate('lead','${l.id}')">Open</button>${can('assignLead') ? `<button class="btn danger" onclick="deleteLead('${l.id}')">Delete</button>` : ''}</div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function filterLeadTable() {
  const q = ($('#leadSearch')?.value || '').toLowerCase();
  const st = $('#stageFilter')?.value || '';
  const prd = $('#productFilter')?.value || '';
  const status = $('#statusFilter')?.value || '';
  $$('#leadTable tbody tr').forEach(row => {
    const match = (!q || row.dataset.search.includes(q)) && (!st || row.dataset.stage === st) && (!prd || row.dataset.product === prd) && (!status || row.dataset.status === status);
    row.style.display = match ? '' : 'none';
  });
}

function openLeadModal(id = null) {
  const lead = id ? db.leads.find(l => l.id === id) : null;
  const firstStage = activeItems('stages')[0];
  const html = `
    <div class="modal-backdrop" onclick="closeModal(event)"><form class="modal" onclick="event.stopPropagation()" onsubmit="saveLead(event, '${id || ''}')">
      <div class="modal-head"><h2>${lead ? 'Edit Lead' : 'Create New Lead'}</h2><button type="button" class="close" onclick="removeModal()">×</button></div>
      <div class="form-grid">
        ${field('Customer Name','customerName','text',lead?.customerName || '', true)}
        ${field('Mobile Number','mobile','tel',lead?.mobile || '', true)}
        ${field('Alternate Mobile','alternateMobile','tel',lead?.alternateMobile || '')}
        ${selectField('Branch','branchId',activeItems('branches'),lead?.branchId || currentUser.branchId,true)}
        ${selectField('Product','productId',activeItems('products'),lead?.productId || '',true)}
        ${selectField('Lead Source','leadSourceId',activeItems('leadSources'),lead?.leadSourceId || '',true)}
        ${can('assignLead') ? selectField('Assigned To','assignedTo',db.users.filter(u => u.active !== false),lead?.assignedTo || currentUser.id,true) : `<input type="hidden" name="assignedTo" value="${currentUser.id}">`}
        ${field('Loan Amount','loanAmount','number',lead?.loanAmount || '')}
        ${field('Next Follow-up Date','nextFollowUpDate','date',lead?.nextFollowUpDate || '')}
        ${selectSimple('Priority','priority',['Normal','High','Urgent'],lead?.priority || 'Normal')}
        ${lead ? selectField('Current Stage','currentStageId',activeItems('stages'),lead.currentStageId,true) : `<input type="hidden" name="currentStageId" value="${firstStage?.id || ''}">`}
        ${selectSimple('Status','status',['New','Active','Pending','Disbursed','Completed','Rejected','Closed'],lead?.status || 'New')}
      </div><br>
      <div class="field"><label>Address</label><textarea class="textarea" name="address">${escapeHtml(lead?.address || '')}</textarea></div><br>
      <div class="field"><label>Remarks</label><textarea class="textarea" name="remarks">${escapeHtml(lead?.remarks || '')}</textarea></div><br>
      <div class="btn-row"><button class="btn primary" type="submit">Save Lead</button><button class="btn" type="button" onclick="removeModal()">Cancel</button></div>
    </form></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function field(label, name, type = 'text', value = '', required = false) {
  return `<div class="field"><label>${escapeHtml(label)}</label><input class="input" name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? 'required' : ''}></div>`;
}
function selectField(label, name, items, value = '', required = false) {
  return `<div class="field"><label>${escapeHtml(label)}</label><select class="select" name="${name}" ${required ? 'required' : ''}><option value="">Select</option>${items.map(i => `<option value="${i.id}" ${i.id === value ? 'selected' : ''}>${escapeHtml(i.name)}${i.role ? ' (' + escapeHtml(i.role) + ')' : ''}</option>`).join('')}</select></div>`;
}
function selectSimple(label, name, items, value = '') {
  return `<div class="field"><label>${escapeHtml(label)}</label><select class="select" name="${name}">${items.map(i => `<option value="${i}" ${i === value ? 'selected' : ''}>${escapeHtml(i)}</option>`).join('')}</select></div>`;
}
function closeModal(event) { if (event.target.classList.contains('modal-backdrop')) removeModal(); }
function removeModal() { $('.modal-backdrop')?.remove(); }

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function saveLead(event, id) {
  event.preventDefault();
  const data = formData(event.target);
  if (id) {
    const idx = db.leads.findIndex(l => l.id === id);
    if (idx < 0) return;
    const old = { ...db.leads[idx] };
    db.leads[idx] = { ...db.leads[idx], ...data, loanAmount: Number(data.loanAmount || 0), updatedAt: now() };
    audit('lead_updated', 'lead', id, old, db.leads[idx]);
  } else {
    const lead = { id: uid('lead'), ...data, loanAmount: Number(data.loanAmount || 0), createdBy: currentUser.id, createdAt: now(), updatedAt: now(), isDeleted: false };
    db.leads.unshift(lead);
    db.movements.unshift({ id: uid('mov'), leadId: lead.id, fromStageId: '', toStageId: lead.currentStageId, status: lead.status, remarks: 'Lead created', pendingReasonId: '', updatedBy: currentUser.id, updatedAt: now(), nextFollowUpDate: lead.nextFollowUpDate || '' });
    initLeadChecklists(lead);
    audit('lead_created', 'lead', lead.id, null, lead);
  }
  saveDB(); removeModal(); toast('Lead saved'); render();
}

function initLeadChecklists(lead) {
  const docs = activeItems('documents').filter(d => !d.productId || d.productId === lead.productId);
  docs.forEach(d => db.leadDocuments.push({ id: uid('ldoc'), leadId: lead.id, documentId: d.id, documentName: d.name, required: d.required !== false, received: false, receivedDate: '', remarks: '', updatedBy: currentUser.id, updatedAt: now() }));
  activeItems('complianceParams').forEach(c => db.complianceRecords.push({ id: uid('lcmp'), leadId: lead.id, complianceId: c.id, name: c.name, completed: false, completedDate: '', remarks: '', updatedBy: currentUser.id, updatedAt: now() }));
}

function deleteLead(id) {
  if (!confirm('Delete this lead? It will be soft deleted.')) return;
  const lead = db.leads.find(l => l.id === id);
  if (!lead) return;
  lead.isDeleted = true;
  lead.updatedAt = now();
  audit('lead_deleted', 'lead', id);
  saveDB(); toast('Lead deleted'); render();
}

function renderLeadDetail(id) {
  const lead = db.leads.find(l => l.id === id && !l.isDeleted);
  if (!lead) return `<div class="empty">File not found. <button class="btn" onclick="navigate('leads')">Back to Files</button></div>`;
  const docs = db.leadDocuments.filter(d => d.leadId === lead.id);
  const comp = db.complianceRecords.filter(c => c.leadId === lead.id);
  const movements = db.movements.filter(m => m.leadId === lead.id).sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const disb = db.disbursements.find(d => d.leadId === lead.id) || {};
  return `
    <div class="btn-row" style="margin-bottom:14px"><button class="btn" onclick="navigate('leads')">← Back</button><button class="btn" onclick="openLeadModal('${lead.id}')">Edit Lead</button><button class="btn primary" onclick="window.print()">Print</button></div>
    <div class="grid grid-3">
      <div class="card"><div class="muted small">Customer</div><h2>${escapeHtml(lead.customerName)}</h2><p class="muted">${escapeHtml(lead.mobile)}${lead.alternateMobile ? ' / ' + escapeHtml(lead.alternateMobile) : ''}</p>${statusBadge(lead.status)}</div>
      <div class="card"><div class="muted small">Current Stage</div><h2>${escapeHtml(stageName(lead.currentStageId))}</h2><p class="muted">Assigned: ${escapeHtml(userName(lead.assignedTo))}</p></div>
      <div class="card"><div class="muted small">Product & Amount</div><h2>${escapeHtml(productName(lead.productId))}</h2><p class="muted">${db.settings.currency || '₹'} ${Number(lead.loanAmount || 0).toLocaleString()}</p></div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title"><h2>Move File Stage</h2></div>
        <form onsubmit="moveStage(event, '${lead.id}')">
          <div class="form-grid">
            ${selectField('New Stage','toStageId',activeItems('stages'),lead.currentStageId,true)}
            ${selectSimple('Status','status',['Active','Pending','Disbursed','Completed','Rejected','Closed'],lead.status || 'Active')}
            ${selectField('Pending Reason','pendingReasonId',activeItems('pendingReasons'),'',false)}
            ${field('Next Follow-up','nextFollowUpDate','date',lead.nextFollowUpDate || '')}
          </div><br>
          <div class="field"><label>Movement Remarks</label><textarea class="textarea" name="remarks" placeholder="Enter clear remarks" required></textarea></div><br>
          <button class="btn primary" type="submit">Save Movement</button>
        </form>
      </div>
      <div class="card">
        <div class="card-title"><h2>Movement Timeline</h2></div>
        ${movements.length ? `<div class="timeline">${movements.map((m,i) => `<div class="timeline-item"><div class="timeline-dot">${movements.length-i}</div><div class="timeline-card"><b>${escapeHtml(m.fromStageId ? stageName(m.fromStageId) + ' → ' : '')}${escapeHtml(stageName(m.toStageId))}</b><div>${statusBadge(m.status)} ${m.pendingReasonId ? `<span class="badge amber">${escapeHtml(reasonName(m.pendingReasonId))}</span>` : ''}</div><p class="muted small">${escapeHtml(m.remarks || '-')}</p><div class="small muted">${escapeHtml(userName(m.updatedBy))} · ${fmtDate(m.updatedAt)} ${m.nextFollowUpDate ? '· Follow-up: ' + escapeHtml(m.nextFollowUpDate) : ''}</div></div></div>`).join('')}</div>` : `<div class="empty">No movement recorded.</div>`}
      </div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title"><h2>Document Checklist</h2><span class="badge blue">${docs.filter(d => d.received).length}/${docs.length}</span></div>
        ${docs.length ? `<div class="check-list">${docs.map(d => `<div class="check-row ${d.received ? 'done' : ''}"><div><b>${escapeHtml(d.documentName)}</b><div class="muted small">${d.required ? 'Required' : 'Optional'} ${d.receivedDate ? '· Received: ' + escapeHtml(d.receivedDate) : ''}</div></div><button class="btn ${d.received ? 'success' : ''}" onclick="toggleDoc('${d.id}')">${d.received ? 'Received' : 'Mark Received'}</button></div>`).join('')}</div>` : `<div class="empty">No document parameters found for this product.</div>`}
      </div>
      <div class="card">
        <div class="card-title"><h2>Disbursement Details</h2></div>
        <form onsubmit="saveDisbursement(event, '${lead.id}')">
          <div class="form-grid">
            ${field('Sanctioned Amount','sanctionedAmount','number',disb.sanctionedAmount || '')}
            ${field('Disbursed Amount','disbursedAmount','number',disb.disbursedAmount || '')}
            ${field('Disbursement Date','disbursementDate','date',disb.disbursementDate || '')}
            ${field('Loan Account Number','loanAccountNumber','text',disb.loanAccountNumber || '')}
            ${field('ROI %','roi','number',disb.roi || '')}
            ${field('Tenure Months','tenure','number',disb.tenure || '')}
            ${field('EMI','emi','number',disb.emi || '')}
            ${field('Insurance Amount','insuranceAmount','number',disb.insuranceAmount || '')}
          </div><br>
          <div class="field"><label>Remarks</label><textarea class="textarea" name="remarks">${escapeHtml(disb.remarks || '')}</textarea></div><br>
          <button class="btn primary" type="submit">Save Disbursement</button>
        </form>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-title"><h2>Post-disbursement Compliance</h2><span class="badge green">${comp.filter(c => c.completed).length}/${comp.length}</span></div>
      ${comp.length ? `<div class="grid grid-2">${comp.map(c => `<div class="check-row ${c.completed ? 'done' : ''}"><div><b>${escapeHtml(c.name)}</b><div class="muted small">${c.completedDate ? 'Completed: ' + escapeHtml(c.completedDate) : 'Pending'}</div></div><button class="btn ${c.completed ? 'success' : ''}" onclick="toggleCompliance('${c.id}')">${c.completed ? 'Completed' : 'Mark Done'}</button></div>`).join('')}</div>` : `<div class="empty">No compliance parameters found.</div>`}
    </div>`;
}

function moveStage(event, leadId) {
  event.preventDefault();
  const data = formData(event.target);
  const lead = db.leads.find(l => l.id === leadId);
  const oldStage = lead.currentStageId;
  lead.currentStageId = data.toStageId;
  lead.status = data.status;
  lead.nextFollowUpDate = data.nextFollowUpDate || '';
  lead.remarks = data.remarks;
  lead.updatedAt = now();
  db.movements.unshift({ id: uid('mov'), leadId, fromStageId: oldStage, toStageId: data.toStageId, status: data.status, remarks: data.remarks, pendingReasonId: data.pendingReasonId || '', updatedBy: currentUser.id, updatedAt: now(), nextFollowUpDate: data.nextFollowUpDate || '' });
  audit('stage_changed', 'lead', leadId, { stage: oldStage }, { stage: data.toStageId, status: data.status });
  saveDB(); toast('Movement saved'); render();
}

function toggleDoc(id) {
  const d = db.leadDocuments.find(x => x.id === id);
  if (!d) return;
  d.received = !d.received;
  d.receivedDate = d.received ? today() : '';
  d.updatedBy = currentUser.id;
  d.updatedAt = now();
  audit('document_updated', 'leadDocument', id);
  saveDB(); render();
}

function saveDisbursement(event, leadId) {
  event.preventDefault();
  const data = formData(event.target);
  const existing = db.disbursements.find(d => d.leadId === leadId);
  const payload = { ...data, sanctionedAmount: Number(data.sanctionedAmount || 0), disbursedAmount: Number(data.disbursedAmount || 0), roi: Number(data.roi || 0), tenure: Number(data.tenure || 0), emi: Number(data.emi || 0), insuranceAmount: Number(data.insuranceAmount || 0), updatedBy: currentUser.id, updatedAt: now() };
  if (existing) Object.assign(existing, payload);
  else db.disbursements.push({ id: uid('disb'), leadId, ...payload, createdAt: now() });
  const lead = db.leads.find(l => l.id === leadId);
  if (payload.disbursedAmount > 0) lead.status = 'Disbursed';
  lead.updatedAt = now();
  audit('disbursement_saved', 'lead', leadId, null, payload);
  saveDB(); toast('Disbursement saved'); render();
}

function toggleCompliance(id) {
  const c = db.complianceRecords.find(x => x.id === id);
  if (!c) return;
  c.completed = !c.completed;
  c.completedDate = c.completed ? today() : '';
  c.updatedBy = currentUser.id;
  c.updatedAt = now();
  const leadId = c.leadId;
  const all = db.complianceRecords.filter(x => x.leadId === leadId);
  const lead = db.leads.find(l => l.id === leadId);
  if (all.length && all.every(x => x.completed)) lead.status = 'Completed';
  lead.updatedAt = now();
  audit('compliance_updated', 'complianceRecord', id);
  saveDB(); render();
}

function renderAdmin() {
  const tabs = [
    ['users','Users'], ['branches','Branches'], ['products','Products'], ['leadSources','Lead Sources'], ['stages','Stages'], ['documents','Documents'], ['complianceParams','Compliance'], ['pendingReasons','Pending Reasons']
  ];
  return `<div class="card"><div class="tabs">${tabs.map(t => `<button class="tab ${adminTab === t[0] ? 'active' : ''}" onclick="adminTab='${t[0]}'; render()">${t[1]}</button>`).join('')}</div>${renderAdminTab()}</div>`;
}

function renderAdminTab() {
  if (adminTab === 'users') return renderUsersAdmin();
  if (adminTab === 'stages') return renderGenericAdmin('stages', ['name','order','active','terminal'], 'Stage');
  if (adminTab === 'documents') return renderDocumentsAdmin();
  if (adminTab === 'complianceParams') return renderGenericAdmin('complianceParams', ['name','active'], 'Compliance Parameter');
  if (adminTab === 'pendingReasons') return renderGenericAdmin('pendingReasons', ['name','active'], 'Pending Reason');
  if (adminTab === 'branches') return renderGenericAdmin('branches', ['name','active'], 'Branch');
  if (adminTab === 'products') return renderGenericAdmin('products', ['name','active'], 'Product');
  if (adminTab === 'leadSources') return renderGenericAdmin('leadSources', ['name','active'], 'Lead Source');
}

function renderUsersAdmin() {
  return `
    <div class="card-title"><h2>Users</h2><button class="btn primary" onclick="openUserModal()">+ Add User</button></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Status</th><th>Action</th></tr></thead><tbody>
      ${db.users.map(u => `<tr><td><b>${escapeHtml(u.name)}</b></td><td>${escapeHtml(u.email)}</td><td>${roleBadge(u.role)}</td><td>${escapeHtml(branchName(u.branchId))}</td><td>${u.active ? '<span class="badge green">Active</span>' : '<span class="badge red">Inactive</span>'}</td><td><div class="btn-row"><button class="btn" onclick="openUserModal('${u.id}')">Edit</button><button class="btn" onclick="toggleActive('users','${u.id}')">${u.active ? 'Deactivate' : 'Activate'}</button></div></td></tr>`).join('')}
    </tbody></table></div>`;
}

function openUserModal(id = '') {
  const u = id ? getById('users', id) : null;
  const html = `<div class="modal-backdrop" onclick="closeModal(event)"><form class="modal" onclick="event.stopPropagation()" onsubmit="saveUser(event,'${id}')"><div class="modal-head"><h2>${u ? 'Edit User' : 'Add User'}</h2><button type="button" class="close" onclick="removeModal()">×</button></div><div class="form-grid">
    ${field('Name','name','text',u?.name || '',true)}${field('Email','email','email',u?.email || '',true)}${field('Password','password','text',u?.password || '',true)}${selectSimple('Role','role',['admin','manager','user'],u?.role || 'user')}${selectField('Branch','branchId',activeItems('branches'),u?.branchId || currentUser.branchId,true)}${selectSimple('Status','active',['true','false'],String(u?.active ?? true))}
  </div><br><div class="btn-row"><button class="btn primary" type="submit">Save User</button><button class="btn" type="button" onclick="removeModal()">Cancel</button></div></form></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function saveUser(event, id) {
  event.preventDefault();
  const data = formData(event.target);
  data.email = data.email.trim().toLowerCase();
  data.active = data.active === 'true';
  if (db.users.some(u => u.email.toLowerCase() === data.email && u.id !== id)) return toast('Email already exists');
  if (id) {
    const u = getById('users', id);
    Object.assign(u, data, { updatedAt: now() });
    audit('user_updated', 'user', id);
  } else {
    const user = { id: uid('usr'), ...data, createdAt: now() };
    db.users.push(user); audit('user_created', 'user', user.id);
  }
  saveDB(); removeModal(); toast('User saved'); render();
}

function renderGenericAdmin(collection, columns, label) {
  const rows = db[collection].slice().sort((a,b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name)));
  return `<div class="card-title"><h2>${escapeHtml(label)} Setup</h2><button class="btn primary" onclick="openGenericModal('${collection}','${label}')">+ Add</button></div>
    <div class="table-wrap"><table><thead><tr>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}<th>Action</th></tr></thead><tbody>
      ${rows.map(r => `<tr>${columns.map(c => `<td>${renderCell(r,c)}</td>`).join('')}<td><div class="btn-row"><button class="btn" onclick="openGenericModal('${collection}','${label}','${r.id}')">Edit</button><button class="btn" onclick="toggleActive('${collection}','${r.id}')">${r.active ? 'Deactivate' : 'Activate'}</button></div></td></tr>`).join('')}
    </tbody></table></div>`;
}
function renderCell(row, c) {
  if (c === 'active') return row.active ? '<span class="badge green">Active</span>' : '<span class="badge red">Inactive</span>';
  if (c === 'terminal') return row.terminal ? '<span class="badge purple">Terminal</span>' : '<span class="badge gray">Normal</span>';
  if (c === 'productId') return row.productId ? productName(row.productId) : 'All Products';
  if (typeof row[c] === 'boolean') return row[c] ? 'Yes' : 'No';
  return escapeHtml(row[c] ?? '-');
}

function openGenericModal(collection, label, id = '') {
  const r = id ? getById(collection, id) : null;
  const html = `<div class="modal-backdrop" onclick="closeModal(event)"><form class="modal" onclick="event.stopPropagation()" onsubmit="saveGeneric(event,'${collection}','${id}')"><div class="modal-head"><h2>${id ? 'Edit' : 'Add'} ${escapeHtml(label)}</h2><button type="button" class="close" onclick="removeModal()">×</button></div><div class="form-grid">
    ${field('Name','name','text',r?.name || '',true)}
    ${collection === 'stages' ? field('Order','order','number',r?.order || activeItems('stages').length + 1,true) : ''}
    ${collection === 'stages' ? selectSimple('Terminal Stage','terminal',['false','true'],String(r?.terminal ?? false)) : ''}
    ${selectSimple('Status','active',['true','false'],String(r?.active ?? true))}
  </div><br><div class="btn-row"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" onclick="removeModal()">Cancel</button></div></form></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function saveGeneric(event, collection, id) {
  event.preventDefault();
  const data = formData(event.target);
  data.active = data.active === 'true';
  if ('terminal' in data) data.terminal = data.terminal === 'true';
  if ('order' in data) data.order = Number(data.order || 0);
  if (id) { Object.assign(getById(collection, id), data, { updatedAt: now() }); audit(`${collection}_updated`, collection, id); }
  else { const row = { id: uid(collection.slice(0,3)), ...data, createdAt: now() }; db[collection].push(row); audit(`${collection}_created`, collection, row.id); }
  saveDB(); removeModal(); toast('Saved'); render();
}

function renderDocumentsAdmin() {
  return `<div class="card-title"><h2>Required Documents</h2><button class="btn primary" onclick="openDocumentModal()">+ Add Document</button></div>
    <div class="table-wrap"><table><thead><tr><th>Document</th><th>Product</th><th>Required</th><th>Status</th><th>Action</th></tr></thead><tbody>
    ${db.documents.map(d => `<tr><td><b>${escapeHtml(d.name)}</b></td><td>${escapeHtml(d.productId ? productName(d.productId) : 'All Products')}</td><td>${d.required ? 'Yes' : 'No'}</td><td>${d.active ? '<span class="badge green">Active</span>' : '<span class="badge red">Inactive</span>'}</td><td><div class="btn-row"><button class="btn" onclick="openDocumentModal('${d.id}')">Edit</button><button class="btn" onclick="toggleActive('documents','${d.id}')">${d.active ? 'Deactivate' : 'Activate'}</button></div></td></tr>`).join('')}
    </tbody></table></div>`;
}

function openDocumentModal(id = '') {
  const d = id ? getById('documents', id) : null;
  const html = `<div class="modal-backdrop" onclick="closeModal(event)"><form class="modal" onclick="event.stopPropagation()" onsubmit="saveDocument(event,'${id}')"><div class="modal-head"><h2>${id ? 'Edit' : 'Add'} Document</h2><button type="button" class="close" onclick="removeModal()">×</button></div><div class="form-grid">${field('Document Name','name','text',d?.name || '',true)}<div class="field"><label>Product</label><select class="select" name="productId"><option value="">All Products</option>${activeItems('products').map(p => `<option value="${p.id}" ${p.id === d?.productId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></div>${selectSimple('Required','required',['true','false'],String(d?.required ?? true))}${selectSimple('Status','active',['true','false'],String(d?.active ?? true))}</div><br><div class="btn-row"><button class="btn primary" type="submit">Save Document</button><button class="btn" type="button" onclick="removeModal()">Cancel</button></div></form></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function saveDocument(event, id) {
  event.preventDefault();
  const data = formData(event.target); data.required = data.required === 'true'; data.active = data.active === 'true';
  if (id) { Object.assign(getById('documents', id), data, { updatedAt: now() }); audit('document_param_updated', 'document', id); }
  else { const d = { id: uid('doc'), ...data, createdAt: now() }; db.documents.push(d); audit('document_param_created', 'document', d.id); }
  saveDB(); removeModal(); toast('Document saved'); render();
}

function toggleActive(collection, id) {
  const item = getById(collection, id); if (!item) return;
  item.active = !item.active; item.updatedAt = now();
  audit(`${collection}_active_toggled`, collection, id);
  saveDB(); render();
}

function renderReports() {
  const types = [['leads','Lead Report'], ['pending','Pending Stage'], ['disbursed','Disbursement'], ['compliance','Compliance Pending'], ['followups','Follow-up Due']];
  return `<div class="card"><div class="card-title"><h2>Reports</h2><div class="btn-row"><button class="btn" onclick="exportCurrentReport()">Export CSV</button><button class="btn" onclick="window.print()">Print</button></div></div><div class="tabs">${types.map(t => `<button class="tab ${reportType === t[0] ? 'active' : ''}" onclick="reportType='${t[0]}'; render()">${t[1]}</button>`).join('')}</div>${renderReportTable()}</div>`;
}

function reportRows() {
  let leads = visibleLeads();
  if (reportType === 'pending') leads = leads.filter(l => ['Pending','Active','New'].includes(l.status));
  if (reportType === 'disbursed') leads = leads.filter(l => l.status === 'Disbursed' || db.disbursements.some(d => d.leadId === l.id));
  if (reportType === 'compliance') leads = leads.filter(l => {
    const comp = db.complianceRecords.filter(c => c.leadId === l.id);
    return comp.length && comp.some(c => !c.completed);
  });
  if (reportType === 'followups') leads = leads.filter(l => l.nextFollowUpDate && !['Completed','Rejected','Closed'].includes(l.status));
  return leads;
}

function renderReportTable() {
  const rows = reportRows();
  if (!rows.length) return `<div class="empty">No data for selected report.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Mobile</th><th>Product</th><th>Branch</th><th>Assigned</th><th>Stage</th><th>Status</th><th>Follow-up</th><th>Disbursed</th><th>Compliance</th></tr></thead><tbody>${rows.map(l => {
    const disb = db.disbursements.find(d => d.leadId === l.id);
    const comp = db.complianceRecords.filter(c => c.leadId === l.id);
    return `<tr><td><b>${escapeHtml(l.customerName)}</b></td><td>${escapeHtml(l.mobile)}</td><td>${escapeHtml(productName(l.productId))}</td><td>${escapeHtml(branchName(l.branchId))}</td><td>${escapeHtml(userName(l.assignedTo))}</td><td>${escapeHtml(stageName(l.currentStageId))}</td><td>${statusBadge(l.status)}</td><td>${escapeHtml(l.nextFollowUpDate || '-')}</td><td>${disb ? (db.settings.currency || '₹') + ' ' + Number(disb.disbursedAmount || 0).toLocaleString() : '-'}</td><td>${comp.length ? comp.filter(c => c.completed).length + '/' + comp.length : '-'}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderAudit() {
  const rows = db.auditLogs.slice(0, 250);
  return `<div class="card"><div class="card-title"><h2>Audit Logs</h2><button class="btn" onclick="exportAuditCSV()">Export CSV</button></div>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Action</th><th>Entity</th><th>User</th><th>Date</th></tr></thead><tbody>${rows.map(a => `<tr><td><b>${escapeHtml(a.action)}</b></td><td>${escapeHtml(a.entityType)}<div class="muted small">${escapeHtml(a.entityId)}</div></td><td>${escapeHtml(userName(a.performedBy))}</td><td>${fmtDate(a.performedAt)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">No audit logs yet.</div>`}</div>`;
}

function renderBackup() {
  return `<div class="grid grid-2"><div class="card"><h2>Export Backup</h2><p class="muted">Download full local database JSON. Keep this safe.</p><button class="btn primary" onclick="exportBackup()">Download Backup JSON</button></div><div class="card"><h2>Import Backup</h2><p class="muted">Import a previously exported JSON backup. This will replace current browser data.</p><input class="input" type="file" id="backupFile" accept="application/json"><br><br><button class="btn danger" onclick="importBackup()">Import & Replace Data</button></div><div class="card"><h2>Reset Demo Data</h2><p class="muted">This clears all local data and restores default admin/user/master data.</p><button class="btn danger" onclick="resetDB()">Reset App</button></div><div class="card"><h2>Storage Note</h2><p class="muted">This GitHub-only version saves data in browser localStorage. For shared branch/team usage across devices, connect Firebase Auth + Firestore.</p></div></div>`;
}

function csvEscape(v) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }
function downloadText(filename, text, type='text/plain') {
  const blob = new Blob([text], { type }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
function exportRowsCSV(filename, rows) {
  if (!rows.length) return toast('No data to export');
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => csvEscape(r[h])).join(','))].join('\n');
  downloadText(filename, csv, 'text/csv');
}
function leadExportRows(leads = visibleLeads()) {
  return leads.map(l => ({ Customer: l.customerName, Mobile: l.mobile, Alternate: l.alternateMobile, Branch: branchName(l.branchId), Product: productName(l.productId), Source: sourceName(l.leadSourceId), Stage: stageName(l.currentStageId), Status: l.status, AssignedTo: userName(l.assignedTo), LoanAmount: l.loanAmount, FollowUpDate: l.nextFollowUpDate, Remarks: l.remarks, CreatedAt: l.createdAt, UpdatedAt: l.updatedAt }));
}
function exportLeadsCSV() { exportRowsCSV(`flms-leads-${today()}.csv`, leadExportRows()); }
function exportCurrentReport() { exportRowsCSV(`flms-${reportType}-report-${today()}.csv`, leadExportRows(reportRows())); }
function exportAuditCSV() { exportRowsCSV(`flms-audit-${today()}.csv`, db.auditLogs.map(a => ({ Action: a.action, EntityType: a.entityType, EntityId: a.entityId, User: userName(a.performedBy), Date: a.performedAt }))); }
function exportBackup() { downloadText(`flms-backup-${today()}.json`, JSON.stringify(db, null, 2), 'application/json'); }
function importBackup() {
  const file = $('#backupFile')?.files?.[0]; if (!file) return toast('Select backup JSON file');
  const reader = new FileReader();
  reader.onload = () => { try { const parsed = JSON.parse(reader.result); if (!parsed.users || !parsed.leads) throw new Error('Invalid backup'); db = parsed; saveDB(); setCurrentUser(null); toast('Backup imported. Login again.'); render(); } catch(e) { toast('Invalid backup file'); } };
  reader.readAsText(file);
}
function resetDB() { if (!confirm('Reset all data?')) return; localStorage.removeItem(APP_KEY); localStorage.removeItem(SESSION_KEY); db = loadDB(); currentUser = null; render(); }

function exportCurrentVisibleCSV() { exportLeadsCSV(); }

function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => deferredPrompt = null);
  } else toast('Use browser menu → Add to Home Screen / Install App');
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.warn));
}

render();

// Expose functions for inline handlers
Object.assign(window, { navigate, login, logout, installApp, openLeadModal, saveLead, closeModal, removeModal, filterLeadTable, deleteLead, moveStage, toggleDoc, saveDisbursement, toggleCompliance, adminTab, reportType, openUserModal, saveUser, openGenericModal, saveGeneric, openDocumentModal, saveDocument, toggleActive, exportLeadsCSV, exportCurrentReport, exportAuditCSV, exportBackup, importBackup, resetDB });
