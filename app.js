/* FLMS - File & Lead Movement System
   Static PWA version for GitHub Pages. Data is saved in browser localStorage.
   For real multi-user shared database, connect Firebase/Auth later.
*/

const APP_KEY = 'flms-pwa-db-v2';
const SESSION_KEY = 'flms-current-user-v1';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const fmtDate = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: value.includes('T') ? 'short' : undefined }) : '-';
const escapeHtml = (str = '') => String(str).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

const PERMISSION_DEFINITIONS = [
  ['createLead', 'Create new leads/files'],
  ['editLead', 'Edit all visible leads/files'],
  ['editOwnLead', 'Edit own/assigned leads only'],
  ['assignLead', 'Assign leads to users'],
  ['moveStage', 'Move file stages'],
  ['updateDocuments', 'Update document checklist'],
  ['saveDisbursement', 'Save disbursement details'],
  ['updateCompliance', 'Update compliance checklist'],
  ['requestLeadDelete', 'Request lead deletion'],
  ['approveLeadDelete', 'Approve lead deletion'],
  ['viewReports', 'View reports'],
  ['exportData', 'Export CSV/backup data'],
  ['backupData', 'Backup and restore data'],
  ['manageAdmin', 'Open admin setup'],
  ['viewAudit', 'View audit logs']
];

function defaultPermissions(role = 'user') {
  const all = Object.fromEntries(PERMISSION_DEFINITIONS.map(([key]) => [key, true]));
  if (role === 'admin') return all;
  if (role === 'manager') return {
    createLead: true, editLead: true, editOwnLead: true, assignLead: true, moveStage: true,
    updateDocuments: true, saveDisbursement: true, updateCompliance: true, requestLeadDelete: true,
    approveLeadDelete: false, viewReports: true, exportData: true, backupData: false, manageAdmin: false, viewAudit: false
  };
  return {
    createLead: true, editLead: false, editOwnLead: true, assignLead: false, moveStage: true,
    updateDocuments: true, saveDisbursement: false, updateCompliance: true, requestLeadDelete: true,
    approveLeadDelete: false, viewReports: false, exportData: false, backupData: false, manageAdmin: false, viewAudit: false
  };
}

let db = loadDB();
let currentUser = loadCurrentUser();
let currentRoute = location.hash.replace('#', '') || 'dashboard';
let currentLeadId = null;
let adminTab = 'users';
let reportType = 'leads';
let deferredPrompt = null;
let sidebarCollapsed = localStorage.getItem('flms_sidebar_collapsed') === '1';

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  localStorage.setItem('flms_sidebar_collapsed', sidebarCollapsed ? '1' : '0');
  render();
}

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
    'CIBIL / Eligibility Check', 'Field Investigation', 'PSIR', 'Valuation', 'Technical', 'Legal', 'Sanction',
    'Agreement / Documentation', 'Disbursement', 'Post-disbursement Compliance', 'Closed / Completed', 'Rejected'
  ].map((name, index) => ({ id: uid('stg'), name, order: index + 1, active: true, terminal: ['Closed / Completed', 'Rejected'].includes(name), createdAt }));
  const documents = [
    'Aadhaar Card', 'PAN Card', 'Customer Photo', 'Address Proof', 'Income Proof', 'Bank Statement', 'Property Documents', 'Gold Ornaments Details'
  ].map((name, i) => ({ id: uid('doc'), name, productId: i >= 6 ? products[i === 7 ? 0 : 3].id : '', required: true, active: true, createdAt }));
  const complianceParams = ['Agreement Completed', 'NACH / ECS Completed', 'Insurance Updated', 'Welcome Call Done', 'Document Dispatch Done', 'Original Document Received']
    .map(name => ({ id: uid('cmp'), name, active: true, createdAt }));
  const pendingReasons = ['Customer Not Available', 'Document Pending', 'Approval Pending', 'PSIR Pending', 'Valuation Pending', 'Technical Pending', 'Legal Pending', 'Advocate Pending', 'Valuer Pending', 'System Issue', 'Rejected by Customer']
    .map(name => ({ id: uid('rsn'), name, active: true, createdAt }));

  return {
    meta: { version: 1, createdAt, updatedAt: createdAt },
    settings: { appName: 'FLMS', branchLabel: 'Branch', currency: '₹' },
    users: [
      { id: adminId, name: 'Admin User', email: 'admin@flms.local', password: 'Admin@12345', role: 'admin', branchId, active: true, permissions: defaultPermissions('admin'), createdAt },
      { id: managerId, name: 'Branch Manager', email: 'manager@flms.local', password: 'Manager@123', role: 'manager', branchId, active: true, permissions: defaultPermissions('manager'), createdAt },
      { id: userId, name: 'Field User', email: 'user@flms.local', password: 'User@123', role: 'user', branchId, active: true, permissions: defaultPermissions('user'), createdAt }
    ],
    branches: [{ id: branchId, name: 'Main Branch', active: true, createdAt }],
    products,
    leadSources: ['Branch Generated', 'DST', 'DSA', 'Other'].map(name => ({ id: uid('src'), name, active: true, createdAt })),
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
    if (raw) {
      const parsed = migrateDB(JSON.parse(raw));
      localStorage.setItem(APP_KEY, JSON.stringify(parsed));
      return parsed;
    }
  } catch (e) { console.warn('DB load failed', e); }
  const fresh = migrateDB(seedDB());
  localStorage.setItem(APP_KEY, JSON.stringify(fresh));
  return fresh;
}

function migrateDB(database) {
  if (!database || typeof database !== 'object') database = seedDB();
  const createdAt = now();
  const requiredSources = ['Branch Generated', 'DST', 'DSA', 'Other'];
  database.leadSources = Array.isArray(database.leadSources) ? database.leadSources : [];
  requiredSources.forEach(name => {
    let item = database.leadSources.find(x => String(x.name).toLowerCase() === name.toLowerCase());
    if (!item) database.leadSources.push({ id: uid('src'), name, active: true, createdAt });
    else item.active = true;
  });
  database.leadSources.forEach(x => { if (!requiredSources.includes(x.name)) x.active = false; });

  const requiredStages = [
    'Lead Generated', 'Customer Contacted', 'Interested', 'Document Collection', 'Login / File Created',
    'CIBIL / Eligibility Check', 'Field Investigation', 'PSIR', 'Valuation', 'Technical', 'Legal', 'Sanction',
    'Agreement / Documentation', 'Disbursement', 'Post-disbursement Compliance', 'Closed / Completed', 'Rejected'
  ];
  database.stages = Array.isArray(database.stages) ? database.stages : [];
  requiredStages.forEach((name, index) => {
    let item = database.stages.find(x => String(x.name).toLowerCase() === name.toLowerCase());
    if (!item) database.stages.push({ id: uid('stg'), name, order: index + 1, active: true, terminal: ['Closed / Completed', 'Rejected'].includes(name), createdAt });
    else { item.order = index + 1; item.active = true; item.terminal = ['Closed / Completed', 'Rejected'].includes(name); }
  });
  database.stages.forEach(x => { if (x.name === 'Legal / Technical / Valuation') x.active = false; });

  database.users = Array.isArray(database.users) ? database.users : [];
  database.users.forEach(u => {
    u.permissions = { ...defaultPermissions(u.role), ...(u.permissions || {}) };
  });

  database.leads = Array.isArray(database.leads) ? database.leads : [];
  database.leads.forEach(l => {
    l.branchEmployeeName ??= '';
    l.dstName ??= '';
    l.dsaName ??= '';
    l.otherSourceName ??= '';
    l.processingTeamName ??= '';
    l.valuerName ??= '';
    l.advocateName ??= '';
    l.psirPersonName ??= '';
    l.deleteStatus ??= l.isDeleted ? 'approved' : 'none';
    l.deleteRequestedBy ??= '';
    l.deleteRequestedAt ??= '';
    l.deleteRequestReason ??= '';
    l.deleteApprovedBy ??= '';
    l.deleteApprovedAt ??= '';
    l.deleteRejectedBy ??= '';
    l.deleteRejectedAt ??= '';
    l.deleteRejectReason ??= '';
  });
  database.movements = Array.isArray(database.movements) ? database.movements : [];
  database.movements.forEach(m => {
    m.assignedDate ??= m.updatedAt ? String(m.updatedAt).slice(0, 10) : '';
    m.receivedDate ??= '';
  });
  database.meta = database.meta || {};
  database.meta.version = 3;
  return database;
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

function currentFullUser() {
  return currentUser ? db.users.find(u => u.id === currentUser.id) || currentUser : null;
}

function can(permission) {
  if (!currentUser) return false;
  const full = currentFullUser();
  if (!full || full.active === false) return false;
  if (full.role === 'admin') return true;
  const permissions = { ...defaultPermissions(full.role), ...(full.permissions || {}) };
  return permissions[permission] === true;
}

function ownsLead(lead) {
  return !!lead && (lead.assignedTo === currentUser?.id || lead.createdBy === currentUser?.id);
}

function canEditLead(lead) {
  return can('editLead') || (can('editOwnLead') && ownsLead(lead));
}

function getById(collection, id) { return db[collection].find(x => x.id === id); }
function activeItems(collection) { return db[collection].filter(x => x.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name))); }
function stageName(id) { return getById('stages', id)?.name || '-'; }
function productName(id) { return getById('products', id)?.name || '-'; }
function branchName(id) { return getById('branches', id)?.name || '-'; }
function userName(id) { return getById('users', id)?.name || '-'; }
function sourceName(id) { return getById('leadSources', id)?.name || '-'; }
function sourceDetail(lead) {
  const src = sourceName(lead?.leadSourceId);
  if (src === 'Branch Generated') return lead?.branchEmployeeName || '-';
  if (src === 'DST') return lead?.dstName || '-';
  if (src === 'DSA') return lead?.dsaName || '-';
  if (src === 'Other') return lead?.otherSourceName || '-';
  return '-';
}
function sourceDetailLabel(lead) {
  const src = sourceName(lead?.leadSourceId);
  if (src === 'Branch Generated') return 'Branch Employee';
  if (src === 'DST') return 'DST Name';
  if (src === 'DSA') return 'DSA Name';
  if (src === 'Other') return 'Other Source Name';
  return 'Source Detail';
}
function latestMovementForStage(leadId, stageKeyword) {
  return db.movements
    .filter(m => m.leadId === leadId && stageName(m.toStageId).toLowerCase().includes(stageKeyword.toLowerCase()))
    .sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
}
function stageDateSummary(leadId, stageKeyword) {
  const m = latestMovementForStage(leadId, stageKeyword);
  if (!m) return { assignedDate: '', receivedDate: '' };
  return { assignedDate: m.assignedDate || '', receivedDate: m.receivedDate || '' };
}
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
    tools: ['Tools', 'Handy calculators and utilities for loan processing'],
    emi: ['EMI Calculator', 'Estimate monthly instalment, total interest and amortization schedule'],
    leads: ['Leads & Files', 'Create leads and move files from generation to disbursement'],
    lead: ['File Details', 'Timeline, documents, disbursement and compliance'],
    admin: ['Admin Setup', 'Configure users, branches, products, stages and parameters'],
    reports: ['Reports', 'Filter, review and export movement data'],
    audit: ['Audit Logs', 'Every important action is recorded here'],
    backup: ['Backup & Restore', 'Export or import full local database backup']
  };
  return titles[currentRoute] || titles.dashboard;
}

