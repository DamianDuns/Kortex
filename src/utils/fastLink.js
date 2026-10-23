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
                    if (cfg && (cfg.oauth_verified || cfg.discord_username)) {
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
                title: `Cuenta de Roblox registrada: @${fullRecord.roblox_username}`,
                detail: fullRecord.roblox_oauth_verified
                    ? `ID ${fullRecord.roblox_user_id} • Verificada con OAuth 2.0 Oficial`
                    : `ID ${fullRecord.roblox_user_id} • Verificada con código de seguridad (MD / Buzón)`
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
        try {
            const thumbRes = await fetchWithRetry(
                `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${botUser.id}&size=150x150&format=Png&isCircular=false`
            ).catch(() => null);
            avatarUrl = thumbRes?.data?.data?.[0]?.imageUrl || null;
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
            updated_at: new Date().toISOString()
        };

        guardarCuentaBotRobloxEnDisco();

        return {
            ok: true,
            account: obtenerEstadoCuentaBotRoblox(),
            message: `✅ Cuenta de Roblox del Bot conectada: **@${botUser.name}** (ID \`${botUser.id}\`). Ahora el bot enviará los códigos directamente por Roblox.`
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
 * Envía el código secreto de 6 dígitos DIRECTAMENTE dentro de la plataforma Roblox:
 * 1) A la Galería de Mensajes / Buzón de Roblox del usuario destino (privatemessages.roblox.com/v1/messages/send).
 * 2) Al Chat de Roblox del usuario destino (chat.roblox.com/v2/send-message) si tiene chat habilitado con el bot.
 */
