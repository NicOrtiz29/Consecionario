/**
 * Configuración global de BBruno Automotores
 * ==================================================
 * Centraliza los parámetros del frontend.
 * Supabase como backend de datos.
 */

window.APP_CONFIG = {
  // Supabase
  SUPABASE_URL: 'https://oxgwzytwfcvayozaecyn.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94Z3d6eXR3ZmN2YXlvemFlY3luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNjgxNzgsImV4cCI6MjA5MDY0NDE3OH0.NiQ-0l8-9NM7WvkbhFx3oAHNk0pV6vIiZNOP_FDZVro',

  // Roles definidos en la aplicación
  ROLES: {
    ADMIN: 'administrador',
    EDITOR: 'editor',
    VIEWER: 'visualizador'
  },

  // Versión del frontend
  VERSION: '3.0.0-supabase'
};