function isRouteActive(route) {
  if (currentRoute === route) return true;
  // Keep "Tools" highlighted while viewing any individual tool sub-page.
  if (route === 'tools') return TOOLS.some(t => t.route === currentRoute);
  return false;
}

function navItemList() {
  return [
    ['dashboard', '📊', 'Dashboard'],
    ['leads', '📁', 'Files'],
    ['tools', '🧰', 'Tools'],
    ...(can('viewReports') ? [['reports', '📈', 'Reports']] : []),
    ...(can('manageAdmin') ? [['admin', '⚙️', 'Admin']] : []),
    ...(can('viewAudit') ? [['audit', '🧾', 'Audit']] : []),
    ...(can('backupData') ? [['backup', '💾', 'Backup']] : [])
  ];
}

function navButtons() {
  return navItemList().map(([route, icon, label]) => `<button class="${isRouteActive(route) ? 'active' : ''}" onclick="navigate('${route}')" title="${escapeHtml(label)}"><span class="icon">${icon}</span><span class="lbl">${label}</span></button>`).join('');
}

function drawerNav() {
  return navItemList().map(([route, icon, label]) => `<button class="${isRouteActive(route) ? 'active' : ''}" onclick="navigate('${route}');closeDrawer()"><span class="icon">${icon}</span><span class="lbl">${label}</span></button>`).join('');
}

function mobileNavButtons() {
  // Primary tabs live in the bottom bar; everything else is in the drawer.
  const items = [
    ['dashboard', '📊', 'Home'],
    ['leads', '📁', 'Files'],
    ['tools', '🧰', 'Tools'],
    ...(can('viewReports') ? [['reports', '📈', 'Reports']] : []),
    ...(can('manageAdmin') ? [['admin', '⚙️', 'Admin']] : [])
  ];
  return items.slice(0, 5).map(([route, icon, label]) => `<button class="${isRouteActive(route) ? 'active' : ''}" onclick="navigate('${route}')"><span class="mi">${icon}</span><span class="mlbl">${label}</span></button>`).join('');
}

function menuAction() {
  if (window.innerWidth <= 980) openDrawer();
  else toggleSidebar();
}

