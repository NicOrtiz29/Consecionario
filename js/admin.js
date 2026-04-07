/**
 * BBruno Automotores - Admin Panel JavaScript
 * ============================================
 * v3 — Supabase Backend Integration
 */

'use strict';

// ── Utils ──
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

function formatCurrency(n) {
  if (!n) return 'Sin precio';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n);
}
function formatNumber(n) { return new Intl.NumberFormat('es-AR').format(n || 0); }
function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function getStatusLabel(s) {
  const m = { disponible:{l:'Disponible',c:'badge-success'}, reservado:{l:'Reservado',c:'badge-warning'}, vendido:{l:'Vendido',c:'badge-danger'}, en_revision:{l:'En revisión',c:'badge-info'} };
  return m[s] || {l:s,c:'badge-info'};
}
function getLeadStatusLabel(s) {
  const m = { nuevo:{l:'Nuevo',c:'badge-danger'}, contactado:{l:'Contactado',c:'badge-info'}, en_negociacion:{l:'En negociación',c:'badge-warning'}, cerrado:{l:'Cerrado',c:'badge-success'}, perdido:{l:'Perdido',c:'badge-gray'} };
  return m[s] || {l:s,c:'badge-info'};
}
function getMaintTypeLabel(t) {
  const m = { service:'Service', reparacion:'Reparación', inspeccion:'Inspección', limpieza:'Limpieza', acondicionamiento:'Acondicionamiento', garantia:'Garantía', otro:'Otro' };
  return m[t] || t;
}

function showToast(title, msg = '', type = 'default') {
  const c = $('#toastContainer'); if (!c) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️', default: 'ℹ️', info: 'ℹ️', danger: '❌' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><div class="toast-body"><div class="toast-title">${title}</div>${msg?`<div class="toast-message">${msg}</div>`:''}</div>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(100%)'; t.style.transition='all .3s'; setTimeout(()=>t.remove(),300); }, 4500);
}

// ── Auth ──
const AUTH_KEY = 'bbruno_admin_session';

let currentUser = null;

const DEMO_USERS = [
  { id: 'user-admin-1', username: 'admin', password: 'admin2024', full_name: 'Administrador BBruno', role: window.APP_CONFIG?.ROLES.ADMIN || 'administrador' },
  { id: 'user-editor-1', username: 'editor', password: 'editor2024', full_name: 'Editor de Inventario', role: window.APP_CONFIG?.ROLES.EDITOR || 'editor' },
  { id: 'user-viewer-1', username: 'visualizador', password: 'visualizador2024', full_name: 'Consultor Visual', role: window.APP_CONFIG?.ROLES.VIEWER || 'visualizador' }
];

function getSession() {
  try { return JSON.parse(sessionStorage.getItem(AUTH_KEY)); } catch { return null; }
}
function setSession(user) {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
}
function clearSession() {
  sessionStorage.removeItem(AUTH_KEY);
}

async function doLogin(username, password) {
  // Intentar con Supabase
  try {
    const users = await SupabaseClient.select('admin_users', {
      filter: `username=eq.${username}`,
      limit: 10,
    });
    const user = users.find(u => u.username === username && u.password_hash === password && u.is_active !== false);
    if (user) {
      const sess = { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
      setSession(sess);
      return sess;
    }
  } catch (err) {
    console.warn('[Auth] Supabase login failed, using demo fallback:', err.message);
  }
  // Fallback a usuarios demo
  const demo = DEMO_USERS.find(u => u.username === username && u.password === password);
  if (demo) {
    const sess = { id: demo.id, username: demo.username, full_name: demo.full_name, role: demo.role };
    setSession(sess);
    return sess;
  }
  return null;
}

// ── State ──
let allVehicles = [];
let allMaintenance = [];
let allLeads = [];
let allBranches = [];
let vehiclePhotos = [];
let vehicleFeatures = [];
let vehicleDocs = [];
let maintParts = [];
let pendingDeleteId = '';
let pendingDeleteTable = '';
let pendingDeleteCallback = null;
let currentPanel = 'dashboard';

// ── API (Supabase) ──
const db = window.SupabaseClient;

async function apiGet(table, opts = {}) {
  return db.select(table, { order: 'created_at.desc', ...opts });
}

async function apiCreate(table, data) {
  if (currentUser?.role === window.APP_CONFIG?.ROLES.VIEWER) {
    showToast('Permiso denegado', 'Tu rol de visualizador no permite crear registros.', 'warning');
    throw new Error('Unauthorized');
  }
  return db.insert(table, data);
}

// Alias for Excel import compatibility
async function apiPost(table, data) {
  return apiCreate(table, data);
}

async function apiUpdate(table, id, data) {
  if (currentUser?.role === window.APP_CONFIG?.ROLES.VIEWER) {
    showToast('Permiso denegado', 'Tu rol de visualizador no permite modificar registros.', 'warning');
    throw new Error('Unauthorized');
  }
  return db.update(table, id, data);
}

async function apiDelete(table, id) {
  if (currentUser?.role !== window.APP_CONFIG?.ROLES.ADMIN) {
    showToast('Permiso denegado', 'Solo los administradores pueden eliminar registros.', 'warning');
    throw new Error('Unauthorized');
  }
  return db.remove(table, id);
}

// ── Modal Management ──
function openModal(id) {
  const m = $(`#${id}`);
  if (!m) return;
  m.style.display = 'flex';
  requestAnimationFrame(() => m.classList.add('show'));
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const m = $(`#${id}`);
  if (!m) return;
  m.classList.remove('show');
  setTimeout(() => { m.style.display = 'none'; document.body.style.overflow = ''; }, 300);
}

// ── Tags Input ──
function initTagsInput(containerId, inputId, arrayRef) {
  const container = $(`#${containerId}`);
  const input = $(`#${inputId}`);
  if (!container || !input) return;

  function renderTags() {
    $$('.tag-item', container).forEach(t => t.remove());
    arrayRef.forEach((tag, i) => {
      const el = document.createElement('span');
      el.className = 'tag-item';
      el.innerHTML = `${tag}<button class="tag-remove" data-idx="${i}" aria-label="Quitar ${tag}">×</button>`;
      container.insertBefore(el, input);
    });
  }

  function addTag(val) {
    const v = val.trim();
    if (v && !arrayRef.includes(v)) {
      arrayRef.push(v);
      renderTags();
    }
    input.value = '';
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input.value);
    }
    if (e.key === 'Backspace' && !input.value && arrayRef.length) {
      arrayRef.pop();
      renderTags();
    }
  });

  container.addEventListener('click', e => {
    if (e.target.classList.contains('tag-remove')) {
      const idx = parseInt(e.target.dataset.idx);
      arrayRef.splice(idx, 1);
      renderTags();
    }
    input.focus();
  });

  renderTags();
  return { render: renderTags };
}

