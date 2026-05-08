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
    en_revision: { label: 'En mantenimiento', cls: 'badge-info' }
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
  // Optimizamos: Pedimos solo campos necesarios para la grilla
  // Evitamos 'description' y 'internal_notes' que pueden ser pesados
  const selectFields = 'id,brand,model,year,version,price,down_payment,status,fuel_type,transmission,doors,mileage,is_featured,created_at,branch_id,photos';
  const data = await db.select('vehicles', { 
    select: selectFields,
    order: 'created_at.desc', 
    limit 
  });
  return data;
}

async function fetchVehicleById(id) {
  // Para el detalle sí pedimos todo (*)
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

// Pagination
let currentPage = 1;
const itemsPerPage = 15;

// Session check for staff
function getStaffSession() {
  try { return JSON.parse(localStorage.getItem('bbruno_admin_session')); } catch { return null; }
}
const isStaff = !!getStaffSession();

// ============================================================
// VEHICLE CARD RENDERING
// ============================================================
function renderVehicleCard(v) {
  const status = getStatusLabel(v.status || 'disponible');
  
  // Optimizamos fotos: Límite de 8 y usamos transformación de Supabase (ancho 600, calidad 75)
  // Esto reduce el peso de cada imagen descargada drásticamente.
  const optimizeUrl = (url) => {
    if (url && url.includes('/storage/v1/render/image/public/')) {
      return `${url}?width=600&quality=75&format=webp`;
    }
    return url;
  };

  const photos = Array.isArray(v.photos) && v.photos.length 
    ? v.photos.slice(0, 8).map(optimizeUrl) 
    : ['https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&q=80'];

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
  const pagContainer = $('#paginationContainer');

  if (!grid) return;

  if (!vehicles || vehicles.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    if (info) info.innerHTML = '';
    if (pagContainer) pagContainer.innerHTML = '';
    return;
  }

  if (empty) empty.classList.add('hidden');
  
  // Slicing for pagination
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageItems = vehicles.slice(startIndex, endIndex);

  info.innerHTML = `Mostrando <strong>${startIndex + 1}-${Math.min(endIndex, vehicles.length)}</strong> de <strong>${vehicles.length}</strong> vehículo${vehicles.length !== 1 ? 's' : ''}`;
  
  grid.innerHTML = pageItems.map(renderVehicleCard).join('');
  
  renderPagination(vehicles.length);
  
  // Scroll to grid top if not first load
  if (currentPage > 1) {
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderPagination(totalItems) {
  const container = $('#paginationContainer');
  if (!container) return;

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `
    <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})" aria-label="Anterior">
      <i class="fas fa-chevron-left"></i>
    </button>
  `;

  for (let i = 1; i <= totalPages; i++) {
    // Show first, last, and pages around current
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      html += `
        <button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">
          ${i}
        </button>
      `;
    } else if (i === currentPage - 2 || i === currentPage + 2) {
      html += `<span style="color:var(--color-gray)">...</span>`;
    }
  }

  html += `
    <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})" aria-label="Siguiente">
      <i class="fas fa-chevron-right"></i>
    </button>
  `;

  container.innerHTML = html;
}

function changePage(page) {
  currentPage = page;
  renderGrid(filteredVehicles);
}

window.changePage = changePage;

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
  const status = $('#filterStatus')?.value || '';
  const sort = $('#filterSort')?.value || 'featured';

  let results = allVehicles.filter(v => {
    // Si no es staff, solo ver disponibles
    if (!isStaff) {
      if (v.status && v.status !== 'disponible') return false;
    } else {
      // Si es staff, puede filtrar por estado
      if (status && v.status !== status) return false;
    }

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
    // PRIMARY SORT: Featured always first
    const featA = !!a.is_featured;
    const featB = !!b.is_featured;
    if (featA && !featB) return -1;
    if (!featA && featB) return 1;

    // SECONDARY SORT: User selected option (only if both are same featured status)
    switch (sort) {
      case 'price_asc': return (a.price || 0) - (b.price || 0);
      case 'price_desc': return (b.price || 0) - (a.price || 0);
      case 'year_desc': return (b.year || 0) - (a.year || 0);
      case 'mileage_asc': return (a.mileage || 0) - (b.mileage || 0);
      case 'featured':
      default:
        // Default tie-breaker: newest first
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }
  });

  filteredVehicles = results;
  currentPage = 1; // Reset to first page
  renderGrid(results);
}

function clearFilters() {
  const fields = ['#filterBrand', '#filterMinYear', '#filterMaxYear', '#filterMaxPrice'];
  fields.forEach(sel => { const el = $(sel); if (el) el.value = ''; });
  const fuel = $('#filterFuel'); if (fuel) fuel.value = '';
  const sort = $('#filterSort'); if (sort) sort.value = 'featured';
  const status = $('#filterStatus'); if (status) status.value = '';
  
  filteredVehicles = allVehicles.filter(v => isStaff || !v.status || v.status === 'disponible');
  currentPage = 1;
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
// BRANDING & CONFIG
// ============================================================
let siteConfig = null;

async function loadBrandingConfig() {
  try {
    const apiBase = window.APP_CONFIG?.API_URL || 'http://localhost:3005/api';
    const resp = await fetch(`${apiBase}/config`);
    if (!resp.ok) throw new Error('Config failed');
    siteConfig = await resp.json();

    // Helper: busca en config o en site_content
    const get = (key) => siteConfig[key] || (siteConfig.site_content && siteConfig.site_content[key]) || '';

    // ═══ 1. Títulos y Textos básicos ═══
    if ($('#pageTitle')) $('#pageTitle').textContent = siteConfig.nombre + ' | Catálogo de Vehículos';
    if ($('#navbarTitle')) $('#navbarTitle').textContent = siteConfig.nombre;
    if ($('#footerCopyright')) $('#footerCopyright').textContent = `© ${new Date().getFullYear()} ${siteConfig.nombre}. Todos los derechos reservados.`;

    // ═══ 2. Logo ═══
    const logoImg = $('#navbarLogo');
    if (logoImg && siteConfig.logo_url) {
      logoImg.src = siteConfig.logo_url;
      logoImg.alt = siteConfig.nombre;
      logoImg.style.display = 'block';
      if ($('#navbarTitle')) $('#navbarTitle').style.display = 'none';
    }
    const footerLogo = $('#footerLogo');
    if (footerLogo && siteConfig.logo_url) {
      footerLogo.src = siteConfig.logo_url;
      footerLogo.alt = siteConfig.nombre;
    }

    // ═══ 3. Colores Dinámicos ═══
    if (siteConfig.color_primario) {
      document.documentElement.style.setProperty('--color-yellow', siteConfig.color_primario);
    }

    // ═══ 4. Hero Section ═══
    const heroBgUrl = get('hero_bg_url');
    if (heroBgUrl) {
      const heroEl = document.querySelector('.hero');
      if (heroEl) {
        // Overlay a dark gradient so text remains readable
        heroEl.style.background = `linear-gradient(135deg, rgba(5,5,5,0.9) 0%, rgba(17,17,17,0.7) 40%, rgba(26,20,0,0.85) 100%), url('${heroBgUrl}') center/cover no-repeat`;
      }
    }

    const heroBadge = get('hero_badge');
    if (heroBadge && $('#heroBadge')) {
      $('#heroBadge').innerHTML = `<i class="fas fa-shield-halved" aria-hidden="true"></i> ${heroBadge}`;
    }
    const heroTitulo = get('hero_titulo');
    if (heroTitulo && $('#heroTitle')) {
      // Parsear: separar en líneas por punto o manualmente
      const words = heroTitulo.split(' ');
      const mid = Math.ceil(words.length / 2);
      const line1 = words.slice(0, mid).join(' ');
      const line2 = words.slice(mid).join(' ');
      $('#heroTitle').innerHTML = `${line1}<br><span class="highlight">${line2}</span>`;
    }
    const heroDesc = get('hero_subtitulo');
    if (heroDesc && $('#heroSubtitle')) {
      $('#heroSubtitle').textContent = heroDesc;
    }

    // Stats
    const statSeg = get('stat_seguidores');
    if (statSeg && $('#statSeg')) $('#statSeg').textContent = statSeg;
    const statSegLabel = get('stat_seguidores_label');
    if (statSegLabel && $('#statSegLabel')) $('#statSegLabel').textContent = statSegLabel;
    const statExp = get('stat_experiencia');
    if (statExp && $('#statExp')) $('#statExp').textContent = statExp;
    const statExpLabel = get('stat_experiencia_label');
    if (statExpLabel && $('#statExpLabel')) $('#statExpLabel').textContent = statExpLabel;

    // ═══ 5. WhatsApp Buttons ═══
    const waNum = (siteConfig.whatsapp || '').replace(/\D/g, '');
    if (waNum) {
      const waUrl = `https://wa.me/${waNum}`;
      if ($('#heroWhatsappBtn')) $('#heroWhatsappBtn').href = waUrl;
      if ($('#contactWhatsappBtn')) $('#contactWhatsappBtn').href = waUrl;
      if ($('#footerWhatsapp')) $('#footerWhatsapp').href = waUrl;
    }
    if (siteConfig.whatsapp && $('#contactWhatsapp')) {
      $('#contactWhatsapp').textContent = siteConfig.whatsapp;
    }

    // ═══ 6. Announcement Bar ═══
    const ubicacion = get('direccion');
    if (ubicacion && siteConfig.whatsapp && $('#brandStrip')) {
      $('#brandStrip').innerHTML = `📍 ${ubicacion} &nbsp;|&nbsp; <a href="https://wa.me/${waNum}" target="_blank">📱 WhatsApp: ${siteConfig.whatsapp}</a> &nbsp;|&nbsp; Compro · Vendo · Permuto · Financio`;
    }

    // ═══ 7. Nosotros / Por qué elegirnos ═══
    const nosotrosTitulo = get('nosotros_titulo');
    if (nosotrosTitulo && $('#nosotrosTitulo')) {
      $('#nosotrosTitulo').innerHTML = nosotrosTitulo.replace(siteConfig.nombre, `<span class="text-yellow">${siteConfig.nombre}</span>`);
    }
    const nosotrosSubtitulo = get('nosotros_subtitulo');
    if (nosotrosSubtitulo && $('#nosotrosSubtitulo')) {
      $('#nosotrosSubtitulo').textContent = nosotrosSubtitulo;
    }
    // Cards
    for (let i = 1; i <= 4; i++) {
      const titulo = get(`card${i}_titulo`);
      const texto = get(`card${i}_desc`);
      if (titulo && $(`#card${i}Titulo`)) $(`#card${i}Titulo`).textContent = titulo;
      if (texto && $(`#card${i}Desc`)) $(`#card${i}Desc`).textContent = texto;
    }

    // ═══ 8. Contacto Section ═══
    if (ubicacion) {
      if ($('#contactUbicacion')) $('#contactUbicacion').textContent = ubicacion.split(',')[0] || ubicacion;
      if ($('#contactUbicacionSub')) $('#contactUbicacionSub').textContent = ubicacion;
      if ($('#contactoSubtitulo')) $('#contactoSubtitulo').textContent = `Estamos en ${ubicacion}. ¡Te esperamos!`;
    }

    const mapsUrl = get('mapa_url');
    if (mapsUrl && $('#contactMapsLink')) $('#contactMapsLink').href = mapsUrl;

    // Vendedores en contacto
    const e1Name = get('emp1_nombre'), e1Tel = get('emp1_tel');
    const e2Name = get('emp2_nombre'), e2Tel = get('emp2_tel');
    if (e1Name && e1Tel && e2Name && e2Tel) {
      if ($('#contactWhatsappSub')) {
        $('#contactWhatsappSub').textContent = `También: ${e1Name} ${e1Tel} | ${e2Name} ${e2Tel}`;
      }
    }

    // Instagram
    const igUrl = get('instagram');
    if (igUrl) {
      // Extraer handle del URL
      const igHandle = '@' + igUrl.replace(/\/$/, '').split('/').pop();
      if ($('#contactInstagram')) $('#contactInstagram').textContent = igHandle;
      if ($('#contactInstagramBtn')) $('#contactInstagramBtn').href = igUrl;
      if ($('#footerInstagram')) $('#footerInstagram').href = igUrl;
    }

    // Facebook
    const fbUrl = get('facebook');
    if (fbUrl && $('#footerFacebook')) $('#footerFacebook').href = fbUrl;

    // ═══ 9. Footer ═══
    const footerDesc = get('footer_descripcion');
    if (footerDesc && $('#footerDesc')) $('#footerDesc').textContent = footerDesc;

    // Footer Contacto
    if (ubicacion && $('#footerUbicacion')) {
      $('#footerUbicacion').querySelector('span').textContent = ubicacion;
    }
    const wa = get('whatsapp');
    if (wa && $('#footerTel')) {
      $('#footerTel').querySelector('span').textContent = wa;
    }
    if (e1Name && e1Tel && $('#footerEmp1')) {
      $('#footerEmp1').querySelector('span').textContent = `${e1Name}: ${e1Tel}`;
    }
    if (e2Name && e2Tel && $('#footerEmp2')) {
      $('#footerEmp2').querySelector('span').textContent = `${e2Name}: ${e2Tel}`;
    }

    // ═══ 10. Horarios en Footer y Hero ═══
    const horarioSem = get('horario_semana');
    const horarioSab = get('horario_sabado');
    if (horarioSem && $('#horarioSemanaText')) $('#horarioSemanaText').textContent = horarioSem;
    if (horarioSab && $('#horarioSabadoText')) $('#horarioSabadoText').textContent = horarioSab;

    const footerContacts = $('#footerContacts');
    if (footerContacts) {
      let html = '';
      if (wa) {
        html += `<a href="https://wa.me/${wa.replace(/\D/g, '')}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> ${wa}</a>`;
      }
      if (horarioSem) {
        html += `<span title="Lunes a Viernes"><i class="far fa-clock"></i> ${horarioSem}</span>`;
      }
      footerContacts.innerHTML = html;
    }

    // ═══ 11. Visibilidad de módulos ═══
    const simSection = $('#generalSimulatorSection');
    if (simSection) {
      simSection.style.display = siteConfig.mostrar_financiacion ? 'block' : 'none';
    }

  } catch (err) {
    console.error('[Branding] Error:', err);
    if ($('#pageTitle')) $('#pageTitle').textContent = 'Catálogo de Vehículos';
  }
}

// ============================================================
// INIT
// ============================================================
async function init() {
  initNavbar();
  await loadBrandingConfig(); // Cargar marca antes que el resto

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
    
    // Si es staff, mostrar el filtro de estados
    if (isStaff) {
      const group = $('#filterStatusGroup');
      if (group) group.style.display = 'block';
    }

    filteredVehicles = allVehicles.filter(v => isStaff || !v.status || v.status === 'disponible');

    // Actualizar stat de vehículos
    const statEl = $('#statVehicles');
    if (statEl) statEl.textContent = filteredVehicles.length + '+';

    // Aplicar filtros iniciales (esto maneja el orden de destacados y paginado)
    applyFilters();
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
  $$('#filterFuel,#filterSort,#filterStatus').forEach(el => {
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
    const apiBase = window.APP_CONFIG?.API_URL || 'http://localhost:3005/api';
    const domain = siteConfig?.alarfin_domain || 'bbruno';
    const apiUrl = `${apiBase}/alarfin-data?domain=${domain}`;

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