function openDrawer() {
  if (document.getElementById('navDrawer')) return;
  const html = `<div id="navDrawer" class="drawer-backdrop" onclick="drawerBackdrop(event)">
    <aside class="drawer" onclick="event.stopPropagation()">
      <div class="brand">
        <div class="logo">F</div>
        <div><div class="brand-title">${escapeHtml(db.settings.appName || 'FLMS')}</div><div class="brand-subtitle">File & Lead Movement</div></div>
      </div>
      <nav class="nav">${drawerNav()}</nav>
      <div class="sidebar-footer">
        <div class="user-chip"><b>${escapeHtml(currentUser.name)}</b><span>${escapeHtml(currentUser.email)} · ${escapeHtml(currentUser.role)}</span></div>
        <button class="btn full ghost" onclick="logout()">Logout</button>
      </div>
    </aside></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  requestAnimationFrame(() => document.getElementById('navDrawer')?.classList.add('open'));
}
function closeDrawer() {
  const d = document.getElementById('navDrawer');
  if (!d) return;
  d.classList.remove('open');
  setTimeout(() => d.remove(), 220);
}
function drawerBackdrop(e) { if (e.target.id === 'navDrawer') closeDrawer(); }

function renderShell(content) {
  const [title, subtitle] = pageTitle();
  return `
    <div class="app-shell${sidebarCollapsed ? ' collapsed' : ''}">
      <aside class="sidebar">
        <div class="brand">
          <div class="logo">F</div>
          <div class="brand-text"><div class="brand-title">${escapeHtml(db.settings.appName || 'FLMS')}</div><div class="brand-subtitle">File & Lead Movement</div></div>
        </div>
        <nav class="nav">${navButtons()}</nav>
        <div class="sidebar-footer">
          <div class="user-chip"><b>${escapeHtml(currentUser.name)}</b><span>${escapeHtml(currentUser.email)} · ${escapeHtml(currentUser.role)}</span></div>
          <button class="btn full ghost" onclick="logout()"><span class="ico">⎋</span><span class="lbl">Logout</span></button>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="topbar-left">
            <button class="icon-btn sidebar-toggle" onclick="menuAction()" title="Menu" aria-label="Toggle menu">☰</button>
            <div class="topbar-head"><h1>${title}</h1><p>${subtitle}</p></div>
          </div>
          <div class="btn-row topbar-actions">
            <button class="btn icon-btn" onclick="refreshApp()" title="Update to latest version"><span class="ico">🔄</span><span class="lbl">Update</span></button>
            <button class="btn icon-btn" onclick="installApp()" title="Install app"><span class="ico">📲</span><span class="lbl">Install</span></button>
            <button class="btn icon-btn" onclick="logout()" title="Logout"><span class="ico">⎋</span><span class="lbl">Logout</span></button>
          </div>
        </header>
        <section class="content">${content}</section>
      </main>
      <nav class="mobile-bottom">${mobileNavButtons()}</nav>
      ${currentRoute !== 'lead' && can('createLead') ? `<button class="fab" title="Add Lead" onclick="openLeadModal()">+</button>` : ''}
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
  else if (currentRoute === 'tools') content = renderTools();
  else if (currentRoute === 'emi') content = renderEmi();
  else if (currentRoute === 'leads') content = renderLeads();
  else if (currentRoute === 'lead') content = renderLeadDetail(currentLeadId);
  else if (currentRoute === 'admin' && can('manageAdmin')) content = renderAdmin();
  else if (currentRoute === 'reports' && can('viewReports')) content = renderReports();
  else if (currentRoute === 'audit' && can('viewAudit')) content = renderAudit();
  else if (currentRoute === 'backup' && can('backupData')) content = renderBackup();
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
      ${kpi('Total Files', leads.length, '📁', 'All visible leads/files', "navigate('leads')")}
      ${kpi('Active Files', active, '⚡', 'Not closed or rejected', "navigate('leads')")}
      ${kpi('Disbursed', disbursed, '✅', 'Disbursement stage/status', "gotoReport('disbursed')")}
      ${kpi('Compliance Pending', compliancePending, '🧾', 'Post-disbursement pending', "gotoReport('compliance')")}
      ${kpi('Today Follow-ups', todayFollow, '📞', 'Due today', "gotoReport('followups')")}
      ${kpi('Overdue Follow-ups', overdue, '⏰', 'Past due date', "gotoReport('followups')")}
      ${kpi('Rejected', leads.filter(l => l.status === 'Rejected').length, '🚫', 'Rejected files', "navigate('leads')")}
      ${kpi('Products', activeItems('products').length, '🏦', 'Active loan products', can('manageAdmin') ? "navigate('admin')" : '')}
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title"><h2>Stage-wise Movement</h2>${can('viewReports') ? `<button class="btn" onclick="navigate('reports')">View Reports</button>` : ''}</div>
        ${stageCounts.length ? `<div class="bar-list">${stageCounts.map(x => `<div class="bar-row"><div class="bar-head"><b>${escapeHtml(x.name)}</b><span>${x.count}</span></div><div class="bar-bg"><div class="bar-fill" style="width:${Math.round((x.count / maxStage) * 100)}%"></div></div></div>`).join('')}</div>` : `<div class="empty">No file movement yet. Add your first lead.</div>`}
      </div>
      <div class="card">
        <div class="card-title"><h2>Recent Files</h2>${can('createLead') ? `<button class="btn primary" onclick="openLeadModal()">Add Lead</button>` : ''}</div>
        ${recent.length ? renderMiniLeadList(recent) : `<div class="empty">No leads available.</div>`}
      </div>
    </div>`;
}

function kpi(label, value, icon, desc, onclick = '') {
  const clickable = onclick ? ` kpi-click" role="button" tabindex="0" onclick="${onclick}` : '';
  return `<div class="card kpi${clickable}"><div><div class="muted small">${escapeHtml(label)}</div><div class="big-number">${value}</div><div class="muted small">${escapeHtml(desc)}</div></div><div class="bubble">${icon}</div></div>`;
}

function gotoReport(type) {
  if (!can('viewReports')) return navigate('leads');
  reportType = type;
  navigate('reports');
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
        <div class="btn-row">${can('exportData') ? `<button class="btn" onclick="exportLeadsCSV()">Export CSV</button>` : ''}${can('createLead') ? `<button class="btn primary" onclick="openLeadModal()">+ New Lead</button>` : ''}</div>
      </div>
      <div class="filter-bar">
        <div class="search-wrap"><span class="search-ico">🔍</span><input class="input" id="leadSearch" placeholder="Search customer, mobile, valuer, advocate…" oninput="filterLeadTable()" /></div>
        <select class="select" id="stageFilter" onchange="filterLeadTable()"><option value="">All stages</option>${activeItems('stages').map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select>
        <select class="select" id="productFilter" onchange="filterLeadTable()"><option value="">All products</option>${activeItems('products').map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>
        <select class="select" id="statusFilter" onchange="filterLeadTable()"><option value="">All status</option>${['New','Active','Pending','Disbursed','Completed','Rejected','Closed'].map(s => `<option>${s}</option>`).join('')}</select>
        <button class="btn ghost" onclick="clearLeadFilters()" title="Clear all filters">Clear</button>
      </div>
      <div class="result-count"><span id="leadCount">${leads.length}</span> file${leads.length === 1 ? '' : 's'} shown</div>
      <div id="leadTable">${renderLeadTable(leads)}</div>
    </div>`;
}

