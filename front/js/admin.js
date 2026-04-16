/**
 * BBruno Automotores - Admin Panel JavaScript
 * ============================================
 * v3 — Supabase Backend Integration
 */

'use strict';

// ── Utils ──
const $ = sel => document.querySelector(sel);
const $$ = (sel, cur = document) => [...cur.querySelectorAll(sel)];

// SECURITY: XSS protection — escape HTML entities in dynamic content
function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

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
  const m = { disponible:{l:'Disponible',c:'badge-success'}, reservado:{l:'Reservado',c:'badge-warning'}, vendido:{l:'Vendido',c:'badge-danger'}, en_revision:{l:'En mantenimiento',c:'badge-info'} };
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
  // SECURITY: Escape all dynamic content to prevent XSS
  t.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><div class="toast-body"><div class="toast-title">${escapeHtml(title)}</div>${msg?`<div class="toast-message">${escapeHtml(msg)}</div>`:''}</div>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(100%)'; t.style.transition='all .3s'; setTimeout(()=>t.remove(),300); }, 4500);
}

// ── Auth ──
const AUTH_KEY = 'bbruno_admin_session';
const TOKEN_KEY = 'bbruno_admin_token';
const REFRESH_KEY = 'bbruno_admin_refresh';

let currentUser = null;

function getSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
}
function setSession(user, tokens = {}) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  if (tokens.token) localStorage.setItem(TOKEN_KEY, tokens.token);
  if (tokens.refreshToken) localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}
function clearSession() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

function logout() {
  clearSession();
  location.reload();
}

// Interceptor para fetch (agrega el token)
async function refreshToken() {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return false;
  try {
    const res = await fetch(`${window.APP_CONFIG.API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh })
    });
    if (!res.ok) throw new Error('Refresh failed');
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token || data.accessToken);
    return true;
  } catch (err) {
    console.warn('[Auth] No se pudo refrescar token:', err.message);
    return false;
  }
}

async function doLogin(username, password) {
  try {
    const res = await fetch(`${window.APP_CONFIG.API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al iniciar sesión');
    }
    const data = await res.json();
    setSession(data.user, data);
    return data.user;
  } catch (err) {
    console.warn('[Auth] Login API falló:', err.message);
    throw err;
  }
}

// ── State ──
let allVehicles = [];
let allMaintenance = [];
let allLeads = [];
let allBranches = [];
let allUsers = [];
let vehiclePhotos = [];
let vehicleFeatures = [];
let vehicleDocs = [];
let maintParts = [];
let pendingDeleteId = '';
let pendingDeleteTable = '';
let pendingDeleteCallback = null;
let currentPanel = 'dashboard';

// ── API Helpers ──
async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${window.APP_CONFIG.API_URL}${endpoint}`;
  const headers = { ...options.headers };
  
  // Usamos la constante TOKEN_KEY que ya definimos arriba
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    if (typeof options.body === 'object') options.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, { ...options, headers });
  
  if (res.status === 401 || res.status === 403) {
    // Si obtenemos error de auth, intentamos refrescar sesión
    const refreshed = await refreshToken();
    if (refreshed) {
      // Reintentamos con el nuevo token
      const newToken = localStorage.getItem(TOKEN_KEY);
      headers['Authorization'] = `Bearer ${newToken}`;
      const retryRes = await fetch(url, { ...options, headers });
      if (retryRes.ok) return retryRes.json();
    }
    
    // Si el refresh falla o sigue dando error
    logout();
    throw new Error('Sesión expirada o sin permisos');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(data.error || 'Error en la petición');
  }
  return res.json();
}

async function apiGet(table) {
  return apiFetch(`/tables/${table}`);
}

async function apiCreate(table, data) {
  return apiFetch(`/tables/${table}`, {
    method: 'POST',
    body: data
  });
}

// Alias for Excel import compatibility
async function apiPost(table, data) {
  return apiCreate(table, data);
}

async function apiUpdate(table, id, data) {
  return apiFetch(`/tables/${table}/${id}`, {
    method: 'PATCH',
    body: data
  });
}

async function apiDelete(table, id) {
  return apiFetch(`/tables/${table}/${id}`, {
    method: 'DELETE'
  });
}

// ── Modal Management ──
function openModal(id) {
  const m = $(`#${id}`);
  if (!m) return;
  
  // Reiniciar scroll del contenido del modal
  const modalContent = m.querySelector('.modal');
  if (modalContent) modalContent.scrollTop = 0;

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
      el.innerHTML = `${tag}<button class="tag-remove" type="button" data-idx="${i}" aria-label="Quitar ${tag}">×</button>`;
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

  input.onkeydown = e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input.value);
    }
    if (e.key === 'Backspace' && !input.value && arrayRef.length) {
      arrayRef.pop();
      renderTags();
    }
  };

  container.onclick = e => {
    if (e.target.classList.contains('tag-remove')) {
      e.preventDefault();
      const idx = parseInt(e.target.dataset.idx);
      arrayRef.splice(idx, 1);
      renderTags();
    }
    input.focus();
  };

  renderTags();
  return { render: renderTags };
}

