// ==========================================
// ARCHIVO: src/utils/fastLink.js
// Sistema Transversal de Cuentas, Sesiones Persistentes e Historial de Actividad
// Persistencia Cuádruple: Supabase + Disco Local + Snapshot DB + Respaldo Automático del Navegador
// ==========================================

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const supabase = require('../../db');
const { fetchWithRetry } = require('../../utils/http');
const PriceItem = require('../../models/PriceItem');

const MAX_WISHLIST_ITEMS = 5;
const MAX_HISTORY_EVENTS = 25;
const DEFAULT_APP_URL = 'https://ais-pre-jzxizk67bjjflsgv3wdz4b-494677195769.us-west1.run.app';
let detectedPublicAppUrl = '';

function normalizarUrlPublica(rawUrl) {
    if (!rawUrl) return '';
    let s = String(rawUrl).trim().replace(/^["']+|["']+$/g, '').trim();
    if (!s || /^(undefined|null|none|tu_url_aqui)$/i.test(s)) return '';
    if (!/^https?:\/\//i.test(s)) {
        const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(s);
        s = `${isLocal ? 'http' : 'https'}://${s}`;
    }
    try {
        const parsed = new URL(s);
        if (!/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(parsed.hostname) && parsed.protocol === 'http:') {
            parsed.protocol = 'https:';
        }
        return `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`.replace(/\/+$/, '');
    } catch {
        return '';
    }
}

function setDetectedPublicAppUrl(urlCandidate) {
    const clean = normalizarUrlPublica(urlCandidate);
    if (!clean) return;
    if (/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(clean) && detectedPublicAppUrl) return;
    detectedPublicAppUrl = clean;
}

function obtenerUrlBasePublica(overrideUrl = '') {
    const candidates = [
        overrideUrl,
        process.env.PUBLIC_URL,
        process.env.PUBLIC_GUIDE_URL,
        process.env.DOCS_URL,
        process.env.RAILWAY_PUBLIC_DOMAIN,
        process.env.RAILWAY_STATIC_URL,
        process.env.RENDER_EXTERNAL_URL,
        detectedPublicAppUrl,
        process.env.APP_URL,
        DEFAULT_APP_URL
    ];
    for (const cand of candidates) {
        const clean = normalizarUrlPublica(cand);
        if (clean && !/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(clean)) {
            return clean;
        }
    }
    for (const cand of candidates) {
        const clean = normalizarUrlPublica(cand);
        if (clean) return clean;
    }
    return DEFAULT_APP_URL;
}

const LOCAL_STORE_DIR = path.join(__dirname, '../../data');
const DOT_DATA_STORE_DIR = path.join(process.cwd(), '.data');
const LOCAL_LINKS_FILE = path.join(LOCAL_STORE_DIR, 'user_links.json');
const LOCAL_LINKS_BACKUP_FILE = path.join(DOT_DATA_STORE_DIR, 'user_links_backup.json');
const DISCORD_CONFIG_FILE = path.join(LOCAL_STORE_DIR, 'discord_configs.json');
const DISCORD_CONFIG_BACKUP_FILE = path.join(DOT_DATA_STORE_DIR, 'discord_configs_backup.json');
const ACCOUNT_HISTORY_FILE = path.join(LOCAL_STORE_DIR, 'account_history.json');
const ROBLOX_BOT_ACCOUNT_FILE = path.join(LOCAL_STORE_DIR, 'roblox_bot_account.json');

let lastDiscordConfigMtime = 0;

// Caché rápida en RAM sincronizada con disco y base de datos
const fastLinkCache = new Map();
const discordConfigCache = new Map();
const accountHistoryCache = new Map();
const accountChangeListeners = [];

// Estado de la Cuenta Oficial de Roblox perteneciente al Bot (para enviar verificaciones dentro de Roblox)
let robloxBotAccountState = {
    connected: false,
    roblox_user_id: null,
    roblox_username: null,
    display_name: null,
    avatar_url: null,
    cookie: null,
    updated_at: null
};

function ensureStoreDir() {
    try {
        if (!fs.existsSync(LOCAL_STORE_DIR)) {
            fs.mkdirSync(LOCAL_STORE_DIR, { recursive: true });
        }
        if (!fs.existsSync(DOT_DATA_STORE_DIR)) {
            fs.mkdirSync(DOT_DATA_STORE_DIR, { recursive: true });
        }
    } catch {
        // Silencioso
    }
}

function esRegistroMasReciente(nuevo, actual) {
    if (!actual) return true;
    const tNuevo = nuevo?.updated_at ? Date.parse(nuevo.updated_at) : 0;
    const tActual = actual?.updated_at ? Date.parse(actual.updated_at) : 0;
    return tNuevo >= tActual;
}

/**
 * Persistencia en Supabase para asegurar que sesiones, cuentas vinculadas e historiales
 * se conserven 100% intactos cuando el bot se actualiza o Railway reinicia el contenedor.
 */
async function persistirConfigDiscordEnSupabase(discordId, cfg) {
    const key = String(discordId || '').trim();
    if (!key || key === 'default_session' || key.startsWith('guest_')) return;
    try {
        const payload = {
            discord_id: key,
            discord_username: cfg.discord_username || null,
            discord_tag: cfg.discord_tag || null,
            discord_avatar: cfg.discord_avatar || null,
            access_token: cfg.access_token || null,
            refresh_token: cfg.refresh_token || null,
            oauth_verified: Boolean(cfg.oauth_verified),
            verified_at: cfg.verified_at ? new Date(cfg.verified_at).toISOString() : null,
            lang: cfg.lang || 'es',
            language_selected: Boolean(cfg.language_selected),
            default_tier: cfg.default_tier || 'Classic',
            default_category: cfg.default_category || 'All',
            default_chart_range: cfg.default_chart_range || '7d',
            default_camera_mode: cfg.default_camera_mode || 'front',
            auto_cashback_40: Boolean(cfg.auto_cashback_40),
            ephemeral_config: Boolean(cfg.ephemeral_config),
            dm_alerts_enabled: cfg.dm_alerts_enabled !== false,
            pending_web_code: cfg.pending_web_code || null,
            pending_web_digits: cfg.pending_web_digits || null,
            pending_web_expires_at: cfg.pending_web_expires_at ? Number(cfg.pending_web_expires_at) : null,
            web_approved_in_discord: Boolean(cfg.web_approved_in_discord),
            web_approved_until: cfg.web_approved_until ? Number(cfg.web_approved_until) : null,
            updated_at: new Date().toISOString()
        };
        await supabase.from('discord_configs').upsert(payload, { onConflict: 'discord_id' });
    } catch (err) {
        console.warn(`[PERSIST-CONFIG] Advertencia al persistir discord_configs en Supabase (${key}):`, err.message);
    }
}

async function persistirCuentaVinculadaEnSupabase(discordId, rec) {
    const key = String(discordId || '').trim();
    if (!key || key === 'default_session') return;
    try {
        const payload = {
            discord_id: key,
            roblox_user_id: rec.roblox_user_id ? Number(rec.roblox_user_id) : null,
            roblox_username: rec.roblox_username ? String(rec.roblox_username) : null,
            display_name: String(rec.display_name || rec.roblox_username || ''),
            avatar_url: rec.avatar_url || rec.avatar_full_url || null,
            auth_method: rec.auth_method || 'code_verified',
            updated_at: new Date().toISOString()
        };
        await supabase.from('user_links').upsert(payload, { onConflict: 'discord_id' });
    } catch (err) {
        console.warn(`[PERSIST-LINK] Advertencia al persistir user_links en Supabase (${key}):`, err.message);
    }
}

async function persistirHistorialEnSupabase(discordId, events) {
    const key = String(discordId || '').trim();
    if (!key || key === 'default_session' || key.startsWith('guest_')) return;
    try {
        const payload = {
            discord_id: key,
            events: Array.isArray(events) ? events : [],
            updated_at: new Date().toISOString()
        };
        await supabase.from('account_history').upsert(payload, { onConflict: 'discord_id' });
    } catch (err) {
        console.warn(`[PERSIST-HIST] Advertencia al persistir account_history en Supabase (${key}):`, err.message);
    }
}

/**
 * Hidrata todas las cuentas, sesiones e historiales desde Supabase para que ninguna cuenta
 * se pierda al reiniciar o actualizar el bot en Railway.
 */
let supabaseSyncPromise = null;
async function sincronizarPersistenciaDesdeSupabase() {
    if (supabaseSyncPromise) return supabaseSyncPromise;
    supabaseSyncPromise = (async () => {
        try {
            // 1. Cuentas de Roblox vinculadas
            const { data: remoteLinks, error: errLinks } = await supabase.from('user_links').select('*');
            if (!errLinks && Array.isArray(remoteLinks)) {
                let loadedLinks = 0;
                for (const row of remoteLinks) {
                    if (row && row.discord_id && row.roblox_user_id) {
                        const key = String(row.discord_id);
                        const existing = fastLinkCache.get(key);
                        if (esRegistroMasReciente(row, existing)) {
                            fastLinkCache.set(key, { ...existing, ...row });
                            loadedLinks++;
                        }
                    }
                }
                guardarLinksEnDisco();
                if (loadedLinks > 0) {
                    console.log(`[FAST-LINK] ✅ ${loadedLinks} cuenta(s) de Roblox hidratada(s) desde Supabase.`);
                }
            }

            // 2. Sesiones y configuraciones de Discord
            const { data: remoteConfigs, error: errConfigs } = await supabase.from('discord_configs').select('*');
            if (!errConfigs && Array.isArray(remoteConfigs)) {
                let loadedConfigs = 0;
                for (const row of remoteConfigs) {
                    if (row && row.discord_id) {
                        const key = String(row.discord_id);
                        const existing = discordConfigCache.get(key);
                        if (esRegistroMasReciente(row, existing)) {
                            const merged = { ...existing, ...row, discord_id: key };
                            discordConfigCache.set(key, merged);
                            loadedConfigs++;
                            for (const fn of accountChangeListeners) {
                                try { fn(key, merged); } catch {}
                            }
                        }
                    }
                }
                guardarConfigsDiscordEnDisco();
                if (loadedConfigs > 0) {
                    console.log(`[FAST-LINK] ✅ ${loadedConfigs} sesión(es) de Discord hidratada(s) desde Supabase.`);
                }
            }

            // 3. Historial de actividad de usuarios
            const { data: remoteHist, error: errHist } = await supabase.from('account_history').select('*');
            if (!errHist && Array.isArray(remoteHist)) {
                let loadedHist = 0;
                for (const row of remoteHist) {
                    if (row && row.discord_id && Array.isArray(row.events)) {
                        const key = String(row.discord_id);
                        if (!accountHistoryCache.has(key) || accountHistoryCache.get(key).length === 0) {
                            accountHistoryCache.set(key, row.events);
                            loadedHist++;
                        }
                    }
                }
                guardarHistorialEnDisco();
                if (loadedHist > 0) {
                    console.log(`[FAST-LINK] ✅ ${loadedHist} historial(es) de cuentas hidratado(s) desde Supabase.`);
                }
            }
        } catch (err) {
            console.warn('[FAST-LINK] Error durante la sincronización inicial con Supabase:', err.message);
        }
    })();
    return supabaseSyncPromise;
}

/**
 * 1. Carga y guardado de Cuentas de Roblox en disco + snapshot DB
 */
function cargarLinksDesdeDisco() {
    try {
        ensureStoreDir();
        for (const candidateFile of [LOCAL_LINKS_FILE, LOCAL_LINKS_BACKUP_FILE]) {
            if (!fs.existsSync(candidateFile)) continue;
            try {
                const raw = fs.readFileSync(candidateFile, 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    for (const [discordId, data] of Object.entries(parsed)) {
                        if (data && data.roblox_user_id) {
                            const key = String(discordId);
                            const existing = fastLinkCache.get(key);
                            if (esRegistroMasReciente(data, existing)) {
                                fastLinkCache.set(key, data);
                            }
                        }
                    }
                }
            } catch {
                // Ignorar archivo corrupto individual
            }
        }
        // Hidratar también desde memoryTables.user_links de db.js si había registros
        const dbLinks = supabase.memoryTables?.user_links || [];
        for (const row of dbLinks) {
            if (row && row.discord_id && row.roblox_user_id) {
                const key = String(row.discord_id);
                const existing = fastLinkCache.get(key);
                if (esRegistroMasReciente(row, existing)) {
                    fastLinkCache.set(key, row);
                }
            }
        }
    } catch (err) {
        console.warn('[FAST-LINK] No se pudo leer data/user_links.json:', err.message);
    }
}

function guardarLinksEnDisco() {
    try {
        ensureStoreDir();
        const obj = {};
        for (const [k, v] of fastLinkCache.entries()) {
            obj[k] = v;
        }
        const serialized = JSON.stringify(obj, null, 2);
        fs.writeFileSync(LOCAL_LINKS_FILE, serialized, 'utf8');
        fs.writeFileSync(LOCAL_LINKS_BACKUP_FILE, serialized, 'utf8');
    } catch (err) {
        console.warn('[FAST-LINK] No se pudo escribir data/user_links.json:', err.message);
    }
}

/**
 * 2. Carga y guardado de Sesiones y Preferencias de Discord en disco + respaldo .data + snapshot DB
 */
function cargarConfigsDiscordDesdeDisco() {
    try {
        ensureStoreDir();
        for (const candidateFile of [DISCORD_CONFIG_FILE, DISCORD_CONFIG_BACKUP_FILE]) {
            if (!fs.existsSync(candidateFile)) continue;
            try {
                const stat = fs.statSync(candidateFile);
                if (stat.mtimeMs > lastDiscordConfigMtime) {
                    lastDiscordConfigMtime = stat.mtimeMs;
                }
                const raw = fs.readFileSync(candidateFile, 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    for (const [discordId, cfg] of Object.entries(parsed)) {
                        if (cfg && typeof cfg === 'object') {
                            const key = String(discordId);
                            const existing = discordConfigCache.get(key);
                            if (esRegistroMasReciente(cfg, existing)) {
                                discordConfigCache.set(key, { ...existing, ...cfg, discord_id: key });
                            }
                        }
                    }
                }
            } catch {
                // Ignorar archivo corrupto individual
            }
        }
        const dbConfigs = supabase.memoryTables?.discord_configs || [];
        for (const row of dbConfigs) {
            if (row && row.discord_id) {
                const key = String(row.discord_id);
                const existing = discordConfigCache.get(key);
                if (esRegistroMasReciente(row, existing)) {
                    discordConfigCache.set(key, { ...existing, ...row, discord_id: key });
                }
            }
        }
    } catch {
        // Silencioso
    }
}

function guardarConfigsDiscordEnDisco() {
    try {
        ensureStoreDir();
        const obj = {};
        for (const [k, v] of discordConfigCache.entries()) {
            obj[k] = v;
        }
        const serialized = JSON.stringify(obj, null, 2);
        fs.writeFileSync(DISCORD_CONFIG_FILE, serialized, 'utf8');
        fs.writeFileSync(DISCORD_CONFIG_BACKUP_FILE, serialized, 'utf8');
        try {
            lastDiscordConfigMtime = fs.statSync(DISCORD_CONFIG_FILE).mtimeMs;
        } catch {
            // Silencioso
        }
        if (Array.isArray(supabase.memoryTables?.discord_configs)) {
            supabase.memoryTables.discord_configs = Array.from(discordConfigCache.values());
            if (typeof supabase.guardarSnapshotEnDisco === 'function') {
                supabase.guardarSnapshotEnDisco();
            }
        }
    } catch {
        // Silencioso
    }
}

/**
 * 3. Carga y guardado del Historial de Actividad de Cuentas en disco + snapshot DB
 */
function cargarHistorialDesdeDisco() {
    try {
        ensureStoreDir();
        if (fs.existsSync(ACCOUNT_HISTORY_FILE)) {
            const raw = fs.readFileSync(ACCOUNT_HISTORY_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                for (const [discordId, events] of Object.entries(parsed)) {
                    if (Array.isArray(events)) {
                        accountHistoryCache.set(String(discordId), events);
                    }
                }
            }
        }
        const dbHist = supabase.memoryTables?.account_history || [];
        for (const row of dbHist) {
            if (row && row.discord_id && Array.isArray(row.events) && !accountHistoryCache.has(String(row.discord_id))) {
                accountHistoryCache.set(String(row.discord_id), row.events);
            }
        }
    } catch {
        // Silencioso
    }
}

function guardarHistorialEnDisco() {
    try {
        ensureStoreDir();
        const obj = {};
        const arr = [];
        for (const [k, v] of accountHistoryCache.entries()) {
            obj[k] = v;
            arr.push({ discord_id: k, events: v, updated_at: new Date().toISOString() });
        }
        fs.writeFileSync(ACCOUNT_HISTORY_FILE, JSON.stringify(obj, null, 2), 'utf8');
        if (Array.isArray(supabase.memoryTables?.account_history)) {
            supabase.memoryTables.account_history = arr;
            if (typeof supabase.guardarSnapshotEnDisco === 'function') {
                supabase.guardarSnapshotEnDisco();
            }
        }
    } catch {
        // Silencioso
    }
}

// Inicializar las cachés desde disco y sincronizar con Supabase en background
cargarLinksDesdeDisco();
cargarConfigsDiscordDesdeDisco();
cargarHistorialDesdeDisco();
sincronizarPersistenciaDesdeSupabase().catch(() => {});

// Almacén en memoria de códigos de seguridad pendientes para vincular Roblox por Nombre/ID
// key (discordId) -> { code, profile, createdAt, expiresAt, dmDelivered, botInboxMessage }
const pendingRobloxVerifications = new Map();

/**
 * Comprueba si el usuario tiene actualmente una cuenta activa registrada (Discord o Roblox).
 */
function estadoCuentasActivasSync(discordId) {
    const key = String(discordId || 'default_session').trim();
    const disc = discordConfigCache.get(key);
    const rblx = fastLinkCache.get(key);
    const tieneDiscord = Boolean(disc && disc.oauth_verified);
    const tieneRoblox = Boolean(rblx && rblx.roblox_user_id);
    return {
        key,
        disc,
        rblx,
        tieneDiscord,
        tieneRoblox,
        tieneAlgunaActiva: tieneDiscord || tieneRoblox
    };
}

/**
 * Filtra y limpia el historial para que SOLO conserve eventos de cuentas que están activas actualmente
 * y nunca guarde eventos de desconexión ni datos huérfanos cuando el usuario ya sacó la cuenta.
 */
function depurarHistorialSegunCuentasActivas(discordId) {
    const { key, tieneDiscord, tieneRoblox, tieneAlgunaActiva } = estadoCuentasActivasSync(discordId);

    if (!tieneAlgunaActiva) {
        if (accountHistoryCache.has(key)) {
            accountHistoryCache.delete(key);
            guardarHistorialEnDisco();
        }
        return [];
    }

    const rawList = accountHistoryCache.get(key) || [];
    const filtered = rawList.filter(ev => {
        if (!ev || !ev.title) return false;
        const lowerTitle = String(ev.title).toLowerCase();
        // Nunca conservar registros de cuentas sacadas o sesiones cerradas
        if (lowerTitle.includes('desvinculad') || lowerTitle.includes('sesión de discord cerrada')) {
            return false;
        }
        if (ev.category === 'discord' && !tieneDiscord) return false;
        if (ev.category === 'roblox' && !tieneRoblox) return false;
        return true;
    });

    if (filtered.length !== rawList.length) {
        if (filtered.length > 0) {
            accountHistoryCache.set(key, filtered);
        } else {
            accountHistoryCache.delete(key);
        }
        guardarHistorialEnDisco();
    }

    return filtered;
}

/**
 * Registra un evento en el historial SOLO cuando el usuario tiene la cuenta activa/registrada.
 * Si el usuario no tiene cuenta activa, no guarda ningún dato.
 */
function registrarEventoHistorialCuenta(discordId, { category = 'account', title, detail = '' }) {
    const { key, tieneDiscord, tieneRoblox, tieneAlgunaActiva } = estadoCuentasActivasSync(discordId);
    if (!key || !title || !tieneAlgunaActiva) return [];

    if (category === 'discord' && !tieneDiscord) return depurarHistorialSegunCuentasActivas(key);
    if (category === 'roblox' && !tieneRoblox) return depurarHistorialSegunCuentasActivas(key);

    const existing = depurarHistorialSegunCuentasActivas(key);
    const nowIso = new Date().toISOString();

    // Evitar duplicados consecutivos exactos
    if (existing.length > 0 && existing[0].title === title && existing[0].detail === detail) {
        existing[0].timestamp = nowIso;
        accountHistoryCache.set(key, existing);
        guardarHistorialEnDisco();
        return existing;
    }

    const entry = {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: nowIso,
        category,
        title: String(title),
        detail: String(detail || '')
    };

    const updated = [entry, ...existing].slice(0, MAX_HISTORY_EVENTS);
    accountHistoryCache.set(key, updated);
    guardarHistorialEnDisco();
    persistirHistorialEnSupabase(key, updated).catch(() => {});
    return updated;
}

function obtenerHistorialCuenta(discordId) {
    const { key, disc, rblx, tieneDiscord, tieneRoblox, tieneAlgunaActiva } = estadoCuentasActivasSync(discordId);

    // Si no hay ninguna cuenta registrada/activa, no devolver ni guardar historial
    if (!tieneAlgunaActiva) {
        if (accountHistoryCache.has(key)) {
            accountHistoryCache.delete(key);
            guardarHistorialEnDisco();
        }
        return [];
    }

    const list = depurarHistorialSegunCuentasActivas(key);
    if (list.length > 0) return list;

    // Si tiene cuentas activas pero aún no tenía eventos grabados, generar el registro de su cuenta activa
    const seeded = [];
    if (tieneRoblox) {
        const metodoTexto = rblx.auth_method === 'oauth' || rblx.roblox_oauth_verified
            ? `ID ${rblx.roblox_user_id} • OAuth 2.0 Oficial`
            : `ID ${rblx.roblox_user_id} • Verificada con código de seguridad`;
        seeded.push({
            id: `seed_rblx_${rblx.roblox_user_id}`,
            timestamp: rblx.updated_at || new Date().toISOString(),
            category: 'roblox',
            title: `Cuenta de Roblox activa: @${rblx.roblox_username}`,
            detail: metodoTexto
        });
    }
    if (tieneDiscord) {
        seeded.push({
            id: `seed_disc_${key}`,
            timestamp: disc.verified_at || disc.updated_at || new Date().toISOString(),
            category: 'discord',
            title: `Sesión de Discord activa: @${disc.discord_username || 'Usuario'}`,
            detail: 'Autorización OAuth 2.0 activa'
        });
    }
    if (seeded.length > 0) {
        accountHistoryCache.set(key, seeded);
        guardarHistorialEnDisco();
    }
    return seeded;
}

/**
 * Unifica los datos de una sesión previa o temporal ('default_session' o ID temporal)
 * hacia el ID real de Discord cuando el usuario inicia sesión en ambos servicios.
 */
async function migrarDatosDeSesion(fromDiscordId, toDiscordId) {
    const fromKey = String(fromDiscordId || '').trim();
    const toKey = String(toDiscordId || '').trim();
    if (!fromKey || !toKey || fromKey === toKey) return;

    // 1. Migrar cuenta de Roblox si toKey aún no tiene una
    const fromRoblox = fastLinkCache.get(fromKey);
    const toRoblox = fastLinkCache.get(toKey);
    if (fromRoblox && fromRoblox.roblox_user_id && (!toRoblox || !toRoblox.roblox_user_id)) {
        await guardarCuentaVinculada(toKey, fromRoblox);
    }

    // 2. Migrar historial de actividad combinándolo cronológicamente (solo eventos de cuentas activas)
    const fromHist = depurarHistorialSegunCuentasActivas(fromKey);
    const toHist = depurarHistorialSegunCuentasActivas(toKey);
    if (fromHist.length > 0) {
        const seen = new Set(toHist.map(e => `${e.title}|${e.detail}`));
        const merged = [...toHist];
        for (const ev of fromHist) {
            const sig = `${ev.title}|${ev.detail}`;
            if (!seen.has(sig)) {
                seen.add(sig);
                merged.push(ev);
            }
        }
        merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        accountHistoryCache.set(toKey, merged.slice(0, MAX_HISTORY_EVENTS));
        guardarHistorialEnDisco();
    }

    // 3. Migrar registros guardados en tablas de usuario (Mi Lista, Robux Pendientes, Códigos, Juegos)
    try {
        const tablesWithUserId = [
            { table: 'roblox_wishlist', col: 'user_id' },
            { table: 'pending_robux', col: 'discord_id' },
            { table: 'user_redeemed_codes', col: 'discord_id' },
            { table: 'game_update_subscriptions', col: 'discord_id' }
        ];
        for (const { table, col } of tablesWithUserId) {
            const rows = supabase.memoryTables?.[table] || [];
            let changed = false;
            for (const r of rows) {
                if (String(r[col]) === fromKey) {
                    r[col] = toKey;
                    changed = true;
                }
            }
            if (changed && typeof supabase.guardarSnapshotEnDisco === 'function') {
                supabase.guardarSnapshotEnDisco();
            }
        }
    } catch {
        // Silencioso
    }
}

/**
 * Permite que el navegador del usuario restaure automáticamente su sesión y cuentas activas
 * si el contenedor del bot fue actualizado o reiniciado desde cero.
 * Solo restaura el historial si hay una cuenta activa registrada.
 */
async function restaurarRespaldoCliente(discordId, clientBackup = {}) {
    const key = String(discordId || clientBackup.discordId || 'default_session').trim();
    if (!key) return null;

    let restoredSomething = false;

    // 1. Restaurar sesión de Discord si estaba activa en el respaldo
    const existingDiscord = discordConfigCache.get(key);
    const backupDiscord = clientBackup.discordConfig;
    if (backupDiscord && backupDiscord.oauth_verified && (!existingDiscord || !existingDiscord.oauth_verified)) {
        guardarConfigDiscord(key, {
            ...backupDiscord,
            oauth_verified: true
        });
        restoredSomething = true;
    }

    // 2. Restaurar cuenta vinculada de Roblox si estaba activa en el respaldo
    const existingRoblox = fastLinkCache.get(key);
    const backupRoblox = clientBackup.linkedAccount;
    if (backupRoblox && backupRoblox.roblox_user_id && (!existingRoblox || !existingRoblox.roblox_user_id)) {
        await guardarCuentaVinculada(key, backupRoblox, { recordHistory: false });
        restoredSomething = true;
    }

    // 3. Restaurar historial de actividad ÚNICAMENTE si el usuario tiene al menos una cuenta activa
    const { tieneAlgunaActiva } = estadoCuentasActivasSync(key);
    if (tieneAlgunaActiva) {
        const existingHistory = accountHistoryCache.get(key) || [];
        const backupHistory = Array.isArray(clientBackup.history) ? clientBackup.history : [];
        if (backupHistory.length > 0 && existingHistory.length === 0) {
            accountHistoryCache.set(key, backupHistory.slice(0, MAX_HISTORY_EVENTS));
            depurarHistorialSegunCuentasActivas(key);
            restoredSomething = true;
        }
        if (restoredSomething) {
            registrarEventoHistorialCuenta(key, {
                category: 'sync',
                title: 'Sesión activa sincronizada',
                detail: 'Tus cuentas activas se mantuvieron tras actualizar el bot'
            });
        }
    } else {
        depurarHistorialSegunCuentasActivas(key);
    }

    return obtenerHistorialYEstadoCuenta(key);
}

/**
 * Devuelve el estado completo de la cuenta del usuario + su historial (solo mientras tenga cuenta activa).
 */
async function obtenerHistorialYEstadoCuenta(discordId) {
    const key = String(discordId || 'default_session').trim();
    const linkedAccount = await obtenerCuentaVinculada(key).catch(() => null);
    const discordConfig = obtenerConfigDiscord(key);
    const tieneCuentaActiva = Boolean((discordConfig && discordConfig.oauth_verified) || (linkedAccount && linkedAccount.roblox_user_id));

    if (!tieneCuentaActiva) {
        depurarHistorialSegunCuentasActivas(key);
        return {
            discordId: key,
            discordConfig,
            linkedAccount: null,
            hasActiveAccount: false,
            history: [],
            stats: {
                wishlistCount: 0,
                pendingRobuxCount: 0,
                redeemedCodesCount: 0,
                gameSubsCount: 0
            },
            savedItems: {
                wishlist: [],
                pendingRobux: [],
                gameSubs: []
            }
        };
    }

    const history = obtenerHistorialCuenta(key);

    let wishlistItems = [];
    let pendingRobuxItems = [];
    let redeemedCodesCount = 0;
    let gameSubsItems = [];

    try {
        const { data: wl } = await supabase.from('roblox_wishlist').select('*').eq('user_id', key);
        if (Array.isArray(wl)) wishlistItems = wl;
    } catch {
        // Silencioso
    }

    try {
        const { data: pr } = await supabase.from('pending_robux').select('*').eq('discord_id', key);
        if (Array.isArray(pr)) pendingRobuxItems = pr;
    } catch {
        // Silencioso
    }

    try {
        const { data: rc } = await supabase.from('user_redeemed_codes').select('*').eq('discord_id', key);
        if (Array.isArray(rc)) redeemedCodesCount = rc.length;
    } catch {
        // Silencioso
    }

    try {
        const { data: gs } = await supabase.from('game_update_subscriptions').select('*').eq('discord_id', key);
        if (Array.isArray(gs)) gameSubsItems = gs;
    } catch {
        // Silencioso
    }

    return {
        discordId: key,
        discordConfig,
        linkedAccount,
        hasActiveAccount: true,
        history,
        stats: {
            wishlistCount: wishlistItems.length,
            pendingRobuxCount: pendingRobuxItems.length,
            redeemedCodesCount,
            gameSubsCount: gameSubsItems.length
        },
        savedItems: {
            wishlist: wishlistItems.slice(0, 5).map(i => ({
                id: i.id_objet,
                name: i.item_name,
                price: i.last_price,
                targetPrice: i.target_price
            })),
            pendingRobux: pendingRobuxItems.slice(0, 5).map(p => ({
                amount: p.amount,
                source: p.source_label || p.source_type || 'Venta',
                releaseAt: p.release_timestamp
            })),
            gameSubs: gameSubsItems.slice(0, 5).map(g => ({
                universeId: g.universe_id,
                name: g.game_name
            }))
        }
    };
}

function onAccountLinked(listenerFn) {
    if (typeof listenerFn === 'function') {
        accountChangeListeners.push(listenerFn);
    }
}

/**
 * Resuelve un usuario de Roblox por su nombre de usuario, ID numérico o URL de perfil.
 * Usa directamente *.roblox.com con failover automático a *.roproxy.com.
 */
async function resolverUsuarioRoblox(input) {
    if (!input) return null;
    const raw = String(input).trim();

    const urlMatch = raw.match(/\/users\/(\d+)/i);
    const numericCandidate = urlMatch ? urlMatch[1] : (/^\d+$/.test(raw) ? raw : null);

    let userId = null;
    let username = null;
    let displayName = null;

    try {
        if (numericCandidate) {
            const res = await fetchWithRetry(`https://users.roblox.com/v1/users/${numericCandidate}`);
            if (res.data && res.data.id) {
                userId = res.data.id;
                username = res.data.name;
                displayName = res.data.displayName || res.data.name;
            }
        }

        if (!userId) {
            const cleanUsername = raw.replace(/^@/, '').trim();
            const postRes = await fetchWithRetry('https://users.roblox.com/v1/usernames/users', {
                method: 'post',
                data: {
                    usernames: [cleanUsername],
                    excludeBannedUsers: false
                }
            });
            const found = postRes.data?.data?.[0];
            if (found && found.id) {
                userId = found.id;
                username = found.name;
                displayName = found.displayName || found.name;
            }
        }

        if (!userId) {
            const cleanQuery = raw.replace(/^@/, '').trim();
            if (cleanQuery.length >= 3) {
                const searchRes = await fetchWithRetry(
                    `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(cleanQuery)}&limit=10`
                ).catch(() => null);
                const firstUser = searchRes?.data?.data?.[0];
                if (firstUser && firstUser.id) {
                    userId = firstUser.id;
                    username = firstUser.name;
                    displayName = firstUser.displayName || firstUser.name;
                }
            }
        }
    } catch (err) {
        console.error('[FAST-LINK RESOLVE ERROR]:', err.message);
    }

    if (!userId) return null;

    let avatarUrl = null;
    let avatarFullUrl = null;
    try {
        const [headRes, fullRes] = await Promise.all([
            fetchWithRetry(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`).catch(() => null),
            fetchWithRetry(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`).catch(() => null)
        ]);
        avatarUrl = headRes?.data?.data?.[0]?.imageUrl || null;
        avatarFullUrl = fullRes?.data?.data?.[0]?.imageUrl || avatarUrl || null;
    } catch {
        // Silencioso
    }

    return {
        roblox_user_id: Number(userId),
        roblox_username: username,
        display_name: displayName || username,
        avatar_url: avatarUrl,
        avatar_full_url: avatarFullUrl
    };
}

/**
 * Obtiene la cuenta vinculada de un usuario de Discord desde RAM, Disco o Supabase.
 */
async function obtenerCuentaVinculada(discordId) {
    if (!discordId) return null;
    const key = String(discordId);

    const cached = fastLinkCache.get(key);

    try {
        const { data, error } = await supabase
            .from('user_links')
            .select('*')
            .eq('discord_id', key)
            .maybeSingle();

        if (!error && data && data.roblox_user_id) {
            const merged = { ...cached, ...data };
            fastLinkCache.set(key, merged);
            guardarLinksEnDisco();
            return merged;
        }
    } catch {
        // Fallback a memoria/disco
    }

    try {
        const { data: memData } = await supabase
            .memoryFrom('user_links')
            .select('*')
            .eq('discord_id', key)
            .maybeSingle();
        if (memData && memData.roblox_user_id) {
            const merged = { ...cached, ...memData };
            fastLinkCache.set(key, merged);
            guardarLinksEnDisco();
            return merged;
        }
    } catch {
        // Silencioso
    }

    if (cached && cached.roblox_user_id) return cached;
    return null;
}

function obtenerCuentaVinculadaSync(discordId) {
    if (!discordId) return null;
    const key = String(discordId);
    return fastLinkCache.get(key) || null;
}

function obtenerConfigDiscord(discordId) {
    const key = String(discordId || '');
    try {
        if (fs.existsSync(DISCORD_CONFIG_FILE)) {
            const mtime = fs.statSync(DISCORD_CONFIG_FILE).mtimeMs;
            if (mtime > lastDiscordConfigMtime) {
                cargarConfigsDiscordDesdeDisco();
            }
        }
    } catch {
        // Silencioso
    }
    const saved = discordConfigCache.get(key) || {};
    return {
        discord_id: key,
        oauth_verified: Boolean(saved.oauth_verified),
        discord_username: saved.discord_username || null,
        discord_tag: saved.discord_tag || null,
        discord_avatar: saved.discord_avatar || null,
        access_token: saved.access_token || null,
        refresh_token: saved.refresh_token || null,
        verified_at: saved.verified_at || null,
        lang: saved.lang === 'en' ? 'en' : 'es',
        language_selected: Boolean(saved.language_selected),
        default_tier: saved.default_tier || 'TIER_100',
        default_category: saved.default_category || 'cat_economy',
        default_chart_range: saved.default_chart_range || '7d',
        default_camera_mode: saved.default_camera_mode || 'full',
        auto_cashback_40: saved.auto_cashback_40 !== false,
        ephemeral_config: Boolean(saved.ephemeral_config),
        dm_alerts_enabled: saved.dm_alerts_enabled !== false,
        pending_web_code: saved.pending_web_code || null,
        pending_web_digits: saved.pending_web_digits || null,
        pending_web_expires_at: Number(saved.pending_web_expires_at || 0) || null,
        web_approved_in_discord: Boolean(saved.web_approved_in_discord),
        web_approved_until: Number(saved.web_approved_until || 0) || null,
        updated_at: saved.updated_at || null
    };
}

function guardarConfigDiscord(discordId, partialConfig) {
    const key = String(discordId || '').trim();
    if (!key || key === 'default_session') return { ...partialConfig, discord_id: '' };
    const current = obtenerConfigDiscord(key);
    const updated = {
        ...current,
        ...partialConfig,
        discord_id: key,
        updated_at: new Date().toISOString()
    };
    discordConfigCache.set(key, updated);
    guardarConfigsDiscordEnDisco();

    // Persistir de forma robusta en Supabase para que sobreviva actualizaciones del bot
    persistirConfigDiscordEnSupabase(key, updated).catch(() => {});

    for (const fn of accountChangeListeners) {
        try { fn(key, updated); } catch {}
    }
    return updated;
}

/**
 * Verifica el estado de la sesión de Discord preservando siempre la sesión guardada
 * cuando el bot se actualiza o cuando el access_token temporal caduca.
 */
async function verificarAutorizacionDiscordOAuth(discordId, { checkRemoteRevocation = false } = {}) {
    const key = String(discordId || '').trim();
    if (!key || key === 'default_session') return obtenerConfigDiscord('');
    let current = discordConfigCache.get(key);

    // Si no está en RAM con sesión verificada, consultar Supabase directamente
    if (!current || !current.oauth_verified) {
        try {
            const { data, error } = await supabase.from('discord_configs').select('*').eq('discord_id', key).maybeSingle();
            if (!error && data && data.discord_id) {
                current = { ...(current || {}), ...data, discord_id: key };
                discordConfigCache.set(key, current);
                guardarConfigsDiscordEnDisco();
            }
        } catch {}
    }
    if (!current) current = obtenerConfigDiscord(key);

    if (!current.oauth_verified) {
        return current;
    }

    if (!current.access_token) {
        return current;
    }

    try {
        const res = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${current.access_token}` },
            timeout: 4500
        });
        if (res.data && res.data.id) {
            const verifiedUsername = res.data.global_name || res.data.username;
            const avatarUrl = res.data.avatar
                ? `https://cdn.discordapp.com/avatars/${res.data.id}/${res.data.avatar}.png?size=256`
                : current.discord_avatar;
            return guardarConfigDiscord(key, {
                oauth_verified: true,
                discord_username: verifiedUsername,
                discord_tag: res.data.username,
                discord_avatar: avatarUrl
            });
        }
    } catch (err) {
        // Solo si el usuario pulsó explícitamente "Comprobar Conexión" en Discord y el token fue revocado (401)
        // sin refresh_token disponible, informamos; de lo contrario conservamos la sesión guardada para que no se pierda al actualizar el bot.
        if (checkRemoteRevocation && err.response && (err.response.status === 401 || err.response.status === 403) && !current.refresh_token) {
            return guardarConfigDiscord(key, {
                oauth_verified: false,
                access_token: null,
                verified_at: null
            });
        }
    }

    return current;
}

/**
 * Guarda o actualiza el vínculo de la cuenta de ROBLOX en RAM, Disco Local, Snapshot DB y Supabase,
 * registrando además el evento en el historial de la cuenta activa.
 */
async function guardarCuentaVinculada(discordId, profileData, { recordHistory = true } = {}) {
    const key = String(discordId || 'default_session').trim();
    const prev = fastLinkCache.get(key) || {};
    const authMethod = profileData.auth_method || prev.auth_method || 'code_verified';

    const dbPayload = {
        discord_id: key,
        roblox_user_id: Number(profileData.roblox_user_id || prev.roblox_user_id || 0),
        roblox_username: String(profileData.roblox_username || prev.roblox_username || ''),
        display_name: String(profileData.display_name || profileData.roblox_username || prev.display_name || ''),
        avatar_url: profileData.avatar_url || prev.avatar_url || null,
        auth_method: authMethod,
        updated_at: new Date().toISOString()
    };

    const fullRecord = {
        ...prev,
        ...dbPayload,
        auth_method: authMethod,
        roblox_oauth_verified: Boolean(profileData.roblox_oauth_verified ?? (authMethod === 'oauth' ? true : prev.roblox_oauth_verified)),
        roblox_access_token: profileData.roblox_access_token !== undefined ? profileData.roblox_access_token : (prev.roblox_access_token || null),
        display_name: profileData.display_name || profileData.roblox_username || prev.display_name,
        avatar_full_url: profileData.avatar_full_url || profileData.avatar_url || prev.avatar_full_url || null
    };

    if (fullRecord.roblox_user_id) {
        fastLinkCache.set(key, fullRecord);
        guardarLinksEnDisco();

        if (recordHistory) {
            registrarEventoHistorialCuenta(key, {
                category: 'roblox',
                title: `Cuenta de Roblox autorizada: @${fullRecord.roblox_username}`,
                detail: `ID ${fullRecord.roblox_user_id} • Autorizada con Roblox OAuth 2.0 Oficial`
            });
        }
    }

    if (dbPayload.roblox_user_id) {
        try {
            await supabase.memoryFrom('user_links').upsert(dbPayload, { onConflict: 'discord_id' });
        } catch {
            // Silencioso
        }

        try {
            await supabase.from('user_links').upsert(dbPayload, { onConflict: 'discord_id' });
        } catch {
            // Silencioso
        }

        for (const fn of accountChangeListeners) {
            try {
                fn(key, fullRecord);
            } catch {
                // Silencioso
            }
        }
    }

    return fullRecord;
}

/**
 * Elimina el registro local de cuenta de Roblox o Discord cuando el usuario decide sacar la cuenta,
 * limpiando automáticamente el historial asociado para NO guardar datos cuando ya sacó la cuenta.
 */
async function eliminarCuentaVinculada(discordId, provider = 'roblox') {
    const key = String(discordId || 'default_session').trim();
    if (provider === 'discord') {
        const current = obtenerConfigDiscord(key);
        const disconnected = {
            ...current,
            oauth_verified: false,
            access_token: null,
            refresh_token: null,
            verified_at: null,
            updated_at: new Date().toISOString()
        };
        discordConfigCache.set(key, disconnected);
        guardarConfigsDiscordEnDisco();
        persistirConfigDiscordEnSupabase(key, disconnected).catch(() => {});
        depurarHistorialSegunCuentasActivas(key);
        return true;
    }

    pendingRobloxVerifications.delete(key);
    fastLinkCache.delete(key);
    guardarLinksEnDisco();
    try {
        await supabase.memoryFrom('user_links').delete().eq('discord_id', key);
    } catch {
        // Silencioso
    }
    try {
        await supabase.from('user_links').delete().eq('discord_id', key);
    } catch {
        // Silencioso
    }
    depurarHistorialSegunCuentasActivas(key);
    return true;
}

/**
 * 4. GESTIÓN DE LA CUENTA OFICIAL DE ROBLOX DEL BOT (Emisor de verificaciones dentro de Roblox)
 * Permite que el bot tenga su propia cuenta de Roblox para enviar mensajes a la Galería de Mensajes
 * (roblox.com/messages) y Chat de Roblox de los usuarios sin exponer claves en Discord.
 */
function limpiarCookieRoblosecurity(rawInput) {
    if (!rawInput) return '';
    let s = String(rawInput).trim();
    s = s.replace(/^["']+|["']+$/g, '').trim();
    s = s.replace(/^\.ROBLOSECURITY\s*=\s*/i, '').trim();
    const match = s.match(/(_\|WARNING:-DO-NOT-SHARE-THIS[^\s;"']*)/i);
    if (match) return match[1].trim();
    return s.split(';')[0].trim();
}

function cargarCuentaBotRobloxDesdeDisco() {
    try {
        ensureStoreDir();
        if (fs.existsSync(ROBLOX_BOT_ACCOUNT_FILE)) {
            const raw = fs.readFileSync(ROBLOX_BOT_ACCOUNT_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && parsed.cookie && parsed.roblox_user_id) {
                robloxBotAccountState = {
                    connected: true,
                    roblox_user_id: Number(parsed.roblox_user_id),
                    roblox_username: String(parsed.roblox_username || ''),
                    display_name: String(parsed.display_name || parsed.roblox_username || ''),
                    avatar_url: parsed.avatar_url || null,
                    cookie: String(parsed.cookie),
                    current_friends_count: Number(parsed.current_friends_count || 0),
                    verified_by_friendship_count: Number(parsed.verified_by_friendship_count || 0),
                    friends_cleaned_count: Number(parsed.friends_cleaned_count || 0),
                    auto_unfriend_enabled: parsed.auto_unfriend_enabled !== false,
                    last_sweep_at: parsed.last_sweep_at || null,
                    updated_at: parsed.updated_at || new Date().toISOString()
                };
            }
        }
    } catch {
        // Silencioso
    }

    // Si se definió ROBLOX_BOT_COOKIE en variables de entorno y aún no está cargada, inicializarla en segundo plano
    const envCookie = limpiarCookieRoblosecurity(process.env.ROBLOX_BOT_COOKIE || '');
    if (envCookie && (!robloxBotAccountState.connected || robloxBotAccountState.cookie !== envCookie)) {
        conectarCuentaBotRoblox(envCookie).catch(() => null);
    }
}

function guardarCuentaBotRobloxEnDisco() {
    try {
        ensureStoreDir();
        if (!robloxBotAccountState.connected || !robloxBotAccountState.cookie) {
            if (fs.existsSync(ROBLOX_BOT_ACCOUNT_FILE)) {
                fs.unlinkSync(ROBLOX_BOT_ACCOUNT_FILE);
            }
            return;
        }
        fs.writeFileSync(ROBLOX_BOT_ACCOUNT_FILE, JSON.stringify(robloxBotAccountState, null, 2), 'utf8');
    } catch {
        // Silencioso
    }
}

function obtenerEstadoCuentaBotRoblox() {
    return {
        connected: Boolean(robloxBotAccountState.connected && robloxBotAccountState.roblox_user_id && robloxBotAccountState.cookie),
        roblox_user_id: robloxBotAccountState.roblox_user_id || null,
        roblox_username: robloxBotAccountState.roblox_username || null,
        display_name: robloxBotAccountState.display_name || null,
        avatar_url: robloxBotAccountState.avatar_url || null,
        current_friends_count: Number(robloxBotAccountState.current_friends_count || 0),
        max_friends_limit: 200,
        verified_by_friendship_count: Number(robloxBotAccountState.verified_by_friendship_count || 0),
        friends_cleaned_count: Number(robloxBotAccountState.friends_cleaned_count || 0),
        auto_unfriend_enabled: robloxBotAccountState.auto_unfriend_enabled !== false,
        last_sweep_at: robloxBotAccountState.last_sweep_at || null,
        profile_url: robloxBotAccountState.roblox_user_id
            ? `https://www.roblox.com/users/${robloxBotAccountState.roblox_user_id}/profile`
            : null,
        updated_at: robloxBotAccountState.updated_at || null
    };
}

async function conectarCuentaBotRoblox(rawCookieInput) {
    const raw = String(rawCookieInput || '').trim();
    if (!raw || /^(quitar|clear|desconectar|reset|none)$/i.test(raw)) {
        robloxBotAccountState = {
            connected: false,
            roblox_user_id: null,
            roblox_username: null,
            display_name: null,
            avatar_url: null,
            cookie: null,
            current_friends_count: 0,
            verified_by_friendship_count: 0,
            friends_cleaned_count: 0,
            auto_unfriend_enabled: true,
            last_sweep_at: null,
            updated_at: null
        };
        guardarCuentaBotRobloxEnDisco();
        return {
            ok: true,
            disconnected: true,
            message: 'Cuenta de Roblox del Bot desvinculada correctamente.'
        };
    }

    const cleanCookie = limpiarCookieRoblosecurity(raw);
    if (!cleanCookie || cleanCookie.length < 30) {
        return {
            ok: false,
            message: 'La cookie .ROBLOSECURITY introducida es demasiado corta. Copiá el valor completo de .ROBLOSECURITY de la cuenta de Roblox del bot.'
        };
    }

    try {
        const authRes = await axios.get('https://users.roblox.com/v1/users/authenticated', {
            headers: {
                Cookie: `.ROBLOSECURITY=${cleanCookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 8000
        });

        const botUser = authRes.data;
        if (!botUser || !botUser.id) {
            return {
                ok: false,
                message: 'Roblox no devolvió un usuario autenticado válido con esa cookie.'
            };
        }

        let avatarUrl = null;
        let currentFriendsCount = 0;
        try {
            const [thumbRes, countRes] = await Promise.all([
                fetchWithRetry(
                    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${botUser.id}&size=150x150&format=Png&isCircular=false`
                ).catch(() => null),
                axios.get(`https://friends.roblox.com/v1/users/${botUser.id}/friends/count`, { timeout: 5500 }).catch(() => null)
            ]);
            avatarUrl = thumbRes?.data?.data?.[0]?.imageUrl || null;
            if (typeof countRes?.data?.count === 'number') {
                currentFriendsCount = countRes.data.count;
            }
        } catch {
            // Silencioso
        }

        robloxBotAccountState = {
            connected: true,
            roblox_user_id: Number(botUser.id),
            roblox_username: String(botUser.name),
            display_name: String(botUser.displayName || botUser.name),
            avatar_url: avatarUrl,
            cookie: cleanCookie,
            current_friends_count: currentFriendsCount,
            verified_by_friendship_count: Number(robloxBotAccountState.verified_by_friendship_count || 0),
            friends_cleaned_count: Number(robloxBotAccountState.friends_cleaned_count || 0),
            auto_unfriend_enabled: true,
            last_sweep_at: robloxBotAccountState.last_sweep_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        guardarCuentaBotRobloxEnDisco();

        return {
            ok: true,
            account: obtenerEstadoCuentaBotRoblox(),
            message: `✅ Cuenta de Roblox del Bot conectada: **@${botUser.name}** (ID \`${botUser.id}\` • Amigos actuales: \`${currentFriendsCount}/200\`). Ahora enviará solicitudes de amistad y eliminará automáticamente al amigo tras verificar.`
        };
    } catch (err) {
        const status = err.response?.status;
        return {
            ok: false,
            message: status === 401
                ? '❌ La cookie .ROBLOSECURITY expiró o no es válida (Error 401 en Roblox). Iniciá sesión en la cuenta de Roblox del bot y copiá su cookie .ROBLOSECURITY actual.'
                : `❌ No se pudo autenticar la cuenta de Roblox del bot (${err.message}).`
        };
    }
}

async function obtenerCsrfTokenRoblox(cookie) {
    if (!cookie) return null;
    try {
        await axios.post(
            'https://auth.roblox.com/v2/logout',
            {},
            {
                headers: {
                    Cookie: `.ROBLOSECURITY=${cookie}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 6000
            }
        );
    } catch (err) {
        const token = err.response?.headers?.['x-csrf-token'];
        if (token) return token;
    }
    return null;
}

/**
 * Elimina a un usuario específico de la lista de amigos de la cuenta de Roblox del Bot
 * inmediatamente después de completar la verificación para no llenar el límite de 200 amigos.
 */
async function eliminarAmigoDeCuentaBotRoblox(targetRobloxUserId, csrfTokenHint = null) {
    if (!robloxBotAccountState.connected || !robloxBotAccountState.cookie || !targetRobloxUserId) {
        return { ok: false, reason: 'bot_not_connected' };
    }
    const cookie = robloxBotAccountState.cookie;
    const csrfToken = csrfTokenHint || (await obtenerCsrfTokenRoblox(cookie));
    if (!csrfToken) {
        return { ok: false, reason: 'csrf_failed' };
    }

    const headers = {
        Cookie: `.ROBLOSECURITY=${cookie}`,
        'x-csrf-token': csrfToken,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    try {
        await axios.post(
            `https://friends.roblox.com/v1/users/${Number(targetRobloxUserId)}/unfriend`,
            {},
            { headers, timeout: 6500 }
        );
        robloxBotAccountState.friends_cleaned_count = Number(robloxBotAccountState.friends_cleaned_count || 0) + 1;
        robloxBotAccountState.current_friends_count = Math.max(0, Number(robloxBotAccountState.current_friends_count || 1) - 1);
        robloxBotAccountState.last_sweep_at = new Date().toISOString();
        guardarCuentaBotRobloxEnDisco();
        return { ok: true };
    } catch {
        return { ok: false, reason: 'unfriend_request_failed' };
    }
}

/**
 * Obtiene la lista real de amigos actuales de la cuenta de Roblox del Bot y actualiza su contador.
 */
async function obtenerListaAmigosBotRoblox() {
    if (!robloxBotAccountState.connected || !robloxBotAccountState.roblox_user_id) {
        return [];
    }
    try {
        const res = await axios.get(
            `https://friends.roblox.com/v1/users/${Number(robloxBotAccountState.roblox_user_id)}/friends`,
            {
                headers: {
                    'Cache-Control': 'no-cache',
                    ...(robloxBotAccountState.cookie ? { Cookie: `.ROBLOSECURITY=${robloxBotAccountState.cookie}` } : {})
                },
                timeout: 6500
            }
        );
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        robloxBotAccountState.current_friends_count = list.length;
        guardarCuentaBotRobloxEnDisco();
        return list;
    } catch {
        return [];
    }
}

/**
 * Limpia la lista de amigos de la cuenta de Roblox del Bot para mantener el historial limpio (0/200)
 * y permitir nuevas verificaciones sin alcanzar nunca el tope de 200 amigos de Roblox.
 */
async function limpiarListaAmigosBotRoblox(forceAll = true) {
    const botStatus = obtenerEstadoCuentaBotRoblox();
    if (!botStatus.connected || !robloxBotAccountState.cookie) {
        return {
            ok: false,
            removed: 0,
            remaining: 0,
            message: '⚠️ El bot aún no tiene una cuenta de Roblox conectada en `/config`.'
        };
    }

    const friendsList = await obtenerListaAmigosBotRoblox();
    if (friendsList.length === 0) {
        robloxBotAccountState.current_friends_count = 0;
        robloxBotAccountState.last_sweep_at = new Date().toISOString();
        guardarCuentaBotRobloxEnDisco();
        return {
            ok: true,
            removed: 0,
            remaining: 0,
            message: `✨ La lista de amigos de **@${botStatus.roblox_username}** ya está completamente limpia (\`0 / 200\` amigos).`
        };
    }

    const csrfToken = await obtenerCsrfTokenRoblox(robloxBotAccountState.cookie);
    if (!csrfToken) {
        return {
            ok: false,
            removed: 0,
            remaining: friendsList.length,
            message: '❌ No se pudo obtener token CSRF de Roblox. Revisá que la cookie `.ROBLOSECURITY` siga vigente.'
        };
    }

    // Si hay verificaciones activas en curso, antes de borrar a un amigo comprobamos si está esperando verificación para verificarlo primero
    for (const [discId, pending] of pendingRobloxVerifications.entries()) {
        if (pending && pending.profile?.roblox_user_id) {
            const matchFriend = friendsList.find(f => Number(f.id) === Number(pending.profile.roblox_user_id));
            if (matchFriend) {
                await confirmarVerificacionCodigoRoblox(discId, '').catch(() => null);
            }
        }
    }

    let removedCount = 0;
    const updatedFriends = await obtenerListaAmigosBotRoblox();
    for (const friend of updatedFriends) {
        if (!friend || !friend.id) continue;
        if (!forceAll) {
            // Si es limpieza automática preventiva, respetar si hay alguien con solicitud de hace menos de 90 segundos
            let isVeryRecentPending = false;
            for (const pending of pendingRobloxVerifications.values()) {
                if (
                    Number(pending?.profile?.roblox_user_id) === Number(friend.id) &&
                    Date.now() - (pending.createdAt || 0) < 90 * 1000
                ) {
                    isVeryRecentPending = true;
                    break;
                }
            }
            if (isVeryRecentPending) continue;
        }
        const resUnfriend = await eliminarAmigoDeCuentaBotRoblox(friend.id, csrfToken);
        if (resUnfriend.ok) {
            removedCount++;
        }
    }

    const finalFriends = await obtenerListaAmigosBotRoblox();
    robloxBotAccountState.current_friends_count = finalFriends.length;
    robloxBotAccountState.last_sweep_at = new Date().toISOString();
    guardarCuentaBotRobloxEnDisco();

    return {
        ok: true,
        removed: removedCount,
        remaining: finalFriends.length,
        message:
            `🧹 **Limpieza de amigos del Bot completada en @${botStatus.roblox_username}:**\n` +
            `> • **Amigos eliminados en esta barrida:** **${removedCount}**\n` +
            `> • **Cupo disponible actual:** \`${finalFriends.length} / 200\` amigos (listo para nuevas verificaciones).`
    };
}

/**
 * Envía una Solicitud de Amistad desde la cuenta de Roblox del Bot al usuario destino.
 * Si el usuario destino ya era amigo o ya había enviado una solicitud al bot, lo detecta al instante.
 */
async function enviarSolicitudAmistadEnRoblox(targetProfile, verifyPhrase) {
    const botStatus = obtenerEstadoCuentaBotRoblox();
    if (!botStatus.connected || !robloxBotAccountState.cookie) {
        return {
            delivered: false,
            alreadyFriends: false,
            channel: 'bot_account_pending',
            botAccount: botStatus,
            reason: 'El bot aún no tiene conectada su cuenta verificadora de Roblox en /config.'
        };
    }

    const recipientId = Number(targetProfile.roblox_user_id);

    // 0. Si la cuenta del bot supera 180 amigos, limpiar preventivamente antes de enviar nueva solicitud
    if (Number(robloxBotAccountState.current_friends_count || 0) >= 180) {
        await limpiarListaAmigosBotRoblox(false).catch(() => null);
    }

    // 1. Verificar si ya están en la lista de amigos del bot
    const currentFriends = await obtenerListaAmigosBotRoblox();
    if (currentFriends.some(f => Number(f.id) === recipientId)) {
        return {
            delivered: true,
            alreadyFriends: true,
            channel: 'roblox_friend_already',
            botAccount: obtenerEstadoCuentaBotRoblox(),
            reason: null
        };
    }

    const cookie = robloxBotAccountState.cookie;
    const csrfToken = await obtenerCsrfTokenRoblox(cookie);
    if (!csrfToken) {
        return {
            delivered: false,
            alreadyFriends: false,
            channel: 'csrf_failed',
            botAccount: botStatus,
            reason: 'No se pudo obtener token CSRF de la cuenta de Roblox del bot (revisar cookie en /config).'
        };
    }

    const headers = {
        Cookie: `.ROBLOSECURITY=${cookie}`,
        'x-csrf-token': csrfToken,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    // 2. Si el usuario ya le había enviado una solicitud de amistad entrante al bot, aceptarla directamente
    try {
        const acceptRes = await axios.post(
            `https://friends.roblox.com/v1/users/${recipientId}/accept-friend-request`,
            {},
            { headers, timeout: 6000 }
        );
        if (acceptRes.status === 200) {
            return {
                delivered: true,
                alreadyFriends: true,
                channel: 'roblox_friend_accepted',
                botAccount: obtenerEstadoCuentaBotRoblox(),
                reason: null
            };
        }
    } catch {
        // No había solicitud entrante previa; continuar enviando solicitud saliente
    }

    // 3. Enviar Solicitud de Amistad saliente desde el Bot hacia el usuario destino
    try {
        const reqRes = await axios.post(
            `https://friends.roblox.com/v1/users/${recipientId}/request-friendship`,
            { friendshipOriginSourceType: 0 },
            { headers, timeout: 7500 }
        );

        if (reqRes.status === 200 && (reqRes.data?.success !== false)) {
            return {
                delivered: true,
                alreadyFriends: false,
                channel: 'roblox_friend_request',
                botAccount: obtenerEstadoCuentaBotRoblox(),
                reason: null
            };
        }
    } catch (err) {
        const errMsg = err.response?.data?.errors?.[0]?.message || '';
        if (/already friends/i.test(errMsg)) {
            return {
                delivered: true,
                alreadyFriends: true,
                channel: 'roblox_friend_already',
                botAccount: obtenerEstadoCuentaBotRoblox(),
                reason: null
            };
        }
    }

    // 4. Si Roblox pidió Captcha en el envío saliente o el usuario bloqueó solicitudes, permitir que el usuario envíe la solicitud al Bot (el bot la auto-acepta)
    return {
        delivered: false,
        alreadyFriends: false,
        channel: 'roblox_incoming_friend_or_bio',
        botAccount: obtenerEstadoCuentaBotRoblox(),
        reason: `Aceptá la solicitud de @${botStatus.roblox_username} o enviale solicitud de amistad a @${botStatus.roblox_username} en Roblox (${verifyPhrase}).`
    };
}

/**
 * Comprueba si el usuario destino ya aceptó la solicitud de amistad del Bot (o si le envió una solicitud al Bot).
 * Si la amistad se confirma, devuelve { verified: true, autoUnfriended: true } y ELIMINA AUTOMÁTICAMENTE al usuario
 * de los amigos del Bot para mantener la lista limpia.
 */
async function verificarAmistadYEliminarAmigoBotRoblox(targetRobloxUserId) {
    if (!robloxBotAccountState.connected || !robloxBotAccountState.cookie || !robloxBotAccountState.roblox_user_id) {
        return { verified: false, autoUnfriended: false, methodNote: null };
    }

    const targetId = Number(targetRobloxUserId);
    const cookie = robloxBotAccountState.cookie;
    let csrfToken = null;
    let isFriendNow = false;
    let methodNote = null;

    // 1. Revisar si ya figura en la lista de amigos actuales de la cuenta del Bot
    const currentFriends = await obtenerListaAmigosBotRoblox();
    if (currentFriends.some(f => Number(f.id) === targetId)) {
        isFriendNow = true;
        methodNote = `Solicitud de amistad aceptada con @${robloxBotAccountState.roblox_username}`;
    }

    // 2. Si aún no figura como amigo, revisar si el usuario le envió una solicitud de amistad entrante al Bot y aceptarla automáticamente
    if (!isFriendNow) {
        try {
            csrfToken = await obtenerCsrfTokenRoblox(cookie);
            if (csrfToken) {
                const headers = {
                    Cookie: `.ROBLOSECURITY=${cookie}`,
                    'x-csrf-token': csrfToken,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                };
                const acceptRes = await axios.post(
                    `https://friends.roblox.com/v1/users/${targetId}/accept-friend-request`,
                    {},
                    { headers, timeout: 6000 }
                );
                if (acceptRes.status === 200) {
                    isFriendNow = true;
                    methodNote = `Solicitud de amistad verificada y aceptada por @${robloxBotAccountState.roblox_username}`;
                }
            }
        } catch {
            // Aún no envió ni aceptó solicitud
        }
    }

    if (!isFriendNow) {
        return { verified: false, autoUnfriended: false, methodNote: null };
    }

    // 3. ¡Amistad confirmada! Incrementar contador y ELIMINAR INMEDIATAMENTE de amigos para mantener limpio el cupo de 200 amigos
    robloxBotAccountState.verified_by_friendship_count = Number(robloxBotAccountState.verified_by_friendship_count || 0) + 1;
    let autoUnfriended = false;
    if (robloxBotAccountState.auto_unfriend_enabled !== false) {
        const unfriendRes = await eliminarAmigoDeCuentaBotRoblox(targetId, csrfToken);
        autoUnfriended = Boolean(unfriendRes.ok);
    }
    guardarCuentaBotRobloxEnDisco();

    return {
        verified: true,
        autoUnfriended,
        methodNote: autoUnfriended
            ? `${methodNote} (amigo eliminado automáticamente tras verificar)`
            : methodNote
    };
}

/**
 * Verifica directamente en los servidores de Roblox (users.roblox.com/v1/users/{id})
 * si el usuario colocó la etiqueta de verificación en su perfil de Roblox (respaldo alternativo).
 */
async function verificarFraseEnPerfilRoblox(targetRobloxUserId, verifyPhrase) {
    if (!targetRobloxUserId || !verifyPhrase) return false;
    try {
        const res = await axios.get(`https://users.roblox.com/v1/users/${Number(targetRobloxUserId)}`, {
            timeout: 6500,
            headers: { 'Cache-Control': 'no-cache' }
        });
        const description = String(res.data?.description || '').toUpperCase();
        return description.includes(String(verifyPhrase).toUpperCase());
    } catch {
        return false;
    }
}

// Cargar la cuenta de Roblox del Bot al iniciar el módulo
cargarCuentaBotRobloxDesdeDisco();

// Registro de verificaciones completadas automáticamente en segundo plano para notificar a la web o Discord
const recentlyAutoVerifiedRoblox = new Map();

// Almacenes de verificación y protección Anti-Spam para Conexión Directa por ID (Discord y Roblox)
const pendingDiscordVerifications = new Map();
const discordVerifyCooldowns = new Map();
const blockedWebDiscordIds = new Set();
const robloxTargetCooldowns = new Map();
const ROBLOX_TARGET_COOLDOWN_MS = 3 * 60 * 1000; // 3 min por cuenta destino de Roblox
const ROBLOX_REQUESTER_COOLDOWN_MS = 30 * 1000;  // 30 seg por solicitante
const DISCORD_DM_COOLDOWN_MS = 2 * 60 * 1000;    // 2 min entre envíos de código por MD

/**
 * Comprueba si un Discord ID ya interactuó previamente con el bot o tiene datos registrados.
 */
function usuarioInteractuoConBot(discordId) {
    const key = String(discordId || '').trim();
    if (!key || key === 'default_session') return false;
    if (discordConfigCache.has(key) || fastLinkCache.has(key) || accountHistoryCache.has(key)) {
        return true;
    }
    try {
        const { hasUserChosenLanguage } = require('./i18n');
        if (typeof hasUserChosenLanguage === 'function' && hasUserChosenLanguage(key)) {
            return true;
        }
    } catch {
        // Silencioso
    }
    const tables = supabase.memoryTables || {};
    if (Array.isArray(tables.roblox_wishlist) && tables.roblox_wishlist.some(r => String(r?.user_id) === key)) return true;
    if (Array.isArray(tables.tycoon_profiles) && tables.tycoon_profiles.some(r => String(r?.user_id) === key)) return true;
    return false;
}

/**
 * Comprueba si un Discord ID comparte al menos un servidor en común con el bot
 * o si ya interactuó previamente con comandos del bot.
 */
async function verificarMiembroMutuoDiscord(client, discordId) {
    const key = String(discordId || '').trim();
    if (!/^\d{15,22}$/.test(key)) {
        return { allowed: false, inMutualGuild: false, hasPriorInteraction: false, userObj: null };
    }

    const hasPriorInteraction = usuarioInteractuoConBot(key);
    let inMutualGuild = false;
    let userObj = null;

    if (client && typeof client.isReady === 'function' && client.isReady()) {
        for (const guild of client.guilds.cache.values()) {
            if (guild.members?.cache?.has(key)) {
                inMutualGuild = true;
                userObj = guild.members.cache.get(key)?.user || null;
                break;
            }
        }
        if (!inMutualGuild) {
            for (const guild of client.guilds.cache.values()) {
                try {
                    const member = await guild.members.fetch(key);
                    if (member) {
                        inMutualGuild = true;
                        userObj = member.user || null;
                        break;
                    }
                } catch {
                    // No está en este servidor
                }
            }
        }
    } else {
        // Si el bot de Discord no está en línea en este proceso, solo permitir si el usuario ya interactuó con el bot o generó su código en /config
        const hasPendingCode = pendingDiscordVerifications.has(key);
        return {
            allowed: hasPriorInteraction || hasPendingCode,
            inMutualGuild: false,
            hasPriorInteraction,
            botOfflinePreview: true,
            userObj: null
        };
    }

    return {
        allowed: inMutualGuild || hasPriorInteraction || pendingDiscordVerifications.has(key),
        inMutualGuild,
        hasPriorInteraction,
        botOfflinePreview: false,
        userObj
    };
}

/**
 * Genera un código temporal de 6 dígitos (ej. KTX-482910) para vincular la sesión web de Discord
 * sin permitir vinculaciones en 1 clic sin permiso y sin hacer spam a terceros.
 * Se persiste también en disco para que nunca se pierda ni expire por recargas del servidor.
 */
function generarCodigoVinculacionDiscord(discordId, userMeta = null, { forceNew = false } = {}) {
    const key = String(discordId || '').trim();
    if (!/^\d{15,22}$/.test(key)) return null;

    const now = Date.now();
    const existing = !forceNew ? obtenerVerificacionPendienteDiscord(key) : null;
    if (existing && now < existing.expiresAt && existing.code) {
        if (userMeta) {
            existing.userMeta = userMeta;
            const uname = userMeta.globalName || userMeta.global_name || userMeta.username || null;
            guardarConfigDiscord(key, {
                ...(uname ? { discord_username: uname } : {}),
                pending_web_code: existing.code,
                pending_web_digits: existing.rawDigits,
                pending_web_expires_at: existing.expiresAt
            });
        }
        return existing;
    }

    const rawDigits = String(Math.floor(100000 + Math.random() * 900000));
    const code = `KTX-${rawDigits}`;
    const expiresAt = now + 30 * 60 * 1000; // 30 minutos alojado en /config
    const challenge = {
        discordId: key,
        code,
        rawDigits,
        createdAt: now,
        expiresAt,
        attempts: 0,
        dmSent: false,
        hostedInConfig: true,
        approvedInDiscord: false,
        userMeta: userMeta || null
    };
    pendingDiscordVerifications.set(key, challenge);

    const uname = userMeta?.globalName || userMeta?.global_name || userMeta?.username || null;
    // Persistir siempre el código alojado en /config en disco para que funcione al instante en la web sin enviar MDs
    guardarConfigDiscord(key, {
        ...(uname ? { discord_username: uname } : {}),
        pending_web_code: code,
        pending_web_digits: rawDigits,
        pending_web_expires_at: expiresAt,
        web_approved_in_discord: false
    });

    return challenge;
}

function obtenerVerificacionPendienteDiscord(discordId) {
    const key = String(discordId || '').trim();
    const now = Date.now();
    const pending = pendingDiscordVerifications.get(key);
    if (pending) {
        if (now > pending.expiresAt) {
            pendingDiscordVerifications.delete(key);
        } else {
            // Sincronizar flag de aprobación desde disco por si se aprobó en otro proceso/instancia
            const savedCfg = obtenerConfigDiscord(key);
            if (savedCfg.web_approved_in_discord && savedCfg.web_approved_until && now < savedCfg.web_approved_until) {
                pending.approvedInDiscord = true;
            }
            return pending;
        }
    }

    // Recuperar desde disco si existe un código alojado en /config o aprobación vigente
    const saved = obtenerConfigDiscord(key);
    if (saved && saved.pending_web_code && saved.pending_web_expires_at && now < saved.pending_web_expires_at) {
        const rawDigits = String(saved.pending_web_digits || saved.pending_web_code.replace(/^KTX-?/i, '')).trim();
        const restored = {
            discordId: key,
            code: saved.pending_web_code,
            rawDigits,
            createdAt: now,
            expiresAt: Number(saved.pending_web_expires_at),
            attempts: 0,
            dmSent: false,
            hostedInConfig: true,
            approvedInDiscord: Boolean(saved.web_approved_in_discord && (!saved.web_approved_until || now < saved.web_approved_until)),
            userMeta: saved.discord_username ? { id: key, username: saved.discord_username } : null
        };
        pendingDiscordVerifications.set(key, restored);
        return restored;
    }

    return null;
}

/**
 * Inicia el desafío de verificación para conectar una cuenta de Discord por ID desde la Web:
 * - PRIVACIDAD Y CONVENIENCIA: Aloja los códigos en el panel /config sin requerir interacción por Mensaje Directo.
 * - El código `KTX-XXXXXX` se aloja directamente dentro del comando `/config` en Discord (`Cuentas y Datos Guardados`).
 * - Verifica que el usuario comparta servidor con el bot o haya ejecutado `/config` antes.
 */
async function iniciarVerificacionDiscordWeb(discordIdInput, { client = null, requesterIp = 'local' } = {}) {
    const key = String(discordIdInput || '').trim();
    if (!/^\d{15,22}$/.test(key)) {
        return {
            ok: false,
            reason: 'invalid_id',
            step: 'invalid_id',
            message: 'Ingresá tu Discord ID numérico válido (17 a 20 dígitos) y el código KTX-XXXXXX alojado en el comando /config.'
        };
    }

    if (blockedWebDiscordIds.has(key)) {
        return {
            ok: false,
            reason: 'blocked_by_user',
            step: 'blocked_by_owner',
            message: '🔒 El propietario de esta cuenta de Discord bloqueó las solicitudes de vinculación por ID desde la web. Podés desbloquearlo ejecutando /config en Discord.'
        };
    }

    const mutualCheck = await verificarMiembroMutuoDiscord(client, key);
    if (!mutualCheck.allowed) {
        return {
            ok: false,
            reason: 'not_in_mutual_guild',
            step: 'not_in_guild',
            message: '🛡️ Para evitar spam, primero probá el bot en Discord ejecutando el comando /config: ahí se aloja tu código personal KTX-XXXXXX para conectar tu ID en la web.'
        };
    }

    // Asegurar que exista un código alojado para consultar desde /config (NUNCA envía MD para no hacer spam en el buzón)
    generarCodigoVinculacionDiscord(key, mutualCheck.userObj);

    return {
        ok: true,
        step: 'verify_required',
        discordId: key,
        dmSent: false,
        hostedInConfig: true,
        expiresInMinutes: 30,
        message: '🔑 Código de verificación: escribí el comando /config en el bot de Discord, abrí "Cuentas y Datos Guardados" y copiá tu código KTX-XXXXXX alojado en el apartado 1. Cuenta de Discord.'
    };
}

/**
 * Confirma el acceso de Discord en la web usando el código `KTX-XXXXXX` alojado en `/config`:
 * - También mantiene compatibilidad si el usuario ya aprobó desde Discord.
 * - Conserva el código vigente durante su ventana de tiempo para no fallar si vuelve a consultar.
 */
async function confirmarVerificacionDiscordWeb(discordIdInput, codeInput, client = null, { isPoll = false } = {}) {
    const key = String(discordIdInput || '').trim();
    const now = Date.now();
    const pending = obtenerVerificacionPendienteDiscord(key);
    const savedCfgDisk = obtenerConfigDiscord(key);

    const approvedViaDiscordButton =
        Boolean(pending && pending.approvedInDiscord) ||
        Boolean(savedCfgDisk.web_approved_in_discord && savedCfgDisk.web_approved_until && now < savedCfgDisk.web_approved_until);

    if (!pending && !approvedViaDiscordButton) {
        return {
            ok: false,
            step: 'verify_required',
            message: '🔑 Para conectar tu ID, ejecutá el comando /config en Discord (apartado 1. Cuenta de Discord), copiá tu código KTX-XXXXXX alojado ahí y pegalo acá.'
        };
    }

    const cleanInput = String(codeInput || '').trim().toUpperCase().replace(/\s+/g, '');

    if (isPoll && !approvedViaDiscordButton) {
        return {
            ok: true,
            step: 'verify_required',
            discordId: key,
            approvedInDiscord: false
        };
    }

    if (!cleanInput && !approvedViaDiscordButton) {
        return {
            ok: false,
            step: 'verify_required',
            message: '💡 Ejecutá el comando /config en el bot de Discord, copiá tu código KTX-XXXXXX alojado en "1. Cuenta de Discord" y pegalo en la casilla de código.'
        };
    }

    if (!approvedViaDiscordButton && pending) {
        pending.attempts = (pending.attempts || 0) + 1;
        if (pending.attempts > 5) {
            pendingDiscordVerifications.delete(key);
            return {
                ok: false,
                step: 'too_many_attempts',
                message: '❌ Demasiados intentos fallidos. Ejecutá /config en Discord para generar un código KTX-XXXXXX nuevo.'
            };
        }

        const matchesCode =
            cleanInput === pending.code.toUpperCase() ||
            cleanInput === pending.rawDigits ||
            cleanInput === `KTX${pending.rawDigits}`;

        if (!matchesCode) {
            return {
                ok: false,
                step: 'invalid_code',
                message: `❌ El código ingresado no coincide. Abrí el comando /config en Discord y copiá el código KTX-XXXXXX que aparece en "1. Cuenta de Discord". Te quedan ${Math.max(0, 5 - pending.attempts)} intento(s).`
            };
        }
    }

    let discordUserObj = {
        ...(pending?.userMeta || {}),
        id: key,
        username: pending?.userMeta?.username || savedCfgDisk.discord_username || `Usuario_${String(key).slice(-4)}`,
        globalName: pending?.userMeta?.globalName || pending?.userMeta?.global_name || savedCfgDisk.discord_username || null,
        avatar: pending?.userMeta?.avatar || null
    };

    if (client && typeof client.isReady === 'function' && client.isReady() && !pending?.userMeta?.id) {
        const fetched = await client.users.fetch(key).catch(() => null);
        if (fetched) discordUserObj = fetched;
    }

    const savedCfg = await activarSesionDiscordDirecta(discordUserObj);

    return {
        ok: true,
        step: 'verified',
        discordId: key,
        discordConfig: savedCfg,
        message: `✅ Identidad verificada con tu código de /config: Cuenta de Discord @${savedCfg?.discord_username || key} (ID ${key}) conectada.`
    };
}

/**
 * Permite aprobar o bloquear una solicitud de vinculación web directamente desde los botones del MD de Discord.
 * - NUNCA borra ni oculta el código `KTX-XXXXXX` del mensaje en Discord cuando el usuario toca "✅ Sí, fui yo".
 * - Si el usuario toca "✅ Sí, fui yo", deja autorizada la sesión web automáticamente para que no le pida escribir el código en la página.
 */
async function procesarAccionSeguridadDiscordWeb(discordUser, action, tokenDigits = '') {
    const uid = String(discordUser?.id || '').trim();
    if (!uid) return { ok: false, message: 'Usuario no válido.' };

    if (action === 'block') {
        pendingDiscordVerifications.delete(uid);
        blockedWebDiscordIds.add(uid);
        if (discordConfigCache.has(uid)) {
            guardarConfigDiscord(uid, {
                pending_web_code: null,
                pending_web_digits: null,
                pending_web_expires_at: null,
                web_approved_in_discord: false,
                web_approved_until: null
            });
        }
        return {
            ok: true,
            blocked: true,
            message:
                `🚫 **Solicitudes Web Bloqueadas para tu Discord ID (\`${uid}\`)**\n` +
                `Anulamos el código de inmediato y bloqueamos las solicitudes de conexión por ID desde la web hacia tu cuenta.\n` +
                `> • Si en algún momento querés volver a habilitarlo, ejecutá \`/config\` en Discord.`
        };
    }

    if (action === 'unblock') {
        blockedWebDiscordIds.delete(uid);
        return {
            ok: true,
            blocked: false,
            message: '🔓 Solicitudes web desbloqueadas para tu cuenta de Discord.'
        };
    }

    const now = Date.now();
    const expiresAt = now + 15 * 60 * 1000;
    let pending = obtenerVerificacionPendienteDiscord(uid);

    // Garantizar que si el dueño legítimo toca "✅ Sí, fui yo" en su MD de Discord, NUNCA falle por expiración y conserve el código exacto del botón
    const cleanButtonDigits = String(tokenDigits || '').replace(/\D/g, '').slice(0, 6);
    const activeDigits = cleanButtonDigits || pending?.rawDigits || String(Math.floor(100000 + Math.random() * 900000));
    const activeCode = `KTX-${activeDigits}`;

    if (!pending) {
        pending = {
            discordId: uid,
            code: activeCode,
            rawDigits: activeDigits,
            createdAt: now,
            expiresAt,
            attempts: 0,
            dmSent: true,
            approvedInDiscord: true,
            userMeta: discordUser
        };
    } else {
        pending.code = activeCode;
        pending.rawDigits = activeDigits;
        pending.expiresAt = expiresAt;
        pending.approvedInDiscord = true;
        pending.userMeta = discordUser;
    }
    pendingDiscordVerifications.set(uid, pending);

    const savedCfg = await activarSesionDiscordDirecta(discordUser);
    guardarConfigDiscord(uid, {
        pending_web_code: activeCode,
        pending_web_digits: activeDigits,
        pending_web_expires_at: expiresAt,
        web_approved_in_discord: true,
        web_approved_until: expiresAt
    });

    return {
        ok: true,
        approved: true,
        discordConfig: savedCfg,
        code: activeCode,
        rawDigits: activeDigits,
        message:
            `🔐 **Verificación de Seguridad — Kortex Web (✅ Confirmada por vos)**\n` +
            `Confirmaste que sos el titular de **@${savedCfg?.discord_username || discordUser.username}** (\`${uid}\`).\n` +
            `> • **Acceso Automático en la Web:** 🟢 **¡Ya estás verificado!** Volvé a la página web: tu cuenta se conectará sola automáticamente (o simplemente tocá **✅ Verificar / Ya confirmé** en la web **sin escribir ningún código**).\n` +
            `> • **Tu Código de Seguridad (se mantiene visible por si lo necesitás):** **\`${activeCode}\`** *(activo por 15 minutos)*`
    };
}

function obtenerVerificacionPendienteRoblox(discordId) {
    const key = String(discordId || 'default_session').trim();
    const pending = pendingRobloxVerifications.get(key);
    if (!pending) return null;
    if (Date.now() > pending.expiresAt) {
        pendingRobloxVerifications.delete(key);
        return null;
    }
    return pending;
}

function cancelarVerificacionCodigoRoblox(discordId) {
    const key = String(discordId || 'default_session').trim();
    const pending = pendingRobloxVerifications.get(key);
    if (pending && pending.profile?.roblox_user_id) {
        robloxTargetCooldowns.delete(`rblx_target:${pending.profile.roblox_user_id}`);
    }
    pendingRobloxVerifications.delete(key);
    return true;
}

/**
 * Inicia el proceso de vinculación segura en Roblox por @Usuario o ID (Paso 1 de 2):
 * - NUNCA vincula la cuenta en el Paso 1 sin demostrar propiedad (evita que alguien se vincule la cuenta de otro jugador).
 * - Protege contra spam aplicando enfriamiento (cooldown) por cuenta de Roblox destino y por solicitante.
 * - Genera un código único `KORTEX-XXXX` que el usuario coloca en su descripción ("Acerca de") de Roblox
 *   (o valida mediante solicitud de amistad con la cuenta del bot si está activa).
 */
async function iniciarVerificacionCodigoRoblox(discordId, robloxInput, options = {}) {
    const key = String(discordId || 'default_session').trim();
    const raw = String(robloxInput || '').trim();
    if (!raw) {
        return { ok: false, message: 'Escribí tu nombre de usuario o ID de Roblox primero.' };
    }

    const resolved = await resolverUsuarioRoblox(raw);
    if (!resolved || !resolved.roblox_user_id) {
        return { ok: false, message: `No se encontró ningún usuario de Roblox con "${raw}". Verificá el nombre o ID.` };
    }

    const now = Date.now();
    const targetCooldownKey = `rblx_target:${resolved.roblox_user_id}`;
    const existingTargetLock = robloxTargetCooldowns.get(targetCooldownKey);

    // Si OTRO usuario distinto acaba de solicitar verificación sobre la misma cuenta de Roblox hace menos de 3 min, bloquear por anti-spam
    if (existingTargetLock && existingTargetLock.requesterDiscordId !== key && (now - existingTargetLock.timestamp < ROBLOX_TARGET_COOLDOWN_MS)) {
        return {
            ok: false,
            reason: 'target_cooldown',
            step: 'cooldown',
            message: `⏳ Ya hay una solicitud de verificación reciente en curso para @${resolved.roblox_username}. Por protección anti-spam, esperá unos minutos o iniciá sesión con Roblox OAuth 2.0.`
        };
    }

    const existingPending = obtenerVerificacionPendienteRoblox(key);
    // Si el mismo usuario ya tiene un código vigente para la misma cuenta de Roblox, reutilizarlo para no cambiarle el código mientras edita su perfil
    const robloxProfileVerifyPhrase =
        (existingPending && Number(existingPending.profile?.roblox_user_id) === Number(resolved.roblox_user_id) && existingPending.robloxProfileVerifyPhrase)
            ? existingPending.robloxProfileVerifyPhrase
            : `KORTEX-${Math.floor(1000 + Math.random() * 9000)}`;

    const createdAt = now;
    const expiresAt = createdAt + 10 * 60 * 1000; // 10 minutos

    // Protección Anti-Spam: No permitir bombardear con solicitudes de amistad a cuentas de Roblox ajenas
    const reqCooldownKey = `rblx_req:${options.requesterKey || options.requesterIp || key}`;
    const lastTargetAttempt = existingTargetLock ? existingTargetLock.timestamp : 0;
    const lastReqAttempt = robloxTargetCooldowns.get(reqCooldownKey) || 0;
    const canSendFriendReq =
        (now - lastTargetAttempt >= ROBLOX_TARGET_COOLDOWN_MS) &&
        (now - lastReqAttempt >= ROBLOX_REQUESTER_COOLDOWN_MS);

    robloxTargetCooldowns.set(targetCooldownKey, {
        timestamp: now,
        requesterDiscordId: key
    });

    let delivery = {
        delivered: false,
        alreadyFriends: false,
        channel: 'roblox_bio_code',
        botAccount: obtenerEstadoCuentaBotRoblox(),
        reason: null
    };

    if (canSendFriendReq && robloxBotAccountState.connected) {
        robloxTargetCooldowns.set(reqCooldownKey, now);
        delivery = await enviarSolicitudAmistadEnRoblox(resolved, robloxProfileVerifyPhrase);
    }

    const botAccount = delivery.botAccount || obtenerEstadoCuentaBotRoblox();

    const botProfileUrl = botAccount.roblox_user_id
        ? `https://www.roblox.com/users/${botAccount.roblox_user_id}/profile`
        : 'https://www.roblox.com/users/friends#!/friend-requests';

    const safePublicMetadata = {
        sender: botAccount.connected
            ? `Bot Verificador en Roblox: @${botAccount.roblox_username} (ID ${botAccount.roblox_user_id})`
            : 'Verificador de Propiedad en Roblox',
        recipient: `@${resolved.roblox_username} (ID ${resolved.roblox_user_id})`,
        sentAt: new Date(createdAt).toISOString(),
        expiresInMinutes: 10,
        robloxMessageDelivered: Boolean(delivery.delivered),
        friendRequestSent: Boolean(delivery.delivered),
        deliveryChannel: delivery.channel,
        botRobloxConnected: Boolean(botAccount.connected),
        botRobloxUsername: botAccount.roblox_username || null,
        botRobloxUserId: botAccount.roblox_user_id || null,
        botProfileUrl,
        robloxFriendRequestsUrl: 'https://www.roblox.com/users/friends#!/friend-requests',
        robloxMessagesUrl: 'https://www.roblox.com/users/friends#!/friend-requests',
        robloxProfileUrl: `https://www.roblox.com/users/${resolved.roblox_user_id}/profile`,
        robloxProfileVerifyPhrase,
        profileChallengePhrase: robloxProfileVerifyPhrase,
        autoUnfriendAfterVerify: true
    };

    const challenge = {
        discordId: key,
        verifyCode: robloxProfileVerifyPhrase,
        robloxProfileVerifyPhrase,
        profile: resolved,
        createdAt,
        expiresAt,
        attempts: 0,
        robloxMessageDelivered: Boolean(delivery.delivered),
        friendRequestSent: Boolean(delivery.delivered),
        deliveryChannel: delivery.channel,
        botRobloxConnected: Boolean(botAccount.connected),
        botRobloxUsername: botAccount.roblox_username || null,
        botRobloxUserId: botAccount.roblox_user_id || null,
        botInboxMessage: safePublicMetadata
    };

    pendingRobloxVerifications.set(key, challenge);

    let statusMessage = '';
    if (botAccount.connected) {
        statusMessage =
            `🛡️ **Verificación de propiedad requerida para @${resolved.roblox_username} (ID \`${resolved.roblox_user_id}\`):**\n` +
            `• **Opción A (Descripción del Perfil):** Pegá el código \`${robloxProfileVerifyPhrase}\` en la descripción ("Acerca de") de tu perfil en Roblox y tocá **✅ Comprobar Verificación**.\n` +
            `• **Opción B (Amistad con el Bot):** Aceptá o enviale solicitud de amistad a **@${botAccount.roblox_username}** en Roblox y tocá **✅ Comprobar Verificación**.`;
    } else {
        statusMessage =
            `🛡️ **Verificación de propiedad requerida para @${resolved.roblox_username} (ID \`${resolved.roblox_user_id}\`):**\n` +
            `Para demostrar que esta cuenta de Roblox es tuya, pegá temporalmente el código \`${robloxProfileVerifyPhrase}\` en la descripción (**"Acerca de"**) de tu perfil de Roblox y tocá **✅ Comprobar Verificación** (podés borrarlo apenas se vincule).`;
    }

    return {
        ok: true,
        step: 'verify_required',
        discordId: key,
        verifyCode: robloxProfileVerifyPhrase,
        profile: resolved,
        robloxMessageDelivered: Boolean(delivery.delivered),
        friendRequestSent: Boolean(delivery.delivered),
        deliveryChannel: delivery.channel,
        botInboxMessage: safePublicMetadata,
        message: statusMessage
    };
}

/**
 * Comprueba si el usuario ya colocó el código `KORTEX-XXXX` en su perfil de Roblox
 * (o si aceptó/envió solicitud de amistad a la cuenta del Bot en Roblox).
 * Solo vincula la cuenta cuando la propiedad queda demostrada.
 */
async function confirmarVerificacionCodigoRoblox(discordId, codeInput = '') {
    const key = String(discordId || 'default_session').trim();
    const pending = obtenerVerificacionPendienteRoblox(key);

    if (!pending) {
        const autoDone = recentlyAutoVerifiedRoblox.get(key);
        if (autoDone && Date.now() - autoDone.timestamp < 5 * 60 * 1000) {
            recentlyAutoVerifiedRoblox.delete(key);
            return {
                ok: true,
                step: 'verified',
                linkedAccount: autoDone.linkedAccount,
                message: autoDone.message
            };
        }
        return {
            ok: false,
            step: 'no_pending',
            message: 'No hay una verificación pendiente o ya expiró. Escribí tu @Usuario o ID de Roblox primero para generar tu código.'
        };
    }

    pending.attempts = (pending.attempts || 0) + 1;
    if (pending.attempts > 15) {
        pendingRobloxVerifications.delete(key);
        return {
            ok: false,
            step: 'too_many_attempts',
            message: '❌ La solicitud de verificación expiró por exceso de intentos. Iniciá una nueva solicitud con tu @Usuario o ID.'
        };
    }

    let verifiedMethodNote = null;
    let authMethodTag = 'roblox_verified';

    // 1. Verificar si el usuario aceptó o envió Solicitud de Amistad al Bot en Roblox (y auto-eliminar de amigos de inmediato)
    if (pending.botRobloxConnected || robloxBotAccountState.connected) {
        const friendCheck = await verificarAmistadYEliminarAmigoBotRoblox(pending.profile.roblox_user_id);
        if (friendCheck.verified) {
            verifiedMethodNote = friendCheck.methodNote;
            authMethodTag = 'roblox_friendship';
        }
    }

    // 2. Validar en vivo en users.roblox.com/v1/users/{id} si el usuario colocó el código KORTEX-XXXX en la descripción de su perfil
    if (!verifiedMethodNote) {
        const phraseToMatch = pending.robloxProfileVerifyPhrase;
        const hasPhraseOnRobloxProfile = await verificarFraseEnPerfilRoblox(
            pending.profile.roblox_user_id,
            phraseToMatch
        );
        if (hasPhraseOnRobloxProfile) {
            verifiedMethodNote = `Código ${phraseToMatch} verificado en la descripción del perfil de Roblox`;
            await eliminarAmigoDeCuentaBotRoblox(pending.profile.roblox_user_id).catch(() => null);
        }
    }

    if (!verifiedMethodNote) {
        if (pending.botRobloxConnected || robloxBotAccountState.connected) {
            const botName = pending.botRobloxUsername || robloxBotAccountState.roblox_username || 'Bot';
            return {
                ok: false,
                step: 'verify_required',
                verifyCode: pending.robloxProfileVerifyPhrase,
                profile: pending.profile,
                message:
                    `⏳ Aún no se detectó el código \`${pending.robloxProfileVerifyPhrase}\` en la descripción del perfil de **@${pending.profile.roblox_username}** ni amistad con **@${botName}**. ` +
                    `Pegá \`${pending.robloxProfileVerifyPhrase}\` en "Acerca de" de tu perfil en Roblox y volvé a tocar **Comprobar Verificación**.`
            };
        }
        return {
            ok: false,
            step: 'verify_required',
            verifyCode: pending.robloxProfileVerifyPhrase,
            profile: pending.profile,
            message:
                `⏳ Aún no se detectó el código \`${pending.robloxProfileVerifyPhrase}\` en el perfil de **@${pending.profile.roblox_username}**. ` +
                `Pegá \`${pending.robloxProfileVerifyPhrase}\` en la descripción (**"Acerca de"**) de tu perfil en **Roblox**, guardá los cambios y volvé a tocar **Comprobar Verificación**.`
        };
    }

    pendingRobloxVerifications.delete(key);

    const saved = await guardarCuentaVinculada(key, {
        ...pending.profile,
        auth_method: authMethodTag,
        roblox_oauth_verified: false,
        roblox_access_token: null
    });

    const finalMsg =
        `✅ **Propiedad de cuenta verificada (${verifiedMethodNote}):** Cuenta **@${saved.roblox_username}** (ID \`${saved.roblox_user_id}\`) vinculada correctamente. Ya podés quitar el código de tu perfil.`;

    recentlyAutoVerifiedRoblox.set(key, {
        timestamp: Date.now(),
        linkedAccount: saved,
        message: finalMsg
    });

    return {
        ok: true,
        step: 'verified',
        linkedAccount: saved,
        message: finalMsg
    };
}

/**
 * Verifica el perfil de Roblox vinculado preservando siempre la cuenta guardada
 * aunque el access_token temporal de OAuth2 haya expirado tras actualizar el bot.
 */
async function verificarAutorizacionRobloxOAuth(discordId) {
    const key = String(discordId || '');
    if (!key) return null;
    const cuenta = await obtenerCuentaVinculada(key).catch(() => null);
    if (!cuenta || !cuenta.roblox_user_id) return null;

    if ((cuenta.auth_method === 'oauth' || cuenta.roblox_oauth_verified) && cuenta.roblox_access_token) {
        try {
            const res = await axios.get('https://apis.roblox.com/oauth/v1/userinfo', {
                headers: { Authorization: `Bearer ${cuenta.roblox_access_token}` },
                timeout: 4500
            });
            if (res.data && res.data.sub) {
                return cuenta;
            }
        } catch {
            // Conservamos la cuenta vinculada en disco y base de datos aunque el token OAuth de corta duración haya expirado
            return cuenta;
        }
    }

    return cuenta;
}

/**
 * PANEL DE CUENTA DE ROBLOX (Dentro de /roblox y /config):
 * Muestra el estado de la cuenta de Roblox autorizada mediante Roblox OAuth 2.0 Oficial
 * o mediante Verificación de Propiedad por Código en Perfil (`KORTEX-XXXX`).
 */
async function construirPanelVinculacionCuenta(discordId, feedbackMsg = null) {
    const {
        ContainerBuilder,
        SectionBuilder,
        TextDisplayBuilder,
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
        MessageFlags
    } = require('discord.js');
    const { COLORES, footer, separador, boton } = require('../../utils/ui');

    const uid = String(discordId);
    const cuenta = await verificarAutorizacionRobloxOAuth(uid).catch(() => null);
    const pendingRoblox = obtenerVerificacionPendienteRoblox(uid);
    const hist = obtenerHistorialCuenta(uid).slice(0, 3);
    const baseAppUrl = obtenerUrlBasePublica();

    const directRobloxOAuthUrl = `${baseAppUrl}/api/auth/roblox/redirect?discord_id=${encodeURIComponent(uid)}`;

    const tieneCuenta = Boolean(cuenta && cuenta.roblox_user_id);

    const container = new ContainerBuilder().setAccentColor(
        pendingRoblox ? COLORES.alerta : (tieneCuenta ? COLORES.exito : COLORES.primario)
    );

    const fichaEstado = tieneCuenta
        ? (
            `# 🎮 Mi Cuenta de Roblox\n` +
            `👤 **Jugador:** **${cuenta.display_name || cuenta.roblox_username}** (\`@${cuenta.roblox_username}\` • ID \`${cuenta.roblox_user_id}\`)\n` +
            `🟢 **Estado:** Cuenta verificada y activa`
        )
        : (
            `# 🎮 Vincular Cuenta de Roblox\n` +
            `⚪ **Estado:** Sin cuenta vinculada\n` +
            `-# Conectá tu cuenta de Roblox con verificación de propiedad por **@Usuario / ID** o mediante **OAuth 2.0 Web**.`
        );

    const headerDisplay = new TextDisplayBuilder().setContent(
        fichaEstado + (feedbackMsg ? `\n\n> ${feedbackMsg}` : '')
    );

    const thumbUrl =
        (pendingRoblox?.profile?.avatar_url) ||
        (tieneCuenta && (cuenta.avatar_url || cuenta.avatar_full_url)) ||
        null;

    if (thumbUrl) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(headerDisplay)
                .setThumbnailAccessory(thumb => thumb.setURL(thumbUrl))
        );
    } else {
        container.addTextDisplayComponents(headerDisplay);
    }

    container.addSeparatorComponents(separador(true));

    if (pendingRoblox && pendingRoblox.profile) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 🛡️ Paso 2: Confirmar Propiedad de @${pendingRoblox.profile.roblox_username}\n` +
            `• **Código Único de Verificación:** \`${pendingRoblox.robloxProfileVerifyPhrase}\` *(válido 10 min)*\n` +
            `• **Cómo verificar:** Entrá a tu perfil en Roblox (\`@${pendingRoblox.profile.roblox_username}\`), pegá \`${pendingRoblox.robloxProfileVerifyPhrase}\` en tu descripción (**"Acerca de"**), guardá y tocá **✅ Comprobar Verificación** abajo.`
        ));
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_fastlink_verify_now', 'Comprobar Verificación', '✅', ButtonStyle.Success),
                new ButtonBuilder()
                    .setLabel('Abrir Mi Perfil en Roblox')
                    .setEmoji('🔗')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://www.roblox.com/users/${pendingRoblox.profile.roblox_user_id}/profile`),
                boton('btn_fastlink_cancel_verify', 'Cancelar', '✖️', ButtonStyle.Secondary)
            )
        );
        container.addSeparatorComponents(separador());
    }

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `### ⚡ Opción 1: Vincular Aquí por @Usuario o ID (Con Código en Perfil)\n` +
                `Escribí tu nombre de usuario o ID de Roblox y confirmá que sos el dueño con un código temporal en tu perfil.`
            ))
            .setButtonAccessory(
                boton(
                    'btn_fastlink_open_modal',
                    tieneCuenta ? 'Cambiar @Usuario / ID' : 'Vincular @Usuario / ID',
                    '🎮',
                    ButtonStyle.Primary
                )
            )
    );

    container.addSeparatorComponents(separador());

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `### 🔐 Opción 2: Permisos de la Aplicación y Portal Web\n` +
                `En Roblox, donde está alojado el bot y sus permisos es en **Configuración → Permisos de la aplicación** (*Settings → App Permissions*).`
            ))
            .setButtonAccessory(
                new ButtonBuilder()
                    .setLabel(tieneCuenta ? 'Abrir Panel Web' : 'Conectar en Web')
                    .setEmoji('🌐')
                    .setStyle(ButtonStyle.Link)
                    .setURL(baseAppUrl)
            )
    );

    if (tieneCuenta && hist.length > 0) {
        container.addSeparatorComponents(separador());
        const lineasHist = hist.map(h => `• **${h.title}** — *${h.detail || 'Registrado'}*`).join('\n');
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 📋 Actividad Reciente\n${lineasHist}`
        ));
    }

    container.addSeparatorComponents(separador(true));

    const bottomButtons = [
        boton('btn_fastlink_refresh', 'Actualizar Estado', '🔄', ButtonStyle.Success)
    ];

    if (tieneCuenta) {
        bottomButtons.push(
            new ButtonBuilder()
                .setLabel('Ver Perfil en Roblox')
                .setEmoji('👤')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://www.roblox.com/users/${cuenta.roblox_user_id}/profile`)
        );
    }

    bottomButtons.push(boton('btn_nav_main_menu', 'Volver Atrás', '⬅️', ButtonStyle.Secondary));

    container.addActionRowComponents(new ActionRowBuilder().addComponents(bottomButtons.slice(0, 5)));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Cuenta de Roblox')
    ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

