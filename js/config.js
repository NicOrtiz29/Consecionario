/**
 * Configuración global de BBruno Automotores
 * Este archivo centraliza los parámetros del frontend para facilitar
 * el cambio entre entornos (Desarrollo local / Producción Netlify)
 */

window.APP_CONFIG = {
  // En producción, si la base cambia a Supabase u otro, solo actualizamos aquí
  API_BASE_URL: window.location.hostname === 'localhost' ? '' : '/.netlify/functions/api',
  
  // Roles definidos en la aplicación
  ROLES: {
    ADMIN: 'administrador', // Acceso total
    EDITOR: 'editor',       // Puede editar inventario, pero no configuraciones críticas
    VIEWER: 'visualizador'  // Solo lectura (ver stock, dashboard)
  },
  
  // Versión del frontend
  VERSION: '2.0.0-pwa'
};