// ── Photo Management ──
function renderPhotoPreviews() {
  const grid = $('#photoPreviews');
  if (!grid) return;
  const count = vehiclePhotos.length;
  const FALLBACK = 'https://placehold.co/600x400/2B2B2B/888?text=Error+de+Carga';
  
  grid.innerHTML = vehiclePhotos.map((url, i) => `
    <div class="photo-preview-item">
      <img src="${url}" alt="Foto ${i+1}" 
           onerror="console.error('Error cargando:', '${url}'); this.onerror=null; this.src='${FALLBACK}';">
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
  let url = input?.value.trim();
  if (!url) return;

  if (vehiclePhotos.length >= 8) {
    showToast('Límite alcanzado', 'Podés cargar hasta 8 fotos por vehículo.', 'warning');
    return;
  }

  // Evitar duplicados
  if (vehiclePhotos.includes(url)) {
    showToast('Foto duplicada', 'Esta imagen ya fue agregada.', 'warning');
    return;
  }

  // Soporte para Instagram con Proxy (Acepta cualquier formato de link)
  const igRegex = /(instagram\.com|instagr\.am)\/(?:.*\/)?(p|reels|tv)\/([A-Za-z0-9_-]+)/i;
  const match = url.match(igRegex);
  
  if (match) {
    try {
      const type = match[2]; 
      const shortcode = match[3]; 
      const igUrl = `https://www.instagram.com/${type}/${shortcode}/media/?size=l`;
      
      // Verificamos si ya existe el MISMO post (para evitar repetir la portada)
      const isDuplicatePost = vehiclePhotos.some(p => p.includes(`/${shortcode}/`));
      if (isDuplicatePost) {
        showToast('Aviso: Mismo Post', 'Ya agregaste la portada de este post. Para las otras fotos, usá "Copiar dirección de imagen".', 'warning');
        // No bloqueamos, por si el usuario realmente quiere repetirla, 
        // pero avisamos por qué se ve igual.
      }

      url = `https://images.weserv.nl/?url=${encodeURIComponent(igUrl)}&default=https://placehold.co/800x600/2b2b2b/888?text=Instagram+No+Disponible`;
      
      console.log('[Admin] IG detectado y procesado:', { shortcode, url });
      $('#igExtraButtons').style.display = 'block';
    } catch (e) {
      console.warn('Error procesando link de IG:', e);
    }
  } else {
    $('#igExtraButtons').style.display = 'none';
  }

  vehiclePhotos.push(url);
  renderPhotoPreviews();
  input.value = '';
  showToast('Foto agregada', 'La imagen ha sido pre-cargada correctamente', 'info');
};