// ── Photo Management ──
function renderPhotoPreviews() {
  const grid = $('#photoPreviewGrid');
  if (!grid) return;
  const count = vehiclePhotos.length;
  grid.innerHTML = vehiclePhotos.map((url, i) => `
    <div class="photo-preview-item">
      <img src="${url}" alt="Foto ${i+1}" onerror="this.src='https://via.placeholder.com/120x80/2B2B2B/888?text=Error'">
      <button onclick="removePhoto(${i})" aria-label="Quitar foto ${i+1}" title="Quitar">✕</button>
    </div>
  `).join('') + (count < 8 ? `
    <div class="photo-add-btn" onclick="$('#vfPhotoUrl').focus()" role="button" tabindex="0" aria-label="Agregar foto">
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>Agregar foto</span>
    </div>` : '');
  
  const label = $('#photoCountLabel');
  if (label) label.textContent = `(${count}/8 fotos)`;
}

window.addPhoto = function() {
  const input = $('#vfPhotoUrl');
  const url = input?.value.trim();
  if (!url) return;
  if (vehiclePhotos.length >= 8) {
    showToast('Límite alcanzado', 'Podés cargar hasta 8 fotos por vehículo.', 'warning');
    return;
  }
  vehiclePhotos.push(url);
  renderPhotoPreviews();
  input.value = '';
};

window.removePhoto = function(idx) {
  vehiclePhotos.splice(idx, 1);
  renderPhotoPreviews();
};

// ── Panel Navigation ──
const panelTitles = {
  dashboard: ['Dashboard', 'Resumen del sistema'],
  vehicles: ['Inventario', 'Gestión de vehículos'],
  maintenance: ['Mantenimiento', 'Historial de servicios'],
  leads: ['Consultas', 'Gestión de leads'],
  branches: ['Sucursales', 'Gestión de sucursales'],
};

function switchPanel(name) {
  currentPanel = name;
  $$('.admin-panel').forEach(p => p.classList.remove('active'));
  const panel = $(`#panel-${name}`);
  if (panel) panel.classList.add('active');

  $$('.sidebar-link[data-panel]').forEach(l => l.classList.toggle('active', l.dataset.panel === name));

  const [title, subtitle] = panelTitles[name] || [name, ''];
  const pt = $('#pageTitle'); if (pt) pt.textContent = title;
  const ps = $('#pageSubtitle'); if (ps) ps.textContent = subtitle;

  // Close sidebar on mobile
  $('#adminSidebar')?.classList.remove('open');
  $('#sidebarOverlay')?.classList.remove('show');

  // Load panel data
  if (name === 'dashboard') renderDashboard();
  if (name === 'vehicles') renderVehiclesTable(allVehicles);
  if (name === 'maintenance') renderMaintenanceList(allMaintenance);
  if (name === 'leads') renderLeadsList(allLeads);
  if (name === 'branches') renderBranchesList(allBranches);
}