/**
 * PANEL DE CONFIGURACIÓN (/config):
 * Estructura por categorías seleccionables:
 * - Categoría 1 (cat_accounts): Cuentas y Datos Guardados.
 * - Categoría 2 (cat_preferences): Idioma y Preferencias.
 * - Categoría 3 (cat_owner_bot): Panel del Propietario.
 */
async function construirPanelConfigDiscord(discordUser, feedbackMsg = null, categoryKey = 'cat_accounts', client = null) {
    const {
        ContainerBuilder,
        SectionBuilder,
        TextDisplayBuilder,
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
        StringSelectMenuBuilder,
        StringSelectMenuOptionBuilder,
        MessageFlags
    } = require('discord.js');
    const { COLORES, footer, separador, boton } = require('../../utils/ui');
    const {
        leerEstadoRecursos,
        obtenerConfigPropietario,
        esPropietarioDelBot
    } = require('./performanceManager');

    const uid = String(discordUser?.id || '');
    const username = discordUser?.globalName || discordUser?.username || 'Usuario';
    const avatarUrl = typeof discordUser?.displayAvatarURL === 'function'
        ? discordUser.displayAvatarURL({ extension: 'png', size: 256 })
        : null;

    const { obtenerPreferenciasUsuario, TIER_LABELS, REGIONAL_TIERS_LIST } = require('./i18n');
    const prefs = obtenerPreferenciasUsuario(uid);
    const isEn = prefs.lang === 'en';

    const esOwner = await esPropietarioDelBot(uid, client);
    const validCats = ['cat_accounts', 'cat_preferences', 'cat_owner_bot'];
    const activeCat = validCats.includes(categoryKey) ? categoryKey : 'cat_accounts';

    const selectOptions = [
        new StringSelectMenuOptionBuilder()
            .setLabel(isEn ? 'Accounts & Saved Data' : 'Cuentas y Datos Guardados')
            .setDescription(
                isEn
                    ? 'Link your Discord and Roblox accounts'
                    : 'Vinculá tus cuentas de Discord y Roblox'
            )
            .setValue('cat_accounts')
            .setEmoji('🔗')
            .setDefault(activeCat === 'cat_accounts'),
        new StringSelectMenuOptionBuilder()
            .setLabel(isEn ? 'Language & Preferences' : 'Idioma y Preferencias')
            .setDescription(
                isEn
                    ? 'Switch language (Español / English) and pricing region'
                    : 'Cambiar idioma (Español / Inglés) y región de precios'
            )
            .setValue('cat_preferences')
            .setEmoji('🌐')
            .setDefault(activeCat === 'cat_preferences')
    ];

    if (esOwner || activeCat === 'cat_owner_bot') {
        selectOptions.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    isEn
                        ? 'Bot Administration (Owner)'
                        : 'Administración del Bot (Propietario)'
                )
                .setDescription(
                    isEn
                        ? 'System status, memory cleanup, and maintenance'
                        : 'Estado del sistema, limpieza de memoria y mantenimiento'
                )
                .setValue('cat_owner_bot')
                .setEmoji('🛡️')
                .setDefault(activeCat === 'cat_owner_bot')
        );
    }

    const placeholderByCat = {
        cat_accounts: isEn
            ? '🔗 Accounts & Saved Data...'
            : '🔗 Cuentas y Datos Guardados...',
        cat_preferences: isEn
            ? '🌐 Language & Preferences...'
            : '🌐 Idioma y Preferencias...',
        cat_owner_bot: isEn
            ? '🛡️ Bot Administration...'
            : '🛡️ Administración del Bot...'
    };

    const selectConfigCat = new StringSelectMenuBuilder()
        .setCustomId('config_category_select')
        .setPlaceholder(placeholderByCat[activeCat] || placeholderByCat.cat_accounts)
        .addOptions(selectOptions);

    // =========================================================
    // CATEGORÍA: IDIOMA Y PREFERENCIAS DE COMODIDAD (cat_preferences)
    // =========================================================
    if (activeCat === 'cat_preferences') {
        const container = new ContainerBuilder().setAccentColor(0x5865F2);

        const langActualBadge = isEn
            ? '🇺🇸 **English**'
            : '🇪🇸 **Español**';

        const tierMap = TIER_LABELS[isEn ? 'en' : 'es'] || TIER_LABELS.es;
        const tierActualLabel = tierMap[prefs.default_tier] || tierMap.TIER_100;

        const catNames = isEn
            ? {
                cat_economy: '💰 1. Economy & Pricing',
                cat_avatar: '👕 2. Avatars & 3D/2D Studio',
                cat_games: '🎮 3. Games & Servers',
                cat_status: '📊 4. Roblox Analytics & Status'
            }
            : {
                cat_economy: '💰 1. Economía y Precios',
                cat_avatar: '👕 2. Avatares y Estudio 3D/2D',
                cat_games: '🎮 3. Juegos y Servidores',
                cat_status: '📊 4. Estadísticas y Estado'
            };

        const rangeNames = isEn
            ? {
                '24h': '⏱️ 24 Hours (Intraday)',
                '7d': '📅 7 Days (Weekly)',
                '30d': '🗓️ 30 Days (Monthly)',
                'all': '🏛️ Full History (All-Time)'
            }
            : {
                '24h': '⏱️ 24 Horas (Intradía)',
                '7d': '📅 7 Días (Semanal)',
                '30d': '🗓️ 30 Días (Mensual)',
                'all': '🏛️ Histórico Completo'
            };

        const cameraLabel = prefs.default_camera_mode === 'headshot'
            ? (isEn ? '🔍 Head / Face Zoom' : '🔍 Zoom Cabeza / Rostro')
            : (isEn ? '🧍 Full Body 3D' : '🧍 Cuerpo Completo 3D');

        const cashbackLabel = prefs.auto_cashback_40 !== false
            ? (isEn ? '🟢 Pre-enabled (40% Group Method)' : '🟢 Pre-activado (Método Grupo 40%)')
            : (isEn ? '⚪ Manual Selection' : '⚪ Selección Manual');

        const alertsBadge = prefs.dm_alerts_enabled !== false
            ? (isEn ? '🟢 **Active** (Receives DM notifications)' : '🟢 **Activas** (Recibís avisos por MD)')
            : (isEn ? '🔕 **Do Not Disturb** (DM alerts paused)' : '🔕 **No Molestar** (Avisos por MD en pausa)');

        const privacyBadge = prefs.ephemeral_config
            ? (isEn ? '🔒 **Private Mode (Only visible to me)**' : '🔒 **Modo Privado (Solo visible para mí)**')
            : (isEn ? '👁️ **Public Mode (Visible in channel)**' : '👁️ **Modo Público (Visible en el canal)**');

        const headerPref = new TextDisplayBuilder().setContent(
            (isEn
                ? `# 🌐 Language & Comfort Preferences\n` +
                  `🗣️ **Language:** ${langActualBadge}  •  🔔 **Alerts:** ${ prefs.dm_alerts_enabled !== false ? '🟢 ON' : '🔕 DND' }  •  ${prefs.ephemeral_config ? '🔒 Private' : '👁️ Public'}`
                : `# 🌐 Idioma y Preferencias de Uso\n` +
                  `🗣️ **Idioma:** ${langActualBadge}  •  🔔 **Alertas:** ${ prefs.dm_alerts_enabled !== false ? '🟢 Activas' : '🔕 No Molestar' }  •  ${prefs.ephemeral_config ? '🔒 Privado' : '👁️ Público'}`) +
            (feedbackMsg ? `\n\n> ${feedbackMsg}` : '')
        );

        if (avatarUrl && /^https?:\/\//i.test(String(avatarUrl))) {
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(headerPref)
                    .setThumbnailAccessory(thumb => thumb.setURL(String(avatarUrl)))
            );
        } else {
            container.addTextDisplayComponents(headerPref);
        }

        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectConfigCat));
        container.addSeparatorComponents(separador(true));

        // =====================================================
        // SECCIÓN 1: CATEGORÍA DE INICIO EN /ROBLOX (Exclusiva)
        // =====================================================
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            isEn
                ? `### 📂 1. Default Starting Category in \`/roblox\`\n` +
                  `**Active:** ${catNames[prefs.default_category] || catNames.cat_economy}\n` +
                  `-# Choose which category opens first whenever you run \`/roblox\`.`
                : `### 📂 1. Categoría de Inicio en \`/roblox\`\n` +
                  `**Activa:** ${catNames[prefs.default_category] || catNames.cat_economy}\n` +
                  `-# Elegí en cuál de las 4 categorías querés que abra directamente el comando \`/roblox\`.`
        ));

        const selectPrefDefaultCat = new StringSelectMenuBuilder()
            .setCustomId('select_pref_default_cat')
            .setPlaceholder(
                isEn
                    ? '📂 Choose your default starting category for /roblox...'
                    : '📂 Elegí con qué categoría iniciar el comando /roblox...'
            )
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn ? 'Category 1: Economy & Pricing' : 'Categoría 1: Economía y Precios')
                    .setDescription(isEn ? 'Price Tracker, Calculator, Price Floors, Pending Robux & Groups' : 'Seguimiento de Precios, Calculadora, Pisos, Robux Pendientes y Grupos')
                    .setValue('cat_economy')
                    .setEmoji('💰')
                    .setDefault(prefs.default_category === 'cat_economy'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn ? 'Category 2: Avatars & 3D/2D Studio' : 'Categoría 2: Avatares y Estudio 3D/2D')
                    .setDescription(isEn ? 'Outfit Sandbox, Clones, 2D Templates, 3D Models & Color-Match' : 'Probador de Ropa, Similares, Plantillas 2D, Modelos 3D y Colores')
                    .setValue('cat_avatar')
                    .setEmoji('👕')
                    .setDefault(prefs.default_category === 'cat_avatar'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn ? 'Category 3: Games & Servers' : 'Categoría 3: Juegos y Servidores')
                    .setDescription(isEn ? 'Empty Servers, Gamepasses, Promo Codes, Patch Alerts & Maps' : 'Servidores Vacíos, Pases, Códigos Activos, Parches y Mapas')
                    .setValue('cat_games')
                    .setEmoji('🎮')
                    .setDefault(prefs.default_category === 'cat_games'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn ? 'Category 4: Analytics & Server Status' : 'Categoría 4: Estadísticas y Estado')
                    .setDescription(isEn ? 'Live Roblox Status, Trending Games, Profiles, Limiteds & Versus' : 'Estado de Roblox en Vivo, Tendencias, Perfiles, Limiteds y Versus')
                    .setValue('cat_status')
                    .setEmoji('📊')
                    .setDefault(prefs.default_category === 'cat_status')
            ]);

        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectPrefDefaultCat));
        container.addSeparatorComponents(separador());

        // =====================================================
        // SECCIÓN 2: REGIÓN DE PRECIOS PREDETERMINADA (Exclusiva — 4 Tiers 100% / 80% / 60% / 40%)
        // =====================================================
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            isEn
                ? `### 🌎 2. Default Pricing Region (Regional Tiers)\n` +
                  `**Active:** ${tierActualLabel}\n` +
                  `-# Pre-selected automatically in **1.2 Economy Calculator** and regional price analyses.`
                : `### 🌎 2. Región de Precios Predeterminada (Tiers Regionales)\n` +
                  `**Activa:** ${tierActualLabel}\n` +
                  `-# Se aplica automáticamente en **1.2 Calculadora de Economía** y análisis regionales.`
        ));

        const selectPrefTier = new StringSelectMenuBuilder()
            .setCustomId('select_pref_tier')
            .setPlaceholder(
                isEn
                    ? '🌎 Choose your default pricing region (100% / 80% / 60% / 40%)...'
                    : '🌎 Elegí tu Tier de región predeterminada (100% / 80% / 60% / 40%)...'
            )
            .addOptions(
                REGIONAL_TIERS_LIST.map((tier) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(isEn ? tier.labelEn : tier.labelEs)
                        .setDescription(isEn ? tier.descEn : tier.descEs)
                        .setValue(tier.id)
                        .setEmoji(tier.emoji)
                        .setDefault(prefs.default_tier === tier.id)
                )
            );

        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectPrefTier));
        container.addSeparatorComponents(separador());

        // =====================================================
        // SECCIÓN 3: AJUSTES DE HERRAMIENTAS (Gráficas, Cámara y Calculadora)
        // =====================================================
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            isEn
                ? `### 🛠️ 3. Tool Defaults (Charts, Sandbox & Calculator)\n` +
                  `• **📈 Price Chart Range (1.1):** ${rangeNames[prefs.default_chart_range] || rangeNames['7d']}\n` +
                  `• **📸 Outfit Sandbox Camera (2.1):** ${cameraLabel}\n` +
                  `• **🧮 Economy Calculator (1.2):** ${cashbackLabel}`
                : `### 🛠️ 3. Ajustes de Herramientas (Gráficas, Probador y Calculadora)\n` +
                  `• **📈 Rango de Gráfica (1.1):** ${rangeNames[prefs.default_chart_range] || rangeNames['7d']}\n` +
                  `• **📸 Cámara del Probador (2.1):** ${cameraLabel}\n` +
                  `• **🧮 Calculadora de Economía (1.2):** ${cashbackLabel}`
        ));

        const selectPrefComfort = new StringSelectMenuBuilder()
            .setCustomId('select_pref_comfort')
            .setPlaceholder(
                isEn
                    ? '🛠️ Adjust chart timeframe, sandbox camera, or calculator...'
                    : '🛠️ Ajustar rango de gráfica, cámara del probador o calculadora...'
            )
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn ? '1.1 Price Charts: 24 Hours (24h)' : 'Gráficas 1.1: Vista de 24 Horas (24h)')
                    .setDescription(isEn ? 'Open price charts in 24-hour intraday view by default' : 'Abrir las gráficas de precios en vista intradía de 24 horas')
                    .setValue('range:24h')
                    .setEmoji('⏱️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn ? '1.1 Price Charts: 7 Days (7d)' : 'Gráficas 1.1: Vista de 7 Días (7d)')
                    .setDescription(isEn ? 'Open price charts in 7-day weekly view by default' : 'Abrir las gráficas de precios en vista semanal de 7 días')
                    .setValue('range:7d')
                    .setEmoji('📅'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn ? '1.1 Price Charts: 30 Days (30d)' : 'Gráficas 1.1: Vista de 30 Días (30d)')
                    .setDescription(isEn ? 'Open price charts in 30-day monthly view by default' : 'Abrir las gráficas de precios en vista mensual de 30 días')
                    .setValue('range:30d')
                    .setEmoji('🗓️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn ? '1.1 Price Charts: Full History (All)' : 'Gráficas 1.1: Histórico Completo')
                    .setDescription(isEn ? 'Open price charts with all recorded historical data' : 'Abrir las gráficas mostrando todo el historial registrado')
                    .setValue('range:all')
                    .setEmoji('🏛️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        prefs.default_camera_mode === 'headshot'
                            ? (isEn ? '2.1 Sandbox Camera: Switch to Full Body 3D' : 'Cámara Probador 2.1: Usar Cuerpo Completo 3D')
                            : (isEn ? '2.1 Sandbox Camera: Switch to Head/Face Zoom' : 'Cámara Probador 2.1: Usar Zoom Cabeza / Rostro')
                    )
                    .setDescription(isEn ? 'Change your starting camera view in 2.1 Outfit Sandbox' : 'Cambiar el enfoque inicial de cámara al abrir el Probador 2.1')
                    .setValue('toggle_camera')
                    .setEmoji('📸'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        prefs.auto_cashback_40 !== false
                            ? (isEn ? '1.2 Calculator: Switch to Manual Selection' : 'Calculadora 1.2: Cambiar a Selección Manual')
                            : (isEn ? '1.2 Calculator: Pre-enable 40% Group Cashback' : 'Calculadora 1.2: Pre-activar Cashback 40%')
                    )
                    .setDescription(isEn ? 'Keep 40% Group Method discount pre-selected in Calculator 1.2' : 'Dejar marcado automáticamente el ahorro de grupo (40%) en 1.2')
                    .setValue('toggle_cashback')
                    .setEmoji('🧮')
            ]);

        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectPrefComfort));
        container.addSeparatorComponents(separador(true));

        // =====================================================
        // SECCIÓN 4: IDIOMA, ALERTAS MD Y VISIBILIDAD (Botones 1-Clic)
        // =====================================================
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            isEn
                ? `### 🔔 4. Language, DM Alerts & Privacy\n` +
                  `• **🔔 Personal DM Alerts:** ${alertsBadge}\n` +
                  `• **👁️ Command Visibility:** ${privacyBadge}`
                : `### 🔔 4. Idioma, Alertas por MD y Privacidad\n` +
                  `• **🔔 Alertas por MD:** ${alertsBadge}\n` +
                  `• **👁️ Visibilidad de Comandos:** ${privacyBadge}`
        ));

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(isEn ? 'btn_pref_lang:es' : 'btn_pref_lang:en')
                    .setLabel(isEn ? 'Cambiar a Español' : 'Switch to English')
                    .setEmoji(isEn ? '🇪🇸' : '🇺🇸')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('btn_pref_toggle_alerts')
                    .setLabel(
                        prefs.dm_alerts_enabled !== false
                            ? (isEn ? 'Alerts: ON' : 'Alertas MD: ON')
                            : (isEn ? 'Alerts: DND' : 'No Molestar')
                    )
                    .setEmoji(prefs.dm_alerts_enabled !== false ? '🔔' : '🔕')
                    .setStyle(prefs.dm_alerts_enabled !== false ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('btn_pref_toggle_ephemeral')
                    .setLabel(
                        prefs.ephemeral_config
                            ? (isEn ? 'Mode: Only Me' : 'Modo: Solo Yo')
                            : (isEn ? 'Mode: Public' : 'Modo: Público')
                    )
                    .setEmoji(prefs.ephemeral_config ? '🔒' : '👁️')
                    .setStyle(prefs.ephemeral_config ? ButtonStyle.Primary : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('btn_pref_reset')
                    .setLabel(isEn ? 'Reset Defaults' : 'Restaurar')
                    .setEmoji('🔄')
                    .setStyle(ButtonStyle.Secondary)
            )
        );

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer(isEn ? 'Settings • /config' : 'Configuración • /config')
        ));

        return {
            components: [container],
            files: [],
            attachments: [],
            flags: MessageFlags.IsComponentsV2
        };
    }

    // =========================================================
    // CATEGORÍA: ADMINISTRACIÓN DEL BOT (PROPIETARIO)
    // =========================================================
    if (activeCat === 'cat_owner_bot') {
        if (!esOwner) {
            const deniedContainer = new ContainerBuilder()
                .setAccentColor(COLORES.error)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# 🔒 Acceso Exclusivo del Propietario\n` +
                    `Esta sección está reservada para el propietario del bot.`
                ))
                .addActionRowComponents(new ActionRowBuilder().addComponents(selectConfigCat))
                .addSeparatorComponents(separador())
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    footer('Configuración • /config')
                ));

            return {
                components: [deniedContainer],
                files: [],
                attachments: [],
                flags: MessageFlags.IsComponentsV2
            };
        }

        const { registerCachePurger } = require('./performanceManager');
        registerCachePurger(
            'fastLinkTempTokens',
            (aggressive) => {
                const now = Date.now();
                let removed = 0;
                for (const [k, v] of pendingRobloxVerifications.entries()) {
                    const expired = !v || !v.expiresAt || now > v.expiresAt;
                    if (expired || (aggressive && now - (v.createdAt || 0) > 10 * 60 * 1000)) {
                        pendingRobloxVerifications.delete(k);
                        removed++;
                    }
                }
                return removed;
            },
            {
                label: '🤝 Solicitudes de Verificación',
                whatItCleans: 'Solicitudes caducadas (>10 min)',
                inspectFn: () => {
                    const total = pendingRobloxVerifications.size;
                    return {
                        entries: total,
                        approxKB: total * 2,
                        detail: `${total} activa(s)`
                    };
                }
            }
        );

        const recursos = leerEstadoRecursos();
        const ownerCfg = obtenerConfigPropietario();

        const colorPanel = ownerCfg.maintenanceMode
            ? COLORES.alerta
            : (recursos.nivel === 'critico' ? COLORES.error : 0x5865F2);

        const container = new ContainerBuilder().setAccentColor(colorPanel);

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            (isEn
                ? `# 🛡️ Bot Administration\n**👑 Owner:** ${username}`
                : `# 🛡️ Administración del Bot\n**👑 Propietario:** ${username}`) +
            (feedbackMsg ? `\n\n> ${feedbackMsg}` : '')
        ));

        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectConfigCat));
        container.addSeparatorComponents(separador(true));

        const fmtMant = ownerCfg.maintenanceMode
            ? (isEn ? '🟠 Active (Owner Only)' : '🟠 Activo (Solo Propietario)')
            : (isEn ? '🟢 Disabled' : '🟢 Desactivado');
        const fmtOAuth = ownerCfg.requireDiscordOAuth
            ? (isEn ? '🟢 Web OAuth Required' : '🟢 Login Web Requerido')
            : (isEn ? '🔓 Direct Save (No Web)' : '🔓 Guardado Directo (Sin Web)');
        const fmtLoading = ownerCfg.dynamicLoadingEnabled
            ? (isEn ? '🟡 Queue Notice on Heavy Traffic' : '🟡 Aviso solo si hay Cola Real')
            : (isEn ? '⚡ Direct 1-Step Reply (Zero Overhead)' : '⚡ Respuesta Directa en 1 Paso (Sin Sobrecarga)');
        const fmtTycoon = ownerCfg.tycoonEnabled !== false
            ? (isEn ? '🟢 Active' : '🟢 Activo')
            : (isEn ? '⏸️ Paused' : '⏸️ Pausado');
        const fmtAlertsGlobal = ownerCfg.alertsEnabled !== false
            ? (isEn ? '🟢 Active (1.1 / 1.4 / 3.4)' : '🟢 Activas (1.1 / 1.4 / 3.4)')
            : (isEn ? '⏸️ Paused Globally' : '⏸️ Pausadas Globalmente');
        const presenceLabels = {
            online: isEn ? '🟢 Online' : '🟢 En línea',
            idle: isEn ? '🌙 Idle / Away' : '🌙 Ausente (Idle)',
            dnd: isEn ? '⛔ Do Not Disturb' : '⛔ No Molestar (DND)'
        };
        const fmtPresence = `${presenceLabels[ownerCfg.botPresenceStatus] || presenceLabels.online} — \`${ownerCfg.botActivityText || '/roblox • /tycoon • /help • /config'}\``;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            isEn
                ? `### ⚡ Active Mechanics & Parameters\n` +
                  `• **Discord Presence & Status:** ${fmtPresence}\n` +
                  `• **Performance & RAM:** ${recursos.limites.nombreModo} (\`${recursos.rssMB.toFixed(1)} MB\`)\n` +
                  `• **Limits per User:** Watchlist \`${ownerCfg.maxWishlistItems}\` • Sandbox \`${ownerCfg.maxSandboxItems}\` • Patches \`${ownerCfg.maxGameSubs}\`\n` +
                  `• **Auto-Scan Timers:** Prices every \`${ownerCfg.priceCheckIntervalMinutes} min\` • Robux/Patches every \`${ownerCfg.workersIntervalMinutes} min\`\n` +
                  `• **Global Background Alerts:** ${fmtAlertsGlobal}\n` +
                  `• **Personal Data Saving:** ${fmtOAuth}\n` +
                  `• **Tycoon Ecosystem (\`/tycoon\`):** ${fmtTycoon}\n` +
                  `• **Execution Mode:** ${fmtLoading}\n` +
                  `• **Maintenance Mode:** ${fmtMant}`
                : `### ⚡ Mecánicas y Parámetros Activos\n` +
                  `• **Estado del Bot en Discord:** ${fmtPresence}\n` +
                  `• **Rendimiento y RAM:** ${recursos.limites.nombreModo} (\`${recursos.rssMB.toFixed(1)} MB\`)\n` +
                  `• **Límites por Usuario:** Mi Lista \`${ownerCfg.maxWishlistItems}\` • Probador \`${ownerCfg.maxSandboxItems}\` • Parches \`${ownerCfg.maxGameSubs}\`\n` +
                  `• **Escaneo Automático:** Precios cada \`${ownerCfg.priceCheckIntervalMinutes} min\` • Robux/Parches cada \`${ownerCfg.workersIntervalMinutes} min\`\n` +
                  `• **Alertas Automáticas Globales:** ${fmtAlertsGlobal}\n` +
                  `• **Guardado de Datos:** ${fmtOAuth}\n` +
                  `• **Ecosistema Tycoon (\`/tycoon\`):** ${fmtTycoon}\n` +
                  `• **Modo de Respuesta:** ${fmtLoading}\n` +
                  `• **Mantenimiento:** ${fmtMant}`
        ));

        const selectOwnerMechanics = new StringSelectMenuBuilder()
            .setCustomId('select_owner_mechanic')
            .setPlaceholder(isEn ? '⚙️ Select a setting or mechanic to modify...' : '⚙️ Elegí un ajuste o mecánica para modificar...')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn
                        ? `Cycle Bot Discord Status (${(ownerCfg.botPresenceStatus || 'online').toUpperCase()})`
                        : `Cambiar Estado en Discord (${presenceLabels[ownerCfg.botPresenceStatus] || 'En línea'})`)
                    .setDescription(isEn
                        ? 'Switch between Online (🟢), Idle (🌙), and Do Not Disturb (⛔)'
                        : 'Alternar en vivo entre En línea (🟢), Ausente (🌙) y No Molestar (⛔)')
                    .setValue('owner_cycle_presence')
                    .setEmoji('🟢'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn
                        ? 'Edit Custom Bot Activity Text'
                        : 'Personalizar Frase de Estado del Bot')
                    .setDescription(isEn
                        ? 'Open modal to customize the activity text shown under the bot in Discord'
                        : 'Abrir ventana para cambiar el texto de actividad que muestra el bot en Discord')
                    .setValue('owner_modal_presence')
                    .setEmoji('💬'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn
                        ? `Edit User Limits (${ownerCfg.maxWishlistItems} / ${ownerCfg.maxSandboxItems} / ${ownerCfg.maxGameSubs})`
                        : `Editar Límites por Usuario (${ownerCfg.maxWishlistItems} / ${ownerCfg.maxSandboxItems} / ${ownerCfg.maxGameSubs})`)
                    .setDescription(isEn
                        ? 'Open modal to set exact limits for Watchlist, Sandbox, and Patch Alerts'
                        : 'Abrir ventana para cambiar el tope de Mi Lista, Probador y Parches')
                    .setValue('owner_modal_limits')
                    .setEmoji('📏'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn
                        ? `Edit Scan Intervals (${ownerCfg.priceCheckIntervalMinutes}m / ${ownerCfg.workersIntervalMinutes}m)`
                        : `Editar Intervalos de Escaneo (${ownerCfg.priceCheckIntervalMinutes}m / ${ownerCfg.workersIntervalMinutes}m)`)
                    .setDescription(isEn
                        ? 'Open modal to set exact minutes for price, Robux, and patch checks'
                        : 'Abrir ventana para ajustar cada cuántos minutos revisa precios y parches')
                    .setValue('owner_modal_intervals')
                    .setEmoji('⏱️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn
                        ? `Global Auto-Alerts (${ownerCfg.alertsEnabled !== false ? 'Pause' : 'Enable'})`
                        : `Alertas Automáticas Globales (${ownerCfg.alertsEnabled !== false ? 'Pausar' : 'Activar'})`)
                    .setDescription(isEn
                        ? 'Pause or resume automatic background notifications (1.1, 1.4, 3.4)'
                        : 'Pausar o reanudar el envío global de avisos automáticos (1.1, 1.4, 3.4)')
                    .setValue('owner_toggle_alerts')
                    .setEmoji('🔔'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn
                        ? `Tycoon Module /tycoon (${ownerCfg.tycoonEnabled !== false ? 'Pause' : 'Enable'})`
                        : `Módulo /tycoon (${ownerCfg.tycoonEnabled !== false ? 'Pausar' : 'Activar'})`)
                    .setDescription(isEn
                        ? 'Enable or temporarily pause the /tycoon economy and studio command'
                        : 'Activar o pausar temporalmente el comando /tycoon')
                    .setValue('owner_toggle_tycoon')
                    .setEmoji('🏭'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn
                        ? 'Moderate / Delete Abusive UGC Item (/tycoon)'
                        : 'Moderar / Eliminar Ítem UGC (/tycoon)')
                    .setDescription(isEn
                        ? 'Open modal to remove a community UGC item from the catalog by ID or name'
                        : 'Abrir ventana para borrar un ítem UGC de la comunidad por ID o nombre')
                    .setValue('owner_modal_ugc_mod')
                    .setEmoji('🎨'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn
                        ? `Discord Web Login (${ownerCfg.requireDiscordOAuth ? 'Switch to Direct Save' : 'Require Web OAuth'})`
                        : `Login Web Discord (${ownerCfg.requireDiscordOAuth ? 'Permitir Guardado Directo' : 'Exigir Login Web'})`)
                    .setDescription(isEn
                        ? 'Allow saving items directly by Discord ID or require web OAuth login'
                        : 'Permitir guardar en Mi Lista/Parches sin ir a la web o exigir login OAuth')
                    .setValue('owner_toggle_discord_oauth')
                    .setEmoji('🔐'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn
                        ? `Queue Notice on Heavy Load (${ownerCfg.dynamicLoadingEnabled ? 'Disable' : 'Enable'})`
                        : `Aviso de Cola en Tráfico Alto (${ownerCfg.dynamicLoadingEnabled ? 'Desactivar' : 'Activar'})`)
                    .setDescription(isEn
                        ? 'Toggle between direct 1-step reply or showing a queue notice when slots are full'
                        : 'Alternar entre respuesta directa en 1 paso o mostrar aviso si hay cola real')
                    .setValue('owner_toggle_loading')
                    .setEmoji('⚡'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn
                        ? `Performance Mode (${ownerCfg.engineMode.toUpperCase()})`
                        : `Modo de Rendimiento (${ownerCfg.engineMode.toUpperCase()})`)
                    .setDescription(isEn
                        ? 'Cycle between Auto, Eco, and High Performance'
                        : 'Alternar entre Automático, Ahorro y Alto Rendimiento')
                    .setValue('owner_cycle_engine')
                    .setEmoji('🎛️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn
                        ? `Maintenance Mode (${ownerCfg.maintenanceMode ? 'Disable' : 'Enable'})`
                        : `Modo Mantenimiento (${ownerCfg.maintenanceMode ? 'Desactivar' : 'Activar'})`)
                    .setDescription(isEn
                        ? 'Temporarily restrict bot commands to the owner only'
                        : 'Restringir temporalmente el bot solo al propietario')
                    .setValue('owner_toggle_maintenance')
                    .setEmoji('🛠️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn
                        ? 'Reset Bot Parameters to Safe Defaults'
                        : 'Restaurar Parámetros del Bot por Defecto')
                    .setDescription(isEn
                        ? 'Restore limits, intervals, presence, and engine settings to factory defaults'
                        : 'Restablecer límites, intervalos, estado y rendimiento a los valores óptimos')
                    .setValue('owner_reset_defaults')
                    .setEmoji('🔄')
            ]);

        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectOwnerMechanics));
        container.addSeparatorComponents(separador(true));

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_owner_scan_now', isEn ? 'Scan Now' : 'Escanear Ahora', '⚡', ButtonStyle.Success),
                boton('btn_owner_optimize_ram', isEn ? 'Clear Cache' : 'Limpiar Caché', '🧹', ButtonStyle.Primary),
                boton(
                    'btn_owner_toggle_maintenance',
                    ownerCfg.maintenanceMode
                        ? (isEn ? 'Exit Maintenance' : 'Salir Mantenimiento')
                        : (isEn ? 'Maintenance' : 'Mantenimiento'),
                    '🛠️',
                    ownerCfg.maintenanceMode ? ButtonStyle.Danger : ButtonStyle.Secondary
                ),
                boton('btn_owner_refresh', isEn ? 'Refresh' : 'Actualizar', '🔄', ButtonStyle.Secondary)
            )
        );

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer(isEn ? 'Bot Administration • /config' : 'Administración • /config')
        ));

        return {
            components: [container],
            files: [],
            attachments: [],
            flags: MessageFlags.IsComponentsV2
        };
    }

    // =========================================================
    // CATEGORÍA 1: CUENTAS Y DATOS GUARDADOS (USUARIOS)
    // =========================================================
    const cfg = await verificarAutorizacionDiscordOAuth(uid);
    const cuentaRoblox = await verificarAutorizacionRobloxOAuth(uid).catch(() => null);
    const pendingRoblox = obtenerVerificacionPendienteRoblox(uid);
    const webDiscordChallenge = generarCodigoVinculacionDiscord(uid, discordUser);
    const resumen = await obtenerHistorialYEstadoCuenta(uid).catch(() => null);
    const baseAppUrl = obtenerUrlBasePublica();
    const directDiscordOAuthUrl = `${baseAppUrl}/api/auth/discord/redirect?discord_id=${encodeURIComponent(uid)}`;
    const directRobloxOAuthUrl = `${baseAppUrl}/api/auth/roblox/redirect?discord_id=${encodeURIComponent(uid)}`;

    const tieneDiscord = Boolean(cfg && cfg.oauth_verified);
    const tieneRoblox = Boolean(cuentaRoblox && cuentaRoblox.roblox_user_id);
    const ambasConectadas = tieneDiscord && tieneRoblox;
    const algunaConectada = tieneDiscord || tieneRoblox;

    const colorBorde = pendingRoblox
        ? COLORES.alerta
        : ambasConectadas
            ? 0x23A55A
            : (algunaConectada ? 0x5865F2 : 0x4E5058);

    const container = new ContainerBuilder().setAccentColor(colorBorde);

    const badgeResumenSuperior = ambasConectadas
        ? (isEn ? '🟢 **Discord & Roblox connected**' : '🟢 **Discord y Roblox conectadas**')
        : algunaConectada
            ? (isEn
                ? `🟡 **${tieneDiscord ? 'Discord connected • Roblox unlinked' : 'Roblox connected • Discord unlinked'}**`
                : `🟡 **${tieneDiscord ? 'Discord conectada • Falta Roblox' : 'Roblox conectada • Falta Discord'}**`)
            : (isEn ? '🔴 **No accounts linked**' : '🔴 **Sin cuentas vinculadas**');

    const headerText = new TextDisplayBuilder().setContent(
        (isEn
            ? `# ⚙️ User Settings\n${badgeResumenSuperior}`
            : `# ⚙️ Configuración\n${badgeResumenSuperior}`) +
        (feedbackMsg ? `\n\n> ${feedbackMsg}` : '')
    );

    const thumbCandidata =
        (tieneRoblox && (cuentaRoblox.avatar_url || cuentaRoblox.avatar_full_url)) ||
        avatarUrl ||
        cfg.discord_avatar ||
        null;

    if (thumbCandidata && /^https?:\/\//i.test(String(thumbCandidata))) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(headerText)
                .setThumbnailAccessory(thumb => thumb.setURL(String(thumbCandidata)))
        );
    } else {
        container.addTextDisplayComponents(headerText);
    }

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectConfigCat));
    container.addSeparatorComponents(separador(true));

    // 1. CUENTA DE DISCORD (Aloja aquí mismo el código KTX-XXXXXX para conectar en la Web)
    const webCodeNoteEs = webDiscordChallenge?.code
        ? `\n🔑 **Tu código de verificación para conectar tu ID (\`${uid}\`) en la Web:** \`${webDiscordChallenge.code}\` *(alojado aquí en \`/config\` para tu comodidad y privacidad)*`
        : '';
    const webCodeNoteEn = webDiscordChallenge?.code
        ? `\n🔑 **Your verification code to link your ID (\`${uid}\`) on the Web:** \`${webDiscordChallenge.code}\` *(hosted right here in \`/config\` for privacy & convenience)*`
        : '';

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                isEn
                    ? `### 💬 1. Discord Account\n` +
                      (tieneDiscord
                          ? `🟢 **Connected:** \`@${cfg.discord_username || username}\`\n-# Linked to your personal settings and saved watchlists. Permissions are managed in **Settings → App Permissions / Authorized Apps**.${webCodeNoteEn}`
                          : `🔴 **Not connected**\n-# Click the button on the right to activate your Discord account here and generate your web code.${webCodeNoteEn}`)
                    : `### 💬 1. Cuenta de Discord\n` +
                      (tieneDiscord
                          ? `🟢 **Conectada:** \`@${cfg.discord_username || username}\`\n-# Sincronizada con tus preferencias y datos del bot. Los permisos están alojados en **Configuración → Permisos de la aplicación**.${webCodeNoteEs}`
                          : `🔴 **Sin conectar**\n-# Tocá el botón de la derecha para activar tu cuenta de Discord acá mismo y generar tu código web.${webCodeNoteEs}`)
            ))
            .setButtonAccessory(
                boton(
                    'btn_config_direct_discord',
                    tieneDiscord
                        ? (isEn ? 'New Web Code' : 'Renovar Código')
                        : (isEn ? 'Connect Discord' : 'Conectar Discord'),
                    tieneDiscord ? '🔑' : '⚡',
                    tieneDiscord ? ButtonStyle.Secondary : ButtonStyle.Primary
                )
            )
    );

    container.addSeparatorComponents(separador());

    // 2. CUENTA DE ROBLOX (La autorización y desvinculación están alojadas en Configuración -> Permisos de la aplicación)
    const pendingRobloxNoteEs = pendingRoblox && pendingRoblox.profile
        ? `\n🛡️ **Verificación pendiente para \`@${pendingRoblox.profile.roblox_username}\`:** Pegá \`${pendingRoblox.robloxProfileVerifyPhrase}\` en "Acerca de" de tu perfil en Roblox y tocá **✅ Comprobar Verificación**.`
        : '';
    const pendingRobloxNoteEn = pendingRoblox && pendingRoblox.profile
        ? `\n🛡️ **Pending verification for \`@${pendingRoblox.profile.roblox_username}\`:** Paste \`${pendingRoblox.robloxProfileVerifyPhrase}\` in your Roblox profile "About" and click **✅ Verify Now**.`
        : '';

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                isEn
                    ? `### 🎮 2. Roblox Account\n` +
                      (tieneRoblox
                          ? `🟢 **Connected:** **${cuentaRoblox.display_name || cuentaRoblox.roblox_username}** (\`@${cuentaRoblox.roblox_username}\`)\n-# Where the bot and permissions are located in Roblox: **Settings → App Permissions** (*Configuración → Permisos de la aplicación*).${pendingRobloxNoteEn}`
                          : `🔴 **Not linked**\n-# Click the button on the right to link by **@Username / ID** with profile code verification. App permissions live in **Settings → App Permissions**.${pendingRobloxNoteEn}`)
                    : `### 🎮 2. Cuenta de Roblox\n` +
                      (tieneRoblox
                          ? `🟢 **Conectada:** **${cuentaRoblox.display_name || cuentaRoblox.roblox_username}** (\`@${cuentaRoblox.roblox_username}\`)\n-# En Roblox, donde está alojado el bot y sus permisos para gestionar o desvincular tu cuenta es en **Configuración → Permisos de la aplicación**.${pendingRobloxNoteEs}`
                          : `🔴 **Sin vincular**\n-# Tocá el botón de la derecha para vincular por **@Usuario / ID** con código de propiedad. En Roblox los permisos se alojan en **Configuración → Permisos de la aplicación**.${pendingRobloxNoteEs}`)
            ))
            .setButtonAccessory(
                boton(
                    'btn_fastlink_open_modal',
                    tieneRoblox
                        ? (isEn ? 'Change Roblox' : 'Cambiar Roblox')
                        : (isEn ? 'Link Roblox' : 'Vincular Roblox'),
                    '🎮',
                    tieneRoblox ? ButtonStyle.Secondary : ButtonStyle.Primary
                )
            )
    );

    if (pendingRoblox && pendingRoblox.profile) {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_fastlink_verify_now', isEn ? 'Verify Now' : 'Comprobar Verificación', '✅', ButtonStyle.Success),
                boton('btn_fastlink_cancel_verify', isEn ? 'Cancel' : 'Cancelar', '✖️', ButtonStyle.Secondary)
            )
        );
    }

    container.addSeparatorComponents(separador());

    // 3. DATOS GUARDADOS (Enfocado en datos permanentes de valor real: Mi Lista 1.1, Estudio /tycoon y Preferencias Activas)
    const ownerLimits = obtenerConfigPropietario();
    const maxWishlist = Number(ownerLimits.maxWishlistItems || MAX_WISHLIST_ITEMS);

    let wishlistItemsDirect = Array.isArray(resumen?.savedItems?.wishlist) ? resumen.savedItems.wishlist : [];
    if (wishlistItemsDirect.length === 0) {
        try {
            const { data: wlRows } = await supabase.from('roblox_wishlist').select('*').eq('user_id', uid);
            if (Array.isArray(wlRows)) {
                wishlistItemsDirect = wlRows.slice(0, maxWishlist).map(i => ({
                    id: i.id_objet,
                    name: i.item_name,
                    price: i.last_price,
                    targetPrice: i.target_price
                }));
            }
        } catch {
            // Silencioso
        }
    }
    const wishlistCount = Math.max(Number(resumen?.stats?.wishlistCount || 0), wishlistItemsDirect.length);

    const wishlistSummaryLine = wishlistItemsDirect.length > 0
        ? wishlistItemsDirect.slice(0, 3).map((item) => {
            const nombreCorto = String(item.name || `ID ${item.id}`).slice(0, 26);
            const metaTxt = item.targetPrice ? ` → 🎯 ${Number(item.targetPrice).toLocaleString('en-US')} R$` : '';
            return `\`${nombreCorto}\` (${Number(item.price || 0).toLocaleString('en-US')} R$${metaTxt})`;
        }).join(' • ') + (wishlistItemsDirect.length > 3 ? ` *(+${wishlistItemsDirect.length - 3})*` : '')
        : (isEn
            ? '*No items tracked yet in `1.1 Price Tracker & Watchlist`.*'
            : '*Sin ítems monitoreados actualmente en `1.1 Seguimiento de Precios y Mi Lista`.*');

    // Progreso guardado en /tycoon (si existe perfil en memoria/disco)
    const tycoonRows = Array.isArray(supabase.memoryTables?.tycoon_profiles) ? supabase.memoryTables.tycoon_profiles : [];
    const tycoonProfile = tycoonRows.find(r => r && String(r.user_id) === uid) || null;
    const tycoonLine = tycoonProfile
        ? (isEn
            ? `🏭 **Studio Progress (\`/tycoon\`):** Level \`${tycoonProfile.studio_level || 1}/6\`  •  ♻️ Rebirth \`x${tycoonProfile.rebirths || 0}\`  •  🎟️ \`${Number(tycoonProfile.tix || 0).toLocaleString('en-US')} Tix\`  •  💠 \`${Number(tycoonProfile.kortex_crystals || 0).toLocaleString('en-US')}\``
            : `🏭 **Estudio Tycoon (\`/tycoon\`):** Nivel \`${tycoonProfile.studio_level || 1}/6\`  •  ♻️ Rebirth \`x${tycoonProfile.rebirths || 0}\`  •  🎟️ \`${Number(tycoonProfile.tix || 0).toLocaleString('en-US')} Tix\`  •  💠 \`${Number(tycoonProfile.kortex_crystals || 0).toLocaleString('en-US')}\``)
        : (isEn
            ? `🏭 **Studio Progress (\`/tycoon\`):** *Not started yet — run \`/tycoon\` to open your studio*`
            : `🏭 **Estudio Tycoon (\`/tycoon\`):** *Sin iniciar — ejecutá \`/tycoon\` para abrir tu estudio*`);

    const tierMapSaved = TIER_LABELS[isEn ? 'en' : 'es'] || TIER_LABELS.es;
    const activeTierShort = tierMapSaved[prefs.default_tier] || tierMapSaved.TIER_100;
    const catShortNames = isEn
        ? {
            cat_economy: '💰 1. Economy',
            cat_avatar: '👕 2. Avatars',
            cat_games: '🎮 3. Games',
            cat_status: '📊 4. Analytics'
        }
        : {
            cat_economy: '💰 1. Economía',
            cat_avatar: '👕 2. Avatares',
            cat_games: '🎮 3. Juegos',
            cat_status: '📊 4. Estadísticas'
        };

    const textoBoveda = isEn
        ? `### 🗂️ 3. Saved Account Data\n` +
          `• 🎯 **My Watchlist (\`1.1\`):** \`${wishlistCount}/${maxWishlist}\` — ${wishlistSummaryLine}\n` +
          `• ${tycoonLine}\n` +
          `• ⚙️ **Saved Preferences:** ${isEn ? '🇺🇸 English' : '🇪🇸 Español'}  •  ${activeTierShort}  •  Start in ${catShortNames[prefs.default_category] || catShortNames.cat_economy}`
        : `### 🗂️ 3. Datos Guardados\n` +
          `• 🎯 **Mi Lista de Seguimiento (\`1.1\`):** \`${wishlistCount}/${maxWishlist}\` — ${wishlistSummaryLine}\n` +
          `• ${tycoonLine}\n` +
          `• ⚙️ **Preferencias Guardadas:** ${isEn ? '🇺🇸 English' : '🇪🇸 Español'}  •  ${activeTierShort}  •  Inicio en ${catShortNames[prefs.default_category] || catShortNames.cat_economy}`;

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(textoBoveda));

    container.addSeparatorComponents(separador(true));

    // 4. BARRA INFERIOR DE CONTROLES (Limpia: solo Actualizar + Panel Web, sin duplicar botones 1 y 2 ni desvincular)
    const filaBotonesInferior = [
        boton(
            'btn_config_refresh',
            isEn ? 'Refresh' : 'Actualizar',
            '🔄',
            ButtonStyle.Success
        ),
        new ButtonBuilder()
            .setLabel(isEn ? 'Web Dashboard' : 'Panel Web')
            .setEmoji('🌐')
            .setStyle(ButtonStyle.Link)
            .setURL(baseAppUrl)
    ];

    container.addActionRowComponents(new ActionRowBuilder().addComponents(filaBotonesInferior));

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer(isEn ? 'Settings • /config' : 'Configuración • /config')
    ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