function renderLeadTable(leads) {
  if (!leads.length) return `<div class="empty">No leads found. Create your first lead.</div>`;
  return `<div class="table-wrap cards"><table><thead><tr><th>Customer</th><th>Product</th><th>Stage</th><th>Status</th><th>Assigned</th><th>Follow-up</th><th>Updated</th><th>Action</th></tr></thead><tbody>
    ${leads.map(l => `<tr data-search="${escapeHtml((l.customerName + ' ' + l.mobile + ' ' + productName(l.productId) + ' ' + (l.subProduct || '') + ' ' + sourceDetail(l) + ' ' + (l.processingTeamName || '') + ' ' + (l.valuerName || '') + ' ' + (l.advocateName || '') + ' ' + (l.psirPersonName || '')).toLowerCase())}" data-stage="${l.currentStageId}" data-product="${l.productId}" data-status="${l.status}">
      <td data-label="Customer"><b>${escapeHtml(l.customerName)}</b><div class="muted small">${escapeHtml(l.mobile)}${l.alternateMobile ? ' / ' + escapeHtml(l.alternateMobile) : ''}</div></td>
      <td data-label="Product">${escapeHtml(productName(l.productId))}${l.subProduct ? ` <span class="badge gray">${escapeHtml(l.subProduct)}</span>` : ''}<div class="muted small">${escapeHtml(sourceName(l.leadSourceId))}: ${escapeHtml(sourceDetail(l))}</div></td>
      <td data-label="Stage"><span class="badge blue">${escapeHtml(stageName(l.currentStageId))}</span></td>
      <td data-label="Status">${statusBadge(l.status)}${l.deleteStatus === 'pending' ? '<br><span class="badge amber">Delete Requested</span>' : l.deleteStatus === 'rejected' ? '<br><span class="badge gray">Delete Rejected</span>' : ''}</td>
      <td data-label="Assigned">${escapeHtml(userName(l.assignedTo))}<div class="muted small">${escapeHtml(branchName(l.branchId))}</div></td>
      <td data-label="Follow-up">${l.nextFollowUpDate ? `<span class="badge ${isOverdue(l.nextFollowUpDate) ? 'red' : l.nextFollowUpDate === today() ? 'amber' : 'gray'}">${escapeHtml(l.nextFollowUpDate)}</span>` : '-'}</td>
      <td data-label="Updated">${fmtDate(l.updatedAt || l.createdAt)}</td>
      <td data-label="Action"><div class="btn-row"><button class="btn" onclick="navigate('lead','${l.id}')">Open</button>${leadDeleteAction(l)}</div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function filterLeadTable() {
  const q = ($('#leadSearch')?.value || '').toLowerCase();
  const st = $('#stageFilter')?.value || '';
  const prd = $('#productFilter')?.value || '';
  const status = $('#statusFilter')?.value || '';
  let shown = 0;
  $$('#leadTable tbody tr').forEach(row => {
    const match = (!q || row.dataset.search.includes(q)) && (!st || row.dataset.stage === st) && (!prd || row.dataset.product === prd) && (!status || row.dataset.status === status);
    row.style.display = match ? '' : 'none';
    if (match) shown++;
  });
  const countEl = $('#leadCount');
  if (countEl) {
    countEl.textContent = shown;
    countEl.parentElement.innerHTML = `<span id="leadCount">${shown}</span> file${shown === 1 ? '' : 's'} shown`;
  }
}

function clearLeadFilters() {
  if ($('#leadSearch')) $('#leadSearch').value = '';
  ['#stageFilter', '#productFilter', '#statusFilter'].forEach(sel => { if ($(sel)) $(sel).value = ''; });
  filterLeadTable();
}

function openLeadModal(id = null) {
  const lead = id ? db.leads.find(l => l.id === id) : null;
  if (!id && !can('createLead')) return toast('You do not have permission to create leads');
  if (id && !canEditLead(lead)) return toast('You do not have permission to edit this lead');
  const firstStage = activeItems('stages')[0];
  const html = `
    <div class="modal-backdrop" onclick="closeModal(event)"><form class="modal wide-modal" onclick="event.stopPropagation()" onsubmit="saveLead(event, '${id || ''}')">
      <div class="modal-head"><h2>${lead ? 'Edit Lead' : 'Create New Lead'}</h2><button type="button" class="close" onclick="removeModal()">×</button></div>
      <div class="section-title">Customer & Product</div>
      <div class="form-grid">
        ${field('Customer Name','customerName','text',lead?.customerName || '', true)}
        ${field('Mobile Number','mobile','tel',lead?.mobile || '', true)}
        ${field('Alternate Mobile','alternateMobile','tel',lead?.alternateMobile || '')}
        ${selectField('Branch','branchId',activeItems('branches'),lead?.branchId || currentUser.branchId,true)}
        ${selectField('Product','productId',activeItems('products'),lead?.productId || '',true)}
        ${subProductField(lead?.subProduct || '')}
        ${sourceSelectField(lead?.leadSourceId || '')}
        ${sourceDetailInput('Branch Employee Name','branchEmployeeName','branch',lead?.branchEmployeeName || '')}
        ${sourceDetailInput('DST Name','dstName','dst',lead?.dstName || '')}
        ${sourceDetailInput('DSA Name','dsaName','dsa',lead?.dsaName || '')}
        ${sourceDetailInput('Other Source Name','otherSourceName','other',lead?.otherSourceName || '')}
        ${can('assignLead') ? selectField('Assigned To','assignedTo',db.users.filter(u => u.active !== false),lead?.assignedTo || currentUser.id,true) : `<input type="hidden" name="assignedTo" value="${currentUser.id}">`}
        ${field('Loan Amount','loanAmount','number',lead?.loanAmount || '')}
        ${field('Next Follow-up Date','nextFollowUpDate','date',lead?.nextFollowUpDate || '')}
        ${selectSimple('Priority','priority',['Normal','High','Urgent'],lead?.priority || 'Normal')}
        ${lead ? selectField('Current Stage','currentStageId',activeItems('stages'),lead.currentStageId,true) : `<input type="hidden" name="currentStageId" value="${firstStage?.id || ''}">`}
        ${selectSimple('Status','status',['New','Active','Pending','Disbursed','Completed','Rejected','Closed'],lead?.status || 'New')}
      </div><br>
      <div class="section-title">Processing & Critical Monitoring Persons</div>
      <div class="form-grid">
        ${field('Processing Team Name','processingTeamName','text',lead?.processingTeamName || '', true)}
        ${field('Valuer Name','valuerName','text',lead?.valuerName || '', true)}
        ${field('Advocate Name','advocateName','text',lead?.advocateName || '', true)}
        ${field('PSIR Person Name','psirPersonName','text',lead?.psirPersonName || '', true)}
      </div><br>
      <div class="field"><label>Address</label><textarea class="textarea" name="address">${escapeHtml(lead?.address || '')}</textarea></div><br>
      <div class="field"><label>Remarks</label><textarea class="textarea" name="remarks">${escapeHtml(lead?.remarks || '')}</textarea></div><br>
      <div class="btn-row"><button class="btn primary" type="submit">Save Lead</button><button class="btn" type="button" onclick="removeModal()">Cancel</button></div>
    </form></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  updateSourceFields();
}

function sourceSelectField(value = '') {
  return `<div class="field"><label>Lead Source</label><select class="select" name="leadSourceId" required onchange="updateSourceFields()"><option value="">Select</option>${activeItems('leadSources').map(i => `<option value="${i.id}" ${i.id === value ? 'selected' : ''}>${escapeHtml(i.name)}</option>`).join('')}</select></div>`;
}
function sourceDetailInput(label, name, key, value = '') {
  return `<div class="field source-detail" data-source-key="${key}"><label>${escapeHtml(label)}</label><input class="input" name="${name}" type="text" value="${escapeHtml(value)}"></div>`;
}
function updateSourceFields() {
  const select = document.querySelector('select[name="leadSourceId"]');
  if (!select) return;
  const selectedName = select.options[select.selectedIndex]?.text || '';
  const map = { 'Branch Generated': 'branch', 'DST': 'dst', 'DSA': 'dsa', 'Other': 'other' };
  const key = map[selectedName] || '';
  $$('.source-detail').forEach(el => {
    const input = $('input', el);
    const show = el.dataset.sourceKey === key;
    el.style.display = show ? '' : 'none';
    if (input) input.required = show;
  });
}
function field(label, name, type = 'text', value = '', required = false) {
  return `<div class="field"><label>${escapeHtml(label)}</label><input class="input" name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? 'required' : ''}></div>`;
}
function subProductOptions() {
  return [...new Set(db.leads.map(l => (l.subProduct || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
function subProductField(value = '') {
  const opts = subProductOptions();
  return `<div class="field"><label>Sub Product (optional)</label><input class="input" name="subProduct" type="text" list="subProductList" value="${escapeHtml(value)}" placeholder="Type or pick a sub product"><datalist id="subProductList">${opts.map(s => `<option value="${escapeHtml(s)}"></option>`).join('')}</datalist></div>`;
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
    const existingLead = db.leads.find(l => l.id === id);
    if (!canEditLead(existingLead)) return toast('You do not have permission to edit this lead');
    const idx = db.leads.findIndex(l => l.id === id);
    if (idx < 0) return;
    const old = { ...db.leads[idx] };
    db.leads[idx] = { ...db.leads[idx], ...data, loanAmount: Number(data.loanAmount || 0), updatedAt: now() };
    audit('lead_updated', 'lead', id, old, db.leads[idx]);
  } else {
    if (!can('createLead')) return toast('You do not have permission to create leads');
    const lead = { id: uid('lead'), ...data, loanAmount: Number(data.loanAmount || 0), createdBy: currentUser.id, createdAt: now(), updatedAt: now(), isDeleted: false, deleteStatus: 'none' };
    db.leads.unshift(lead);
    db.movements.unshift({ id: uid('mov'), leadId: lead.id, fromStageId: '', toStageId: lead.currentStageId, status: lead.status, remarks: 'Lead created', pendingReasonId: '', assignedDate: today(), receivedDate: today(), updatedBy: currentUser.id, updatedAt: now(), nextFollowUpDate: lead.nextFollowUpDate || '' });
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

function leadDeleteAction(lead) {
  if (!lead) return '';
  if (lead.deleteStatus === 'pending') {
    if (can('approveLeadDelete')) return `<button class="btn danger" onclick="adminTab='deleteRequests'; navigate('admin')">Review Delete</button>`;
    return `<button class="btn" disabled>Delete Pending</button>`;
  }
  if (!can('requestLeadDelete')) return '';
  return `<button class="btn danger" onclick="requestLeadDelete('${lead.id}')">Request Delete</button>`;
}

function requestLeadDelete(id) {
  if (!can('requestLeadDelete')) return toast('You do not have permission to request deletion');
  const lead = db.leads.find(l => l.id === id && !l.isDeleted);
  if (!lead) return;
  if (lead.deleteStatus === 'pending') return toast('Delete request already pending with admin');
  const reason = prompt('Enter reason for delete request. Admin approval is required.');
  if (reason === null) return;
  if (!reason.trim()) return toast('Delete reason is required');
  lead.deleteStatus = 'pending';
  lead.deleteRequestedBy = currentUser.id;
  lead.deleteRequestedAt = now();
  lead.deleteRequestReason = reason.trim();
  lead.deleteApprovedBy = '';
  lead.deleteApprovedAt = '';
  lead.deleteRejectedBy = '';
  lead.deleteRejectedAt = '';
  lead.deleteRejectReason = '';
  lead.updatedAt = now();
  audit('lead_delete_requested', 'lead', id, null, { reason: reason.trim() });
  saveDB(); toast('Delete request sent to admin'); render();
}

function approveLeadDelete(id) {
  if (!can('approveLeadDelete')) return toast('Only authorized admin can approve delete');
  const lead = db.leads.find(l => l.id === id && !l.isDeleted);
  if (!lead) return;
  if (lead.deleteStatus !== 'pending') return toast('No pending delete request found');
  if (!confirm(`Approve deletion of ${lead.customerName}? This will remove it from active records.`)) return;
  lead.deleteStatus = 'approved';
  lead.isDeleted = true;
  lead.deleteApprovedBy = currentUser.id;
  lead.deleteApprovedAt = now();
  lead.updatedAt = now();
  audit('lead_delete_approved', 'lead', id, { requestedBy: lead.deleteRequestedBy, reason: lead.deleteRequestReason });
  saveDB(); toast('Lead deleted after admin approval'); render();
}

function rejectLeadDelete(id) {
  if (!can('approveLeadDelete')) return toast('Only authorized admin can reject delete');
  const lead = db.leads.find(l => l.id === id && !l.isDeleted);
  if (!lead) return;
  if (lead.deleteStatus !== 'pending') return toast('No pending delete request found');
  const reason = prompt('Enter reason for rejecting delete request');
  if (reason === null) return;
  lead.deleteStatus = 'rejected';
  lead.deleteRejectedBy = currentUser.id;
  lead.deleteRejectedAt = now();
  lead.deleteRejectReason = reason.trim();
  lead.updatedAt = now();
  audit('lead_delete_rejected', 'lead', id, { requestedBy: lead.deleteRequestedBy, requestReason: lead.deleteRequestReason }, { rejectReason: reason.trim() });
  saveDB(); toast('Delete request rejected'); render();
}

function renderLeadDetail(id) {
  const lead = db.leads.find(l => l.id === id && !l.isDeleted);
  if (!lead) return `<div class="empty">File not found. <button class="btn" onclick="navigate('leads')">Back to Files</button></div>`;
  const docs = db.leadDocuments.filter(d => d.leadId === lead.id);
  const comp = db.complianceRecords.filter(c => c.leadId === lead.id);
  const movements = db.movements.filter(m => m.leadId === lead.id).sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const disb = db.disbursements.find(d => d.leadId === lead.id) || {};
  return `
    <div class="btn-row" style="margin-bottom:14px"><button class="btn" onclick="navigate('leads')">← Back</button>${canEditLead(lead) ? `<button class="btn" onclick="openLeadModal('${lead.id}')">Edit Lead</button>` : ''}${leadDeleteAction(lead)}<button class="btn primary" onclick="window.print()">Print</button></div>
    <div class="grid grid-3">
      <div class="card"><div class="muted small">Customer</div><h2>${escapeHtml(lead.customerName)}</h2><p class="muted">${escapeHtml(lead.mobile)}${lead.alternateMobile ? ' / ' + escapeHtml(lead.alternateMobile) : ''}</p>${statusBadge(lead.status)}</div>
      <div class="card"><div class="muted small">Current Stage</div><h2>${escapeHtml(stageName(lead.currentStageId))}</h2><p class="muted">Assigned: ${escapeHtml(userName(lead.assignedTo))}</p></div>
      <div class="card"><div class="muted small">Product & Amount</div><h2>${escapeHtml(productName(lead.productId))}</h2>${lead.subProduct ? `<p class="muted small">Sub Product: <b>${escapeHtml(lead.subProduct)}</b></p>` : ''}<p class="muted">${db.settings.currency || '₹'} ${Number(lead.loanAmount || 0).toLocaleString()}</p></div>
    </div>
    ${renderMonitoringSummary(lead)}
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title"><h2>Move File Stage</h2></div>
        ${can('moveStage') ? `<form onsubmit="moveStage(event, '${lead.id}')">
          <div class="form-grid">
            ${selectField('New Stage','toStageId',activeItems('stages'),lead.currentStageId,true)}
            ${selectSimple('Status','status',['Active','Pending','Disbursed','Completed','Rejected','Closed'],lead.status || 'Active')}
            ${selectField('Pending Reason','pendingReasonId',activeItems('pendingReasons'),'',false)}
            ${field('Assigned / Allotted Date','assignedDate','date',today(),true)}
            ${field('Received Date','receivedDate','date','',true)}
            ${field('Next Follow-up','nextFollowUpDate','date',lead.nextFollowUpDate || '')}
          </div><br>
          <div class="field"><label>Movement Remarks</label><textarea class="textarea" name="remarks" placeholder="Enter clear remarks" required></textarea></div><br>
          <button class="btn primary" type="submit">Save Movement</button>
        </form>` : `<div class="empty">You do not have permission to move file stages.</div>`}
      </div>
      <div class="card">
        <div class="card-title"><h2>Movement Timeline</h2></div>
        ${movements.length ? `<div class="timeline">${movements.map((m,i) => `<div class="timeline-item"><div class="timeline-dot">${movements.length-i}</div><div class="timeline-card"><b>${escapeHtml(m.fromStageId ? stageName(m.fromStageId) + ' → ' : '')}${escapeHtml(stageName(m.toStageId))}</b><div>${statusBadge(m.status)} ${m.pendingReasonId ? `<span class="badge amber">${escapeHtml(reasonName(m.pendingReasonId))}</span>` : ''}</div><p class="muted small">${escapeHtml(m.remarks || '-')}</p><div class="small muted">Assigned: ${escapeHtml(m.assignedDate || '-')} · Received: ${escapeHtml(m.receivedDate || '-')}</div><div class="small muted">${escapeHtml(userName(m.updatedBy))} · ${fmtDate(m.updatedAt)} ${m.nextFollowUpDate ? '· Follow-up: ' + escapeHtml(m.nextFollowUpDate) : ''}</div></div></div>`).join('')}</div>` : `<div class="empty">No movement recorded.</div>`}
      </div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-title"><h2>Document Checklist</h2><span class="badge blue">${docs.filter(d => d.received).length}/${docs.length}</span></div>
        ${docs.length ? `<div class="check-list">${docs.map(d => `<div class="check-row ${d.received ? 'done' : ''}"><div><b>${escapeHtml(d.documentName)}</b><div class="muted small">${d.required ? 'Required' : 'Optional'} ${d.receivedDate ? '· Received: ' + escapeHtml(d.receivedDate) : ''}</div></div>${can('updateDocuments') ? `<button class="btn ${d.received ? 'success' : ''}" onclick="toggleDoc('${d.id}')">${d.received ? 'Received' : 'Mark Received'}</button>` : `<span class="badge gray">View Only</span>`}</div>`).join('')}</div>` : `<div class="empty">No document parameters found for this product.</div>`}
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
          ${can('saveDisbursement') ? `<button class="btn primary" type="submit">Save Disbursement</button>` : `<div class="empty">You do not have permission to save disbursement details.</div>`}
        </form>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-title"><h2>Post-disbursement Compliance</h2><span class="badge green">${comp.filter(c => c.completed).length}/${comp.length}</span></div>
      ${comp.length ? `<div class="grid grid-2">${comp.map(c => `<div class="check-row ${c.completed ? 'done' : ''}"><div><b>${escapeHtml(c.name)}</b><div class="muted small">${c.completedDate ? 'Completed: ' + escapeHtml(c.completedDate) : 'Pending'}</div></div>${can('updateCompliance') ? `<button class="btn ${c.completed ? 'success' : ''}" onclick="toggleCompliance('${c.id}')">${c.completed ? 'Completed' : 'Mark Done'}</button>` : `<span class="badge gray">View Only</span>`}</div>`).join('')}</div>` : `<div class="empty">No compliance parameters found.</div>`}
    </div>`;
}

function renderMonitoringSummary(lead) {
  const legal = stageDateSummary(lead.id, 'Legal');
  const valuation = stageDateSummary(lead.id, 'Valuation');
  const technical = stageDateSummary(lead.id, 'Technical');
  const psir = stageDateSummary(lead.id, 'PSIR');
  const rows = [
    ['Lead Source', `${sourceName(lead.leadSourceId)} / ${sourceDetail(lead)}`],
    ['Processing Team', lead.processingTeamName || '-'],
    ['Valuer', lead.valuerName || '-'],
    ['Advocate', lead.advocateName || '-'],
    ['PSIR Person', lead.psirPersonName || '-']
  ];
  const dateRows = [
    ['PSIR', psir], ['Valuation', valuation], ['Technical', technical], ['Legal', legal]
  ];
  return `<div class="card" style="margin-top:16px">
    <div class="card-title"><h2>Critical Monitoring</h2><span class="badge purple">PSIR / Valuation / Technical / Legal</span></div>
    <div class="grid grid-2">
      <div class="mini-table">${rows.map(r => `<div class="info-row"><span>${escapeHtml(r[0])}</span><b>${escapeHtml(r[1])}</b></div>`).join('')}</div>
      <div class="mini-table">${dateRows.map(([label, d]) => `<div class="info-row"><span>${escapeHtml(label)}</span><b>Assigned: ${escapeHtml(d.assignedDate || '-')} · Received: ${escapeHtml(d.receivedDate || '-')}</b></div>`).join('')}</div>
    </div>
  </div>`;
}

function moveStage(event, leadId) {
  event.preventDefault();
  if (!can('moveStage')) return toast('You do not have permission to move stages');
  const data = formData(event.target);
  const lead = db.leads.find(l => l.id === leadId);
  const oldStage = lead.currentStageId;
  if (!data.assignedDate || !data.receivedDate) return toast('Assigned date and received date are required for every stage movement');
  lead.currentStageId = data.toStageId;
  lead.status = data.status;
  lead.nextFollowUpDate = data.nextFollowUpDate || '';
  lead.remarks = data.remarks;
  lead.updatedAt = now();
  db.movements.unshift({ id: uid('mov'), leadId, fromStageId: oldStage, toStageId: data.toStageId, status: data.status, remarks: data.remarks, pendingReasonId: data.pendingReasonId || '', assignedDate: data.assignedDate || '', receivedDate: data.receivedDate || '', updatedBy: currentUser.id, updatedAt: now(), nextFollowUpDate: data.nextFollowUpDate || '' });
  audit('stage_changed', 'lead', leadId, { stage: oldStage }, { stage: data.toStageId, status: data.status });
  saveDB(); toast('Movement saved'); render();
}

function toggleDoc(id) {
  if (!can('updateDocuments')) return toast('You do not have permission to update documents');
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
  if (!can('saveDisbursement')) return toast('You do not have permission to save disbursement details');
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
  if (!can('updateCompliance')) return toast('You do not have permission to update compliance');
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
    ['users','Users'], ['deleteRequests','Delete Requests'], ['branches','Branches'], ['products','Products'], ['leadSources','Lead Sources'], ['stages','Stages'], ['documents','Documents'], ['complianceParams','Compliance'], ['pendingReasons','Pending Reasons']
  ];
  return `<div class="card"><div class="tabs">${tabs.map(t => `<button class="tab ${adminTab === t[0] ? 'active' : ''}" onclick="adminTab='${t[0]}'; render()">${t[1]}</button>`).join('')}</div>${renderAdminTab()}</div>`;
}

function renderAdminTab() {
  if (adminTab === 'users') return renderUsersAdmin();
  if (adminTab === 'deleteRequests') return renderDeleteRequestsAdmin();
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
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Rights</th><th>Status</th><th>Action</th></tr></thead><tbody>
      ${db.users.map(u => `<tr><td><b>${escapeHtml(u.name)}</b></td><td>${escapeHtml(u.email)}</td><td>${roleBadge(u.role)}</td><td>${escapeHtml(branchName(u.branchId))}</td><td><span class="badge blue">${Object.values({ ...defaultPermissions(u.role), ...(u.permissions || {}) }).filter(Boolean).length} rights</span></td><td>${u.active ? '<span class="badge green">Active</span>' : '<span class="badge red">Inactive</span>'}</td><td><div class="btn-row"><button class="btn" onclick="openUserModal('${u.id}')">Edit</button><button class="btn" onclick="toggleActive('users','${u.id}')">${u.active ? 'Deactivate' : 'Activate'}</button></div></td></tr>`).join('')}
    </tbody></table></div>`;
}