window.extractIGImages = async function() {
  const url = $('#vfPhotoUrl')?.value || (vehiclePhotos.find(p => p.includes('instagram.com')) || '');
  const igRegex = /(instagram\.com|instagr\.am)\/(?:.*\/)?(p|reels|tv)\/([A-Za-z0-9_-]+)/i;
  const match = url.match(igRegex);
  
  if (!match) {
    showToast('Error', 'No hay un link de Instagram válido para extraer.', 'error');
    return;
  }

  const shortcode = match[3];
  showToast('Extrayendo...', 'Buscando fotos en Instagram...', 'info');

  try {
    const apiBase = window.APP_CONFIG?.API_URL || 'http://localhost:3005/api';
    const res = await fetch(`${apiBase}/ig-extract?shortcode=${shortcode}`);
    const data = await res.json();

    if (data.images && data.images.length > 0) {
      // Limpiamos las repetidas
      const newImages = data.images.filter(img => !vehiclePhotos.includes(img));
      
      if (newImages.length === 0) {
        showToast('Info', 'Ya se importaron todas las fotos disponibles.', 'info');
        return;
      }

      // Agregamos todas pasando por el Proxy para evitar el error 403
      newImages.forEach(img => {
        if (vehiclePhotos.length < 8) {
          const proxiedUrl = `https://images.weserv.nl/?url=${encodeURIComponent(img)}&default=https://placehold.co/800x600/2b2b2b/888?text=Error+IG`;
          vehiclePhotos.push(proxiedUrl);
        }
      });
      
      renderPhotoPreviews();
      showToast('¡Éxito!', `Se agregaron ${newImages.length} fotos encontradas.`, 'success');
    } else {
      showToast('Error', 'No se encontraron fotos adicionales.', 'warning');
    }
  } catch (err) {
    console.error('Error extrayendo IG:', err);
    showToast('Error', 'No se pudo contactar con el extractor.', 'error');
  }
};

window.handleLocalPhoto = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (vehiclePhotos.length >= 8) {
    showToast('Límite alcanzado', 'Podés cargar hasta 8 fotos por vehículo.', 'warning');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    vehiclePhotos.push(e.target.result);
    renderPhotoPreviews();
    showToast('Foto agregada', 'Imagen cargada desde la PC.', 'success');
  };
  reader.onerror = function() {
    showToast('Error', 'No se pudo leer la imagen de la PC.', 'error');
  };
  reader.readAsDataURL(file);
  
  // Limpiar el input para permitir subir la misma u otra de nuevo
  event.target.value = '';
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
  users: ['Usuarios', 'Gestión de acceso y seguridad'],
  logs: ['Auditoría', 'Registro de movimientos y seguridad'],
};

function switchPanel(name) {
  const isAdmin = currentUser?.role === window.APP_CONFIG?.ROLES.ADMIN;
  if ((name === 'users' || name === 'logs') && !isAdmin) {
    showToast('Acceso denegado', 'Solo administradores pueden ver esta sección.', 'warning');
    return;
  }
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
  if (name === 'users') loadUsers();
  if (name === 'logs') loadLogs();
}