// ── Dashboard ──
function renderDashboard() {
  const total = allVehicles.length;
  const avail = allVehicles.filter(v => v.status === 'disponible').length;
  const reserved = allVehicles.filter(v => v.status === 'reservado').length;
  const sold = allVehicles.filter(v => v.status === 'vendido').length;
  const newLeads = allLeads.filter(l => l.status === 'nuevo').length;

  const sg = $('#statsGrid');
  if (sg) {
    sg.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-icon yellow"><i class="fas fa-car" aria-hidden="true"></i></div>
        <div><div class="stat-card-value">${total}</div><div class="stat-card-label">Total vehículos</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon green"><i class="fas fa-circle-check" aria-hidden="true"></i></div>
        <div><div class="stat-card-value">${avail}</div><div class="stat-card-label">Disponibles</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon orange"><i class="fas fa-clock" aria-hidden="true"></i></div>
        <div><div class="stat-card-value">${reserved}</div><div class="stat-card-label">Reservados</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon red"><i class="fas fa-circle-xmark" aria-hidden="true"></i></div>
        <div><div class="stat-card-value">${sold}</div><div class="stat-card-label">Vendidos</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon blue"><i class="fas fa-envelope" aria-hidden="true"></i></div>
        <div><div class="stat-card-value">${newLeads}</div><div class="stat-card-label">Consultas nuevas</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon yellow"><i class="fas fa-screwdriver-wrench" aria-hidden="true"></i></div>
        <div><div class="stat-card-value">${allMaintenance.length}</div><div class="stat-card-label">Registros de servicio</div></div>
      </div>
    `;
  }

  // Recent vehicles
  const rv = $('#dashboardRecentVehicles');
  if (rv) {
    const recent = allVehicles.slice(0, 5);
    if (!recent.length) { rv.innerHTML = '<div class="table-empty"><i class="fas fa-car" aria-hidden="true"></i><br>Sin vehículos aún</div>'; }
    else {
      rv.innerHTML = recent.map(v => {
        const st = getStatusLabel(v.status || 'disponible');
        const photo = Array.isArray(v.photos) && v.photos[0] ? v.photos[0] : 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=80&q=60';
        return `
          <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.04)">
            <img src="${photo}" alt="" style="width:56px;height:38px;border-radius:6px;object-fit:cover;flex-shrink:0" onerror="this.src='https://via.placeholder.com/56x38/2B2B2B/888?text=BB'">
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.year} ${v.brand} ${v.model}</div>
              <div style="font-size:.75rem;color:var(--color-gray)">${formatCurrency(v.price)}</div>
            </div>
            <span class="badge ${st.c}" style="flex-shrink:0">${st.l}</span>
          </div>`;
      }).join('');
    }
  }

  // Recent leads
  const rl = $('#dashboardRecentLeads');
  if (rl) {
    const recent = allLeads.slice(0, 6);
    if (!recent.length) { rl.innerHTML = '<div class="table-empty"><i class="fas fa-users" aria-hidden="true"></i><br>Sin consultas aún</div>'; }
    else {
      rl.innerHTML = recent.map(l => {
        const st = getLeadStatusLabel(l.status || 'nuevo');
        const veh = allVehicles.find(v => v.patent === l.vehicle_patent);
        return `
          <div class="lead-card" style="margin:.25rem .75rem">
            <div class="lead-card-header">
              <div>
                <div class="lead-name">${l.name || '—'}</div>
                <div class="lead-contact">${l.phone || ''}</div>
              </div>
              <span class="badge ${st.c}">${st.l}</span>
            </div>
            ${veh ? `<div style="font-size:.78rem;color:var(--color-yellow);margin-top:.3rem"><i class="fas fa-car" aria-hidden="true"></i> ${veh.year} ${veh.brand} ${veh.model} [${veh.patent}]</div>` : ''}
          </div>`;
      }).join('');
    }
  }
}

// ── Vehicles Table ──
function renderVehiclesTable(vehicles) {
  const tbody = $('#vehiclesTableBody');
  if (!tbody) return;
  if (!vehicles || !vehicles.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="table-empty"><i class="fas fa-car" aria-hidden="true"></i><br>No hay vehículos</td></tr>';
    return;
  }
  tbody.innerHTML = vehicles.map(v => {
    const st = getStatusLabel(v.status || 'disponible');
    const photo = Array.isArray(v.photos) && v.photos[0] ? v.photos[0] : 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=80&q=60';
    const fuel = {nafta:'Nafta',diesel:'Diésel',gnc:'GNC',nafta_gnc:'Nafta+GNC',hibrido:'Híbrido',electrico:'Eléctrico'}[v.fuel_type] || v.fuel_type || '—';
    return `
      <tr>
        <td>
          <img class="table-vehicle-thumb" src="${photo}" alt="" 
            onerror="this.src='https://via.placeholder.com/72x48/2B2B2B/888?text=BB'">
        </td>
        <td>
          <div class="table-vehicle-name">${v.brand || ''} ${v.model || ''}</div>
          <div class="table-vehicle-sub">${v.version || '—'}</div>
        </td>
        <td style="font-family:monospace;font-weight:700;letter-spacing:1px">${v.patent || '—'}</td>
        <td>${v.year || '—'}</td>
        <td>${v.mileage ? formatNumber(v.mileage) + ' km' : '—'}</td>
        <td style="font-weight:700;color:var(--color-yellow)">${formatCurrency(v.price)}</td>
        <td><span class="badge ${st.c}">${st.l}</span></td>
        <td>${fuel}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-ghost btn-sm btn-icon" title="Ver en sitio" onclick="window.open('vehicle-detail.html?id=${v.id}','_blank')" aria-label="Ver vehículo">
              <i class="fas fa-eye" aria-hidden="true"></i>
            </button>
            <button class="btn btn-outline btn-sm btn-icon" title="Editar" onclick="openVehicleModal('${v.id}')" aria-label="Editar vehículo">
              <i class="fas fa-pen" aria-hidden="true"></i>
            </button>
            <button class="btn btn-danger btn-sm btn-icon" title="Eliminar" onclick="confirmDelete('vehicles','${v.id}','¿Eliminar el vehículo ${v.year} ${v.brand} ${v.model} (${v.patent || 'sin patente'})? Esta acción no se puede deshacer.',loadVehicles)" aria-label="Eliminar vehículo">
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ── Vehicle Modal ──
let featureTagsCtrl, docTagsCtrl, maintPartsCtrl;

