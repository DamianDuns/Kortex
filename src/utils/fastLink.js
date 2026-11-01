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
const LOCAL_STORE_DIR = path.join(__dirname, '../../data');
const LOCAL_LINKS_FILE = path.join(LOCAL_STORE_DIR, 'user_links.json');
const DISCORD_CONFIG_FILE = path.join(LOCAL_STORE_DIR, 'discord_configs.json');
const ACCOUNT_HISTORY_FILE = path.join(LOCAL_STORE_DIR, 'account_history.json');
const ROBLOX_BOT_ACCOUNT_FILE = path.join(LOCAL_STORE_DIR, 'roblox_bot_account.json');

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
    } catch {
        // Silencioso
    }
}

/**
 * 1. Carga y guardado de Cuentas de Roblox en disco + snapshot DB
 */
function cargarLinksDesdeDisco() {
    try {
        ensureStoreDir();
        if (fs.existsSync(LOCAL_LINKS_FILE)) {
            const raw = fs.readFileSync(LOCAL_LINKS_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                for (const [discordId, data] of Object.entries(parsed)) {
                    if (data && data.roblox_user_id) {
                        fastLinkCache.set(String(discordId), data);
                    }
                }
            }
        }
        // Hidratar también desde memoryTables.user_links de db.js si había registros
        const dbLinks = supabase.memoryTables?.user_links || [];
        for (const row of dbLinks) {
            if (row && row.discord_id && row.roblox_user_id && !fastLinkCache.has(String(row.discord_id))) {
                fastLinkCache.set(String(row.discord_id), row);
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
        fs.writeFileSync(LOCAL_LINKS_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
        console.warn('[FAST-LINK] No se pudo escribir data/user_links.json:', err.message);
    }
}

/**
 * 2. Carga y guardado de Sesiones de Discord en disco + snapshot DB
 */
function cargarConfigsDiscordDesdeDisco() {
    try {
        ensureStoreDir();
        if (fs.existsSync(DISCORD_CONFIG_FILE)) {
            const raw = fs.readFileSync(DISCORD_CONFIG_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                for (const [discordId, cfg] of Object.entries(parsed)) {
                    if (cfg && (cfg.oauth_verified || cfg.discord_username || cfg.language_selected || cfg.lang || cfg.default_tier)) {
                        discordConfigCache.set(String(discordId), cfg);
                    }
                }
            }
        }
        const dbConfigs = supabase.memoryTables?.discord_configs || [];
        for (const row of dbConfigs) {
            if (row && row.discord_id && !discordConfigCache.has(String(row.discord_id))) {
                discordConfigCache.set(String(row.discord_id), row);
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
        fs.writeFileSync(DISCORD_CONFIG_FILE, JSON.stringify(obj, null, 2), 'utf8');
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

// Inicializar las 3 cachés desde disco al arrancar el bot
cargarLinksDesdeDisco();
cargarConfigsDiscordDesdeDisco();
cargarHistorialDesdeDisco();

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

    // Si se consultó con un ID nuevo pero existe una cuenta única en default_session, recuperarla
    if (key !== 'default_session') {
        const fallbackDefault = fastLinkCache.get('default_session');
        if (fallbackDefault && fallbackDefault.roblox_user_id && fastLinkCache.size === 1) {
            return fallbackDefault;
        }
    }

    return null;
}

function obtenerCuentaVinculadaSync(discordId) {
    if (!discordId) return null;
    const key = String(discordId);
    return fastLinkCache.get(key) || fastLinkCache.get('default_session') || null;
}

function obtenerConfigDiscord(discordId) {
    const key = String(discordId || '');
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
        ephemeral_config: Boolean(saved.ephemeral_config),
        dm_alerts_enabled: saved.dm_alerts_enabled !== false,
        updated_at: saved.updated_at || null
    };
}

function guardarConfigDiscord(discordId, partialConfig) {
    const key = String(discordId || '');
    const current = obtenerConfigDiscord(key);
    const updated = {
        ...current,
        ...partialConfig,
        discord_id: key,
        updated_at: new Date().toISOString()
    };
    discordConfigCache.set(key, updated);
    guardarConfigsDiscordEnDisco();
    return updated;
}

/**
 * Verifica el estado de la sesión de Discord preservando siempre la sesión guardada
 * cuando el bot se actualiza o cuando el access_token temporal caduca.
 */
async function verificarAutorizacionDiscordOAuth(discordId, { checkRemoteRevocation = false } = {}) {
    const key = String(discordId || '');
    if (!key) return obtenerConfigDiscord('');
    const current = obtenerConfigDiscord(key);

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
        avatar_url: profileData.avatar_url || prev.avatar_url || null,
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
        discordConfigCache.delete(key);
        guardarConfigsDiscordEnDisco();
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
    pendingRobloxVerifications.delete(key);
    return true;
}

/**
 * Inicia el proceso de vinculación rápida en Roblox:
 * - Si la cuenta del Bot está conectada, le envía una Solicitud de Amistad en Roblox al usuario destino.
 * - Apenas el usuario acepta la solicitud de amistad, el sistema verifica su cuenta automáticamente y lo elimina de amigos.
 * - Incluye también el código de respaldo `KORTEX-XXXX` en la descripción por si el usuario prefiere verificar por biografía.
 */
async function iniciarVerificacionCodigoRoblox(discordId, robloxInput) {
    const key = String(discordId || 'default_session').trim();
    const raw = String(robloxInput || '').trim();
    if (!raw) {
        return { ok: false, message: 'Escribí tu nombre de usuario o ID de Roblox primero.' };
    }

    const resolved = await resolverUsuarioRoblox(raw);
    if (!resolved || !resolved.roblox_user_id) {
        return { ok: false, message: `No se encontró ningún usuario de Roblox con "${raw}". Verificá el nombre o ID.` };
    }

    const robloxProfileVerifyPhrase = `KORTEX-${Math.floor(1000 + Math.random() * 9000)}`;
    const createdAt = Date.now();
    const expiresAt = createdAt + 10 * 60 * 1000; // 10 minutos

    const delivery = await enviarSolicitudAmistadEnRoblox(resolved, robloxProfileVerifyPhrase);
    const botAccount = delivery.botAccount || obtenerEstadoCuentaBotRoblox();

    // Si ya eran amigos o tenía solicitud entrante previa, verificar y auto-eliminar de amigos en el acto
    if (delivery.alreadyFriends) {
        await eliminarAmigoDeCuentaBotRoblox(resolved.roblox_user_id).catch(() => null);
        robloxBotAccountState.verified_by_friendship_count = Number(robloxBotAccountState.verified_by_friendship_count || 0) + 1;
        guardarCuentaBotRobloxEnDisco();

        const saved = await guardarCuentaVinculada(key, {
            ...resolved,
            auth_method: 'roblox_friendship',
            roblox_oauth_verified: false,
            roblox_access_token: null
        });

        return {
            ok: true,
            step: 'verified',
            discordId: key,
            linkedAccount: saved,
            profile: resolved,
            robloxMessageDelivered: true,
            deliveryChannel: 'roblox_friend_instant',
            message: `✅ ¡Solicitud de amistad detectada! Cuenta **@${saved.roblox_username}** verificada automáticamente y eliminada de la lista de amigos de **@${botAccount.roblox_username}** para mantener limpio el cupo.`
        };
    }

    const botProfileUrl = botAccount.roblox_user_id
        ? `https://www.roblox.com/users/${botAccount.roblox_user_id}/profile`
        : 'https://www.roblox.com/users/friends#!/friend-requests';

    const safePublicMetadata = {
        sender: botAccount.connected
            ? `Bot Verificador en Roblox: @${botAccount.roblox_username} (ID ${botAccount.roblox_user_id})`
            : 'Verificador en Plataforma Roblox',
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
    if (delivery.delivered && delivery.channel === 'roblox_friend_request') {
        statusMessage =
            `🤝 La cuenta de Roblox del bot (**@${botAccount.roblox_username}**) le envió una **Solicitud de Amistad en Roblox** a **@${resolved.roblox_username}**. ` +
            `Aceptala en Roblox: apenas la aceptes, el bot **verificará tu cuenta automáticamente y te eliminará de sus amigos** para mantener su lista limpia.`;
    } else if (botAccount.connected) {
        statusMessage =
            `🤝 Para verificar **@${resolved.roblox_username}**, aceptá la solicitud de **@${botAccount.roblox_username}** en Roblox (o entrá al perfil de **@${botAccount.roblox_username}** y enviale solicitud de amistad). ` +
            `Apenas se conecten como amigos, el bot verificará tu cuenta automáticamente y se eliminará de tu lista de amigos (también podés usar \`${robloxProfileVerifyPhrase}\` en tu descripción).`;
    } else {
        statusMessage =
            `🛡️ Verificación en Roblox para **@${resolved.roblox_username}**: Colocá \`${robloxProfileVerifyPhrase}\` en tu descripción ("Acerca de") en Roblox y tocá Comprobar (o conectá la Cuenta de Roblox del Bot en \`/config\` para verificar con Solicitud de Amistad automática + Auto-Unfriend).`;
    }

    return {
        ok: true,
        step: 'verify_required',
        discordId: key,
        profile: resolved,
        robloxMessageDelivered: Boolean(delivery.delivered),
        friendRequestSent: Boolean(delivery.delivered),
        deliveryChannel: delivery.channel,
        botInboxMessage: safePublicMetadata,
        message: statusMessage
    };
}

/**
 * Comprueba si el usuario ya aceptó la solicitud de amistad del Bot en Roblox (o colocó la frase en su perfil).
 * Apenas detecta la amistad, verifica la cuenta y ELIMINA AUTOMÁTICAMENTE al usuario de la lista de amigos del bot.
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
            message: 'No hay una verificación pendiente o ya expiró. Escribí tu usuario o ID de Roblox nuevamente.'
        };
    }

    pending.attempts = (pending.attempts || 0) + 1;
    if (pending.attempts > 15) {
        pendingRobloxVerifications.delete(key);
        return {
            ok: false,
            message: '❌ La solicitud de verificación expiró por exceso de intentos. Iniciá una nueva solicitud en Roblox.'
        };
    }

    let verifiedMethodNote = null;
    let authMethodTag = 'roblox_verified';

    // 1. Verificar si el usuario aceptó la Solicitud de Amistad del Bot en Roblox (y auto-eliminar de amigos de inmediato)
    if (pending.botRobloxConnected || robloxBotAccountState.connected) {
        const friendCheck = await verificarAmistadYEliminarAmigoBotRoblox(pending.profile.roblox_user_id);
        if (friendCheck.verified) {
            verifiedMethodNote = friendCheck.methodNote;
            authMethodTag = 'roblox_friendship';
        }
    }

    // 2. Respaldo: Validar en vivo en users.roblox.com si el usuario colocó la etiqueta KORTEX-XXXX en la descripción de su perfil
    if (!verifiedMethodNote) {
        const cleanInput = String(codeInput || '').trim().toUpperCase();
        const phraseToMatch = pending.robloxProfileVerifyPhrase;
        const hasPhraseOnRobloxProfile = await verificarFraseEnPerfilRoblox(
            pending.profile.roblox_user_id,
            phraseToMatch
        );
        if (hasPhraseOnRobloxProfile || (cleanInput && cleanInput === phraseToMatch && hasPhraseOnRobloxProfile)) {
            verifiedMethodNote = 'Verificada mediante código en descripción del perfil de Roblox';
            // Si además había aceptado amistad, limpiar amigo por seguridad
            await eliminarAmigoDeCuentaBotRoblox(pending.profile.roblox_user_id).catch(() => null);
        }
    }

    if (!verifiedMethodNote) {
        if (pending.botRobloxConnected || robloxBotAccountState.connected) {
            const botName = pending.botRobloxUsername || robloxBotAccountState.roblox_username || 'Bot';
            return {
                ok: false,
                message:
                    `⏳ Aún no figura aceptada la solicitud de amistad con **@${botName}** para **@${pending.profile.roblox_username}**. ` +
                    `Entrá a **Solicitudes de Amistad en Roblox** y aceptá a **@${botName}** (o colocá \`${pending.robloxProfileVerifyPhrase}\` en la descripción de tu perfil de Roblox) y el bot te verificará y borrará de amigos automáticamente.`
            };
        }
        return {
            ok: false,
            message:
                `⏳ Aún no se detectó la etiqueta \`${pending.robloxProfileVerifyPhrase}\` en el perfil de **@${pending.profile.roblox_username}**. ` +
                `Colocá \`${pending.robloxProfileVerifyPhrase}\` en la descripción ("Acerca de") de tu perfil en **Roblox** y volvé a tocar Comprobar.`
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
        `✅ Identidad verificada en Roblox (${verifiedMethodNote}). Cuenta **@${saved.roblox_username}** vinculada y lista de amigos del bot depurada automáticamente.`;

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
 * Muestra el estado de la cuenta de Roblox autorizada exclusivamente mediante Roblox OAuth 2.0 Oficial
 * y el historial únicamente cuando la cuenta está activa.
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
    const hist = obtenerHistorialCuenta(uid).slice(0, 3);
    const baseAppUrl = (process.env.APP_URL || process.env.PUBLIC_GUIDE_URL || 'https://ais-dev-dmpwse4jqkfkz4vfkzt6pu-494677195769.us-west1.run.app').replace(/\/+$/, '');

    const directRobloxOAuthUrl = `${baseAppUrl}/api/auth/roblox/redirect?discord_id=${encodeURIComponent(uid)}`;

    const tieneCuenta = Boolean(cuenta && cuenta.roblox_user_id);

    const container = new ContainerBuilder().setAccentColor(tieneCuenta ? COLORES.exito : COLORES.primario);

    const fichaEstado = tieneCuenta
        ? (
            `# 🎮 Mi Cuenta de Roblox\n` +
            `👤 **Jugador:** **${cuenta.display_name || cuenta.roblox_username}** (\`@${cuenta.roblox_username}\`)\n` +
            `🟢 **Estado:** Cuenta vinculada`
        )
        : (
            `# 🎮 Vincular Cuenta de Roblox\n` +
            `⚪ **Estado:** Sin cuenta vinculada\n` +
            `-# Conectá tu cuenta de Roblox para cargar tu avatar automáticamente.`
        );

    const headerDisplay = new TextDisplayBuilder().setContent(
        fichaEstado + (feedbackMsg ? `\n\n> ${feedbackMsg}` : '')
    );

    if (tieneCuenta && (cuenta.avatar_url || cuenta.avatar_full_url)) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(headerDisplay)
                .setThumbnailAccessory(thumb => thumb.setURL(cuenta.avatar_url || cuenta.avatar_full_url))
        );
    } else {
        container.addTextDisplayComponents(headerDisplay);
    }

    container.addSeparatorComponents(separador(true));

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `### 🔗 Conexión con Roblox\n` +
                `Iniciá sesión en Roblox para vincular o cambiar tu perfil.`
            ))
            .setButtonAccessory(
                new ButtonBuilder()
                    .setLabel(tieneCuenta ? 'Cambiar Cuenta' : 'Conectar Roblox')
                    .setEmoji('🎮')
                    .setStyle(ButtonStyle.Link)
                    .setURL(directRobloxOAuthUrl)
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

    const { obtenerPreferenciasUsuario, TIER_LABELS } = require('./i18n');
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
    // CATEGORÍA: IDIOMA Y PREFERENCIAS (cat_preferences)
    // =========================================================
    if (activeCat === 'cat_preferences') {
        const container = new ContainerBuilder().setAccentColor(0x5865F2);

        const langActualBadge = isEn
            ? '🇺🇸 **English**'
            : '🇪🇸 **Español**';

        const tierMap = TIER_LABELS[isEn ? 'en' : 'es'] || TIER_LABELS.es;
        const tierActualLabel = tierMap[prefs.default_tier] || tierMap.TIER_100;

        const headerPref = new TextDisplayBuilder().setContent(
            (isEn
                ? `# 🌐 Language & Preferences\n` +
                  `🗣️ **Language:** ${langActualBadge}`
                : `# 🌐 Idioma y Preferencias\n` +
                  `🗣️ **Idioma:** ${langActualBadge}`) +
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

        // 1. SELECCIÓN DE IDIOMA (SOLO ESPAÑOL E INGLÉS)
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            isEn
                ? `### 🗣️ 1. Language\nChoose the language for all panels and tools.`
                : `### 🗣️ 1. Idioma\nElegí el idioma de todos los paneles y herramientas.`
        ));

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_pref_lang:es')
                    .setLabel(isEn ? 'Español' : 'Español (Activo)')
                    .setEmoji('🇪🇸')
                    .setStyle(!isEn ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('btn_pref_lang:en')
                    .setLabel(isEn ? 'English (Active)' : 'English')
                    .setEmoji('🇺🇸')
                    .setStyle(isEn ? ButtonStyle.Success : ButtonStyle.Secondary)
            )
        );

        container.addSeparatorComponents(separador());

        // 2. REGIÓN DE PRECIOS PREDETERMINADA (TIERS DE ROBLOX)
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            isEn
                ? `### 🌎 2. Pricing Region\n**Current:** ${tierActualLabel}`
                : `### 🌎 2. Región de Precios\n**Actual:** ${tierActualLabel}`
        ));

        const selectPrefTier = new StringSelectMenuBuilder()
            .setCustomId('select_pref_tier')
            .setPlaceholder(
                isEn
                    ? '🌎 Choose your default pricing region...'
                    : '🌎 Elegí tu región de precios...'
            )
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn ? 'Tier 100% — US, Spain, Global' : 'Tier 100% — EE.UU., España, Global')
                    .setDescription(isEn ? 'Standard catalog price (0% discount)' : 'Precio estándar (Sin descuento regional)')
                    .setValue('TIER_100')
                    .setEmoji('🌐')
                    .setDefault(prefs.default_tier === 'TIER_100'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn ? 'Tier 80% — Mexico, Chile, Uruguay' : 'Tier 80% — México, Chile, Uruguay')
                    .setDescription(isEn ? '20% regional discount' : '20% de descuento regional')
                    .setValue('TIER_80')
                    .setEmoji('🇲🇽')
                    .setDefault(prefs.default_tier === 'TIER_80'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn ? 'Tier 60% — Argentina, Brazil, Colombia, Peru' : 'Tier 60% — Argentina, Brasil, Colombia, Perú')
                    .setDescription(isEn ? '40% regional discount' : '40% de descuento regional')
                    .setValue('TIER_60')
                    .setEmoji('🇦🇷')
                    .setDefault(prefs.default_tier === 'TIER_60'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(isEn ? 'Tier 40% — Venezuela, Bolivia, Paraguay' : 'Tier 40% — Venezuela, Bolivia, Paraguay')
                    .setDescription(isEn ? '60% regional discount' : '60% de descuento regional')
                    .setValue('TIER_40')
                    .setEmoji('🇻🇪')
                    .setDefault(prefs.default_tier === 'TIER_40')
            ]);

        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectPrefTier));
        container.addSeparatorComponents(separador(true));
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
            ? (isEn ? '🟢 Step-by-Step (Rows 1–4)' : '🟢 Progresiva (Filas 1–4)')
            : (isEn ? '⚡ Instant Reply' : '⚡ Respuesta Directa');
        const fmtTycoon = ownerCfg.tycoonEnabled !== false
            ? (isEn ? '🟢 Active' : '🟢 Activo')
            : (isEn ? '⏸️ Paused' : '⏸️ Pausado');

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            isEn
                ? `### ⚡ Active Mechanics & Parameters\n` +
                  `• **Performance & RAM:** ${recursos.limites.nombreModo} (\`${recursos.rssMB} MB\`)\n` +
                  `• **Limits per User:** Watchlist \`${ownerCfg.maxWishlistItems}\` • Sandbox \`${ownerCfg.maxSandboxItems}\` • Patches \`${ownerCfg.maxGameSubs}\`\n` +
                  `• **Auto-Scan Timers:** Prices every \`${ownerCfg.priceCheckIntervalMinutes} min\` • Robux/Patches every \`${ownerCfg.workersIntervalMinutes} min\`\n` +
                  `• **Personal Data Saving:** ${fmtOAuth}\n` +
                  `• **Tycoon Ecosystem (\`/tycoon\`):** ${fmtTycoon}\n` +
                  `• **Loading Screen:** ${fmtLoading}\n` +
                  `• **Maintenance Mode:** ${fmtMant}`
                : `### ⚡ Mecánicas y Parámetros Activos\n` +
                  `• **Rendimiento y RAM:** ${recursos.limites.nombreModo} (\`${recursos.rssMB} MB\`)\n` +
                  `• **Límites por Usuario:** Mi Lista \`${ownerCfg.maxWishlistItems}\` • Probador \`${ownerCfg.maxSandboxItems}\` • Parches \`${ownerCfg.maxGameSubs}\`\n` +
                  `• **Escaneo Automático:** Precios cada \`${ownerCfg.priceCheckIntervalMinutes} min\` • Robux/Parches cada \`${ownerCfg.workersIntervalMinutes} min\`\n` +
                  `• **Guardado de Datos:** ${fmtOAuth}\n` +
                  `• **Ecosistema Tycoon (\`/tycoon\`):** ${fmtTycoon}\n` +
                  `• **Pantalla de Carga:** ${fmtLoading}\n` +
                  `• **Mantenimiento:** ${fmtMant}`
        ));

        const selectOwnerMechanics = new StringSelectMenuBuilder()
            .setCustomId('select_owner_mechanic')
            .setPlaceholder(isEn ? '⚙️ Select a setting or mechanic to modify...' : '⚙️ Elegí un ajuste o mecánica para modificar...')
            .addOptions([
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
                        ? `Step-by-Step Loading Screen (${ownerCfg.dynamicLoadingEnabled ? 'Disable' : 'Enable'})`
                        : `Pantalla de Carga por Filas (${ownerCfg.dynamicLoadingEnabled ? 'Desactivar' : 'Activar'})`)
                    .setDescription(isEn
                        ? 'Toggle between 4-row progress screen or instant direct response'
                        : 'Alternar entre el progreso de 4 filas o respuesta directa al instante')
                    .setValue('owner_toggle_loading')
                    .setEmoji('📋'),
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
                    .setEmoji('🛠️')
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
    const resumen = await obtenerHistorialYEstadoCuenta(uid).catch(() => null);
    const baseAppUrl = (process.env.APP_URL || process.env.PUBLIC_GUIDE_URL || 'https://ais-dev-dmpwse4jqkfkz4vfkzt6pu-494677195769.us-west1.run.app').replace(/\/+$/, '');
    const directDiscordOAuthUrl = `${baseAppUrl}/api/auth/discord/redirect?discord_id=${encodeURIComponent(uid)}`;
    const directRobloxOAuthUrl = `${baseAppUrl}/api/auth/roblox/redirect?discord_id=${encodeURIComponent(uid)}`;

    const tieneDiscord = Boolean(cfg && cfg.oauth_verified);
    const tieneRoblox = Boolean(cuentaRoblox && cuentaRoblox.roblox_user_id);
    const ambasConectadas = tieneDiscord && tieneRoblox;
    const algunaConectada = tieneDiscord || tieneRoblox;

    const colorBorde = ambasConectadas
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

    // 1. CUENTA DE DISCORD
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                isEn
                    ? `### 💬 1. Discord Account\n` +
                      (tieneDiscord
                          ? `🟢 **Connected:** \`@${cfg.discord_username || username}\``
                          : `🔴 **Not connected**\n-# Connect to save your watchlist and alerts.`)
                    : `### 💬 1. Cuenta de Discord\n` +
                      (tieneDiscord
                          ? `🟢 **Conectada:** \`@${cfg.discord_username || username}\``
                          : `🔴 **Sin conectar**\n-# Conectala para guardar tu lista de precios y alertas.`)
            ))
            .setButtonAccessory(
                new ButtonBuilder()
                    .setLabel(
                        tieneDiscord
                            ? (isEn ? 'Reconnect Discord' : 'Reconectar Discord')
                            : (isEn ? 'Connect Discord' : 'Conectar Discord')
                    )
                    .setEmoji('🔗')
                    .setStyle(ButtonStyle.Link)
                    .setURL(directDiscordOAuthUrl)
            )
    );

    container.addSeparatorComponents(separador());

    // 2. CUENTA DE ROBLOX
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                isEn
                    ? `### 🎮 2. Roblox Account\n` +
                      (tieneRoblox
                          ? `🟢 **Connected:** **${cuentaRoblox.display_name || cuentaRoblox.roblox_username}** (\`@${cuentaRoblox.roblox_username}\`)`
                          : `🔴 **Not linked**\n-# Link your account to load your avatar automatically.`)
                    : `### 🎮 2. Cuenta de Roblox\n` +
                      (tieneRoblox
                          ? `🟢 **Conectada:** **${cuentaRoblox.display_name || cuentaRoblox.roblox_username}** (\`@${cuentaRoblox.roblox_username}\`)`
                          : `🔴 **Sin vincular**\n-# Vinculala para cargar tu avatar automáticamente.`)
            ))
            .setButtonAccessory(
                new ButtonBuilder()
                    .setLabel(
                        tieneRoblox
                            ? (isEn ? 'Switch Account' : 'Cambiar Cuenta')
                            : (isEn ? 'Connect Roblox' : 'Conectar Roblox')
                    )
                    .setEmoji('🎮')
                    .setStyle(ButtonStyle.Link)
                    .setURL(directRobloxOAuthUrl)
            )
    );

    container.addSeparatorComponents(separador());

    // 3. DATOS GUARDADOS
    const ownerLimits = obtenerConfigPropietario();
    const maxWishlist = Number(ownerLimits.maxWishlistItems || MAX_WISHLIST_ITEMS);
    const maxGameSubs = Number(ownerLimits.maxGameSubs || 3);
    const wishlistCount = Number(resumen?.stats?.wishlistCount || 0);
    const pendingCount = Number(resumen?.stats?.pendingRobuxCount || 0);
    const gameSubsCount = Number(resumen?.stats?.gameSubsCount || 0);
    const codesCount = Number(resumen?.stats?.redeemedCodesCount || 0);

    const textoBoveda = isEn
        ? `### 🗂️ 3. Saved Data\n` +
          `🎯 **Watchlist:** \`${wishlistCount}/${maxWishlist}\`  •  ⏳ **Pending Robux:** \`${pendingCount}\`  •  🔔 **Alerts:** \`${gameSubsCount}/${maxGameSubs}\`  •  🎁 **Codes:** \`${codesCount}\``
        : `### 🗂️ 3. Datos Guardados\n` +
          `🎯 **Mi Lista:** \`${wishlistCount}/${maxWishlist}\`  •  ⏳ **Robux Pendientes:** \`${pendingCount}\`  •  🔔 **Alertas:** \`${gameSubsCount}/${maxGameSubs}\`  •  🎁 **Códigos:** \`${codesCount}\``;

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(textoBoveda));

    container.addSeparatorComponents(separador(true));

    // 4. BARRA INFERIOR DE CONTROLES
    const filaBotonesInferior = [
        boton(
            'btn_config_refresh',
            isEn ? 'Refresh Status' : 'Actualizar Estado',
            '🔄',
            ButtonStyle.Success
        ),
        new ButtonBuilder()
            .setLabel(isEn ? 'Web Dashboard' : 'Panel Web')
            .setEmoji('🌐')
            .setStyle(ButtonStyle.Link)
            .setURL(baseAppUrl)
    ];

    if (tieneRoblox) {
        filaBotonesInferior.push(
            new ButtonBuilder()
                .setLabel(isEn ? 'Roblox Profile' : 'Perfil de Roblox')
                .setEmoji('👤')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://www.roblox.com/users/${cuentaRoblox.roblox_user_id}/profile`)
        );
    }

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
    const baseAppUrl = (process.env.APP_URL || process.env.PUBLIC_GUIDE_URL || 'https://ais-dev-dmpwse4jqkfkz4vfkzt6pu-494677195769.us-west1.run.app').replace(/\/+$/, '');

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
                        `Conectá tu perfil para usar esta función.`
                    ))
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setLabel('Conectar Roblox')
                            .setEmoji('🎮')
                            .setStyle(ButtonStyle.Link)
                            .setURL(directRobloxOAuthUrl)
                    )
            )
            .addSeparatorComponents(separador(true))
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    boton('btn_fastlink_modal', 'Mi Cuenta Roblox', '🎮', ButtonStyle.Success),
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
                    `Conectá tu cuenta para habilitar el guardado y las alertas.`
                ))
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setLabel('Conectar Discord')
                        .setEmoji('🔗')
                        .setStyle(ButtonStyle.Link)
                        .setURL(directDiscordOAuthUrl)
                )
        )
        .addSeparatorComponents(separador(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
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
async function agregarItemAWishlistRapido(discordId, { idObjet, itemName, itemType = 'catalog', price = 0, targetPrice = null }) {
    const userId = String(discordId);
    const idStr = String(idObjet);

    const { data: existentes, error: countErr } = await supabase
        .from('roblox_wishlist')
        .select('id, id_objet')
        .eq('user_id', userId);

    if (countErr) {
        return { ok: false, motivo: 'Error al consultar tu lista de monitoreo.' };
    }

    const { obtenerConfigPropietario } = require('./performanceManager');
    const maxItems = Number(obtenerConfigPropietario().maxWishlistItems || MAX_WISHLIST_ITEMS);

    const lista = existentes || [];
    if (lista.some(i => String(i.id_objet) === idStr)) {
        return { ok: false, motivo: `El objeto **${itemName}** (ID \`${idStr}\`) ya está en tu **Mi Lista**.` };
    }

    if (lista.length >= maxItems) {
        return {
            ok: false,
            motivo: `Tu **Mi Lista** ya alcanzó el límite máximo de **${maxItems}/${maxItems}** objetos.`
        };
    }

    const ahoraIso = new Date().toISOString();
    const initialHistory = [{ price: Number(price || 0), timestamp: ahoraIso }];

    const nuevoRegistro = {
        user_id: userId,
        id_objet: idStr,
        item_name: itemName || `Objeto ${idStr}`,
        item_type: itemType,
        last_price: Number(price || 0),
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
    fastLinkCache,
    discordConfigCache,
    accountHistoryCache,
    pendingRobloxVerifications,
    recentlyAutoVerifiedRoblox,
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
    obtenerConfigDiscord,
    guardarConfigDiscord,
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
    agregarItemAWishlistRapido
};
