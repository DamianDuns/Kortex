// ==========================================
// ARCHIVO: src/webServer.js
// Servidor HTTP de Kortex (Documentación Web Oficial, Vistas Previas y API Local)
// Escucha en 0.0.0.0:3000 para AI Studio, Railway y entorno local
// ==========================================

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const supabase = require('../db');
const logger = require('../utils/logger');
const {
    obtenerConfigDiscord,
    guardarConfigDiscord,
    confirmarVerificacionDiscordWeb,
    buscarDiscordIdPorRobloxUserIdAsync,
    migrarDatosDeSesion,
    guardarCuentaVinculada,
    eliminarCuentaVinculada,
    obtenerHistorialYEstadoCuenta,
    registrarEventoHistorialCuenta,
    resolverUsuarioRoblox
} = require('./utils/fastLink');
const { fetchWithRetry } = require('../utils/http');

const DOCS_DIR = path.resolve(__dirname, '..', 'docs');
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8'
};

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5865F2"/>
      <stop offset="100%" stop-color="#4752C4"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#g)"/>
  <text x="32" y="43" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="34" fill="#FFFFFF">K</text>
</svg>`;

let activeServer = null;

function sendJson(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey'
    });
    res.end(body);
}

function readJsonBody(req, maxBytes = 64 * 1024) {
    return new Promise((resolve, reject) => {
        let total = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
                reject(new Error('Payload demasiado grande'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (chunks.length === 0) return resolve({});
            try {
                const raw = Buffer.concat(chunks).toString('utf8');
                resolve(raw ? JSON.parse(raw) : {});
            } catch {
                resolve({});
            }
        });
        req.on('error', reject);
    });
}

async function obtenerResumenTycoonUsuario(discordId) {
    const uid = String(discordId || '').trim();
    if (!uid || uid === 'default_session') return null;
    try {
        const { data: row } = await supabase
            .from('tycoon_profiles')
            .select('*')
            .eq('user_id', uid)
            .maybeSingle();
        const profile = row || (supabase.memoryTables?.tycoon_profiles || []).find(r => r && String(r.user_id) === uid) || null;
        if (!profile) return null;
        return {
            studio_stage: Number(profile.studio_stage ?? profile.studio_level ?? 1),
            rebirth_count: Number(profile.rebirth_count ?? profile.rebirths ?? 0),
            tix_balance: Number(profile.tix_balance ?? profile.tix ?? 0),
            voxeles: Number(profile.crystal_balance ?? profile.kortex_crystals ?? 0),
            key_fragments: Number(profile.key_fragments ?? 0),
            master_keys: Number(profile.master_keys ?? 0)
        };
    } catch {
        return null;
    }
}

async function construirPayloadCuentaWeb(discordId) {
    const cleanId = String(discordId || 'default_session').trim() || 'default_session';
    const base = await obtenerHistorialYEstadoCuenta(cleanId);
    const tycoonSummary = base.hasActiveAccount ? await obtenerResumenTycoonUsuario(cleanId) : null;
    return {
        ok: true,
        ...base,
        tycoonSummary
    };
}

async function handleLocalRpc(fnName, params, client) {
    if (fnName === 'kortex_web_get_account_status') {
        const discordId = String(params?.p_discord_id || '').trim();
        if (!discordId || discordId === 'default_session') {
            return {
                ok: true,
                discordId: '',
                discordConfig: null,
                linkedAccount: null,
                hasActiveAccount: false,
                history: [],
                stats: { wishlistCount: 0, pendingRobuxCount: 0, redeemedCodesCount: 0, gameSubsCount: 0 },
                tycoonSummary: null
            };
        }
        return await construirPayloadCuentaWeb(discordId);
    }

    if (fnName === 'kortex_web_verify_discord') {
        const rawCode = String(params?.p_code || '').trim();
        const rawDiscordId = String(params?.p_discord_id || '').trim();
        const prevRblxSession = String(
            params?.p_previous_session_id || (rawDiscordId.startsWith('rblx_') ? rawDiscordId : '')
        ).trim();

        const verifyRes = await confirmarVerificacionDiscordWeb(
            rawDiscordId.startsWith('rblx_') ? '' : rawDiscordId,
            rawCode,
            client || null,
            { previousSessionId: prevRblxSession }
        );
        if (!verifyRes || !verifyRes.ok) {
            return {
                ok: false,
                message: verifyRes?.message || '❌ Código inválido o expirado. Ejecutá /config en Discord para ver tu código vigente.'
            };
        }
        return await construirPayloadCuentaWeb(verifyRes.discordId);
    }

    if (fnName === 'kortex_web_link_roblox') {
        const rawDiscordId = String(params?.p_discord_id || '').trim();
        const robloxUserId = Number(params?.p_roblox_user_id || 0);
        const robloxUsername = String(params?.p_roblox_username || '').trim();
        if (!robloxUserId || !robloxUsername) {
            return { ok: false, message: 'Datos de cuenta de Roblox incompletos.' };
        }

        let sessionKey = /^\d{15,22}$/.test(rawDiscordId) ? rawDiscordId : '';
        if (!sessionKey) {
            const existingOwnerDiscordId = await buscarDiscordIdPorRobloxUserIdAsync(robloxUserId);
            if (existingOwnerDiscordId) {
                sessionKey = existingOwnerDiscordId;
            }
        }
        if (!sessionKey) {
            sessionKey = `rblx_${robloxUserId}`;
        }

        await guardarCuentaVinculada(sessionKey, {
            roblox_user_id: robloxUserId,
            roblox_username: robloxUsername,
            display_name: String(params?.p_display_name || robloxUsername),
            avatar_url: params?.p_avatar_url || null,
            auth_method: String(params?.p_auth_method || 'bio_verified')
        });

        if (/^\d{15,22}$/.test(sessionKey)) {
            const existingCfg = obtenerConfigDiscord(sessionKey);
            if (existingCfg && (existingCfg.discord_username || existingCfg.oauth_verified)) {
                guardarConfigDiscord(sessionKey, { oauth_verified: true });
            }
            const orphanRblxKey = `rblx_${robloxUserId}`;
            await migrarDatosDeSesion(orphanRblxKey, sessionKey).catch(() => {});
        } else {
            guardarConfigDiscord(sessionKey, {
                lang: obtenerConfigDiscord(sessionKey).lang || 'es'
            });
        }
        return await construirPayloadCuentaWeb(sessionKey);
    }

    if (fnName === 'kortex_web_sync_discord_oauth') {
        const discordId = String(params?.p_discord_id || '').trim();
        const username = String(params?.p_username || '').trim();
        const avatarUrl = String(params?.p_avatar_url || '').trim();
        const prevSession = String(params?.p_previous_session_id || '').trim();
        if (!/^\d{15,22}$/.test(discordId)) {
            return { ok: false, message: 'ID de Discord inválido.' };
        }
        const prevCfg = obtenerConfigDiscord(discordId);
        guardarConfigDiscord(discordId, {
            discord_id: discordId,
            oauth_verified: true,
            discord_username: username || prevCfg.discord_username || `Usuario ${discordId.slice(-4)}`,
            discord_avatar: avatarUrl || prevCfg.discord_avatar || null,
            verified_at: new Date().toISOString()
        });
        if (prevSession && prevSession.startsWith('rblx_') && prevSession !== discordId) {
            await migrarDatosDeSesion(prevSession, discordId).catch(() => {});
        }
        registrarEventoHistorialCuenta(discordId, {
            category: 'discord',
            title: `Sesión unificada activa: @${username || prevCfg.discord_username || discordId}`,
            detail: 'Perfil sincronizado automáticamente con tus datos guardados'
        });
        return await construirPayloadCuentaWeb(discordId);
    }

    if (fnName === 'kortex_web_disconnect_account') {
        const discordId = String(params?.p_discord_id || '').trim();
        const provider = String(params?.p_provider || 'all').trim().toLowerCase();
        if (!discordId) {
            return {
                ok: true,
                discordId: '',
                discordConfig: null,
                linkedAccount: null,
                hasActiveAccount: false,
                history: [],
                stats: { wishlistCount: 0, pendingRobuxCount: 0, redeemedCodesCount: 0, gameSubsCount: 0 },
                tycoonSummary: null
            };
        }
        if (provider === 'discord' || provider === 'all') {
            await eliminarCuentaVinculada(discordId, 'discord');
        }
        if (provider === 'roblox' || provider === 'all') {
            await eliminarCuentaVinculada(discordId, 'roblox');
        }
        return await construirPayloadCuentaWeb(discordId);
    }

    return { ok: false, message: `Procedimiento desconocido: ${fnName}` };
}

async function handleCanvasTycoon(urlObj, res) {
    const section = urlObj.searchParams.get('section') || 'sec_studio';
    const { getOrCreatePlayerState, getTycoonLeaderboard } = require('../services/tycoonEngine');
    const {
        renderTycoonSnapshot,
        renderTycoonShopShowcase,
        renderTycoonVaultShowcase,
        renderTycoonQuestsShowcase
    } = require('../utils/tycoonRenderer');

    const state = await getOrCreatePlayerState('web_preview_studio');
    let pngBuffer;
    if (section === 'sec_shop') {
        pngBuffer = await renderTycoonShopShowcase({ state, username: 'KortexStudio', lang: 'es' });
    } else if (section === 'sec_vault') {
        pngBuffer = await renderTycoonVaultShowcase({ state, username: 'KortexStudio', lang: 'es' });
    } else if (section === 'sec_perks') {
        const leaderboard = await getTycoonLeaderboard(5).catch(() => []);
        pngBuffer = await renderTycoonQuestsShowcase({ state, username: 'KortexStudio', lang: 'es', leaderboard });
    } else {
        pngBuffer = await renderTycoonSnapshot({ state, username: 'KortexStudio', lang: 'es' });
    }

    res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=30'
    });
    res.end(pngBuffer);
}

function tryServeStaticFile(baseDir, relativePathname, res) {
    const safeRel = path.normalize(relativePathname).replace(/^(\.\.(\/|\\|$))+/, '');
    const candidate = path.resolve(baseDir, '.' + path.sep + safeRel);
    if (!candidate.startsWith(baseDir + path.sep) && candidate !== baseDir) {
        return false;
    }

    let finalPath = candidate;
    if (fs.existsSync(finalPath) && fs.statSync(finalPath).isDirectory()) {
        finalPath = path.join(finalPath, 'index.html');
    }

    if (!fs.existsSync(finalPath) || !fs.statSync(finalPath).isFile()) {
        return false;
    }

    const baseName = path.basename(finalPath).toLowerCase();
    if (baseName.startsWith('.env') || /^env[_.-]/.test(baseName)) {
        return false;
    }

    const ext = path.extname(finalPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const cacheHeader = ext === '.html' ? 'no-cache' : 'public, max-age=300';

    res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheHeader
    });
    fs.createReadStream(finalPath).pipe(res);
    return true;
}

const SUPABASE_UMD_FILE = path.resolve(__dirname, '..', 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');

function resolveRuntimePublicSupabaseConfig() {
    const fromEnv = typeof supabase.getPublicSupabaseBrowserConfig === 'function'
        ? supabase.getPublicSupabaseBrowserConfig(process.env)
        : { supabaseUrl: '', supabaseKey: '', realtimeEnabled: false };
    return fromEnv;
}

function createKortexHttpServer({ client = null } = {}) {
    const openSseResponses = new Set();

    const server = http.createServer(async (req, res) => {
        try {
            const method = (req.method || 'GET').toUpperCase();
            const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost:3000'}`);
            let pathname = decodeURIComponent(urlObj.pathname || '/');

            if (method === 'OPTIONS') {
                res.writeHead(204, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey'
                });
                res.end();
                return;
            }

            if (method === 'GET' && pathname === '/favicon.ico') {
                res.writeHead(200, {
                    'Content-Type': 'image/svg+xml',
                    'Cache-Control': 'public, max-age=86400'
                });
                res.end(FAVICON_SVG);
                return;
            }

            if (method === 'GET' && (pathname === '/supabase-config.js' || pathname === '/Kortex/supabase-config.js')) {
                const pubCfg = resolveRuntimePublicSupabaseConfig();
                const jsBody = `window.__KORTEX_SUPABASE_CONFIG__ = ${JSON.stringify(pubCfg)};\n`;
                res.writeHead(200, {
                    'Content-Type': 'application/javascript; charset=utf-8',
                    'Cache-Control': 'no-store',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(jsBody);
                return;
            }

            if (method === 'GET' && pathname === '/api/supabase-config') {
                const pubCfg = resolveRuntimePublicSupabaseConfig();
                sendJson(res, 200, {
                    ok: true,
                    ...pubCfg
                });
                return;
            }

            if (method === 'GET' && (pathname === '/vendor/supabase.js' || pathname === '/Kortex/vendor/supabase.js')) {
                if (fs.existsSync(SUPABASE_UMD_FILE)) {
                    res.writeHead(200, {
                        'Content-Type': 'application/javascript; charset=utf-8',
                        'Cache-Control': 'public, max-age=86400'
                    });
                    fs.createReadStream(SUPABASE_UMD_FILE).pipe(res);
                    return;
                }
            }

            if (method === 'GET' && pathname === '/api/realtime/events') {
                const targetDiscordId = String(urlObj.searchParams.get('discord_id') || '').trim();
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream; charset=utf-8',
                    'Cache-Control': 'no-cache, no-transform',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*',
                    'X-Accel-Buffering': 'no'
                });

                openSseResponses.add(res);
                res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, discordId: targetDiscordId, connectedAt: new Date().toISOString() })}\n\n`);

                const onAccountSync = (payload) => {
                    if (!payload || res.writableEnded) return;
                    if (!targetDiscordId || payload.discordId === targetDiscordId) {
                        try {
                            res.write(`event: account_sync\ndata: ${JSON.stringify(payload)}\n\n`);
                        } catch {
                            // Conexión cerrada por el cliente
                        }
                    }
                };

                if (supabase.events && typeof supabase.events.on === 'function') {
                    supabase.events.on('account_sync', onAccountSync);
                }

                const heartbeatTimer = setInterval(() => {
                    if (!res.writableEnded) {
                        try {
                            res.write(': keepalive\n\n');
                        } catch {
                            // Silencioso
                        }
                    }
                }, 20000);
                if (typeof heartbeatTimer.unref === 'function') {
                    heartbeatTimer.unref();
                }

                const cleanup = () => {
                    clearInterval(heartbeatTimer);
                    openSseResponses.delete(res);
                    if (supabase.events && typeof supabase.events.off === 'function') {
                        supabase.events.off('account_sync', onAccountSync);
                    }
                };

                req.on('close', cleanup);
                res.on('close', cleanup);
                return;
            }

            if (method === 'GET' && pathname === '/api/health') {
                const isReady = Boolean(client && typeof client.isReady === 'function' && client.isReady());
                const pubCfg = resolveRuntimePublicSupabaseConfig();
                sendJson(res, 200, {
                    ok: true,
                    service: 'kortex',
                    status: 'online',
                    discordReady: isReady,
                    supabaseConfigured: !supabase.isMemoryFallback,
                    realtimeEnabled: pubCfg.realtimeEnabled,
                    uptimeSeconds: Math.round(process.uptime())
                });
                return;
            }

            if (method === 'POST' && pathname.startsWith('/api/rpc/')) {
                const fnName = pathname.slice('/api/rpc/'.length).trim();
                const body = await readJsonBody(req);
                const result = await handleLocalRpc(fnName, body, client);
                sendJson(res, 200, result);
                return;
            }

            if (method === 'GET' && pathname === '/api/roblox/resolve') {
                const input = String(urlObj.searchParams.get('input') || '').trim();
                if (!input) {
                    sendJson(res, 400, { ok: false, message: 'Parámetro input requerido.' });
                    return;
                }
                const resolved = await resolverUsuarioRoblox(input);
                if (!resolved || !resolved.roblox_user_id) {
                    sendJson(res, 404, { ok: false, message: 'Usuario de Roblox no encontrado.' });
                    return;
                }
                sendJson(res, 200, {
                    ok: true,
                    id: resolved.roblox_user_id,
                    name: resolved.roblox_username,
                    displayName: resolved.display_name || resolved.roblox_username,
                    avatarUrl: resolved.avatar_url || ''
                });
                return;
            }

            if (method === 'GET' && pathname.startsWith('/api/roblox/profile/')) {
                const rawUserId = pathname.slice('/api/roblox/profile/'.length).trim();
                if (!/^\d{1,15}$/.test(rawUserId)) {
                    sendJson(res, 400, { ok: false, message: 'ID de Roblox inválido.' });
                    return;
                }
                const profileRes = await fetchWithRetry(`https://users.roblox.com/v1/users/${rawUserId}`);
                sendJson(res, 200, profileRes.data || {});
                return;
            }

            if (method === 'GET' && pathname === '/api/canvas/tycoon') {
                await handleCanvasTycoon(urlObj, res);
                return;
            }

            if (method === 'GET' || method === 'HEAD') {
                if (pathname === '/' || pathname === '/Kortex' || pathname === '/Kortex/') {
                    pathname = '/index.html';
                } else if (pathname.startsWith('/Kortex/')) {
                    pathname = pathname.slice('/Kortex'.length);
                }

                if (pathname.startsWith('/public/')) {
                    const relPublic = pathname.slice('/public/'.length);
                    if (tryServeStaticFile(PUBLIC_DIR, relPublic, res)) return;
                }

                if (tryServeStaticFile(DOCS_DIR, pathname, res)) return;
                if (tryServeStaticFile(PUBLIC_DIR, pathname, res)) return;
            }

            sendJson(res, 404, { ok: false, error: 'Ruta no encontrada' });
        } catch (err) {
            logger.error('WEB', err.message || err);
            if (!res.headersSent) {
                sendJson(res, 500, { ok: false, error: 'Error interno del servidor' });
            } else {
                res.end();
            }
        }
    });

    server.on('close', () => {
        for (const sseRes of openSseResponses) {
            try {
                sseRes.end();
            } catch {
                // Silencioso
            }
        }
        openSseResponses.clear();
    });

    return server;
}

function startWebServer({
    port = Number(process.env.PORT) || 3000,
    host = '0.0.0.0',
    client = null
} = {}) {
    if (activeServer) return Promise.resolve(activeServer);

    return new Promise((resolve, reject) => {
        const server = createKortexHttpServer({ client });
        server.once('error', (err) => {
            logger.error('WEB', `No se pudo iniciar el servidor HTTP en ${host}:${port}: ${err.message}`);
            reject(err);
        });
        server.listen(port, host, () => {
            activeServer = server;
            const addr = server.address();
            const boundPort = typeof addr === 'object' && addr ? addr.port : port;
            logger.ok(`Servidor Web de Kortex activo en http://${host}:${boundPort}`);
            resolve(server);
        });
    });
}

function stopWebServer() {
    if (!activeServer) return Promise.resolve();
    const srv = activeServer;
    activeServer = null;
    return new Promise((resolve) => {
        srv.close(() => resolve());
    });
}

module.exports = {
    createKortexHttpServer,
    startWebServer,
    stopWebServer
};