// ── Dashboard ──
function renderDashboard() {
  const total = allVehicles.length;
  const avail = allVehicles.filter(v => v.status === 'disponible').length;
  const reserved = allVehicles.filter(v => v.status === 'reservado').length;
  const sold = allVehicles.filter(v => v.status === 'vendido').length;
  const maint = allVehicles.filter(v => v.status === 'en_revision').length;
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
        <div class="stat-card-icon blue"><i class="fas fa-screwdriver-wrench" aria-hidden="true"></i></div>
        <div><div class="stat-card-value">${maint}</div><div class="stat-card-label">En mantenimiento</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon blue"><i class="fas fa-envelope" aria-hidden="true"></i></div>
        <div><div class="stat-card-value">${newLeads}</div><div class="stat-card-label">Consultas nuevas</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon yellow"><i class="fas fa-wrench" aria-hidden="true"></i></div>
        <div><div class="stat-card-value">${allMaintenance.length}</div><div class="stat-card-label">Servicios realizados</div></div>
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
            <img src="${photo}" alt="" style="width:56px;height:38px;border-radius:6px;object-fit:cover;flex-shrink:0" onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%2256%22%20height%3D%2238%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%232B2B2B%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22Arial%22%20font-size%3D%2210%22%20fill%3D%22%23888%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3EBB%3C%2Ftext%3E%3C%2Fsvg%3E'">
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
            onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%2272%22%20height%3D%2248%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%232B2B2B%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22Arial%22%20font-size%3D%2212%22%20fill%3D%22%23888%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3EBB%3C%2Ftext%3E%3C%2Fsvg%3E'">
        </td>
        <td>
          <div class="table-vehicle-name">
            ${v.brand || ''} ${v.model || ''}
            ${v.internal_notes ? `<i class="fas fa-sticky-note" style="color:var(--color-yellow);margin-left:.5rem;font-size:0.8rem" title="Contiene notas internas"></i>` : ''}
          </div>
          <div class="table-vehicle-sub">${v.version || '—'}</div>
        </td>
        <td style="font-family:monospace;font-weight:700;letter-spacing:1px">${v.patent || '—'}</td>
        <td>${v.year || '—'}</td>
        <td>${v.mileage ? formatNumber(v.mileage) + ' km' : '—'}</td>
        <td style="font-weight:700;color:var(--color-yellow)">
          ${formatCurrency(v.price)}
          ${v.down_payment ? `<div style="font-size:0.75rem;color:var(--color-gray-light);font-weight:400;margin-top:2px">Anticipo: ${formatCurrency(v.down_payment)}</div>` : ''}
        </td>
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
      if ($('#vfDownPayment')) $('#vfDownPayment').value = v.down_payment || '';
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

  // SECURITY: Disable fields for Vendedor/Viewer
  const role = currentUser?.role;
  const isSeller = (role === 'vendedor');
  const isViewer = (role === 'visualizador');
  const isEditing = !!$('#vfId').value;
  
  if (isSeller || isViewer) {
    const inputsToBlock = [
      'vfBrand', 'vfModel', 'vfYear', 'vfVersion', 'vfColor', 
      'vfMileage', 'vfDoors', 'vfEngine', 'vfPrice', 'vfDownPayment',
      'vfFuel', 'vfTransmission', 'vfCondition', 'vfVin', 'vfPatent',
      'vfDesc', 'vfFeatured', 'vfPhotoUrl', 'btnAddPhoto', 'btnExtractIG', 'vfPhotoFile'
    ];

    inputsToBlock.forEach(id => {
      const el = $('#' + id);
      if (el) {
        el.disabled = true;
        el.style.opacity = '0.6';
      }
    });

    // Special exception: Sellers can edit status and internal notes
    if (isSeller && isEditing) {
      if ($('#vfStatus')) { $('#vfStatus').disabled = false; $('#vfStatus').style.opacity = '1'; }
      if ($('#vfNotes')) { $('#vfNotes').disabled = false; $('#vfNotes').style.opacity = '1'; }
      if ($('#btnSaveVehicle')) $('#btnSaveVehicle').style.display = 'flex';
    } else {
      // If it's a viewer or a seller creating new (not allowed), hide save
      if ($('#btnSaveVehicle')) $('#btnSaveVehicle').style.display = 'none';
    }
  } else {
    // Admin/Editor: Ensure everything is enabled
    $$('#vehicleForm input, #vehicleForm select, #vehicleForm textarea, #btnAddPhoto, #btnExtractIG').forEach(el => {
      el.disabled = false;
      el.style.opacity = '1';
    });
    if ($('#btnSaveVehicle')) $('#btnSaveVehicle').style.display = 'flex';
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

  // Smart Validation: Check for duplicate plate when creating a new record
  if (!id) {
    const existing = allVehicles.find(v => v.patent?.toLowerCase() === patent.toLowerCase());
    if (existing) {
      const msg = `Atención: Ya existe un vehículo registrado con la patente ${patent} (${existing.brand} ${existing.model}).\n\n¿Querés ACTUALIZAR el vehículo existente con los datos nuevos?`;
      if (confirm(msg)) {
        // Switch to update mode using the existing vehicle's ID
        data.id = existing.id;
        try {
          if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...'; }
          await apiUpdate('vehicles', existing.id, data);
          showToast('¡Actualizado!', `El vehículo con patente ${patent} ha sido actualizado.`, 'success');
          closeModal('vehicleModal');
          await loadVehicles();
          if (currentPanel === 'dashboard') renderDashboard();
          return; // Exit early
        } catch (err) {
          showToast('Error', `No se pudo actualizar: ${err.message}`, 'error');
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar vehículo'; }
          return;
        }
      } else {
        // User cancelled the update, so we don't proceed with creation either
        return;
      }
    }
  }

  // Flush any pending text in the tag inputs
  const pendingFeature = $('#vfFeatureInput')?.value.trim();
  if (pendingFeature && !vehicleFeatures.includes(pendingFeature)) {
    vehicleFeatures.push(pendingFeature);
    featureTagsCtrl?.render();
  }

  const pendingDoc = $('#vfDocInputField')?.value.trim();
  if (pendingDoc && !vehicleDocs.includes(pendingDoc)) {
    vehicleDocs.push(pendingDoc);
    docTagsCtrl?.render();
  }

  const data = {
    brand, model, year, patent,
    version: $('#vfVersion')?.value.trim() || '',
    color: $('#vfColor')?.value.trim() || '',
    mileage: mileage || 0, 
    price: price || 0,
    down_payment: parseFloat($('#vfDownPayment')?.value) || 0,
    status: $('#vfStatus')?.value || 'disponible',
    fuel_type: $('#vfFuel')?.value || 'nafta',
    transmission: $('#vfTransmission')?.value || 'manual',
    condition: $('#vfCondition')?.value || 'usado_bueno',
    doors: parseInt($('#vfDoors')?.value) || 4,
    engine: $('#vfEngine')?.value.trim() || '',
    vin: $('#vfVin')?.value.trim() || '',
    description: $('#vfDesc')?.value.trim() || '',
    internal_notes: $('#vfNotes')?.value.trim() || '',
    is_featured: $('#vfFeatured')?.checked || false,
    photos: vehiclePhotos,
    features: vehicleFeatures,
    documents: vehicleDocs,
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
  list.innerHTML = branches.map(b => {
    let rawAddr = b.address || '';
    let mapsLink = '';
    if (rawAddr.includes(' | ')) {
      const parts = rawAddr.split(' | ');
      rawAddr = parts[0];
      mapsLink = parts[1];
    }
    return `
    <div style="background:var(--color-carbon-mid);border:1px solid rgba(255,255,255,0.07);border-radius:var(--border-radius);padding:1.25rem;margin-bottom:.75rem;display:flex;align-items:flex-start;gap:1rem;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="font-weight:700;font-size:1rem;margin-bottom:.25rem">${b.name || '—'}</div>
        <div style="font-size:.82rem;color:var(--color-gray)">
          <i class="fas fa-map-marker-alt" aria-hidden="true"></i> ${rawAddr}, ${b.city || ''}
          ${mapsLink ? `<a href="${mapsLink}" target="_blank" style="color:var(--color-yellow);margin-left:6px;text-decoration:none;"><i class="fas fa-map" aria-hidden="true"></i> Cómo llegar</a>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:.4rem;align-items:center">
        <span class="badge ${b.is_active ? 'badge-success' : 'badge-danger'}">${b.is_active ? 'Activa' : 'Inactiva'}</span>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="openBranchModal('${b.id}')" aria-label="Editar sucursal">
          <i class="fas fa-pen" aria-hidden="true"></i>
        </button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="confirmDelete('branches','${b.id}','¿Eliminar la sucursal ${b.name}?',loadBranches)" aria-label="Eliminar sucursal">
          <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  `}).join('');
}

function openBranchModal(id = null) {
  const form = $('#branchForm');
  if (form) form.reset();
  $('#bfId').value = '';

  const title = $('#branchModalTitle');
  if (title) title.textContent = id ? 'Editar sucursal' : 'Nueva sucursal';

  if (id) {
    const b = allBranches.find(x => x.id === id);
    if (b) {
      $('#bfId').value = b.id || '';
      $('#bfName').value = b.name || '';
      $('#bfCity').value = b.city || '';
      let rawAddr = b.address || '';
      let mapsLink = '';
      if (rawAddr.includes(' | ')) {
        const parts = rawAddr.split(' | ');
        rawAddr = parts[0];
        mapsLink = parts[1];
      }
      $('#bfAddress').value = rawAddr;
      if ($('#bfGoogleMaps')) $('#bfGoogleMaps').value = mapsLink;
      $('#bfActive').value = b.is_active ? 'true' : 'false';
    }
  }

  openModal('branchModal');
}

async function saveBranch() {
  const id = $('#bfId')?.value;
  const name = $('#bfName')?.value.trim();
  const city = $('#bfCity')?.value.trim();

  if (!name || !city) {
    showToast('Campos requeridos', 'Completá el nombre y la ciudad.', 'warning');
    return;
  }

  const rawAddr = $('#bfAddress')?.value.trim() || '';
  const rawMaps = $('#bfGoogleMaps')?.value.trim() || '';
  const combinedAddress = rawMaps ? `${rawAddr} | ${rawMaps}` : rawAddr;

  const data = {
    name,
    city,
    address: combinedAddress,
    is_active: $('#bfActive')?.value === 'true'
  };
  
  // Only send ID if editing, otherwise let DB handle it
  if (id) data.id = id;

  const btn = $('#btnSaveBranch');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

  try {
    if (id) {
      await apiUpdate('branches', id, data);
      showToast('¡Actualizada!', 'Sucursal actualizada correctamente.', 'success');
    } else {
      await apiCreate('branches', data);
      showToast('¡Creada!', 'Nueva sucursal agregada.', 'success');
    }
    closeModal('branchModal');
    await loadBranches();
  } catch (err) {
    showToast('Error', `No se pudo guardar: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar sucursal'; }
  }
}

async function loadBranches() {
  try {
    allBranches = await apiGet('branches');
    if (currentPanel === 'branches') renderBranchesList(allBranches);
  } catch (err) { console.error('[Admin] Error cargando sucursales:', err); }
}

// ── Users Management ──
function renderUsersTable(users) {
  const tbody = $('#usersTableBody');
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty"><i class="fas fa-users" aria-hidden="true"></i><br>No hay usuarios registrados</td></tr>';
    return;
  }

  // SECURITY: Escape all user-provided data to prevent XSS
  tbody.innerHTML = users.map(u => {
    const safeUsername = escapeHtml(u.username);
    const safeName = escapeHtml(u.full_name) || '—';
    const safeRole = escapeHtml(u.role);
    const safeId = escapeHtml(u.id);
    return `
    <tr>
      <td><div style="font-weight:700">${safeUsername}</div></td>
      <td>${safeName}</td>
      <td><span class="user-role-badge">${safeRole}</span></td>
      <td>
        <span class="badge ${u.is_active ? 'badge-success' : 'badge-danger'}">
          ${u.is_active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td>
        <div class="table-actions">
           <button class="btn btn-outline btn-sm btn-icon" title="Editar" onclick="openUserModal('${safeId}')">
             <i class="fas fa-pen"></i>
           </button>
           ${u.id !== currentUser.id ? `
           <button class="btn btn-danger btn-sm btn-icon" title="Eliminar" onclick="confirmDelete('admin_users','${safeId}','¿Eliminar al usuario ${safeUsername}?','loadUsers')">
             <i class="fas fa-trash"></i>
           </button>` : ''}
        </div>
      </td>
    </tr>
  `}).join('');
}

async function loadUsers() {
  if (currentUser?.role !== window.APP_CONFIG?.ROLES.ADMIN) return;
  try {
    const users = await apiFetch('/admin/users');
    allUsers = users;
    if (currentPanel === 'users') renderUsersTable(allUsers);
  } catch (err) { console.error('[Admin] Error cargando usuarios:', err); }
}

function openUserModal(id = null) {
  const form = $('#userForm');
  if (form) form.reset();
  $('#ufId').value = id || '';
  $('#passHint').textContent = id ? 'Ingresa una contraseña solo si quieres cambiarla.' : 'La contraseña es obligatoria para nuevos usuarios.';
  
  if (id) {
    const u = allUsers.find(x => x.id === id);
    if (u) {
      $('#ufUsername').value = u.username || '';
      $('#ufFullName').value = u.full_name || '';
      $('#ufRole').value = u.role || 'editor';
      $('#ufActive').checked = !!u.is_active;
      $('#ufUsername').disabled = true; // No permitir cambiar username
    }
  } else {
    $('#ufUsername').disabled = false;
    $('#ufRole').value = 'vendedor';
    $('#ufActive').checked = true;
  }
  openModal('userModal');
}

async function saveUser() {
  const id = $('#ufId').value;
  const username = $('#ufUsername').value.trim();
  const password = $('#ufPassword').value.trim();
  const full_name = $('#ufFullName').value.trim();
  const role = $('#ufRole').value;
  const is_active = $('#ufActive').checked;

  if (!username || !full_name || (!id && !password)) {
    showToast('Campos requeridos', 'Completá usuario, nombre y contraseña.', 'warning');
    return;
  }

  const data = { username, full_name, role, is_active };
  if (password) data.password = password;

  const btn = $('#btnSaveUser');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

  try {
    const endpoint = id ? `/admin/users/${id}` : '/admin/users';
    const method = id ? 'PATCH' : 'POST';
    
    await apiFetch(endpoint, {
      method,
      body: data
    });

    showToast('¡Éxito!', id ? 'Usuario actualizado.' : 'Usuario creado correctamente.', 'success');
    closeModal('userModal');
    await loadUsers();
  } catch (err) {
    showToast('Error', err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar usuario'; }
  }
}

function generateRandomPass() {
  // SECURITY: Use crypto.getRandomValues for better randomness
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const array = new Uint32Array(12);
  crypto.getRandomValues(array);
  let pass = '';
  for (let i = 0; i < 12; i++) pass += chars[array[i] % chars.length];
  $('#ufPassword').value = pass;
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
// ── Logs ──
async function loadLogs() {
  try {
    const logs = await apiGet('audit_logs');
    const tbody = $('#logsTableBody');
    if (!tbody) return;
    
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No hay movimientos registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(log => {
      const date = new Date(log.created_at).toLocaleString('es-AR');
      let badgeClass = 'badge-info';
      if (log.action === 'DELETE') badgeClass = 'badge-danger';
      if (log.action === 'CREATE') badgeClass = 'badge-success';
      
      const details = JSON.stringify(log.details || {}).substring(0, 100) + (JSON.stringify(log.details).length > 100 ? '...' : '');

      return `
        <tr>
          <td style="font-size:0.8rem; color:var(--color-gray-light)">${date}</td>
          <td><span style="font-weight:600">${log.username}</span></td>
          <td><span class="badge ${badgeClass}">${log.action}</span></td>
          <td><code style="color:var(--color-yellow)">${log.target_table}</code></td>
          <td style="font-size:0.75rem; color:var(--color-gray)" title='${JSON.stringify(log.details)}'>
            ${details}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('[Logs] Error:', err);
    showToast('Error', 'No se pudieron cargar los logs auditaría.', 'danger');
  }
}

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
  $('#logoutBtn')?.addEventListener('click', logout);

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

  // Branches
  $('#btnNewBranch')?.addEventListener('click', () => openBranchModal());
  $('#btnSaveBranch')?.addEventListener('click', saveBranch);

  // Users
  $('#btnNewUser')?.addEventListener('click', () => openUserModal());
  $('#btnSaveUser')?.addEventListener('click', saveUser);

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
  if (!currentUser) return;
  const role = currentUser.role;
  const roles = window.APP_CONFIG?.ROLES;

  // Sidebar link: Users only for Admin
  const usersLink = $('#sidebarLinkUsers');
  if (usersLink) usersLink.style.display = (role === roles.ADMIN) ? 'flex' : 'none';

  const isStaff = (role === roles.ADMIN || role === roles.EDITOR);
  const isAdmin = (role === roles.ADMIN);

  $$('#btnNewVehicle, #btnNewMaintenance, #btnNewBranch, #btnExportExcel, #btnImportExcel').forEach(b => { 
    if (b) b.style.display = isStaff ? 'flex' : 'none'; 
  });
  
  const btnNewUser = $('#btnNewUser');
  if (btnNewUser) btnNewUser.style.display = isAdmin ? 'flex' : 'none';

  const logsLink = $('#sidebarLinkLogs');
  if (logsLink) logsLink.style.display = isAdmin ? 'flex' : 'none';

  // Table actions: Hide delete for non-admins (or non-staff)
  const style = document.createElement('style');
  style.id = 'role-based-styles';
  const existingStyle = document.getElementById('role-based-styles');
  if (existingStyle) existingStyle.remove();

  let css = '';
  if (role !== roles.ADMIN && role !== roles.EDITOR) {
    css += '.btn-danger { display: none !important; } '; // Hide delete
  }
  
  if (role === roles.SELLER || role === roles.VIEWER) {
    // Sellers can see edit button for vehicles (to change status), 
    // but not for branches or maintenance.
    css += '#panel-branches .btn-outline, #panel-maintenance .btn-outline { display: none !important; } ';
  }

  style.textContent = css;
  document.head.appendChild(style);
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
        openModal('loginErrorModal');
        $('#loginPass').value = '';
        $('#loginPass').focus();
      }
    } catch (err) {
      console.error('[Auth] Login error:', err);
      openModal('loginErrorModal');
      $('#loginPass').value = '';
      $('#loginPass').focus();
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
    // SECURITY: Verify session against server (prevents localStorage tampering)
    try {
      const verifiedUser = await apiFetch('/auth/verify');
      if (verifiedUser) {
        // Update local session with server-verified data (role from DB, not localStorage)
        setSession(verifiedUser);
        currentUser = verifiedUser;
        await initAdmin(verifiedUser);
      } else {
        console.warn('[Security] Sesión inválida, forzando re-login');
        clearSession();
        initLogin();
      }
    } catch (err) {
      // Network error — allow offline access with cached session
      console.warn('[Auth] No se pudo verificar sesión (offline?), usando caché');
      currentUser = session;
      await initAdmin(session);
    }
  } else {
    initLogin();
  }
});

// Expose globals needed by inline handlers
window.openVehicleModal = openVehicleModal;
window.openMaintenanceModal = openMaintenanceModal;
window.openBranchModal = openBranchModal;
window.confirmDelete = confirmDelete;
window.updateLeadStatus = updateLeadStatus;
window.switchPanel = switchPanel;
window.closeModal = closeModal;
window.generateRandomPass = generateRandomPass;
window.loadUsers = loadUsers;
window.loadLogs = loadLogs;
window.openUserModal = openUserModal;
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
  'Anticipo': 'down_payment',
  'Estado': 'status',
  'Combustible': 'fuel_type',
  'Transmisión': 'transmission',
  'Puertas': 'doors',
  'Motor': 'engine',
  'Patente': 'patent',
  'VIN': 'vin',
  'Descripción': 'description',
  'Destacado': 'is_featured',
  'Equipamiento': 'features'
};

function exportVehiclesToExcel() {
  try {
    if (typeof XLSX === 'undefined') {
      showToast('Error', 'La librería para generar Excel no se cargó correctamente. Por favor recargá la página.', 'error');
      console.error('[Excel] XLSX library not found');
      return;
    }

    let exportData = [];
    let isTemplate = false;

    if (allVehicles.length > 0) {
      exportData = allVehicles.map(v => {
        const row = {};
        Object.entries(EXCEL_MAPPING).forEach(([header, key]) => {
          let val = v[key];
          if (key === 'features') val = Array.isArray(val) ? val.join(', ') : '';
          if (key === 'is_featured') val = val ? 'si' : 'no';
          
          let finalVal = String(val || '');
          
          // Excel limit is 32,767 characters per cell.
          if (finalVal.length > 32760) {
            console.warn(`[Excel] Truncando campo "${header}" para vehículo ${v.patent}. Largo: ${finalVal.length}`);
            finalVal = finalVal.substring(0, 32760) + "...";
          }
          row[header] = finalVal;
        });
        return row;
      });
    } else {
      isTemplate = true;
      exportData = [
        {
          'Marca': 'Toyota', 'Modelo': 'Corolla', 'Año': 2024, 'Versión': 'SEG Hybrid', 'Color': 'Blanco',
          'Kilometraje': 0, 'Precio': 35000000, 'Estado': 'disponible', 'Combustible': 'hibrido',
          'Transmisión': 'automatica', 'Puertas': 4, 'Motor': '1.8 HV', 'Patente': 'AF123JK', 'VIN': '',
          'Descripción': 'Excelente unidad...', 'Destacado': 'no',
          'Fotos': 'https://link-a-foto.jpg', 'Equipamiento': 'Techo, Cuero, GPS'
        }
      ];
    }

    const ws = XLSX.utils.json_to_sheet(exportData, { header: Object.keys(EXCEL_MAPPING) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock_BBruno");
    
    // Trigger download
    XLSX.writeFile(wb, `Stock_BBruno_${new Date().toISOString().split('T')[0]}.xlsx`);

    if (isTemplate) {
      showToast('Plantilla lista', 'Como no hay autos, se bajó el formato de carga masiva.', 'info');
    } else {
      showToast('Exportación exitosa', 'Se descargó el inventario completo.', 'success');
    }
  } catch (err) {
    console.error('[Excel] Error exportando:', err);
    showToast('Error', 'No se pudo generar el archivo: ' + err.message, 'error');
  }
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
          
          if (key === 'features') {
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
          await apiFetch('/api/tables/vehicles/upsert?onConflict=patent', {
            method: 'POST',
            body: vehicleData
          });
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