/**
 * Activa y verifica la cuenta de Discord del usuario directamente desde su interacción autenticada en Discord
 * o desde el verificador del bot sin depender de redirecciones externas.
 */
async function activarSesionDiscordDirecta(discordUser) {
    const uid = String(discordUser?.id || '').trim();
    if (!uid) return null;
    const username = discordUser?.globalName || discordUser?.global_name || discordUser?.username || 'Usuario';
    const tag = discordUser?.username || username;
    const avatarUrl = typeof discordUser?.displayAvatarURL === 'function'
        ? discordUser.displayAvatarURL({ extension: 'png', size: 256 })
        : (discordUser?.avatar
            ? `https://cdn.discordapp.com/avatars/${uid}/${discordUser.avatar}.png?size=256`
            : (discordUser?.avatarUrl || null));

    await migrarDatosDeSesion('default_session', uid);

    const saved = guardarConfigDiscord(uid, {
        discord_username: username,
        discord_tag: tag,
        discord_avatar: avatarUrl,
        oauth_verified: true,
        verified_at: new Date().toISOString()
    });

    registrarEventoHistorialCuenta(uid, {
        category: 'discord',
        title: `Cuenta de Discord conectada: @${username}`,
        detail: `ID ${uid} • Verificación directa activa`
    });

    return saved;
}

