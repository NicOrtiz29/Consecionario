/**
 * BBruno Automotores - JavaScript Principal (Vista Pública)
 * =========================================================
 */

'use strict';

// ============================================================
// UTILS
// ============================================================
window.changeCardPhoto = function(el, src, index) {
  const wrapper = el.closest('.vehicle-card-img-wrapper');
  const img = wrapper.querySelector('.vehicle-card-img');
  const dots = wrapper.querySelectorAll('.photo-indicators .dot');
  if (img.src !== src) {
    img.src = src;
    dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
  }
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function formatCurrency(amount) {
  if (!amount) return 'Consultar';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS',
    minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(amount);
}

function formatNumber(n) {
  return new Intl.NumberFormat('es-AR').format(n);
}

function formatMileage(km) {
  if (!km && km !== 0) return '—';
  return `${formatNumber(km)} km`;
}

function slugify(str) {
  return (str || '').toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
}

// Animación para los números
function animateValue(obj, end, duration = 400) {
  if (!obj) return;
  let startTimestamp = null;
  const startText = obj.textContent.replace(/[^\d]/g, '');
  const startValue = parseInt(startText) || 0;
  
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const current = Math.floor(progress * (end - startValue) + startValue);
    obj.textContent = formatCurrency(current);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      obj.textContent = formatCurrency(end);
    }
  };
  window.requestAnimationFrame(step);
}


function getStatusLabel(status) {
  const map = {
    disponible: { label: 'Disponible', cls: 'badge-success' },
    reservado: { label: 'Reservado', cls: 'badge-warning' },
    vendido: { label: 'Vendido', cls: 'badge-danger' },
    en_revision: { label: 'En revisión', cls: 'badge-info' }
  };
  return map[status] || { label: status, cls: 'badge-info' };
}

function getFuelLabel(fuel) {
  const map = {
    nafta: 'Nafta', diesel: 'Diésel', gnc: 'GNC',
    nafta_gnc: 'Nafta + GNC', hibrido: 'Híbrido', electrico: 'Eléctrico'
  };
  return map[fuel] || fuel;
}

function getFuelIcon(fuel) {
  const map = {
    nafta: 'fa-gas-pump', diesel: 'fa-gas-pump',
    gnc: 'fa-fire', nafta_gnc: 'fa-fire',
    hibrido: 'fa-leaf', electrico: 'fa-bolt'
  };
  return map[fuel] || 'fa-gas-pump';
}

