require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
// Priorizamos la clave service_role para operaciones de backend seguras
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('[ERROR] Faltan las credenciales de Supabase en el archivo .env.');
}

// Inicializamos el cliente de Supabase con privilegios de servidor
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