/**
 * PANEL DE DESBLOQUEO DE FUNCIÓN:
 */
function construirPanelDesbloqueoRequerido({
    tipo = 'discord',
    userId,
    nombreHerramienta = 'Esta función',
    motivo = '',
    backButtonId = 'btn_nav_main_menu',
    backLabel = 'Volver Atrás'
}) {
    const {
        ContainerBuilder,
        SectionBuilder,
        TextDisplayBuilder,
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
        MessageFlags
    } = require('discord.js');
    const { footer, separador, boton } = require('../../utils/ui');

    const uid = String(userId || '');
    const baseAppUrl = obtenerUrlBasePublica();

    if (tipo === 'roblox') {
        const directRobloxOAuthUrl = `${baseAppUrl}/api/auth/roblox/redirect?discord_id=${encodeURIComponent(uid)}`;
        const container = new ContainerBuilder()
            .setAccentColor(0xF0B232)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# 🔓 Cuenta Requerida: ${nombreHerramienta}\n` +
                `${motivo || 'Para cargar los datos de tu propio personaje necesitás vincular tu cuenta de Roblox.'}`
            ))
            .addSeparatorComponents(separador(true))
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `### 🎮 Vincular Cuenta de Roblox\n` +
                        `Podés vincularla verificando tu propiedad por **@Usuario / ID** o desde el portal web.`
                    ))
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setLabel('Portal Web / OAuth')
                            .setEmoji('🌐')
                            .setStyle(ButtonStyle.Link)
                            .setURL(directRobloxOAuthUrl)
                    )
            )
            .addSeparatorComponents(separador(true))
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    boton('btn_fastlink_open_modal', 'Vincular @Usuario / ID', '🎮', ButtonStyle.Primary),
                    boton('btn_fastlink_modal', 'Mi Cuenta Roblox', '👤', ButtonStyle.Success),
                    boton(backButtonId, backLabel, '⬅️', ButtonStyle.Secondary)
                )
            )
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                footer('También disponible en /config')
            ));

        return {
            components: [container],
            files: [],
            attachments: [],
            flags: MessageFlags.IsComponentsV2
        };
    }

    const directDiscordOAuthUrl = `${baseAppUrl}/api/auth/discord/redirect?discord_id=${encodeURIComponent(uid)}`;
    const container = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🔓 Cuenta Requerida: ${nombreHerramienta}\n` +
            `${motivo || 'Para guardar tus datos y enviarte alertas necesitás conectar tu cuenta de Discord.'}`
        ))
        .addSeparatorComponents(separador(true))
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `### 💬 Conectar Cuenta de Discord\n` +
                    `Tocá **⚡ Activar Mi Cuenta Aquí (1 Clic)** abajo o conectala desde el portal web.`
                ))
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setLabel('Portal Web / OAuth')
                        .setEmoji('🔗')
                        .setStyle(ButtonStyle.Link)
                        .setURL(directDiscordOAuthUrl)
                )
        )
        .addSeparatorComponents(separador(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_config_direct_discord', 'Activar Mi Cuenta Aquí (1 Clic)', '⚡', ButtonStyle.Primary),
                boton(backButtonId, backLabel, '⬅️', ButtonStyle.Secondary)
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer('También disponible en /config')
        ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

/**
 * Agrega un activo a `Mi Lista (máx. 5)` del Seguimiento de Precios
 */
async function agregarItemAWishlistRapido(discordId, { idObjet, itemName, itemType = 'catalog', price = 0, targetPrice = null, guildId = 'DM' }) {
    const userId = String(discordId);
    const idStr = String(idObjet);

    const { data: existentes, error: countErr } = await supabase
        .from('roblox_wishlist')
        .select('id, id_objet, item_name, last_price, target_price')
        .eq('user_id', userId);

    if (countErr) {
        return { ok: false, motivo: 'Error al consultar tu lista de monitoreo.' };
    }

    const { obtenerConfigPropietario } = require('./performanceManager');
    const maxItems = Number(obtenerConfigPropietario().maxWishlistItems || MAX_WISHLIST_ITEMS);

    const lista = existentes || [];
    const itemExistente = lista.find(i => String(i.id_objet) === idStr);
    if (itemExistente) {
        return {
            ok: true,
            alreadyExists: true,
            totalActual: lista.length,
            maxItems,
            item: itemExistente,
            motivo: `El objeto **${itemName || itemExistente.item_name}** ya está en tu **Mi Lista**.`
        };
    }

    if (lista.length >= maxItems) {
        return {
            ok: false,
            motivo: `Tu **Mi Lista** ya alcanzó el límite máximo de **${maxItems}/${maxItems}** objetos.`
        };
    }

    let finalPrice = Number(price || 0);
    let finalName = itemName;
    if (finalPrice <= 0 || !finalName) {
        try {
            const { obtenerDetallesCompletos } = require('../../utils/roblox');
            const det = await obtenerDetallesCompletos(idStr).catch(() => null);
            if (det) {
                if (!finalName || finalName.startsWith('Objeto ') || finalName.startsWith('Alternativa ')) {
                    finalName = det.name || finalName;
                }
                if (det.price && Number(det.price) > 0) {
                    finalPrice = Number(det.price);
                } else if (det.lowestResalePrice && Number(det.lowestResalePrice) > 0) {
                    finalPrice = Number(det.lowestResalePrice);
                }
            }
        } catch (_) {}
    }

    const ahoraIso = new Date().toISOString();
    const initialHistory = [{ price: finalPrice, timestamp: ahoraIso }];

    const nuevoRegistro = {
        user_id: userId,
        guild_id: String(guildId || 'DM'),
        id_objet: idStr,
        item_name: finalName || `Objeto ${idStr}`,
        item_type: itemType,
        last_price: finalPrice,
        target_price: targetPrice !== null ? Number(targetPrice) : null,
        is_paused: false,
        price_history: initialHistory
    };

    const { error: insertErr } = await supabase
        .from('roblox_wishlist')
        .insert([nuevoRegistro]);

    if (insertErr) {
        return { ok: false, motivo: `No se pudo guardar en tu lista: ${insertErr.message}` };
    }

    registrarEventoHistorialCuenta(userId, {
        category: 'tool',
        title: `Objeto guardado en Mi Lista: ${nuevoRegistro.item_name}`,
        detail: `ID ${idStr} • Precio base: ${nuevoRegistro.last_price} R$`
    });

    await PriceItem.recordPrice(idStr, nuevoRegistro.item_name, nuevoRegistro.last_price, {
        existingHistory: initialHistory,
        createdAt: ahoraIso
    }).catch(() => null);

    return {
        ok: true,
        totalActual: lista.length + 1,
        maxItems,
        item: nuevoRegistro
    };
}

module.exports = {
    MAX_WISHLIST_ITEMS,
    DEFAULT_APP_URL,
    normalizarUrlPublica,
    setDetectedPublicAppUrl,
    obtenerUrlBasePublica,
    activarSesionDiscordDirecta,
    fastLinkCache,
    discordConfigCache,
    accountHistoryCache,
    pendingRobloxVerifications,
    recentlyAutoVerifiedRoblox,
    pendingDiscordVerifications,
    discordVerifyCooldowns,
    blockedWebDiscordIds,
    robloxTargetCooldowns,
    usuarioInteractuoConBot,
    verificarMiembroMutuoDiscord,
    generarCodigoVinculacionDiscord,
    obtenerVerificacionPendienteDiscord,
    iniciarVerificacionDiscordWeb,
    confirmarVerificacionDiscordWeb,
    procesarAccionSeguridadDiscordWeb,
    verificarFraseEnPerfilRoblox,
    onAccountLinked,
    resolverUsuarioRoblox,
    obtenerCuentaVinculada,
    obtenerCuentaVinculadaSync,
    guardarCuentaVinculada,
    eliminarCuentaVinculada,
    obtenerEstadoCuentaBotRoblox,
    conectarCuentaBotRoblox,
    obtenerListaAmigosBotRoblox,
    eliminarAmigoDeCuentaBotRoblox,
    limpiarListaAmigosBotRoblox,
    iniciarVerificacionCodigoRoblox,
    confirmarVerificacionCodigoRoblox,
    cancelarVerificacionCodigoRoblox,
    obtenerVerificacionPendienteRoblox,
    obtenerVerificacionRobloxPendiente: obtenerVerificacionPendienteRoblox,
    obtenerConfigDiscord,
    guardarConfigDiscord,
    persistirConfigDiscordEnSupabase,
    persistirCuentaVinculadaEnSupabase,
    persistirHistorialEnSupabase,
    sincronizarPersistenciaDesdeSupabase,
    verificarAutorizacionDiscordOAuth,
    verificarAutorizacionRobloxOAuth,
    registrarEventoHistorialCuenta,
    obtenerHistorialCuenta,
    obtenerHistorialYEstadoCuenta,
    migrarDatosDeSesion,
    restaurarRespaldoCliente,
    construirPanelVinculacionCuenta,
    construirPanelConfigDiscord,
    construirPanelDesbloqueoRequerido,
    agregarItemAWishlistRapido,
    obtenerConfigPropietario
};