function getTransmissionLabel(t) {
  const map = { manual: 'Manual', automatica: 'Automática', cvt: 'CVT' };
  return map[t] || t;
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(title, message = '', type = 'default') {
  const container = $('#toastContainer');
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', default: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.default}</span>
    <div class="toast-body">
      ${title ? `<div class="toast-title">${title}</div>` : ''}
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================================
// API HELPERS (Supabase)
// ============================================================
const db = window.SupabaseClient;

async function fetchVehicles({ limit = 100 } = {}) {
  const data = await db.select('vehicles', { order: 'created_at.desc', limit });
  return data; // Returns array directly
}

async function fetchVehicleById(id) {
  return db.selectById('vehicles', id);
}

async function fetchBranches() {
  return db.select('branches');
}

async function submitLead(data) {
  return db.insert('leads', data);
}

// ============================================================
// STATE
// ============================================================
let allVehicles = [];
let filteredVehicles = [];
let branchesMap = {};
let alarfinData = null;
let genSimCuotas = 12;

// ============================================================
// VEHICLE CARD RENDERING
// ============================================================
function renderVehicleCard(v) {
  const status = getStatusLabel(v.status || 'disponible');
  const photos = Array.isArray(v.photos) && v.photos.length ? v.photos.slice(0, 8) : ['https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&q=80'];
  const branch = branchesMap[v.branch_id];
  const branchName = branch ? branch.city || branch.name : 'Tristán Suárez';
  const isAvailable = v.status === 'disponible' || !v.status;

  // Generar segmentos de hover si hay múltiples fotos
  let hoverSegments = '';
  let indicators = '';
  if (photos.length > 1) {
    hoverSegments = photos.map((p, i) => `
      <div class="photo-segment" onmouseenter="changeCardPhoto(this, '${p}', ${i})"></div>
    `).join('');
    
    indicators = `
      <div class="photo-indicators">
        ${photos.map((_, i) => `<span class="dot ${i === 0 ? 'active' : ''}"></span>`).join('')}
      </div>
    `;
  }

  return `
    <article class="vehicle-card" 
      onclick="goToDetail('${v.id}')" 
      role="listitem"
      tabindex="0"
      onkeydown="if(event.key==='Enter')goToDetail('${v.id}')"
      aria-label="${v.year} ${v.brand} ${v.model} - ${formatCurrency(v.price)}">
      <div class="vehicle-card-img-wrapper">
        <img 
          class="vehicle-card-img" 
          src="${photos[0]}" 
          alt="${v.year} ${v.brand} ${v.model}"
          loading="lazy"
          onerror="this.src='https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&q=80'">
        
        <div class="photo-segments-container">
          ${hoverSegments}
        </div>
        
        ${indicators}

        <div class="vehicle-card-badge">
          <span class="badge ${status.cls}">${status.label}</span>
        </div>
        ${v.is_featured ? `<div class="vehicle-card-featured">⭐ Destacado</div>` : ''}
      </div>
      <div class="vehicle-card-body">
        <div class="vehicle-card-brand">${v.brand || ''}</div>
        <h3 class="vehicle-card-title">${v.year || ''} ${v.model || ''}</h3>
        <div class="vehicle-card-version">${v.version || ''}</div>
        <div class="vehicle-card-specs">
          <div class="spec-item">
            <i class="fas fa-road" aria-hidden="true"></i>
            <span>${formatMileage(v.mileage)}</span>
          </div>
          <div class="spec-item">
            <i class="fas ${getFuelIcon(v.fuel_type)}" aria-hidden="true"></i>
            <span>${getFuelLabel(v.fuel_type) || '—'}</span>
          </div>
          ${v.transmission ? `
          <div class="spec-item">
            <i class="fas fa-gears" aria-hidden="true"></i>
            <span>${getTransmissionLabel(v.transmission)}</span>
          </div>` : ''}
          ${v.doors ? `
          <div class="spec-item">
            <i class="fas fa-door-open" aria-hidden="true"></i>
            <span>${v.doors}p</span>
          </div>` : ''}
        </div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between">
          <div>
            <div class="vehicle-card-price-label">Precio Total</div>
            <div class="vehicle-card-price">${formatCurrency(v.price)}</div>
            ${v.down_payment ? `<div style="font-size:0.75rem; color:var(--color-yellow); margin-top:2px; font-weight:600">Anticipo: ${formatCurrency(v.down_payment)}</div>` : ''}
          </div>
          ${isAvailable ? `
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();quickWhatsApp('${v.id}','${v.year} ${v.brand} ${v.model}')">
            <i class="fab fa-whatsapp" aria-hidden="true"></i>
          </button>` : ''}
        </div>
      </div>
      <div class="vehicle-card-footer">
        <div class="vehicle-card-location">
          <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
          <span>${branchName}</span>
        </div>
        <span style="font-size:.78rem;color:var(--color-yellow);font-weight:600">Ver detalle →</span>
      </div>
    </article>
  `;
}

function renderGrid(vehicles) {
  const grid = $('#vehicleGrid');
  const empty = $('#vehicleGridEmpty');
  const info = $('#resultsInfo');

  if (!grid) return;

  if (!vehicles || vehicles.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    if (info) info.innerHTML = '';
    return;
  }

  if (empty) empty.classList.add('hidden');
  if (info) info.innerHTML = `Mostrando <strong>${vehicles.length}</strong> vehículo${vehicles.length !== 1 ? 's' : ''}`;
  grid.innerHTML = vehicles.map(renderVehicleCard).join('');
}

// ============================================================
// NAVIGATION
// ============================================================
function goToDetail(id) {
  window.location.href = `vehicle-detail.html?id=${id}`;
}

function quickWhatsApp(vehicleId, vehicleName) {
  const msg = `¡Hola BBruno! Me interesa el ${vehicleName}. ¿Sigue disponible?`;
  window.open(`https://wa.me/541523150051?text=${encodeURIComponent(msg)}`, '_blank');
}

// ============================================================
// FILTERS
// ============================================================
function applyFilters() {
  const brand = ($('#filterBrand')?.value || '').toLowerCase().trim();
  const minYear = parseInt($('#filterMinYear')?.value) || 0;
  const maxYear = parseInt($('#filterMaxYear')?.value) || 9999;
  const fuel = $('#filterFuel')?.value || '';
  const maxPrice = parseInt($('#filterMaxPrice')?.value) || Infinity;
  const sort = $('#filterSort')?.value || 'featured';

  let results = allVehicles.filter(v => {
    if (v.status === 'vendido') return false; // Ocultar vendidos del catálogo público
    if (brand && !(
      (v.brand || '').toLowerCase().includes(brand) ||
      (v.model || '').toLowerCase().includes(brand) ||
      (v.version || '').toLowerCase().includes(brand)
    )) return false;
    if (v.year && (v.year < minYear || v.year > maxYear)) return false;
    if (fuel && v.fuel_type !== fuel) return false;
    if (v.price && v.price > maxPrice) return false;
    return true;
  });

  // Sort
  results = results.sort((a, b) => {
    switch (sort) {
      case 'price_asc': return (a.price || 0) - (b.price || 0);
      case 'price_desc': return (b.price || 0) - (a.price || 0);
      case 'year_desc': return (b.year || 0) - (a.year || 0);
      case 'mileage_asc': return (a.mileage || 0) - (b.mileage || 0);
      case 'featured':
      default:
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        return 0;
    }
  });

  filteredVehicles = results;
  renderGrid(results);
}

function clearFilters() {
  const fields = ['#filterBrand', '#filterMinYear', '#filterMaxYear', '#filterMaxPrice'];
  fields.forEach(sel => { const el = $(sel); if (el) el.value = ''; });
  const fuel = $('#filterFuel'); if (fuel) fuel.value = '';
  const sort = $('#filterSort'); if (sort) sort.value = 'featured';
  filteredVehicles = allVehicles.filter(v => v.status !== 'vendido');
  renderGrid(filteredVehicles);
}

// ============================================================
// NAVBAR MOBILE
// ============================================================
function initNavbar() {
  const toggle = $('#navToggle');
  const menu = $('#navMenu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.innerHTML = isOpen
      ? '<i class="fas fa-xmark" aria-hidden="true"></i>'
      : '<i class="fas fa-bars" aria-hidden="true"></i>';
  });

  // Cerrar al hacer click en link
  $$('.nav-link', menu).forEach(link => {
    link.addEventListener('click', () => {
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
    });
  });

  // Smooth scroll para anclas
  $$('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = $(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ============================================================
// INIT
// ============================================================
async function init() {
  initNavbar();

  // Registrar SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Cargar datos desde Supabase
  try {
    const [vehiclesData, branchesData] = await Promise.all([
      fetchVehicles({ limit: 100 }),
      fetchBranches()
    ]);

    // Branches map
    (branchesData || []).forEach(b => { branchesMap[b.id] = b; });

    allVehicles = vehiclesData || [];
    filteredVehicles = allVehicles.filter(v => v.status !== 'vendido');

    // Actualizar stat de vehículos
    const statEl = $('#statVehicles');
    if (statEl) statEl.textContent = filteredVehicles.length + '+';

    renderGrid(filteredVehicles);
  } catch (err) {
    console.error('[BBruno] Error cargando vehículos:', err);
    const grid = $('#vehicleGrid');
    if (grid) grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--color-gray)">
        <i class="fas fa-circle-exclamation" style="font-size:2rem;color:var(--color-danger);display:block;margin-bottom:1rem"></i>
        Error al cargar el catálogo. <a href="javascript:location.reload()" style="color:var(--color-yellow)">Reintentar</a>
      </div>`;
  }

  // Events
  $('#btnApplyFilters')?.addEventListener('click', applyFilters);
  $('#btnClearFilters')?.addEventListener('click', clearFilters);

  // Filtro al presionar Enter
  $$('#filterBrand,#filterMinYear,#filterMaxYear,#filterMaxPrice').forEach(el => {
    el?.addEventListener('keydown', e => { if (e.key === 'Enter') applyFilters(); });
  });

  // Filtros reactivos en selects
  $$('#filterFuel,#filterSort').forEach(el => {
    el?.addEventListener('change', applyFilters);
  });

  // General Simulator
  if ($('#genSimMonto')) initGeneralSimulator();
}

document.addEventListener('DOMContentLoaded', init);

// Exponer globalmente
window.goToDetail = goToDetail;
window.quickWhatsApp = quickWhatsApp;

async function initGeneralSimulator() {
  const container = $('#genSimContent');
  const loading = $('#genSimLoading');
  const errorDiv = $('#genSimError');
  const montoInput = $('#genSimMonto');
  const anioInput = $('#genSimAnio');

  if (!montoInput || !anioInput) return;

  const updateTexts = () => {
    if ($('#genSimMontoText')) $('#genSimMontoText').textContent = formatCurrency(montoInput.value);
    if ($('#genSimAnioText')) $('#genSimAnioText').textContent = anioInput.value;
  };

  montoInput.addEventListener('input', () => { updateTexts(); calculateGenSim(); });
  anioInput.addEventListener('input', () => { updateTexts(); calculateGenSim(); });

  $$('#genSimCuotasGrid .cuota-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#genSimCuotasGrid .cuota-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      genSimCuotas = parseInt(btn.dataset.cuotas);
      calculateGenSim();
    });
  });

  try {
    const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? 'http://localhost:3005/api/alarfin-data' 
      : 'https://bbruno-api.onrender.com/api/alarfin-data';

    const resp = await fetch(apiUrl);
    if (!resp.ok) throw new Error('API Offline');
    const rawData = await resp.json();
    alarfinData = rawData.tasas || rawData;

    if (typeof alarfinData !== 'object' || Object.keys(alarfinData).length === 0) throw new Error('Invalid Data');
    
    if(loading) loading.style.display = 'none';
    if(container) container.style.display = 'block';
    updateTexts();
    calculateGenSim();
  } catch (err) {
    if(loading) loading.style.display = 'none';
    if(errorDiv) {
      errorDiv.textContent = 'Servicio de simulación temporalmente inaccesible.';
      errorDiv.style.display = 'block';
    }
  }
}

function calculateGenSim() {
  if (!alarfinData) return;
  const monto = parseInt($('#genSimMonto').value);
  const year = parseInt($('#genSimAnio').value);
  const cuotas = genSimCuotas;
  
  const yearKey = year.toString();
  const cuotaKey = cuotas.toString();
  let tasa = null;

  if (alarfinData[yearKey] && alarfinData[yearKey][cuotaKey]) {
    tasa = parseFloat(alarfinData[yearKey][cuotaKey]);
  } else {
    const availableYears = Object.keys(alarfinData).map(Number).sort((a,b) => b-a);
    const fallbackYear = availableYears.find(y => year >= y);
    if (fallbackYear && alarfinData[fallbackYear.toString()] && alarfinData[fallbackYear.toString()][cuotaKey]) {
      tasa = parseFloat(alarfinData[fallbackYear.toString()][cuotaKey]);
    }
  }
  
  if (tasa) {
    animateValue($('#genSimResult'), monto * tasa);
  } else {
    const res = $('#genSimResult');
    if (res) res.textContent = 'Consultar';
  }
}