function openVehicleModal(id = null) {
  vehiclePhotos = [];
  vehicleFeatures = [];
  vehicleDocs = [];

  const title = $('#vehicleModalTitle');
  if (title) title.textContent = id ? 'Editar vehículo' : 'Nuevo vehículo';

  const form = $('#vehicleForm');
  if (form) form.reset();
  $('#vfId').value = '';

  renderPhotoPreviews();

  // Re-init tags
  featureTagsCtrl = initTagsInput('vfFeaturesContainer', 'vfFeatureInput', vehicleFeatures);
  docTagsCtrl = initTagsInput('vfDocsContainer', 'vfDocInputField', vehicleDocs);

  if (id) {
    const v = allVehicles.find(x => x.id === id);
    if (v) {
      $('#vfId').value = v.id;
      $('#vfBrand').value = v.brand || '';
      $('#vfModel').value = v.model || '';
      $('#vfYear').value = v.year || '';
      $('#vfVersion').value = v.version || '';
      $('#vfColor').value = v.color || '';
      $('#vfMileage').value = v.mileage || '';
      $('#vfDoors').value = v.doors || '';
      $('#vfEngine').value = v.engine || '';
      $('#vfPrice').value = v.price || '';
      $('#vfStatus').value = v.status || 'disponible';
      $('#vfFuel').value = v.fuel_type || 'nafta';
      $('#vfTransmission').value = v.transmission || 'manual';
      if ($('#vfCondition')) $('#vfCondition').value = v.condition || 'usado_bueno';
      $('#vfFeatured').checked = !!v.is_featured;
      $('#vfVin').value = v.vin || '';
      $('#vfPatent').value = v.patent || '';
      $('#vfDesc').value = v.description || '';
      if ($('#vfNotes')) $('#vfNotes').value = v.internal_notes || '';

      // Photos
      vehiclePhotos = Array.isArray(v.photos) ? [...v.photos] : [];
      renderPhotoPreviews();

      // Features
      if (Array.isArray(v.features)) {
        v.features.forEach(f => vehicleFeatures.push(f));
        featureTagsCtrl?.render();
      }

      // Docs
      if (Array.isArray(v.documents)) {
        v.documents.forEach(d => vehicleDocs.push(d));
        docTagsCtrl?.render();
      }
    }
  }

  openModal('vehicleModal');
}

