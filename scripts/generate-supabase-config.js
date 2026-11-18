// ==========================================
// ARCHIVO: scripts/generate-supabase-config.js
// Genera docs/supabase-config.js a partir de SUPABASE_URL y SUPABASE_KEY
// para despliegues estáticos en GitHub Pages sin exponer claves service_role.
// ==========================================

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { getPublicSupabaseBrowserConfig, isSecretServiceKey } = require('../db');

const rawKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLIC_KEY || process.env.SUPABASE_KEY || '').trim();
if (rawKey && isSecretServiceKey(rawKey) && !process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_PUBLIC_KEY) {
    console.warn('[WEB-CONFIG] Advertencia: SUPABASE_KEY detectada como clave secreta (service_role). Para el cliente web en GitHub Pages utilizá la clave pública (anon / publishable) en SUPABASE_KEY.');
}

const publicConfig = getPublicSupabaseBrowserConfig(process.env);
const outPath = path.resolve(__dirname, '..', 'docs', 'supabase-config.js');

const content = `// Archivo autogenerado desde variables de entorno (SUPABASE_URL y SUPABASE_KEY)
window.__KORTEX_SUPABASE_CONFIG__ = ${JSON.stringify(publicConfig, null, 2)};
`;

fs.writeFileSync(outPath, content, 'utf8');
console.log(
    publicConfig.realtimeEnabled
        ? `[WEB-CONFIG] docs/supabase-config.js generado con SUPABASE_URL (${publicConfig.supabaseUrl}) y Realtime activo.`
        : '[WEB-CONFIG] docs/supabase-config.js generado en modo local (definí SUPABASE_URL y SUPABASE_KEY para habilitar Supabase Realtime).'
);