async function enviarMensajeVerificacionEnRoblox(targetProfile, secretInboxCode, verifyPhrase) {
    const botStatus = obtenerEstadoCuentaBotRoblox();
    if (!botStatus.connected || !robloxBotAccountState.cookie) {
        return {
            delivered: false,
            channel: 'bot_account_pending',
            botAccount: botStatus,
            reason: 'El bot aún no tiene conectada su cuenta emisora de Roblox en /config.'
        };
    }

    const cookie = robloxBotAccountState.cookie;
    const csrfToken = await obtenerCsrfTokenRoblox(cookie);
    if (!csrfToken) {
        return {
            delivered: false,
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

    const recipientId = Number(targetProfile.roblox_user_id);

    // 1. Intentar envío a la Galería de Mensajes de Roblox (roblox.com/messages)
    try {
        const pmRes = await axios.post(
            'https://privatemessages.roblox.com/v1/messages/send',
            {
                userId: Number(botStatus.roblox_user_id),
                subject: `Código de Verificación Kortex: ${secretInboxCode}`,
                body:
                    `¡Hola @${targetProfile.roblox_username}!\n\n` +
                    `Recibimos una solicitud para verificar tu cuenta de Roblox en Kortex.\n\n` +
                    `🔑 Tu código secreto de verificación de 6 dígitos es: ${secretInboxCode}\n\n` +
                    `Introducí estos 6 dígitos en Kortex para confirmar que sos el propietario real de esta cuenta.\n` +
                    `Si no solicitaste este código, podés ignorar este mensaje con total tranquilidad.`,
                recipientId,
                includePreviousMessage: false
            },
            { headers, timeout: 8500 }
        );

        if (pmRes.data && pmRes.data.success === true) {
            return {
                delivered: true,
                channel: 'roblox_inbox',
                botAccount: botStatus,
                reason: null
            };
        }
    } catch {
        // Si la Galería de Mensajes está restringida por privacidad del usuario, intentar Chat de Roblox
    }

    // 2. Intentar envío por Chat de Roblox (chat.roblox.com) si son amigos o tiene chat permitido
    try {
        const convRes = await axios.post(
            'https://chat.roblox.com/v2/start-one-to-one-conversation',
            { participantUserId: recipientId },
            { headers, timeout: 6500 }
        );
        const convId = convRes.data?.conversation?.id;
        if (convId) {
            const chatRes = await axios.post(
                'https://chat.roblox.com/v2/send-message',
                {
                    conversationId: convId,
                    message: `🔐 [Kortex Verificación] ¡Hola @${targetProfile.roblox_username}! Tu código secreto de 6 dígitos es: ${secretInboxCode}`
                },
                { headers, timeout: 6500 }
            );
            if (chatRes.data && (chatRes.data.resultType === 'Success' || chatRes.data.messageId)) {
                return {
                    delivered: true,
                    channel: 'roblox_chat',
                    botAccount: botStatus,
                    reason: null
                };
            }
        }
    } catch {
        // Silencioso
    }

    return {
        delivered: false,
        channel: 'roblox_privacy_blocked',
        botAccount: botStatus,
        reason: `El usuario @${targetProfile.roblox_username} tiene bloqueada la recepción de mensajes de desconocidos en la privacidad de Roblox (${verifyPhrase}).`
    };
}

/**
 * Revisa la Galería de Mensajes de Entrada de la propia cuenta de Roblox del Bot
 * por si el usuario destino le envió un mensaje dentro de Roblox al Bot para verificarse.
 */
async function verificarMensajeRecibidoEnBuzonBotRoblox(targetRobloxUserId, createdAt, verifyPhrase, secretCode) {
    if (!robloxBotAccountState.connected || !robloxBotAccountState.cookie) return false;
    try {
        const res = await axios.get(
            'https://privatemessages.roblox.com/v1/messages?messageTab=0&pageNumber=0&pageSize=20',
            {
                headers: {
                    Cookie: `.ROBLOSECURITY=${robloxBotAccountState.cookie}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 7000
            }
        );
        const collection = res.data?.collection || [];
        for (const msg of collection) {
            const senderId = Number(msg.sender?.id || 0);
            if (senderId === Number(targetRobloxUserId)) {
                const bodyAndSub = `${msg.subject || ''} ${msg.body || ''}`.toUpperCase();
                const msgTime = msg.created ? new Date(msg.created).getTime() : Date.now();
                if (
                    bodyAndSub.includes(String(verifyPhrase).toUpperCase()) ||
                    bodyAndSub.includes(String(secretCode)) ||
                    msgTime >= createdAt - 5 * 60 * 1000
                ) {
                    return true;
                }
            }
        }
    } catch {
        // Silencioso
    }
    return false;
}

/**
 * Verifica directamente en los servidores de Roblox (users.roblox.com/v1/users/{id})
 * si el usuario colocó la etiqueta de verificación en su perfil de Roblox (alternativa en Roblox cuando tiene mensajes cerrados).
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

// Cargar también la cuenta de Roblox del Bot al iniciar el módulo
cargarCuentaBotRobloxDesdeDisco();

/**
 * SISTEMA DE VERIFICACIÓN EN 2 PASOS EXCLUSIVO POR PLATAFORMA ROBLOX:
 * - NUNCA envía el código al MD de Discord ni lo muestra en la pantalla o panel.
 * - La cuenta de Roblox del Bot envía el código secreto de 6 dígitos a la Galería de Mensajes de Roblox
 *   (roblox.com/messages) o al Chat de Roblox del usuario destino.
 * - Si el usuario destino tiene sus mensajes de Roblox cerrados por privacidad, puede:
 *   a) Abrir sus mensajes en Roblox y reenviar,
 *   b) Enviarle un mensaje en Roblox a la cuenta del Bot, o
 *   c) Poner la etiqueta pública en su Descripción de Roblox (validada en vivo contra users.roblox.com).
 */
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

    // Código secreto de 6 dígitos que SOLO se envía por dentro de Roblox (JAMAŚ se muestra en Discord ni en la web)
    const secretInboxCode = String(Math.floor(100000 + Math.random() * 900000));
    // Etiqueta pública distinta para verificar en Roblox si el usuario tiene su buzón cerrado a desconocidos
    const robloxProfileVerifyPhrase = `KORTEX-${Math.floor(1000 + Math.random() * 9000)}`;
    const createdAt = Date.now();
    const expiresAt = createdAt + 10 * 60 * 1000; // 10 minutos

    // Enviar el código secreto directamente a la Galería de Mensajes / Chat de Roblox usando la Cuenta de Roblox del Bot
    const delivery = await enviarMensajeVerificacionEnRoblox(resolved, secretInboxCode, robloxProfileVerifyPhrase);
    const botAccount = delivery.botAccount || obtenerEstadoCuentaBotRoblox();

    const safePublicMetadata = {
        sender: botAccount.connected
            ? `Cuenta de Roblox del Bot: @${botAccount.roblox_username} (ID ${botAccount.roblox_user_id})`
            : 'Verificador en Plataforma Roblox',
        recipient: `@${resolved.roblox_username} (ID ${resolved.roblox_user_id})`,
        sentAt: new Date(createdAt).toISOString(),
        expiresInMinutes: 10,
        robloxMessageDelivered: Boolean(delivery.delivered),
        deliveryChannel: delivery.channel,
        botRobloxConnected: Boolean(botAccount.connected),
        botRobloxUsername: botAccount.roblox_username || null,
        botRobloxUserId: botAccount.roblox_user_id || null,
        robloxMessagesUrl: 'https://www.roblox.com/messages',
        robloxProfileUrl: `https://www.roblox.com/users/${resolved.roblox_user_id}/profile`,
        robloxProfileVerifyPhrase
    };

    const challenge = {
        discordId: key,
        secretInboxCode, // SECRETO: Jamás se expone en el cliente ni en Discord
        robloxProfileVerifyPhrase,
        profile: resolved,
        createdAt,
        expiresAt,
        attempts: 0,
        robloxMessageDelivered: Boolean(delivery.delivered),
        deliveryChannel: delivery.channel,
        botRobloxConnected: Boolean(botAccount.connected),
        botRobloxUsername: botAccount.roblox_username || null,
        botRobloxUserId: botAccount.roblox_user_id || null,
        botInboxMessage: safePublicMetadata
    };

    pendingRobloxVerifications.set(key, challenge);

    let statusMessage = '';
    if (delivery.delivered && delivery.channel === 'roblox_inbox') {
        statusMessage =
            `📬 La cuenta de Roblox del bot (**@${botAccount.roblox_username}**) le envió un mensaje con el código secreto de 6 dígitos a la **Galería de Mensajes en Roblox (\`roblox.com/messages\`)** de **@${resolved.roblox_username}**. Abrí tus mensajes en Roblox e introducí el código.`;
    } else if (delivery.delivered && delivery.channel === 'roblox_chat') {
        statusMessage =
            `💬 La cuenta de Roblox del bot (**@${botAccount.roblox_username}**) le envió el código secreto de 6 dígitos al **Chat de Roblox** de **@${resolved.roblox_username}**. Revisá tu chat en Roblox e introducí el código.`;
    } else if (botAccount.connected) {
        statusMessage =
            `🔒 Intentamos enviar el código desde **@${botAccount.roblox_username}** a la Galería de Mensajes en Roblox de **@${resolved.roblox_username}**, pero esa cuenta tiene los mensajes privados restringidos en Roblox. Abrí tus mensajes en Roblox (*Privacidad → ¿Quién puede enviarme mensajes? → Todos*) y reintentá, o enviále un mensaje en Roblox a **@${botAccount.roblox_username}** (o colocá \`${robloxProfileVerifyPhrase}\` en tu descripción de Roblox) y tocá Verificar.`;
    } else {
        statusMessage =
            `🛡️ Verificación en Roblox para **@${resolved.roblox_username}**: Para verificar sin revelar claves en Discord, colocá \`${robloxProfileVerifyPhrase}\` en tu descripción ("Acerca de") en Roblox y tocá Verificar (o conectá la Cuenta de Roblox del Bot en \`/config\` para enviar códigos directo al Buzón de Mensajes de Roblox).`;
    }

    return {
        ok: true,
        step: 'verify_required',
        discordId: key,
        profile: resolved,
        robloxMessageDelivered: Boolean(delivery.delivered),
        deliveryChannel: delivery.channel,
        botInboxMessage: safePublicMetadata,
        message: statusMessage
    };
}

async function confirmarVerificacionCodigoRoblox(discordId, codeInput = '') {
    const key = String(discordId || 'default_session').trim();
    const pending = obtenerVerificacionPendienteRoblox(key);

    if (!pending) {
        return {
            ok: false,
            message: 'No hay una verificación pendiente o ya expiró. Escribí tu usuario o ID de Roblox nuevamente.'
        };
    }

    pending.attempts = (pending.attempts || 0) + 1;
    if (pending.attempts > 5) {
        pendingRobloxVerifications.delete(key);
        return {
            ok: false,
            message: '❌ Se superó el límite de 5 intentos por seguridad. Solicitá un nuevo envío en Roblox.'
        };
    }

    const cleanInput = String(codeInput || '').trim();
    const onlyDigits = cleanInput.replace(/\D+/g, '');

    let verifiedMethodNote = null;

    // 1. Validar si introdujo el código secreto de 6 dígitos enviado a su Galería de Mensajes / Chat de Roblox
    if (onlyDigits && onlyDigits.length === 6 && onlyDigits === pending.secretInboxCode) {
        if (pending.robloxMessageDelivered) {
            verifiedMethodNote = 'Verificada por mensaje en la Galería de Mensajes / Chat de Roblox';
        }
    }

    // 2. Validar si el usuario le envió un mensaje desde su cuenta de Roblox al Buzón de Roblox del Bot
    if (!verifiedMethodNote && pending.botRobloxConnected) {
        const sentToBotOnRoblox = await verificarMensajeRecibidoEnBuzonBotRoblox(
            pending.profile.roblox_user_id,
            pending.createdAt,
            pending.robloxProfileVerifyPhrase,
            pending.secretInboxCode
        );
        if (sentToBotOnRoblox) {
            verifiedMethodNote = `Verificada por mensaje en Roblox recibido en @${pending.botRobloxUsername}`;
        }
    }

    // 3. Validar en vivo en los servidores de Roblox (users.roblox.com) si el usuario colocó la etiqueta en su perfil de Roblox
    if (!verifiedMethodNote) {
        const hasPhraseOnRobloxProfile = await verificarFraseEnPerfilRoblox(
            pending.profile.roblox_user_id,
            pending.robloxProfileVerifyPhrase
        );
        if (hasPhraseOnRobloxProfile) {
            verifiedMethodNote = 'Verificada directamente en el perfil oficial de Roblox';
        }
    }

    if (!verifiedMethodNote) {
        if (pending.robloxMessageDelivered) {
            return {
                ok: false,
                message:
                    `❌ El código no coincide con el enviado a la Galería de Mensajes de Roblox de **@${pending.profile.roblox_username}**. ` +
                    `Abrí \`roblox.com/messages\` en tu cuenta de Roblox, buscá el mensaje de **@${pending.botRobloxUsername}** e introducí los 6 dígitos exactos.`
            };
        }
        return {
            ok: false,
            message:
                `❌ Aún no se detectó la verificación en Roblox para **@${pending.profile.roblox_username}**. ` +
                (pending.botRobloxConnected
                    ? `Habilitá la recepción de mensajes en tu privacidad de Roblox para recibir el código de **@${pending.botRobloxUsername}** en \`roblox.com/messages\`, enviále un mensaje en Roblox a **@${pending.botRobloxUsername}**, o colocá \`${pending.robloxProfileVerifyPhrase}\` en la descripción de tu perfil en Roblox antes de verificar.`
                    : `Colocá \`${pending.robloxProfileVerifyPhrase}\` en la descripción ("Acerca de") de tu perfil en **Roblox** (\`roblox.com\`) y volvé a tocar Verificar (o conectá la Cuenta de Roblox del Bot desde \`/config\` para enviar códigos al buzón de Roblox).`)
        };
    }

    pendingRobloxVerifications.delete(key);

    const saved = await guardarCuentaVinculada(key, {
        ...pending.profile,
        auth_method: 'roblox_verified',
        roblox_oauth_verified: false,
        roblox_access_token: null
    });

    return {
        ok: true,
        step: 'verified',
        linkedAccount: saved,
        message: `✅ Identidad confirmada en Roblox (${verifiedMethodNote}). Cuenta **@${saved.roblox_username}** vinculada de forma segura.`
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
 * PANEL DE CUENTA DE ROBLOX (Dentro de /roblox):
 * Muestra el estado de la cuenta de Roblox, opciones de conexión (OAuth 2.0 o Verificación en Roblox por Galería de Mensajes)
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
    const pendingVerif = obtenerVerificacionPendienteRoblox(uid);
    const botRoblox = obtenerEstadoCuentaBotRoblox();
    const hist = obtenerHistorialCuenta(uid).slice(0, 3);
    const baseAppUrl = (process.env.APP_URL || process.env.PUBLIC_GUIDE_URL || 'https://ais-dev-dmpwse4jqkfkz4vfkzt6pu-494677195769.us-west1.run.app').replace(/\/+$/, '');

    const directRobloxOAuthUrl = `${baseAppUrl}/api/auth/roblox/redirect?discord_id=${encodeURIComponent(uid)}`;

    const tieneCuenta = Boolean(cuenta && cuenta.roblox_user_id);
    const esOAuth = Boolean(cuenta?.auth_method === 'oauth' || cuenta?.roblox_oauth_verified);

    const container = new ContainerBuilder().setAccentColor(tieneCuenta ? COLORES.exito : COLORES.primario);

    const fichaEstado = tieneCuenta
        ? (
            `# 🎮 Mi Cuenta de Roblox\n` +
            `👤 **Jugador:** **${cuenta.display_name || cuenta.roblox_username}** (\`@${cuenta.roblox_username}\`)  •  🆔 **ID:** \`${cuenta.roblox_user_id}\`\n` +
            `🛡️ **Estado:** ${esOAuth ? '🟢 **Autorizada en Roblox (OAuth 2.0 Persistente)**' : '🔐 **Verificada en la Plataforma de Roblox (Galería de Mensajes / Perfil)**'}\n` +
            `-# Tu historial se guarda mientras tengas la cuenta activa y se limpia automáticamente si la quitás.`
        )
        : (
            `# 🎮 Vincular Cuenta de Roblox\n` +
            `⚪ **Estado actual:** *Sin cuenta de Roblox activa*\n` +
            `-# Elegí cualquiera de las dos opciones seguras en Roblox para conectar tu perfil.`
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

    // Opción 1: Roblox OAuth 2.0 Oficial
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `### 🔐 Opción 1: Conexión Oficial con Roblox OAuth 2.0\n` +
                `Autorizá tu perfil desde la página oficial de **Roblox**. Tu sesión queda guardada de forma persistente.`
            ))
            .setButtonAccessory(
                new ButtonBuilder()
                    .setLabel('Autorizar en Roblox')
                    .setEmoji('🔐')
                    .setStyle(ButtonStyle.Link)
                    .setURL(directRobloxOAuthUrl)
            )
    );

    container.addSeparatorComponents(separador());

    // Opción 2: Verificación en 2 Pasos DENTRO DE ROBLOX (Galería de Mensajes de Roblox / Perfil de Roblox — NUNCA muestra el código en Discord)
    if (pendingVerif) {
        const targetName = pendingVerif.profile.roblox_username;
        const targetId = pendingVerif.profile.roblox_user_id;

        let textoVerifRoblox = '';
        if (pendingVerif.robloxMessageDelivered) {
            textoVerifRoblox =
                `### 📬 Verificación en Roblox Enviada a @${targetName}\n` +
                `🤖 **Cuenta Emisora en Roblox:** \`@${pendingVerif.botRobloxUsername}\`\n` +
                `📩 **Dónde ver tu código:** Entrá a tu **Galería de Mensajes en Roblox (\`roblox.com/messages\`)** (o Chat de Roblox) con la cuenta **@${targetName}** (ID \`${targetId}\`).\n` +
                `-# Por seguridad, el código secreto de 6 dígitos solo se envió dentro de Roblox y nunca se muestra acá. Leelo en tu buzón de Roblox e introducilo con el botón de al lado.`;
        } else if (pendingVerif.botRobloxConnected) {
            textoVerifRoblox =
                `### 🔒 Buzón de Roblox Cerrado en @${targetName} (Verificación en Roblox)\n` +
                `🤖 **Cuenta del Bot en Roblox:** \`@${pendingVerif.botRobloxUsername}\` intentó enviarte el código a \`roblox.com/messages\`, pero **@${targetName}** tiene los mensajes privados cerrados.\n` +
                `✅ **Cómo verificar en Roblox:**\n` +
                `1️⃣ Abrí tus mensajes en Roblox (*Privacidad → ¿Quién puede enviarme mensajes? → Todos*) y tocá **Reenviar en Roblox**, **O**\n` +
                `2️⃣ Enviále un mensaje en Roblox a **@${pendingVerif.botRobloxUsername}** o colocá \`${pendingVerif.robloxProfileVerifyPhrase}\` en tu descripción ("Acerca de") en Roblox y tocá **Comprobar en Roblox**.`;
        } else {
            textoVerifRoblox =
                `### 🛡️ Verificación en Plataforma Roblox para @${targetName}\n` +
                `Para comprobar en **Roblox** que sos el dueño real de **@${targetName}** (ID \`${targetId}\`) sin exponer claves en Discord:\n` +
                `• Colocá la etiqueta \`${pendingVerif.robloxProfileVerifyPhrase}\` en la descripción ("Acerca de") de tu perfil en **Roblox** (\`roblox.com/users/${targetId}/profile\`) y tocá **Comprobar en Roblox**.\n` +
                `-# Si sos el propietario del bot, también podés conectar la Cuenta de Roblox del Bot en \`/config\` para enviar códigos directo a la Galería de Mensajes de Roblox.`;
        }

        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(textoVerifRoblox))
                .setButtonAccessory(
                    boton('btn_fastlink_verify_code_modal', 'Introducir Código Roblox', '🔑', ButtonStyle.Success)
                )
        );
    } else {
        const infoBotEmisor = botRoblox.connected
            ? `La cuenta de Roblox del bot (**@${botRoblox.roblox_username}**) te enviará un mensaje privado con un código secreto de 6 dígitos directo a tu **Galería de Mensajes en Roblox (\`roblox.com/messages\`)**.`
            : `Indicá tu **Nombre o ID de Roblox** para verificar tu cuenta directamente dentro de la plataforma **Roblox** (por Galería de Mensajes de Roblox o verificación en tu perfil de Roblox).`;

        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `### 📬 Opción 2: Vincular por Nombre o ID (Verificación en Roblox)\n` +
                    `${infoBotEmisor}`
                ))
                .setButtonAccessory(
                    boton('btn_fastlink_manual_modal', 'Enviar a mi Roblox', '📬', ButtonStyle.Primary)
                )
        );
    }

    if (tieneCuenta && hist.length > 0) {
        container.addSeparatorComponents(separador());
        const lineasHist = hist.map(h => `• **${h.title}** — *${h.detail || 'Registrado'}*`).join('\n');
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 📋 Historial de tu Cuenta Activa\n${lineasHist}`
        ));
    }

    container.addSeparatorComponents(separador(true));

    const bottomButtons = [];

    if (pendingVerif) {
        bottomButtons.push(
            boton('btn_fastlink_check_roblox', 'Comprobar en Roblox', '✅', ButtonStyle.Success),
            new ButtonBuilder()
                .setLabel('Abrir Mensajes de Roblox')
                .setEmoji('📬')
                .setStyle(ButtonStyle.Link)
                .setURL('https://www.roblox.com/messages'),
            boton('btn_fastlink_manual_modal', 'Reenviar / Cambiar Usuario', '🔄', ButtonStyle.Primary)
        );
    } else {
        bottomButtons.push(
            boton('btn_fastlink_refresh', 'Comprobar Estado', '🔄', ButtonStyle.Success)
        );
    }

    if (tieneCuenta && bottomButtons.length < 4) {
        bottomButtons.push(
            new ButtonBuilder()
                .setLabel('Ver Perfil en Roblox')
                .setEmoji('👤')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://www.roblox.com/users/${cuenta.roblox_user_id}/profile`)
        );
    }

    bottomButtons.push(boton('btn_nav_main_menu', 'Volver a /roblox', '⬅️', ButtonStyle.Secondary));

    container.addActionRowComponents(new ActionRowBuilder().addComponents(bottomButtons.slice(0, 5)));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Centro de Cuenta de Roblox • Verificación en plataforma Roblox sin exponer claves en Discord')
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
 * - Categoría 1 (cat_accounts): Cuentas, Conexión e Historial (Para cualquier usuario).
 * - Categoría 2 (cat_owner_bot): Configuración y Moderación del Bot (Exclusivo para el Propietario del Bot).
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

    const esOwner = await esPropietarioDelBot(uid, client);
    const activeCat = categoryKey === 'cat_owner_bot' ? 'cat_owner_bot' : 'cat_accounts';

    const selectOptions = [
        new StringSelectMenuOptionBuilder()
            .setLabel('Categoría: Cuentas y Conexión')
            .setDescription('Estado de conexión OAuth2, cuenta de Roblox e historial guardado')
            .setValue('cat_accounts')
            .setEmoji('🔗')
            .setDefault(activeCat === 'cat_accounts')
    ];

    if (esOwner || activeCat === 'cat_owner_bot') {
        selectOptions.push(
            new StringSelectMenuOptionBuilder()
                .setLabel('Categoría: Configuración y Moderación del Bot (Propietario)')
                .setDescription('Cuenta de Roblox del Bot, Motor RAM/GPU y control general del bot')
                .setValue('cat_owner_bot')
                .setEmoji('🛡️')
                .setDefault(activeCat === 'cat_owner_bot')
        );
    }

    const selectConfigCat = new StringSelectMenuBuilder()
        .setCustomId('config_category_select')
        .setPlaceholder(
            activeCat === 'cat_owner_bot'
                ? '🛡️ Categoría actual: Configuración y Moderación del Bot...'
                : '🔗 Categoría actual: Cuentas y Conexión (Seleccionar categoría)...'
        )
        .addOptions(selectOptions);

    // =========================================================
    // CATEGORÍA 2: CONFIGURACIÓN Y MODERACIÓN DEL BOT (PROPIETARIO)
    // =========================================================
    if (activeCat === 'cat_owner_bot') {
        if (!esOwner) {
            const deniedContainer = new ContainerBuilder()
                .setAccentColor(COLORES.error)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# 🔒 Acceso Exclusivo del Propietario\n` +
                    `La categoría **🛡️ Configuración y Moderación del Bot** está reservada exclusivamente para el propietario del bot.`
                ))
                .addActionRowComponents(new ActionRowBuilder().addComponents(selectConfigCat))
                .addSeparatorComponents(separador())
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    footer('Configuración (/config) • Acceso restringido al propietario')
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
                label: '🔐 Códigos Temporales de Verificación',
                whatItCleans: 'Solicitudes de códigos de 6 dígitos caducadas (>15 min) sin tocar cuentas vinculadas',
                inspectFn: () => {
                    const total = pendingRobloxVerifications.size;
                    return {
                        entries: total,
                        approxKB: total * 2,
                        detail: `${total} solicitud(es) temporal(es) en curso • ${fastLinkCache.size} cuenta(s) protegida(s)`
                    };
                }
            }
        );

        const recursos = leerEstadoRecursos();
        const ownerCfg = obtenerConfigPropietario();
        const botRoblox = obtenerEstadoCuentaBotRoblox();

        const colorPanel = ownerCfg.maintenanceMode
            ? COLORES.alerta
            : (recursos.nivel === 'critico' ? COLORES.error : 0x5865F2);

        const container = new ContainerBuilder().setAccentColor(colorPanel);

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🛡️ Configuración y Moderación del Bot\n` +
            `**👑 Panel Exclusivo del Propietario (${username})**\n` +
            `Administrá la cuenta emisora de Roblox del bot, el arranque y calibración del motor RAM/GPU, la limpieza transparente de cachés y las mecánicas técnicas del sistema.` +
            (feedbackMsg ? `\n\n> ${feedbackMsg}` : '')
        ));

        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectConfigCat));
        container.addSeparatorComponents(separador(true));

        // 1. SECCIÓN DE LA CUENTA DE ROBLOX DEL BOT PARA ENVIAR VERIFICACIONES EN ROBLOX
        const estadoBotRobloxTexto = botRoblox.connected
            ? `🟢 **Conectada en Roblox:** **@${botRoblox.roblox_username}** (\`ID: ${botRoblox.roblox_user_id}\`)\n` +
              `> 📬 **Envío activo:** El bot usa esta cuenta para enviar los códigos de 6 dígitos directamente a la **Galería de Mensajes de Roblox (\`roblox.com/messages\`)** y **Chat de Roblox** de los usuarios.`
            : `🟠 **Sin cuenta de Roblox del Bot conectada aún**\n` +
              `> 💡 **Cómo activarla:** Tocá el botón **🤖 Cuenta Roblox del Bot** abajo y pegá la cookie \`.ROBLOSECURITY\` de la cuenta de Roblox que creaste para el bot. Así enviará los códigos directo al buzón de Roblox de cada usuario.`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## 🤖 1. Cuenta Oficial de Roblox del Bot (Verificador en Roblox)\n` +
            `> 👤 **Estado:** ${estadoBotRobloxTexto}`
        ));

        container.addSeparatorComponents(separador());

        // 2. SISTEMA DEL OPTIMIZADOR Y DESGLOSE TRANSPARENTE DE QUÉ LIMPIA LA MEMORIA
        const detalleLimiteHost = recursos.hostLimiteMB
            ? ` / \`${recursos.hostLimiteMB} MB\` *(${recursos.pctHost}% • Libre: \`${recursos.hostLibreMB} MB\`)*`
            : '';

        const logsRecientes = Array.isArray(recursos.stats?.lastTerminalLogs) && recursos.stats.lastTerminalLogs.length > 0
            ? recursos.stats.lastTerminalLogs.join('\n')
            : '[MOTOR] > Calibración activa: Uso individual detectado (sin sobrecarga)';

        const subsistemasLines = (recursos.inspeccion?.subsistemas || [])
            .map(s => `> • **${s.label}:** \`${s.detail}\``)
            .join('\n');

        const httpHits = recursos.inspeccion?.httpStats?.cacheHits || 0;
        const failovers = recursos.inspeccion?.httpStats?.failoverSuccesses || 0;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ⚡ 2. Motor RAM / GPU y Qué Garantiza la Limpieza de Memoria\n` +
            `> 🛡️ **Estado Calibrado:** **${recursos.etiquetaModo}**\n` +
            `> 🎛️ **Modo del Motor:** **${recursos.limites.nombreModo}** *(${recursos.limites.descripcionModo})*\n` +
            `> 💾 **RAM Proceso (Bot):** \`${recursos.rssMB} MB\` *(Heap JS: \`${recursos.heapUsadoMB} MB\` • Buffers Canvas/3D: \`${recursos.nativoCanvasMB} MB\`)*\n` +
            `> 📦 **RAM Contenedor / Host:** \`${recursos.hostUsadaMB} MB\`${detalleLimiteHost}\n` +
            `> 🚀 **Red y Velocidad:** \`${httpHits}\` consultas aceleradas en caché • \`${failovers}\` rescates anti-caída RoProxy • Cola GPU: \`${recursos.activeGpuTasks}/${recursos.limites.maxGpu}\`\n\n` +
            `### 🧹 ¿Qué limpia exactamente el botón «Purgar Caché y Buffers»?\n` +
            `El botón **descarga únicamente basura temporal acumulada en RAM** tras generar imágenes o consultar APIs:\n` +
            (subsistemasLines ? `${subsistemasLines}\n` : '') +
            `> 🔒 **Garantía de Protección:** **Jamás** borra cuentas vinculadas (\`${fastLinkCache.size}\`), ni sesiones OAuth2 (\`${discordConfigCache.size}\`), ni listas de monitoreo.\n\n` +
            `### 🖥️ Terminal de Diagnóstico y Procedimientos\n` +
            '```ansi\n' +
            `kortex@optimizer:~$ status --subsystems --temp-kb=${recursos.inspeccion?.totalApproxKB || 0}KB\n` +
            `${logsRecientes}\n` +
            '```'
        ));

        container.addSeparatorComponents(separador());

        // 3. CONTROL GENERAL DE MECÁNICAS TÉCNICAS DEL SISTEMA (SIN DESACTIVAR CATEGORÍAS DE HERRAMIENTAS)
        const fmtEstado = (val) => (val ? '🟢 **Activo**' : '🔴 **Pausado**');
        const fmtMant = ownerCfg.maintenanceMode
            ? '🟠 **ACTIVO (Solo vos como Propietario podés usar comandos)**'
            : '🟢 **Desactivado (Abierto normalmente a todos los usuarios)**';

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ⚙️ 3. Control General de Mecánicas Técnicas del Sistema\n` +
            `> 🛠️ **Modo Mantenimiento Global:** ${fmtMant}\n` +
            `> 📋 **Sistema de Procedimientos por Filas (1 a 4) + Terminal:** ${fmtEstado(ownerCfg.dynamicLoadingEnabled)} *(Solo aparece si una tarea demora >650ms)*\n` +
            `> 🔔 **Monitoreo y Alertas en Segundo Plano:** ${fmtEstado(ownerCfg.backgroundMonitorsEnabled)} *(Escaneo periódico de precios, Robux pendientes y parches)*\n` +
            `> 🎨 **Motor de Renderizado Pesado (Canvas HD / Exportador 3D .ZIP):** ${fmtEstado(ownerCfg.heavyCanvas3DEnabled)} *(Generación de tarjetas PNG y mallas .OBJ)*\n` +
            `> ⚡ **Caché Rápida Anti-Rate-Limit (Roblox API):** ${fmtEstado(ownerCfg.smartApiCacheEnabled)} *(Acelera respuestas repetidas y evita bloqueos 429)*\n` +
            `> 🛡️ **Escudo Failover Automático (\`roblox.com\` ↔ \`roproxy.com\`):** ${fmtEstado(ownerCfg.autoFailoverShieldEnabled)} *(Cambia de ruta automáticamente si Roblox falla)*`
        ));

        const selectOwnerMechanics = new StringSelectMenuBuilder()
            .setCustomId('select_owner_mechanic')
            .setPlaceholder('⚙️ Seleccioná una mecánica técnica del sistema para ajustar...')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        botRoblox.connected
                            ? `Cuenta Roblox del Bot (@${botRoblox.roblox_username})`
                            : 'Conectar Cuenta de Roblox del Bot (Verificador)'
                    )
                    .setDescription('Configura la cuenta de Roblox del bot que envía los códigos al buzón de Roblox')
                    .setValue('owner_config_roblox_bot')
                    .setEmoji('🤖'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(`Modo del Motor RAM/GPU (Actual: ${ownerCfg.engineMode.toUpperCase()})`)
                    .setDescription('Alterna entre Automático Calibrado, Ahorro Estricto y Alto Rendimiento')
                    .setValue('owner_cycle_engine')
                    .setEmoji('🎛️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Ejecutar Diagnóstico de Arranque y Calibración')
                    .setDescription('Verifica fuentes TTF, sincroniza escudos HTTP y barre tokens vencidos')
                    .setValue('owner_run_boot_diag')
                    .setEmoji('🚀'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(`Modo Mantenimiento Global (${ownerCfg.maintenanceMode ? 'Desactivar' : 'Activar'})`)
                    .setDescription('Restringe temporalmente el uso del bot solo para vos (Propietario)')
                    .setValue('owner_toggle_maintenance')
                    .setEmoji('🛠️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(`Sistema de Ejecución por Filas (${ownerCfg.dynamicLoadingEnabled ? 'Pausar' : 'Activar'})`)
                    .setDescription('Muestra las Filas 1 a 4 y la Terminal cuando un proceso pesado tarda en cargar')
                    .setValue('owner_toggle_loading')
                    .setEmoji('📋'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(`Monitoreo de Alertas en 2do Plano (${ownerCfg.backgroundMonitorsEnabled ? 'Pausar' : 'Activar'})`)
                    .setDescription('Controla el escaneo automático de precios, Robux pendientes y parches')
                    .setValue('owner_toggle_monitors')
                    .setEmoji('🔔'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(`Motor Gráfico Canvas HD y 3D (${ownerCfg.heavyCanvas3DEnabled ? 'Pausar' : 'Activar'})`)
                    .setDescription('Habilita o pausa la generación de imágenes pesadas y paquetes 3D .ZIP')
                    .setValue('owner_toggle_canvas3d')
                    .setEmoji('🎨'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(`Caché Rápida Anti-Rate-Limit (${ownerCfg.smartApiCacheEnabled ? 'Pausar' : 'Activar'})`)
                    .setDescription('Guarda en RAM por 35s las consultas a Roblox para responder al instante sin error 429')
                    .setValue('owner_toggle_apicache')
                    .setEmoji('⚡'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(`Escudo Failover RoProxy (${ownerCfg.autoFailoverShieldEnabled ? 'Pausar' : 'Activar'})`)
                    .setDescription('Usa respaldo automático si un endpoint directo de Roblox devuelve error')
                    .setValue('owner_toggle_failover')
                    .setEmoji('🛡️')
            ]);

        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectOwnerMechanics));
        container.addSeparatorComponents(separador(true));

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton(
                    'btn_owner_bot_roblox_modal',
                    botRoblox.connected ? `Bot Roblox: @${botRoblox.roblox_username}` : 'Cuenta Roblox del Bot',
                    '🤖',
                    ButtonStyle.Success
                ),
                boton('btn_owner_optimize_ram', 'Purgar Caché y Buffers', '🧹', ButtonStyle.Primary),
                boton('btn_owner_boot_diag', 'Calibrar Sistema', '🚀', ButtonStyle.Secondary),
                boton(
                    'btn_owner_toggle_maintenance',
                    ownerCfg.maintenanceMode ? 'Salir Mantenimiento' : 'Modo Mantenimiento',
                    '🛠️',
                    ownerCfg.maintenanceMode ? ButtonStyle.Danger : ButtonStyle.Secondary
                ),
                boton('btn_owner_refresh', 'Actualizar', '🔄', ButtonStyle.Secondary)
            )
        );

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer('Configuración y Moderación del Bot (/config) • Diagnóstico transparente y arranque calibrado')
        ));

        return {
            components: [container],
            files: [],
            attachments: [],
            flags: MessageFlags.IsComponentsV2
        };
    }

    // =========================================================
    // CATEGORÍA 1: CUENTAS, CONEXIÓN E HISTORIAL (USUARIOS)
    // =========================================================
    const cfg = await verificarAutorizacionDiscordOAuth(uid);
    const cuentaRoblox = await verificarAutorizacionRobloxOAuth(uid).catch(() => null);
    const resumen = await obtenerHistorialYEstadoCuenta(uid).catch(() => null);
    const baseAppUrl = (process.env.APP_URL || process.env.PUBLIC_GUIDE_URL || 'https://ais-dev-dmpwse4jqkfkz4vfkzt6pu-494677195769.us-west1.run.app').replace(/\/+$/, '');
    const directDiscordOAuthUrl = `${baseAppUrl}/api/auth/discord/redirect?discord_id=${encodeURIComponent(uid)}`;

    const container = new ContainerBuilder().setAccentColor(cfg.oauth_verified ? 0x23A55A : 0x5865F2);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# ⚙️ Configuración de Usuario\n` +
        `**🔗 Categoría: Cuentas y Conexión**\n` +
        `Seleccioná una categoría en el menú desplegable para gestionar las cuentas, el estado y el historial de tu perfil.` +
        (feedbackMsg ? `\n\n> ${feedbackMsg}` : '')
    ));

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectConfigCat));
    container.addSeparatorComponents(separador(true));

    const estadoOAuth = cfg.oauth_verified
        ? `🟢 **Conectada y Guardada** (\`@${cfg.discord_username || username}\`)`
        : `⚪ **Sin sesión OAuth2 guardada aún**`;

    const estadoRoblox = cuentaRoblox && cuentaRoblox.roblox_user_id
        ? `🟢 **@${cuentaRoblox.roblox_username}** (\`ID ${cuentaRoblox.roblox_user_id}\`)`
        : `⚪ *No vinculada aún*`;

    const accountDetailText = new TextDisplayBuilder().setContent(
        `## 🔗 Estado de tus Cuentas\n` +
        `💬 **Cuenta de Discord:** ${estadoOAuth}\n` +
        `🎮 **Cuenta de Roblox:** ${estadoRoblox}\n` +
        `📊 **Datos Guardados:** \`${resumen?.stats?.wishlistCount || 0}\` en Mi Lista • \`${resumen?.stats?.pendingRobuxCount || 0}\` Robux pendientes • \`${resumen?.stats?.gameSubsCount || 0}\` juegos seguidos\n` +
        `-# Tus sesiones y datos quedan respaldados de forma persistente aunque el bot se actualice.`
    );

    if (avatarUrl || cfg.discord_avatar) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(accountDetailText)
                .setThumbnailAccessory(thumb => thumb.setURL(avatarUrl || cfg.discord_avatar))
        );
    } else {
        container.addTextDisplayComponents(accountDetailText);
    }

    container.addSeparatorComponents(separador());

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `### 💬 Conexión Oficial con Discord OAuth2\n` +
                (cfg.oauth_verified
                    ? `Tu sesión está guardada y activa. Si deseás revalidar tus permisos con Discord, podés usar el botón al costado.`
                    : `Conectá y autorizá la aplicación mediante **Discord OAuth2** para guardar tus listas y alertas de forma permanente.`)
            ))
            .setButtonAccessory(
                new ButtonBuilder()
                    .setLabel(cfg.oauth_verified ? 'Revalidar Conexión' : 'Conectar con Discord OAuth2')
                    .setEmoji('🔗')
                    .setStyle(ButtonStyle.Link)
                    .setURL(directDiscordOAuthUrl)
            )
    );

    const hist = (resumen?.history || []).slice(0, 3);
    if (hist.length > 0) {
        container.addSeparatorComponents(separador());
        const lineas = hist.map(h => `• **${h.title}** — *${h.detail || 'Guardado'}*`).join('\n');
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 📋 Historial Reciente de tu Cuenta\n${lineas}`
        ));
    }

    container.addSeparatorComponents(separador(true));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_config_refresh', 'Comprobar Conexión', '🔄', ButtonStyle.Success),
            boton('btn_fastlink_modal', 'Cuenta de Roblox', '🎮', ButtonStyle.Secondary)
        )
    );

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Configuración de Usuario (/config) • Persistencia automática de sesión e historial activa')
    ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

/**
 * PANEL DE DESBLOQUEO DE FUNCIÓN (Cuando una mecánica específica requiere cuenta conectada para funcionar bien):
 */
function construirPanelDesbloqueoRequerido({
    tipo = 'discord',
    userId,
    nombreHerramienta = 'Esta función',
    motivo = '',
    backButtonId = 'btn_nav_main_menu',
    backLabel = 'Volver a las Herramientas'
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
                `# 🔓 Desbloquear Función: ${nombreHerramienta}\n` +
                `${motivo || 'Para que esta función cargue los datos reales de tu propio personaje sin errores, necesitás tener vinculada tu **Cuenta de Roblox**.'}\n\n` +
                `-# Podés seguir usando libremente todas las herramientas generales sin registrarte, o vincular tu cuenta de Roblox abajo para desbloquear las funciones de tu avatar.`
            ))
            .addSeparatorComponents(separador(true))
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `### 🔐 Opción 1: Iniciar Sesión con Roblox OAuth 2.0\n` +
                        `Autorizá tu perfil oficialmente en Roblox para desbloquear al instante tu personaje.`
                    ))
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setLabel('Iniciar Sesión en Roblox')
                            .setEmoji('🔐')
                            .setStyle(ButtonStyle.Link)
                            .setURL(directRobloxOAuthUrl)
                    )
            )
            .addSeparatorComponents(separador())
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `### 📬 Opción 2: Vincular por Nombre o ID (Verificación en Roblox)\n` +
                        `Recibí un código en tu Galería de Mensajes de Roblox para verificar tu cuenta.`
                    ))
                    .setButtonAccessory(
                        boton('btn_fastlink_manual_modal', 'Verificar en Roblox', '📬', ButtonStyle.Primary)
                    )
            )
            .addSeparatorComponents(separador(true))
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    boton('btn_fastlink_modal', 'Ir al Centro de Cuenta Roblox', '🎮', ButtonStyle.Success),
                    boton(backButtonId, backLabel, '⬅️', ButtonStyle.Secondary)
                )
            )
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                footer('Requisito funcional de avatar • Las demás herramientas de consulta siguen disponibles sin registro')
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
            `# 🔓 Desbloquear Función: ${nombreHerramienta}\n` +
            `${motivo || 'Para guardar tus datos personales y enviarte alertas automáticas en Discord de forma segura, esta función requiere que inicies sesión con tu **Cuenta de Discord**.'}\n\n` +
            `-# Todas las herramientas de consulta siguen abiertas sin registrarse. Si querés usar esta mecánica personal, iniciá sesión abajo para desbloquearla.`
        ))
        .addSeparatorComponents(separador(true))
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `### 💬 Iniciar Sesión con Discord OAuth 2.0\n` +
                    `Conectá tu cuenta una sola vez (también disponible desde \`/config\` → *Cuentas y Conexión*) para habilitar el guardado y las notificaciones automáticas.`
                ))
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setLabel('Iniciar Sesión con Discord')
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
            footer('Requisito funcional de alertas y guardado • También gestionable en /config')
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

    const lista = existentes || [];
    if (lista.some(i => String(i.id_objet) === idStr)) {
        return { ok: false, motivo: `El objeto **${itemName}** (ID \`${idStr}\`) ya está en tu **Mi Lista**.` };
    }

    if (lista.length >= MAX_WISHLIST_ITEMS) {
        return {
            ok: false,
            motivo: `Tu **Mi Lista** ya alcanzó el límite máximo de **${MAX_WISHLIST_ITEMS}/${MAX_WISHLIST_ITEMS}** objetos.`
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
        maxItems: MAX_WISHLIST_ITEMS,
        item: nuevoRegistro
    };
}

module.exports = {
    MAX_WISHLIST_ITEMS,
    fastLinkCache,
    discordConfigCache,
    accountHistoryCache,
    pendingRobloxVerifications,
    onAccountLinked,
    resolverUsuarioRoblox,
    obtenerCuentaVinculada,
    obtenerCuentaVinculadaSync,
    guardarCuentaVinculada,
    eliminarCuentaVinculada,
    obtenerEstadoCuentaBotRoblox,
    conectarCuentaBotRoblox,
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