async function saveVehicle() {
  const id = $('#vfId')?.value;
  const brand = $('#vfBrand')?.value.trim();
  const model = $('#vfModel')?.value.trim();
  const year = parseInt($('#vfYear')?.value);
  const price = parseFloat($('#vfPrice')?.value);
  const mileage = parseFloat($('#vfMileage')?.value);
  const patent = $('#vfPatent')?.value.trim();

  if (!brand || !model || !year) {
    showToast('Campos requeridos', 'Por favor completá Marca, Modelo y Año.', 'warning');
    return;
  }

  if (!patent) {
    showToast('Patente requerida', 'La patente es obligatoria y debe ser única por vehículo.', 'warning');
    return;
  }

  const data = {
    brand, model, year, patent,
    version: $('#vfVersion')?.value.trim() || '',
    color: $('#vfColor')?.value.trim() || '',
    mileage: mileage || 0, price: price || 0,
    status: $('#vfStatus')?.value || 'disponible',
    fuel_type: $('#vfFuel')?.value || 'nafta',
    transmission: $('#vfTransmission')?.value || 'manual',
    doors: parseInt($('#vfDoors')?.value) || 4,
    engine: $('#vfEngine')?.value.trim() || '',
    vin: $('#vfVin')?.value.trim() || '',
    description: $('#vfDesc')?.value.trim() || '',
    is_featured: $('#vfFeatured')?.checked || false,
    photos: vehiclePhotos,
    features: vehicleFeatures,
    branch_id: 'branch-1',
  };

  const btn = $('#btnSaveVehicle');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

  try {
    if (id) {
      await apiUpdate('vehicles', id, data);
      showToast('¡Actualizado!', `${year} ${brand} ${model} actualizado correctamente.`, 'success');
    } else {
      await apiCreate('vehicles', data);
      showToast('¡Creado!', `${year} ${brand} ${model} agregado al inventario.`, 'success');
    }
    closeModal('vehicleModal');
    await loadVehicles();
    if (currentPanel === 'dashboard') renderDashboard();
  } catch (err) {
    showToast('Error', `No se pudo guardar: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar vehículo'; }
  }
}

// ── Load Vehicles ──
async function loadVehicles() {
  try {
    allVehicles = await apiGet('vehicles');
    if (currentPanel === 'vehicles') renderVehiclesTable(allVehicles);
    populateVehicleSelect();
  } catch (err) {
    console.error('[Admin] Error cargando vehículos:', err);
  }
}

function filterVehiclesTable() {
  const search = ($('#vehicleSearch')?.value || '').toLowerCase();
  const status = $('#vehicleStatusFilter')?.value || '';
  const filtered = allVehicles.filter(v => {
    const matchSearch = !search || [v.brand, v.model, v.version, String(v.year), v.patent, v.vin].join(' ').toLowerCase().includes(search);
    const matchStatus = !status || v.status === status;
    return matchSearch && matchStatus;
  });
  renderVehiclesTable(filtered);
}

function populateVehicleSelect() {
  const sel = $('#mfVehicle');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— Seleccionar vehículo —</option>' +
    allVehicles.map(v => `<option value="${v.patent}">${v.year} ${v.brand} ${v.model} [${v.patent}]</option>`).join('');
  if (current) sel.value = current;
}

// ── Maintenance ──
function renderMaintenanceList(records) {
  const list = $('#maintenanceList');
  if (!list) return;

  const search = ($('#maintSearch')?.value || '').toLowerCase();
  const filtered = records.filter(r => {
    if (!search) return true;
    const v = allVehicles.find(x => x.patent === r.vehicle_patent);
    const vName = v ? `${v.year} ${v.brand} ${v.model} ${v.patent}` : r.vehicle_patent || '';
    return vName.toLowerCase().includes(search) || (r.description||'').toLowerCase().includes(search) || (r.type||'').toLowerCase().includes(search);
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="table-empty"><i class="fas fa-screwdriver-wrench"></i><br>No hay registros de mantenimiento</div>';
    return;
  }

  // Group by vehicle patent
  const byVehicle = {};
  filtered.forEach(r => {
    const vp = r.vehicle_patent || 'sin_patente';
    if (!byVehicle[vp]) byVehicle[vp] = [];
    byVehicle[vp].push(r);
  });

  list.innerHTML = Object.entries(byVehicle).map(([vp, recs]) => {
    const v = allVehicles.find(x => x.patent === vp);
    const vName = v ? `${v.year} ${v.brand} ${v.model}` : 'Vehículo desconocido';
    const sorted = [...recs].sort((a,b) => new Date(b.date||0) - new Date(a.date||0));
    return `
      <div style="margin-bottom:1.5rem">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;padding-bottom:.5rem;border-bottom:1px solid rgba(245,216,10,0.15)">
          <h4 style="font-size:.95rem;font-weight:700;color:var(--color-yellow)">
            <i class="fas fa-car" aria-hidden="true"></i> ${vName} <span style="font-family:monospace;background:rgba(255,255,255,0.1);padding:0 .4rem;border-radius:3px;margin-left:.5rem;color:var(--color-gray-light)">${vp}</span>
          </h4>
          <span style="font-size:.75rem;color:var(--color-gray)">${recs.length} registro${recs.length!==1?'s':''}</span>
        </div>
        ${sorted.map(r => `
          <div class="maintenance-entry">
            <div class="maintenance-entry-header">
              <div style="display:flex;align-items:center;gap:.5rem">
                <span class="maintenance-type-badge">${getMaintTypeLabel(r.type)}</span>
                <span style="font-size:.8rem;color:var(--color-gray)">${formatDate(r.date)}</span>
                ${r.mileage_at_service ? `<span style="font-size:.78rem;color:var(--color-gray)">· ${formatNumber(r.mileage_at_service)} km</span>` : ''}
              </div>
              <div style="display:flex;gap:.4rem">
                <button class="btn btn-ghost btn-sm btn-icon" onclick="openMaintenanceModal('${r.id}')" aria-label="Editar registro">
                  <i class="fas fa-pen" aria-hidden="true"></i>
                </button>
                <button class="btn btn-danger btn-sm btn-icon" onclick="confirmDelete('maintenance','${r.id}','¿Eliminar este registro de mantenimiento?',loadMaintenance)" aria-label="Eliminar registro">
                  <i class="fas fa-trash" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <p style="font-size:.85rem;color:var(--color-gray-light);margin-top:.4rem">${r.description || '—'}</p>
            ${r.performed_by ? `<div style="font-size:.78rem;color:var(--color-gray);margin-top:.35rem"><i class="fas fa-user-gear" aria-hidden="true"></i> ${r.performed_by}${r.technician ? ' · ' + r.technician : ''}</div>` : ''}
            ${r.cost ? `<div style="font-size:.78rem;color:var(--color-yellow);margin-top:.25rem"><i class="fas fa-dollar-sign" aria-hidden="true"></i> ${formatCurrency(r.cost)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

function openMaintenanceModal(id = null) {
  maintParts = [];
  const form = $('#maintenanceForm');
  if (form) form.reset();
  $('#mfId').value = '';

  maintPartsCtrl = initTagsInput('mfPartsContainer', 'mfPartInput', maintParts);

  const title = $('#maintModalTitle');
  if (title) title.textContent = id ? 'Editar registro' : 'Nuevo registro de mantenimiento';

  if (!id) {
    const today = new Date().toISOString().split('T')[0];
    if ($('#mfDate')) $('#mfDate').value = today;
  }

  if (id) {
    const r = allMaintenance.find(x => x.id === id);
    if (r) {
      $('#mfId').value = r.id;
      $('#mfVehicle').value = r.vehicle_patent || '';
      $('#mfType').value = r.type || 'service';
      $('#mfDate').value = r.date ? r.date.split('T')[0] : '';
      $('#mfMileage').value = r.mileage_at_service || '';
      $('#mfCost').value = r.cost || '';
      $('#mfPerformedBy').value = r.performed_by || '';
      $('#mfTechnician').value = r.technician || '';
      $('#mfDescription').value = r.description || '';
      if ($('#mfNextMileage')) $('#mfNextMileage').value = r.next_service_mileage || '';
      if ($('#mfNextDate')) $('#mfNextDate').value = r.next_service_date ? r.next_service_date.split('T')[0] : '';
    }
  }

  openModal('maintenanceModal');
}

async function saveMaintenance() {
  const id = $('#mfId')?.value;
  const vehiclePatent = $('#mfVehicle')?.value;
  const description = $('#mfDescription')?.value.trim();
  const date = $('#mfDate')?.value;

  if (!vehiclePatent || !description || !date) {
    showToast('Campos requeridos', 'Seleccioná vehículo, fecha y descripción.', 'warning');
    return;
  }

  const data = {
    vehicle_patent: vehiclePatent,
    type: $('#mfType')?.value || 'service',
    date,
    description,
    mileage_at_service: parseFloat($('#mfMileage')?.value) || 0,
    cost: parseFloat($('#mfCost')?.value) || 0,
    performed_by: $('#mfPerformedBy')?.value.trim() || '',
    technician: $('#mfTechnician')?.value.trim() || '',
  };

  const btn = $('#btnSaveMaintenance');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

  try {
    if (id) { await apiUpdate('maintenance', id, data); showToast('¡Actualizado!', 'Registro de mantenimiento actualizado.', 'success'); }
    else { await apiCreate('maintenance', data); showToast('¡Guardado!', 'Nuevo registro agregado al historial.', 'success'); }
    closeModal('maintenanceModal');
    await loadMaintenance();
  } catch (err) {
    showToast('Error', `No se pudo guardar: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar registro'; }
  }
}

async function loadMaintenance() {
  try {
    allMaintenance = await apiGet('maintenance');
    if (currentPanel === 'maintenance') renderMaintenanceList(allMaintenance);
  } catch (err) { console.error('[Admin] Error cargando mantenimiento:', err); }
}

// ── Leads ──
function renderLeadsList(leads) {
  const list = $('#leadsList');
  if (!list) return;

  const statusFilter = $('#leadStatusFilter')?.value || '';
  const filtered = leads.filter(l => !statusFilter || l.status === statusFilter);

  if (!filtered.length) {
    list.innerHTML = '<div class="table-empty"><i class="fas fa-users"></i><br>No hay consultas</div>';
    return;
  }

  const sorted = [...filtered].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  list.innerHTML = sorted.map(l => {
    const st = getLeadStatusLabel(l.status || 'nuevo');
    const veh = allVehicles.find(v => v.patent === l.vehicle_patent);
    const vText = veh ? `${veh.year} ${veh.brand} ${veh.model} [${veh.patent}]` : '';
    const waMsg = `Hola ${l.name || 'cliente'}, te contactamos de BBruno Automotores. ${veh ? `Te escribimos por el ${vText}.` : ''} ¿Seguís interesado?`;
    return `
      <div class="lead-card">
        <div class="lead-card-header">
          <div style="flex:1;min-width:0">
            <div class="lead-name">${l.name || '—'}</div>
            <div class="lead-contact">
              ${l.phone ? `<i class="fas fa-phone" style="font-size:.75rem" aria-hidden="true"></i> ${l.phone}` : ''}
              ${l.email ? ` · ${l.email}` : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.4rem;flex-shrink:0">
            <span class="badge ${st.c}">${st.l}</span>
            <select class="form-control" style="font-size:.75rem;padding:.2rem .5rem;width:auto" 
              onchange="updateLeadStatus('${l.id}',this.value)" aria-label="Cambiar estado del lead">
              ${['nuevo','contactado','en_negociacion','cerrado','perdido'].map(s=>`<option value="${s}" ${l.status===s?'selected':''}>${getLeadStatusLabel(s).l}</option>`).join('')}
            </select>
          </div>
        </div>
        ${veh ? `<div style="font-size:.8rem;color:var(--color-yellow);margin-top:.4rem"><i class="fas fa-car" aria-hidden="true"></i> <a href="vehicle-detail.html?id=${veh.id}" target="_blank" style="color:var(--color-yellow)">${vText}</a></div>` : ''}
        ${l.message ? `<div class="lead-msg">"${l.message}"</div>` : ''}
        <div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap">
          ${l.phone ? `
            <a href="https://wa.me/${l.phone.replace(/\D/g,'')}?text=${encodeURIComponent(waMsg)}" target="_blank" rel="noopener" class="btn btn-sm" style="background:#25D366;color:#fff;border-color:#25D366;font-size:.75rem">
              <i class="fab fa-whatsapp" aria-hidden="true"></i> WhatsApp
            </a>` : ''}
          ${l.phone ? `<a href="tel:${l.phone}" class="btn btn-ghost btn-sm" style="font-size:.75rem"><i class="fas fa-phone" aria-hidden="true"></i> Llamar</a>` : ''}
          <button class="btn btn-danger btn-sm" onclick="confirmDelete('leads','${l.id}','¿Eliminar esta consulta de ${l.name}?',loadLeads)" style="font-size:.75rem" aria-label="Eliminar consulta">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function updateLeadStatus(id, status) {
  try {
    await apiUpdate('leads', id, { status });
    const lead = allLeads.find(l => l.id === id);
    if (lead) lead.status = status;
    updateLeadsCount();
    showToast('Estado actualizado', '', 'success');
  } catch { showToast('Error al actualizar', '', 'error'); }
}

function updateLeadsCount() {
  const newCount = allLeads.filter(l => l.status === 'nuevo').length;
  const badge = $('#leadsCount');
  if (badge) {
    badge.textContent = newCount;
    badge.style.display = newCount > 0 ? 'inline-flex' : 'none';
  }
}

async function loadLeads() {
  try {
    allLeads = await apiGet('leads');
    updateLeadsCount();
    if (currentPanel === 'leads') renderLeadsList(allLeads);
    if (currentPanel === 'dashboard') renderDashboard();
  } catch (err) { console.error('[Admin] Error cargando leads:', err); }
}

// ── Branches ──
function renderBranchesList(branches) {
  const list = $('#branchesList');
  if (!list) return;
  if (!branches.length) {
    list.innerHTML = '<div class="table-empty"><i class="fas fa-building"></i><br>No hay sucursales</div>';
    return;
  }
  list.innerHTML = branches.map(b => `
    <div style="background:var(--color-carbon-mid);border:1px solid rgba(255,255,255,0.07);border-radius:var(--border-radius);padding:1.25rem;margin-bottom:.75rem;display:flex;align-items:flex-start;gap:1rem;flex-wrap:wrap">
      ${b.photo ? `<img src="${b.photo}" alt="${b.name}" style="width:100px;height:70px;object-fit:cover;border-radius:6px;flex-shrink:0" onerror="this.style.display='none'">` : ''}
      <div style="flex:1;min-width:200px">
        <div style="font-weight:700;font-size:1rem;margin-bottom:.25rem">${b.name || '—'}</div>
        <div style="font-size:.82rem;color:var(--color-gray)">
          <i class="fas fa-map-marker-alt" aria-hidden="true"></i> ${b.address || ''}, ${b.city || ''}
        </div>
      </div>
      <div style="display:flex;gap:.4rem;align-items:center">
        <span class="badge ${b.is_active ? 'badge-success' : 'badge-danger'}">${b.is_active ? 'Activa' : 'Inactiva'}</span>
      </div>
    </div>
  `).join('');
}

async function loadBranches() {
  try {
    allBranches = await apiGet('branches');
    if (currentPanel === 'branches') renderBranchesList(allBranches);
  } catch (err) { console.error('[Admin] Error cargando sucursales:', err); }
}

// ── Delete Confirm ──
function confirmDelete(table, id, message, callback) {
  pendingDeleteId = id;
  pendingDeleteTable = table;
  pendingDeleteCallback = callback;
  const msg = $('#deleteModalMsg');
  if (msg) msg.textContent = message;
  openModal('deleteModal');
}

async function executeDelete() {
  if (!pendingDeleteId || !pendingDeleteTable) return;
  const btn = $('#btnConfirmDelete');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Eliminando...'; }
  try {
    await apiDelete(pendingDeleteTable, pendingDeleteId);
    showToast('¡Eliminado!', 'El elemento fue eliminado correctamente.', 'success');
    closeModal('deleteModal');
    if (typeof pendingDeleteCallback === 'function') await pendingDeleteCallback();
    if (currentPanel === 'dashboard') renderDashboard();
  } catch (err) {
    showToast('Error', `No se pudo eliminar: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash"></i> Eliminar'; }
    pendingDeleteId = '';
    pendingDeleteTable = '';
    pendingDeleteCallback = null;
  }
}

// ── Topbar Clock ──
function updateClock() {
  const el = $('#topbarTime');
  if (el) {
    el.textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
}

// ── Main Init ──
async function initAdmin(user) {
  currentUser = user;

  const login = $('#loginScreen');
  const app = $('#adminApp');
  if (login) login.style.display = 'none';
  if (app) { app.style.display = 'block'; }

  const ua = $('#userAvatar'); if (ua) ua.textContent = (user.full_name||'A')[0].toUpperCase();
  const un = $('#userName'); if (un) un.textContent = user.full_name || user.username;
  const ur = $('#userRole'); if (ur) ur.textContent = user.role || '';

  // Sidebar navigation
  $$('.sidebar-link[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
  });

  // Sidebar mobile
  const sidebarToggle = $('#sidebarToggle');
  const sidebarOverlay = $('#sidebarOverlay');
  const sidebar = $('#adminSidebar');
  const sidebarClose = $('#sidebarClose');

  sidebarToggle?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    sidebarOverlay?.classList.toggle('show');
  });
  sidebarClose?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    sidebarOverlay?.classList.remove('show');
  });
  sidebarOverlay?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    sidebarOverlay?.classList.remove('show');
  });

  // Logout
  $('#logoutBtn')?.addEventListener('click', () => {
    clearSession();
    location.reload();
  });

  // Vehicle actions
  $('#btnNewVehicle')?.addEventListener('click', () => openVehicleModal());
  $('#btnSaveVehicle')?.addEventListener('click', saveVehicle);
  $('#vehicleSearch')?.addEventListener('input', filterVehiclesTable);
  $('#vehicleStatusFilter')?.addEventListener('change', filterVehiclesTable);

  // Add photo
  $('#btnAddPhoto')?.addEventListener('click', window.addPhoto);
  $('#vfPhotoUrl')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#btnAddPhoto')?.click(); }
  });

  // Maintenance
  $('#btnNewMaintenance')?.addEventListener('click', () => {
    populateVehicleSelect();
    openMaintenanceModal();
  });
  $('#btnSaveMaintenance')?.addEventListener('click', saveMaintenance);
  $('#maintSearch')?.addEventListener('input', () => renderMaintenanceList(allMaintenance));

  // Leads
  $('#leadStatusFilter')?.addEventListener('change', () => renderLeadsList(allLeads));

  // Delete confirm
  $('#btnConfirmDelete')?.addEventListener('click', executeDelete);

  // Close modals on backdrop click
  $$('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) {
        closeModal(backdrop.id);
      }
    });
  });

  // Keyboard ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $$('.modal-backdrop.show').forEach(m => closeModal(m.id));
    }
  });

  // Clock
  updateClock();
  setInterval(updateClock, 30000);

  // Load all data from Supabase
  await Promise.all([
    loadVehicles(),
    loadMaintenance(),
    loadLeads(),
    loadBranches(),
  ]);

  renderRoleBasedUI();
  renderDashboard();
}

function renderRoleBasedUI() {
  const role = currentUser?.role;
  const roles = window.APP_CONFIG?.ROLES;

  if (role === roles.VIEWER) {
    $$('#btnNewVehicle, #btnNewMaintenance, #btnNewBranch').forEach(b => { if (b) b.style.display = 'none'; });
    $$('#btnSaveVehicle, #btnSaveMaintenance').forEach(b => {
      if (b) { b.disabled = true; b.title = 'Tu rol no permite guardar cambios'; b.style.opacity = '0.5'; }
    });
  }

  if (role !== roles.ADMIN) {
    const deleteBtn = $('#btnConfirmDelete');
    if (deleteBtn) deleteBtn.style.display = 'none';
    if (role === roles.EDITOR) {
      console.log('[Admin] Rol editor: Acceso a edición habilitado, borrado restringido.');
    }
  }
}

// ── Login Flow ──
async function initLogin() {
  const form = $('#loginForm');
  const btn = $('#loginBtn');
  const error = $('#loginError');
  const togglePass = $('#togglePass');

  togglePass?.addEventListener('click', () => {
    const input = $('#loginPass');
    const icon = togglePass.querySelector('i');
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      icon.className = 'fas fa-eye-slash';
    } else {
      input.type = 'password';
      icon.className = 'fas fa-eye';
    }
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const username = $('#loginUser')?.value.trim();
    const password = $('#loginPass')?.value;
    if (!username || !password) return;

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...'; }
    if (error) error.style.display = 'none';

    try {
      const user = await doLogin(username, password);
      if (user) {
        await initAdmin(user);
      } else {
        if (error) error.style.display = 'flex';
        setTimeout(() => { if (error) error.style.display = 'none'; }, 3000);
        $('#loginPass').value = '';
        $('#loginPass').focus();
      }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> Iniciar sesión'; }
    }
  });

  $('#loginUser')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('#loginPass')?.focus(); });
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  const session = getSession();
  if (session) {
    currentUser = session;
    await initAdmin(session);
  } else {
    initLogin();
  }
});

// Expose globals needed by inline handlers
window.openVehicleModal = openVehicleModal;
window.openMaintenanceModal = openMaintenanceModal;
window.confirmDelete = confirmDelete;
window.updateLeadStatus = updateLeadStatus;
window.switchPanel = switchPanel;
window.closeModal = closeModal;
window.$ = $;
window.exportVehiclesToExcel = exportVehiclesToExcel;
window.handleExcelImport = handleExcelImport;

// ── Excel Functions ──
const EXCEL_MAPPING = {
  'Marca': 'brand',
  'Modelo': 'model',
  'Año': 'year',
  'Versión': 'version',
  'Color': 'color',
  'Kilometraje': 'mileage',
  'Precio': 'price',
  'Estado': 'status',
  'Combustible': 'fuel_type',
  'Transmisión': 'transmission',
  'Puertas': 'doors',
  'Motor': 'engine',
  'Patente': 'patent',
  'VIN': 'vin',
  'Descripción': 'description',
  'Destacado': 'is_featured',
  'Fotos': 'photos',
  'Equipamiento': 'features'
};

function exportVehiclesToExcel() {
  let exportData = [];

  if (allVehicles.length > 0) {
    exportData = allVehicles.map(v => {
      const row = {};
      Object.entries(EXCEL_MAPPING).forEach(([header, key]) => {
        let val = v[key];
        if (key === 'photos') val = Array.isArray(val) ? val.join(', ') : '';
        if (key === 'features') val = Array.isArray(val) ? val.join(', ') : '';
        if (key === 'is_featured') val = val ? 'si' : 'no';
        row[header] = val || '';
      });
      return row;
    });
    showToast('Exportación exitosa', 'Se descargó el inventario completo.', 'success');
  } else {
    exportData = [
      {
        'Marca': 'Toyota', 'Modelo': 'Corolla', 'Año': 2024, 'Versión': 'SEG Hybrid', 'Color': 'Blanco',
        'Kilometraje': 0, 'Precio': 35000000, 'Estado': 'disponible', 'Combustible': 'hibrido',
        'Transmisión': 'automatica', 'Puertas': 4, 'Motor': '1.8 HV', 'Patente': 'AF123JK', 'VIN': '',
        'Descripción': 'Excelente unidad...', 'Destacado': 'no',
        'Fotos': 'https://link-a-foto.jpg', 'Equipamiento': 'Techo, Cuero, GPS'
      }
    ];
    showToast('Plantilla lista', 'Como no hay autos, se descargó el formato de carga masiva.', 'info');
  }

  const ws = XLSX.utils.json_to_sheet(exportData, { header: Object.keys(EXCEL_MAPPING) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock_BBruno");
  XLSX.writeFile(wb, `Stock_BBruno_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function handleExcelImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);

      if (!rows.length) {
        showToast('Archivo vacío', 'No se encontraron filas con datos.', 'warning');
        return;
      }

      showToast('Importando...', `Procesando ${rows.length} vehículos. Por favor esperá.`, 'info');

      let successCount = 0;
      let errorCount = 0;

      for (const row of rows) {
        const vehicleData = {
          branch_id: 'branch-1'
        };
        
        Object.entries(EXCEL_MAPPING).forEach(([header, key]) => {
          let val = row[header];
          if (val === undefined) val = '';
          
          if (key === 'photos') {
             vehicleData[key] = val ? String(val).split(',').map(s => s.trim()).filter(Boolean) : [];
          } else if (key === 'features') {
             vehicleData[key] = val ? String(val).split(',').map(s => s.trim()).filter(Boolean) : [];
          } else if (key === 'is_featured') {
             vehicleData[key] = String(val).toLowerCase() === 'si' || val === true;
          } else if (key === 'mileage' || key === 'price' || key === 'year' || key === 'doors') {
             vehicleData[key] = val ? parseFloat(val) : 0;
          } else {
             vehicleData[key] = String(val || '').trim();
          }
        });

        // Validation: patent is required
        if (!vehicleData.brand || !vehicleData.model || !vehicleData.patent) {
          errorCount++;
          continue;
        }

        try {
          await db.upsert('vehicles', vehicleData, 'patent');
          successCount++;
        } catch (err) {
          console.error('[Import] Error subiendo fila:', vehicleData, err);
          errorCount++;
        }
      }

      await loadVehicles();
      if (successCount > 0) {
        showToast('Importación finalizada', `Se procesaron ${successCount} vehículos correctamente. ${errorCount ? `Hubo ${errorCount} errores.` : ''}`, 'success');
      } else {
        showToast('Error', 'No se pudo cargar ningún vehículo. Revisá el formato y que la patente esté presente.', 'danger');
      }
    } catch (err) {
      console.error('[Import] Error leyendo archivo:', err);
      showToast('Error de archivo', 'No se pudo leer el Excel. Asegurate de que sea un archivo válido.', 'danger');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}
