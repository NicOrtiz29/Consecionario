# BBruno Automotores — PWA de Gestión de Inventario 🚗

**Concesionaria BBruno Automotores · Tristán Suárez, Ezeiza, Buenos Aires**  
Instagram: [@bbrunoautomotores](https://www.instagram.com/bbrunoautomotores/)

---

## 🎯 Descripción del Proyecto

Aplicación web progresiva (PWA) para la gestión integral del inventario de vehículos de **BBruno Automotores**. Incluye dos áreas diferenciadas:

- **Vista pública** para clientes: catálogo con fotos, fichas detalladas, filtros y formulario de consulta.
- **Panel administrativo privado**: gestión completa de vehículos, historial de mantenimiento, consultas (leads) y sucursales.

---

## ✅ Funcionalidades Implementadas

### Vista Pública (`index.html`)
- [x] Catálogo responsivo con cards de vehículos (foto, km, precio, estado, combustible)
- [x] Filtros dinámicos por marca/modelo, año, combustible y precio máximo
- [x] Ordenamiento (destacados, precio, año, kilometraje)
- [x] Barra de marquee con propuestas de valor
- [x] Estadísticas en tiempo real (vehículos disponibles)
- [x] Sección "¿Por qué elegirnos?"
- [x] Sección de contacto con WhatsApp, ubicación e Instagram
- [x] Horarios de atención
- [x] Footer completo con redes sociales
- [x] Identidad visual completa BBruno (negro, amarillo #F5D80A, dorado, grises)
- [x] Navbar sticky con menú mobile
- [x] Toast notifications
- [x] Accesibilidad (roles ARIA, alt text, labels)

### Detalle de Vehículo (`vehicle-detail.html`)
- [x] Galería de fotos con miniaturas interactivas
- [x] Lightbox para ver fotos en pantalla completa (navegación con teclado)
- [x] Ficha técnica completa (km, combustible, transmisión, motor, puertas, color, patente)
- [x] Estado con badges (disponible, reservado, vendido, en revisión)
- [x] Descripción pública y equipamiento
- [x] Documentación asociada (títulos, VTV, etc.)
- [x] CTA de WhatsApp y llamada directa
- [x] Formulario de consulta que guarda lead en la base de datos + abre WhatsApp
- [x] Compartir (Web Share API con fallback a clipboard)
- [x] Breadcrumb de navegación
- [x] Loader animado

### Panel Administrativo (`admin.html`)
- [x] **Login** con usuario/contraseña (sesión en sessionStorage)
- [x] **Dashboard**: estadísticas en tiempo real, últimos vehículos y consultas recientes
- [x] **Gestión de vehículos**: tabla completa con búsqueda, filtro por estado, CRUD
- [x] **Formulario de vehículo**: 
  - Datos básicos (marca, modelo, año, versión, color, motor, puertas)
  - Estado y precio (disponible/reservado/vendido/en revisión)
  - Combustible, transmisión, condición, destacado
  - VIN y patente
  - Fotos con preview (URLs)
  - Equipamiento (tags interactivos)
  - Documentación (tags)
  - Descripción pública y notas internas privadas
- [x] **Historial de mantenimiento**: agrupado por vehículo, con timeline
- [x] **Formulario de mantenimiento**: tipo, fecha, km, costo, taller, técnico, repuestos (tags)
- [x] **Gestión de leads**: lista con estado, cambio rápido de estado, botón WhatsApp directo
- [x] **Sucursales**: visualización de datos de cada sucursal
- [x] Sidebar responsivo (colapsable en mobile)
- [x] Reloj en tiempo real en topbar
- [x] Notificaciones toast
- [x] Modales de creación/edición
- [x] Modal de confirmación de eliminación
- [x] Cierre de sesión

### PWA
- [x] `manifest.json` (nombre, iconos, colores, orientación, categoría)
- [x] `sw.js` service worker (cache, offline fallback, network-first)
- [x] Meta tags para iOS/Android

---

## 📁 Estructura de Archivos

```
📦 BBruno Automotores
├── index.html              ← Vista pública (catálogo)
├── vehicle-detail.html     ← Ficha detallada pública
├── admin.html              ← Panel administrativo
├── manifest.json           ← PWA manifest
├── sw.js                   ← Service Worker
├── css/
│   └── style.css           ← Estilos globales + paleta BBruno
└── js/
    ├── app.js              ← Lógica vista pública
    └── admin.js            ← Lógica panel administrativo
```

---

## 🌐 URIs Funcionales

| Ruta                              | Descripción                                    |
|-----------------------------------|------------------------------------------------|
| `index.html`                      | Catálogo público de vehículos                  |
| `index.html#catalogo`             | Scroll directo al catálogo                     |
| `index.html#contacto`             | Scroll directo a contacto                      |
| `vehicle-detail.html?id={ID}`     | Ficha detallada del vehículo con ese ID        |
| `admin.html`                      | Panel administrativo (requiere login)          |

---

## 🔐 Credenciales de Acceso Admin

> ⚠️ Para entornos de producción, cambiar las contraseñas en la tabla `admin_users`.

| Usuario | Contraseña   | Rol         |
|---------|--------------|-------------|
| admin   | admin2024    | superadmin  |
| lucas   | lucas123     | vendedor    |
| kevin   | kevin123     | vendedor    |

---

## 🗃️ Modelos de Datos (Tablas)

### `vehicles`
Inventario principal. Campos públicos: `brand`, `model`, `year`, `version`, `color`, `mileage`, `price`, `status`, `fuel_type`, `transmission`, `doors`, `photos`, `description`, `features`, `documents`, `is_featured`, `condition`.  
Campos privados (solo admin): `internal_notes`, `vin`, `patent`, `branch_id`.

### `maintenance`
Historial de mantenimiento por vehículo: `vehicle_id`, `type`, `date`, `description`, `mileage_at_service`, `cost`, `performed_by`, `technician`, `next_service_mileage`, `next_service_date`, `parts_replaced`.

### `leads`
Consultas de clientes: `vehicle_id`, `client_name`, `client_phone`, `client_email`, `message`, `status`, `assigned_to`, `branch_id`.

### `branches`
Sucursales: `name`, `address`, `city`, `province`, `phone`, `whatsapp`, `email`, `manager`, `schedule`, `google_maps_url`, `is_active`, `photo`.

### `admin_users`
Usuarios del sistema: `username`, `password_hash`, `full_name`, `role`, `branch_id`, `email`, `is_active`.

---

## 🎨 Paleta de Colores BBruno

| Variable           | Valor     | Uso                        |
|--------------------|-----------|----------------------------|
| `--color-black`    | `#050505` | Fondo principal            |
| `--color-yellow`   | `#F5D80A` | Acento primario, CTA       |
| `--color-gold`     | `#D1B300` | Hover del amarillo         |
| `--color-white`    | `#F5F5F5` | Texto principal            |
| `--color-gray-dark`| `#2B2B2B` | Cards y paneles            |
| `--color-carbon`   | `#111111` | Fondo secundario           |

---

## 🚧 Funcionalidades Pendientes / Próximos Pasos

- [ ] Gestión completa de sucursales (formulario crear/editar)
- [ ] Gestión de usuarios admin (crear/editar desde el panel)
- [ ] Carga de imágenes real (actualmente por URL)
- [ ] Exportar inventario a PDF/Excel
- [ ] Filtros avanzados de mantenimiento por fecha
- [ ] Gráficos de ventas (Chart.js)
- [ ] Historial de precios por vehículo
- [ ] Integración con MercadoLibre Autos
- [ ] Notificaciones push para nuevos leads
- [ ] Sistema de contraseñas hasheado (bcrypt en backend)
- [ ] Múltiples sucursales con usuarios por sucursal
- [ ] Modo oscuro/claro toggleable (actualmente siempre oscuro)
- [ ] Página 404 personalizada

---

## 📱 Compatibilidad

- ✅ Chrome / Chromium (Desktop + Mobile)
- ✅ Safari iOS (PWA instalable)
- ✅ Firefox
- ✅ Edge
- ✅ Android Chrome

---

*BBruno Automotores · Tristán Suárez, Ezeiza, Bs.As. · WhatsApp: 11-2315-0051*