function permissionCheckboxes(user) {
  const role = user?.role || 'user';
  const perms = { ...defaultPermissions(role), ...(user?.permissions || {}) };
  return `<div class="permissions-grid">${PERMISSION_DEFINITIONS.map(([key, label]) => `<label class="check-tile"><input type="checkbox" name="perm_${key}" ${perms[key] ? 'checked' : ''}> <span>${escapeHtml(label)}</span></label>`).join('')}</div>`;
}

function applyRoleDefaultsInUserModal() {
  const form = document.querySelector('.modal form');
  if (!form) return;
  const role = form.querySelector('[name="role"]')?.value || 'user';
  const defaults = defaultPermissions(role);
  PERMISSION_DEFINITIONS.forEach(([key]) => {
    const box = form.querySelector(`[name="perm_${key}"]`);
    if (box) box.checked = !!defaults[key];
  });
}

function openUserModal(id = '') {
  const u = id ? getById('users', id) : null;
  const html = `<div class="modal-backdrop" onclick="closeModal(event)"><form class="modal wide-modal" onclick="event.stopPropagation()" onsubmit="saveUser(event,'${id}')"><div class="modal-head"><h2>${u ? 'Edit User' : 'Add User'}</h2><button type="button" class="close" onclick="removeModal()">×</button></div><div class="form-grid">
    ${field('Name','name','text',u?.name || '',true)}${field('Email','email','email',u?.email || '',true)}${field('Password','password','text',u?.password || '',true)}${selectSimple('Role','role',['admin','manager','user'],u?.role || 'user').replace('<select class="select" name="role">','<select class="select" name="role" onchange="applyRoleDefaultsInUserModal()">')}${selectField('Branch','branchId',activeItems('branches'),u?.branchId || currentUser.branchId,true)}${selectSimple('Status','active',['true','false'],String(u?.active ?? true))}
  </div><br><div class="section-title">User Rights / Permissions</div>${permissionCheckboxes(u)}<br><div class="btn-row"><button class="btn primary" type="submit">Save User</button><button class="btn" type="button" onclick="removeModal()">Cancel</button></div></form></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function saveUser(event, id) {
  event.preventDefault();
  const data = formData(event.target);
  data.email = data.email.trim().toLowerCase();
  data.active = data.active === 'true';
  const permissions = {};
  PERMISSION_DEFINITIONS.forEach(([key]) => { permissions[key] = event.target[`perm_${key}`]?.checked === true; delete data[`perm_${key}`]; });
  data.permissions = permissions;
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

function renderDeleteRequestsAdmin() {
  const requests = db.leads
    .filter(l => !l.isDeleted && l.deleteStatus === 'pending')
    .sort((a, b) => new Date(b.deleteRequestedAt || b.updatedAt) - new Date(a.deleteRequestedAt || a.updatedAt));
  return `<div class="card-title"><h2>Lead Delete Requests</h2><span class="badge amber">${requests.length} pending</span></div>
    ${requests.length ? `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Product/Stage</th><th>Requested By</th><th>Reason</th><th>Date</th><th>Action</th></tr></thead><tbody>
      ${requests.map(l => `<tr><td><b>${escapeHtml(l.customerName)}</b><div class="muted small">${escapeHtml(l.mobile)}</div></td><td>${escapeHtml(productName(l.productId))}<div class="muted small">${escapeHtml(stageName(l.currentStageId))}</div></td><td>${escapeHtml(userName(l.deleteRequestedBy))}</td><td>${escapeHtml(l.deleteRequestReason || '-')}</td><td>${fmtDate(l.deleteRequestedAt)}</td><td><div class="btn-row"><button class="btn" onclick="navigate('lead','${l.id}')">Open</button><button class="btn danger" onclick="approveLeadDelete('${l.id}')">Approve Delete</button><button class="btn" onclick="rejectLeadDelete('${l.id}')">Reject</button></div></td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty">No pending delete approval requests.</div>`}`;
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
  return `<div class="card"><div class="card-title"><h2>Reports</h2><div class="btn-row">${can('exportData') ? `<button class="btn" onclick="exportCurrentReport()">Export CSV</button>` : ''}<button class="btn" onclick="window.print()">Print</button></div></div><div class="tabs">${types.map(t => `<button class="tab ${reportType === t[0] ? 'active' : ''}" onclick="reportType='${t[0]}'; render()">${t[1]}</button>`).join('')}</div>${renderReportTable()}</div>`;
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
  return `<div class="table-wrap cards"><table><thead><tr><th>Customer</th><th>Mobile</th><th>Product</th><th>Branch</th><th>Assigned</th><th>Stage</th><th>Source</th><th>Processing</th><th>Valuer</th><th>Advocate</th><th>PSIR</th><th>Status</th><th>Follow-up</th><th>Disbursed</th><th>Compliance</th></tr></thead><tbody>${rows.map(l => {
    const disb = db.disbursements.find(d => d.leadId === l.id);
    const comp = db.complianceRecords.filter(c => c.leadId === l.id);
    return `<tr><td data-label="Customer"><b>${escapeHtml(l.customerName)}</b></td><td data-label="Mobile">${escapeHtml(l.mobile)}</td><td data-label="Product">${escapeHtml(productName(l.productId))}${l.subProduct ? `<div class="muted small">${escapeHtml(l.subProduct)}</div>` : ''}</td><td data-label="Branch">${escapeHtml(branchName(l.branchId))}</td><td data-label="Assigned">${escapeHtml(userName(l.assignedTo))}</td><td data-label="Stage">${escapeHtml(stageName(l.currentStageId))}</td><td data-label="Source">${escapeHtml(sourceName(l.leadSourceId))}<div class="muted small">${escapeHtml(sourceDetail(l))}</div></td><td data-label="Processing">${escapeHtml(l.processingTeamName || '-')}</td><td data-label="Valuer">${escapeHtml(l.valuerName || '-')}</td><td data-label="Advocate">${escapeHtml(l.advocateName || '-')}</td><td data-label="PSIR">${escapeHtml(l.psirPersonName || '-')}</td><td data-label="Status">${statusBadge(l.status)}${l.deleteStatus === 'pending' ? '<br><span class="badge amber">Delete Requested</span>' : l.deleteStatus === 'rejected' ? '<br><span class="badge gray">Delete Rejected</span>' : ''}</td><td data-label="Follow-up">${escapeHtml(l.nextFollowUpDate || '-')}</td><td data-label="Disbursed">${disb ? (db.settings.currency || '₹') + ' ' + Number(disb.disbursedAmount || 0).toLocaleString() : '-'}</td><td data-label="Compliance">${comp.length ? comp.filter(c => c.completed).length + '/' + comp.length : '-'}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderAudit() {
  const rows = db.auditLogs.slice(0, 250);
  return `<div class="card"><div class="card-title"><h2>Audit Logs</h2><button class="btn" onclick="exportAuditCSV()">Export CSV</button></div>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Action</th><th>Entity</th><th>User</th><th>Date</th></tr></thead><tbody>${rows.map(a => `<tr><td><b>${escapeHtml(a.action)}</b></td><td>${escapeHtml(a.entityType)}<div class="muted small">${escapeHtml(a.entityId)}</div></td><td>${escapeHtml(userName(a.performedBy))}</td><td>${fmtDate(a.performedAt)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">No audit logs yet.</div>`}</div>`;
}

function renderBackup() {
  return `<div class="grid grid-2"><div class="card"><h2>Export Backup</h2><p class="muted">Download full local database JSON. Keep this safe.</p><button class="btn primary" onclick="exportBackup()">Download Backup JSON</button></div><div class="card"><h2>Import Backup</h2><p class="muted">Import a previously exported JSON backup. This will replace current browser data.</p><input class="input" type="file" id="backupFile" accept="application/json"><br><br><button class="btn danger" onclick="importBackup()">Import & Replace Data</button></div><div class="card"><h2>Storage Note</h2><p class="muted">This GitHub-only version saves data in browser localStorage. For shared branch/team usage across devices, connect Firebase Auth + Firestore.</p></div></div>`;
}

// ---------- Tools ----------
// Registry of available tools. Add new tools here and they appear on the
// Tools page automatically. `route` must have a matching case in render().
const TOOLS = [
  { route: 'emi', icon: '🧮', name: 'EMI Calculator', desc: 'Monthly instalment, total interest and full amortization schedule.', available: true }
];

function renderTools() {
  return `
    <div class="card">
      <div class="card-title"><h2>Tools</h2></div>
      <p class="muted">Calculators and utilities to help with loan processing. More tools will be added here.</p>
      <div class="grid grid-3" style="margin-top:16px">
        ${TOOLS.map(t => t.available
          ? `<button class="tool-card" onclick="navigate('${t.route}')">
               <div class="tool-icon">${t.icon}</div>
               <div class="tool-name">${escapeHtml(t.name)}</div>
               <div class="muted small">${escapeHtml(t.desc)}</div>
             </button>`
          : `<div class="tool-card disabled">
               <div class="tool-icon">${t.icon}</div>
               <div class="tool-name">${escapeHtml(t.name)}</div>
               <div class="muted small">${escapeHtml(t.desc)}</div>
               <span class="badge gray" style="margin-top:8px">Coming soon</span>
             </div>`).join('')}
      </div>
    </div>`;
}

// ---------- EMI Calculator ----------
function computeEmi(principal, annualRate, months) {
  const P = Number(principal) || 0;
  const n = Math.round(Number(months) || 0);
  const r = (Number(annualRate) || 0) / 12 / 100;
  if (P <= 0 || n <= 0) return null;
  let emi;
  if (r === 0) emi = P / n;
  else emi = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const totalPayment = emi * n;
  const totalInterest = totalPayment - P;
  return { P, n, r, emi, totalPayment, totalInterest };
}

function emiSchedule(res) {
  const rows = [];
  let balance = res.P;
  for (let i = 1; i <= res.n; i++) {
    const interest = balance * res.r;
    let principalPaid = res.emi - interest;
    if (i === res.n) principalPaid = balance; // absorb rounding in final row
    balance = Math.max(0, balance - principalPaid);
    rows.push({ month: i, principal: principalPaid, interest, payment: principalPaid + interest, balance });
  }
  return rows;
}

function fmtMoney(v) {
  const cur = db.settings.currency || '₹';
  return `${cur} ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderEmi() {
  return `
  <div class="btn-row" style="margin-bottom:14px"><button class="btn" onclick="navigate('tools')">← Back to Tools</button></div>
  <div class="grid grid-2">
    <div class="card">
      <div class="card-title"><h2>Loan Details</h2></div>
      <div class="field"><label>Loan Amount (${escapeHtml(db.settings.currency || '₹')})</label>
        <input class="input" id="emiAmount" type="number" min="0" step="1000" value="1000000" inputmode="decimal" oninput="calcEmi()" /></div><br>
      <div class="field"><label>Annual Interest Rate (% per year)</label>
        <input class="input" id="emiRate" type="number" min="0" step="0.05" value="9" inputmode="decimal" oninput="calcEmi()" /></div><br>
      <div class="field"><label>Loan Tenure</label>
        <div class="btn-row">
          <input class="input" id="emiTenure" type="number" min="1" step="1" value="20" inputmode="numeric" style="flex:1" oninput="calcEmi()" />
          <select class="input" id="emiTenureUnit" style="max-width:140px" onchange="calcEmi()">
            <option value="years" selected>Years</option>
            <option value="months">Months</option>
          </select>
        </div></div><br>
      <p class="muted small">Values update automatically as you type.</p>
    </div>
    <div class="card" id="emiResult">${renderEmiResult(computeEmi(1000000, 9, 240))}</div>
  </div>
  <div class="card" id="emiScheduleCard" style="margin-top:16px">${renderEmiSchedule(computeEmi(1000000, 9, 240))}</div>
  `;
}

function renderEmiResult(res) {
  if (!res) return `<div class="empty">Enter loan amount, interest rate and tenure to see the EMI.</div>`;
  return `
    <div class="card-title"><h2>Result</h2></div>
    <div class="emi-highlight">
      <div class="muted small">Monthly EMI</div>
      <div class="emi-emi">${fmtMoney(res.emi)}</div>
    </div>
    <div class="grid grid-2" style="margin-top:14px">
      <div class="stat"><div class="muted small">Principal Amount</div><b>${fmtMoney(res.P)}</b></div>
      <div class="stat"><div class="muted small">Total Interest</div><b>${fmtMoney(res.totalInterest)}</b></div>
      <div class="stat"><div class="muted small">Total Payable</div><b>${fmtMoney(res.totalPayment)}</b></div>
      <div class="stat"><div class="muted small">Number of EMIs</div><b>${res.n}</b></div>
    </div>`;
}

function renderEmiSchedule(res) {
  if (!res) return `<div class="empty">Amortization schedule will appear here.</div>`;
  const rows = emiSchedule(res);
  return `
    <div class="card-title"><h2>Amortization Schedule</h2><button class="btn" onclick="exportEmiCSV()">Export CSV</button></div>
    <div class="table-wrap"><table><thead><tr><th>Month</th><th>Principal</th><th>Interest</th><th>EMI</th><th>Balance</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${r.month}</td><td>${fmtMoney(r.principal)}</td><td>${fmtMoney(r.interest)}</td><td>${fmtMoney(r.payment)}</td><td>${fmtMoney(r.balance)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function readEmiInputs() {
  const amount = Number($('#emiAmount')?.value) || 0;
  const rate = Number($('#emiRate')?.value) || 0;
  let tenure = Number($('#emiTenure')?.value) || 0;
  const unit = $('#emiTenureUnit')?.value || 'years';
  const months = unit === 'years' ? tenure * 12 : tenure;
  return computeEmi(amount, rate, months);
}

function calcEmi() {
  const res = readEmiInputs();
  const resultEl = $('#emiResult');
  const scheduleEl = $('#emiScheduleCard');
  if (resultEl) resultEl.innerHTML = renderEmiResult(res);
  if (scheduleEl) scheduleEl.innerHTML = renderEmiSchedule(res);
}

function exportEmiCSV() {
  const res = readEmiInputs();
  if (!res) return toast('Enter valid loan details first');
  const rows = emiSchedule(res).map(r => ({
    Month: r.month,
    Principal: r.principal.toFixed(2),
    Interest: r.interest.toFixed(2),
    EMI: r.payment.toFixed(2),
    Balance: r.balance.toFixed(2)
  }));
  exportRowsCSV(`flms-emi-schedule-${today()}.csv`, rows);
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
  return leads.map(l => {
    const psir = stageDateSummary(l.id, 'PSIR');
    const valuation = stageDateSummary(l.id, 'Valuation');
    const technical = stageDateSummary(l.id, 'Technical');
    const legal = stageDateSummary(l.id, 'Legal');
    return {
      Customer: l.customerName,
      Mobile: l.mobile,
      Alternate: l.alternateMobile,
      Branch: branchName(l.branchId),
      Product: productName(l.productId),
      SubProduct: l.subProduct || '',
      Source: sourceName(l.leadSourceId),
      SourceDetailType: sourceDetailLabel(l),
      SourceDetailName: sourceDetail(l),
      ProcessingTeamName: l.processingTeamName,
      ValuerName: l.valuerName,
      AdvocateName: l.advocateName,
      PSIRPersonName: l.psirPersonName,
      Stage: stageName(l.currentStageId),
      Status: l.status,
      AssignedTo: userName(l.assignedTo),
      LoanAmount: l.loanAmount,
      FollowUpDate: l.nextFollowUpDate,
      PSIRAssignedDate: psir.assignedDate,
      PSIRReceivedDate: psir.receivedDate,
      ValuationAssignedDate: valuation.assignedDate,
      ValuationReceivedDate: valuation.receivedDate,
      TechnicalAssignedDate: technical.assignedDate,
      TechnicalReceivedDate: technical.receivedDate,
      LegalAssignedDate: legal.assignedDate,
      LegalReceivedDate: legal.receivedDate,
      Remarks: l.remarks,
      CreatedAt: l.createdAt,
      UpdatedAt: l.updatedAt
    };
  });
}
function exportLeadsCSV() { if (!can('exportData')) return toast('You do not have permission to export data'); exportRowsCSV(`flms-leads-${today()}.csv`, leadExportRows()); }
function exportCurrentReport() { if (!can('exportData')) return toast('You do not have permission to export data'); exportRowsCSV(`flms-${reportType}-report-${today()}.csv`, leadExportRows(reportRows())); }
function exportAuditCSV() { if (!can('exportData')) return toast('You do not have permission to export data'); exportRowsCSV(`flms-audit-${today()}.csv`, db.auditLogs.map(a => ({ Action: a.action, EntityType: a.entityType, EntityId: a.entityId, User: userName(a.performedBy), Date: a.performedAt }))); }
function exportBackup() { if (!can('backupData')) return toast('You do not have permission to export backup'); downloadText(`flms-backup-${today()}.json`, JSON.stringify(db, null, 2), 'application/json'); }
function importBackup() {
  if (!can('backupData')) return toast('You do not have permission to import backup');
  const file = $('#backupFile')?.files?.[0]; if (!file) return toast('Select backup JSON file');
  const reader = new FileReader();
  reader.onload = () => { try { const parsed = JSON.parse(reader.result); if (!parsed.users || !parsed.leads) throw new Error('Invalid backup'); db = migrateDB(parsed); saveDB(); setCurrentUser(null); toast('Backup imported. Login again.'); render(); } catch(e) { toast('Invalid backup file'); } };
  reader.readAsText(file);
}
function resetDB() { if (!confirm('Reset all data?')) return; localStorage.removeItem(APP_KEY); localStorage.removeItem(SESSION_KEY); db = loadDB(); currentUser = null; render(); }

function exportCurrentVisibleCSV() { exportLeadsCSV(); }

async function refreshApp() {
  toast('Updating to latest version…');
  try {
    // Ask the browser to check for a new service worker version.
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.update().catch(() => {})));
    }
    // Clear cached app shell so the newest files are fetched. This does NOT
    // touch localStorage, so all saved leads and settings are preserved.
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (e) { console.warn('Refresh failed', e); }
  // Reload from network with the caches cleared.
  location.reload();
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

async function installApp() {
  if (isStandalone()) { toast('FLMS is already installed — you are using the installed app.'); return; }
  if (deferredPrompt) {
    document.getElementById('installBanner')?.remove();
    deferredPrompt.prompt();
    try {
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (outcome !== 'accepted') openInstallHelp();
    } catch (e) { deferredPrompt = null; openInstallHelp(); }
    return;
  }
  // Native prompt not ready yet — show clear manual steps.
  openInstallHelp();
}

function openInstallHelp() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/, Macintosh/.test(ua) && 'ontouchend' in document);
  const isAndroid = /Android/.test(ua);
  let steps;
  if (isIOS) {
    steps = `<ol class="help-list">
      <li>Open this site in <b>Safari</b> (not Chrome or an in-app browser).</li>
      <li>Tap the <b>Share</b> button <span class="kbd">⬆️</span> at the bottom.</li>
      <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
      <li>Tap <b>Add</b>. The FLMS icon appears on your home screen.</li>
    </ol>`;
  } else if (isAndroid) {
    steps = `<ol class="help-list">
      <li><b>Use the app for ~30 seconds first</b> — tap around a few screens. Chrome only offers install after you've interacted with the site.</li>
      <li>Make sure you opened it in <b>Chrome</b> directly (not inside WhatsApp/Instagram/Facebook — those in-app browsers can't install).</li>
      <li>Open Chrome's <b>⋮ menu</b> → tap <b>Add to Home screen</b> → <b>Install</b>.</li>
      <li>Still no option? Tap <b>🔄 Update</b> in the top bar (clears the old cache), let it reload, use it briefly, then try again.</li>
    </ol>
    <p class="muted small">Tip: come back and tap this <b>Install</b> button again after using the app a little — the one-tap installer usually becomes available.</p>`;
  } else {
    steps = `<ol class="help-list">
      <li>Use <b>Chrome</b> or <b>Edge</b> on desktop.</li>
      <li>Look for the <b>install icon</b> (a monitor with a down-arrow) at the right edge of the address bar, and click it.</li>
      <li>Or open the browser <b>⋮ menu</b> → <b>Install FLMS…</b> / <b>Apps → Install this site</b>.</li>
    </ol>`;
  }
  const html = `<div class="modal-backdrop" onclick="closeModal(event)"><div class="modal" onclick="event.stopPropagation()" style="max-width:520px"><div class="modal-head"><h2>📲 Install FLMS</h2><button type="button" class="close" onclick="removeModal()">×</button></div>${steps}<div class="btn-row" style="margin-top:8px"><button class="btn primary" type="button" onclick="removeModal()">Got it</button></div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function showInstallBanner() {
  if (!deferredPrompt || isStandalone()) return;
  if (document.getElementById('installBanner')) return;
  if (localStorage.getItem('flms_install_dismissed') === '1') return;
  const el = document.createElement('div');
  el.id = 'installBanner';
  el.className = 'install-banner';
  el.innerHTML = `<div class="ib-text">📲 <b>Install FLMS</b><span class="muted small">One-tap install is ready</span></div><div class="btn-row"><button class="btn primary" onclick="installApp()">Install now</button><button class="btn ghost" onclick="dismissInstallBanner()">Later</button></div>`;
  document.body.appendChild(el);
}
function dismissInstallBanner() {
  document.getElementById('installBanner')?.remove();
  localStorage.setItem('flms_install_dismissed', '1');
}

// The browser fires this only when it considers the app installable. We keep
// the event so the in-app Install button / banner can trigger the real
// native install (a WebAPK), not a plain shortcut.
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; showInstallBanner(); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; dismissInstallBanner(); localStorage.removeItem('flms_install_dismissed'); toast('✅ FLMS installed. Open it from your home screen.'); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.warn));
}

render();

// Expose functions for inline handlers
Object.assign(window, { navigate, login, logout, installApp, refreshApp, toggleSidebar, gotoReport, clearLeadFilters, openInstallHelp, dismissInstallBanner, menuAction, openDrawer, closeDrawer, drawerBackdrop, openLeadModal, updateSourceFields, saveLead, closeModal, removeModal, filterLeadTable, leadDeleteAction, requestLeadDelete, approveLeadDelete, rejectLeadDelete, moveStage, toggleDoc, saveDisbursement, toggleCompliance, adminTab, reportType, openUserModal, saveUser, applyRoleDefaultsInUserModal, openGenericModal, saveGeneric, openDocumentModal, saveDocument, toggleActive, exportLeadsCSV, exportCurrentReport, exportAuditCSV, exportBackup, importBackup, calcEmi, exportEmiCSV });
