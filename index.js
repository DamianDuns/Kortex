// ==========================================
// ARCHIVO: index.js
// Punto de entrada de Kortex: Servidor Web (0.0.0.0:3000) + Cliente Discord.js v14
// ==========================================

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
require('dotenv').config();
const logger = require('./utils/logger');
const supabase = require('./db');
const {
    generatePriceChart,
    generateWatchlistOverviewCanvas,
    generatePriceFloorsChart,
    generateCalculatorBreakdownCard,
    generatePendingRobuxCard,
    generateEmptyServersRadarCard,
    generateOutfitSandboxCard,
    generateClonesComparisonCanvas,
    generateMannequinTemplateCanvas,
    generateColorMatchCanvas
} = require('./src/utils/chartGenerator');
const { renderTycoonSnapshot, renderTycoonSectionCanvas } = require('./utils/tycoonRenderer');
const { getOrCreatePlayerState, getTycoonLeaderboard } = require('./services/tycoonEngine');
const {
    obtenerEstadoServidoresRoblox,
    obtenerJuegosEnTendenciaRoblox,
    obtenerPerfilAnaliticoRoblox,
    generateRobloxStatusCanvas,
    generateTrendingGamesCanvas,
    generateProfileInspectorCanvas,
    generateLimitedsRadarCanvas,
    generateCompareGamesCanvas
} = require('./src/modules/statusModule');

const modoDeploy = process.argv.includes('--deploy') || process.env.DEPLOY_COMMANDS === 'true';
logger.imprimirBanner(modoDeploy);

// Verificación no bloqueante de variables de entorno
const REQUIRED_ENV = ['DISCORD_TOKEN', 'CLIENT_ID', 'SUPABASE_URL'];
const faltantes = REQUIRED_ENV.filter(key => !process.env[key]);
if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_KEY) {
    faltantes.push('SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_KEY)');
}
if (faltantes.length > 0) {
    logger.warn(`Variables de entorno no configuradas aún: ${faltantes.join(', ')}. Iniciando servidor web en modo vista previa.`);
}

const routerInteracciones = require('./interactions');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ]
});

client.commands = new Collection();
const commandsForDeploy = [];
const nombresComandos = [];
const nombresEventos = [];

// 1. Carga de comandos
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            commandsForDeploy.push(command.data.toJSON());
            nombresComandos.push(command.data.name);
        }
    }
}

// 2. Carga de eventos
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        nombresEventos.push(event.once ? `${event.name} (once)` : event.name);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }
}

const resumenInteracciones = typeof routerInteracciones.obtenerResumenHandlers === 'function'
    ? routerInteracciones.obtenerResumenHandlers()
    : null;

logger.imprimirResumenCarga({
    comandos: nombresComandos,
    eventos: nombresEventos,
    interacciones: resumenInteracciones
});

// ==========================================
// 3. SERVIDOR HTTP EN PUERTO 3000 (0.0.0.0:3000)
// Sirve la Guía Oficial de Kortex, el Centro de Vinculación OAuth2 (Discord + Roblox) y vistas previas
// ==========================================
const axios = require('axios');
const {
    fastLinkCache,
    discordConfigCache,
    normalizarUrlPublica,
    setDetectedPublicAppUrl,
    obtenerUrlBasePublica,
    activarSesionDiscordDirecta,
    iniciarVerificacionDiscordWeb,
    confirmarVerificacionDiscordWeb,
    iniciarVerificacionCodigoRoblox,
    confirmarVerificacionCodigoRoblox,
    resolverUsuarioRoblox,
    guardarCuentaVinculada,
    eliminarCuentaVinculada,
    guardarConfigDiscord,
    verificarAutorizacionDiscordOAuth,
    verificarAutorizacionRobloxOAuth,
    registrarEventoHistorialCuenta,
    obtenerHistorialYEstadoCuenta,
    migrarDatosDeSesion,
    restaurarRespaldoCliente,
    sincronizarPersistenciaDesdeSupabase
} = require('./src/utils/fastLink');

const PORT = Number(process.env.PORT) || 3000;
const DOCS_HTML_PATH = path.join(__dirname, 'docs', 'index.html');

// Almacén temporal de estados OAuth2 (state -> { discordId, provider, mode, createdAt })
const oauthStates = new Map();
// Sesiones verificadas de Discord OAuth2 hidratadas desde disco al iniciar el servidor
const verifiedDiscordSessions = new Map();

// Hidratar sesiones guardadas y calibrar subsistemas
function hydratePersistedSessionsOnBoot() {
    for (const [discId, cfg] of discordConfigCache.entries()) {
        if (cfg && (cfg.oauth_verified || cfg.discord_username)) {
            verifiedDiscordSessions.set(String(discId), {
                id: String(discId),
                username: cfg.discord_username || 'Usuario',
                tag: cfg.discord_tag || cfg.discord_username || 'Usuario',
                avatar: cfg.discord_avatar || null,
                verifiedAt: cfg.verified_at || cfg.updated_at || new Date().toISOString()
            });
        }
    }
}
hydratePersistedSessionsOnBoot();

// Sincronizar cuentas persistentes con Supabase en segundo plano al iniciar
sincronizarPersistenciaDesdeSupabase().then(() => {
    hydratePersistedSessionsOnBoot();
    logger.ok('Persistencia remota con Supabase sincronizada e hidratada.');
}).catch((err) => {
    logger.warn('Sincronización inicial con Supabase en background:', err.message);
});

(function runDiagnosticsOnBoot() {
    try {
        const {
            registerCachePurger,
            ejecutarDiagnosticoArranqueYCalibracion
        } = require('./src/utils/performanceManager');
        registerCachePurger(
            'oauthTempStates',
            () => {
                const now = Date.now();
                let removed = 0;
                for (const [st, obj] of oauthStates.entries()) {
                    if (!obj || now - (obj.createdAt || 0) > 15 * 60 * 1000) {
                        oauthStates.delete(st);
                        removed++;
                    }
                }
                return removed;
            },
            {
                label: '🔑 Estados OAuth2 Temporales (Web)',
                whatItCleans: 'Tokens state de inicio de sesión web de más de 15 minutos',
                inspectFn: () => ({
                    entries: oauthStates.size,
                    approxKB: oauthStates.size,
                    detail: `${oauthStates.size} estado(s) temporal(es) • ${verifiedDiscordSessions.size} sesión(es) web activa(s)`
                })
            }
        );
        ejecutarDiagnosticoArranqueYCalibracion();
    } catch {
        // Silencioso
    }
})();

function resolveActiveSessionDiscordId(hintId) {
    const cleanHint = hintId ? String(hintId).trim() : '';
    if (cleanHint && cleanHint !== 'default_session' && cleanHint !== 'null' && cleanHint !== 'undefined') {
        return cleanHint;
    }
    return null;
}

function getBaseOrigin(req, urlObj = null) {
    const queryOrigin = urlObj ? normalizarUrlPublica(urlObj.searchParams.get('origin')) : '';
    if (queryOrigin && !/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(queryOrigin)) {
        setDetectedPublicAppUrl(queryOrigin);
        return queryOrigin;
    }

    const headerOrigin = normalizarUrlPublica(req.headers.origin);
    if (headerOrigin && !/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(headerOrigin)) {
        setDetectedPublicAppUrl(headerOrigin);
        return headerOrigin;
    }

    const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const rawProto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    if (rawHost && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(rawHost)) {
        const detected = normalizarUrlPublica(`${rawProto}://${rawHost}`);
        if (detected) {
            setDetectedPublicAppUrl(detected);
            return detected;
        }
    }

    return obtenerUrlBasePublica();
}

function readJsonBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
            if (body.length > 50000) req.destroy();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                resolve({});
            }
        });
        req.on('error', () => resolve({}));
    });
}

function renderOAuthCallbackPage({ ok, title, subtitle, payload }) {
    const safePayload = JSON.stringify(payload || {});
    const badgeColor = ok ? '#23A55A' : '#F23F43';
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Kortex</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0B0D13;
      color: #F2F4F8;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 20px;
    }
    .card {
      max-width: 460px;
      width: 100%;
      background: #12151E;
      border: 1px solid #232838;
      border-top: 4px solid ${badgeColor};
      border-radius: 12px;
      padding: 28px;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
    }
    h1 { font-size: 1.35rem; margin: 0 0 10px; }
    p { color: #9AA2B8; font-size: 0.95rem; line-height: 1.5; margin: 0 0 20px; }
    .btn {
      display: inline-block;
      padding: 10px 18px;
      border-radius: 8px;
      background: #5865F2;
      color: #fff;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.9rem;
      border: none;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${subtitle}</p>
    <a class="btn" href="https://damianduns.github.io/Kortex/" onclick="if(window.opener){window.close();return false;}">Volver a Kortex</a>
  </div>
  <script>
    (function() {
      var data = ${safePayload};
      if (window.opener) {
        try {
          window.opener.postMessage(data, '*');
          setTimeout(function() { window.close(); }, 1200);
        } catch (e) {}
      }
    })();
  </script>
</body>
</html>`;
}

function renderOAuthGatewayPage({ provider, discordId, authUrl, callbackUrl, baseOrigin }) {
    const isDiscord = provider === 'discord';
    const accent = isDiscord ? '#5865F2' : '#23A55A';
    const title = isDiscord
        ? '💬 Conectar Cuenta de Discord — Kortex'
        : '🎮 Conectar Cuenta de Roblox — Kortex';
    const sharedOrigin = baseOrigin.replace('https://ais-dev-', 'https://ais-pre-');
    const sharedCallbackUrl = `${sharedOrigin}/auth/${isDiscord ? 'discord' : 'roblox'}/callback`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #090B10;
      color: #F3F5F9;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 18px;
    }
    .card {
      max-width: 520px;
      width: 100%;
      background: #121621;
      border: 1px solid #242B3D;
      border-top: 4px solid ${accent};
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.65);
    }
    h1 { font-size: 1.22rem; margin: 0 0 8px; }
    p { color: #9BA5BA; font-size: 0.88rem; line-height: 1.5; margin: 0 0 16px; }
    .box {
      background: #0C0F17;
      border: 1px solid #22293A;
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .box-title {
      font-size: 0.84rem;
      font-weight: 700;
      color: #F3F5F9;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .badge {
      font-size: 0.7rem;
      padding: 2px 7px;
      border-radius: 6px;
      background: rgba(35, 165, 90, 0.18);
      color: #4ADE80;
      font-weight: 700;
    }
    .input-row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    input {
      flex: 1;
      background: #151A28;
      border: 1px solid #2C354D;
      border-radius: 8px;
      padding: 10px 12px;
      color: #F3F5F9;
      font-size: 0.88rem;
      outline: none;
    }
    input:focus { border-color: ${accent}; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      padding: 11px 16px;
      border-radius: 9px;
      background: ${accent};
      color: #fff;
      text-decoration: none;
      font-weight: 700;
      font-size: 0.88rem;
      border: none;
      cursor: pointer;
    }
    .btn-secondary {
      background: #1C2335;
      border: 1px solid #2E3852;
      color: #E2E8F0;
      margin-top: 8px;
    }
    .uri-code {
      display: block;
      background: #080A0F;
      border: 1px solid #1E2536;
      border-radius: 7px;
      padding: 8px 10px;
      font-family: monospace;
      font-size: 0.74rem;
      color: #A5B4FC;
      word-break: break-all;
      margin: 6px 0;
    }
    .status-msg {
      margin-top: 10px;
      font-size: 0.82rem;
      line-height: 1.45;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>Elegí cómo querés conectar tu cuenta. El <strong>Portal Oficial OAuth 2.0</strong> es la vía recomendada para iniciar sesión y registrar tu cuenta con total comodidad.</p>

    <div class="box">
      <div class="box-title">
        <span>🔐 Opción 1: Portal Oficial OAuth 2.0 (${isDiscord ? 'Discord' : 'Roblox'})</span>
        <span class="badge">RECOMENDADO</span>
      </div>
      <p style="margin-bottom:8px;font-size:0.8rem;">Iniciá sesión o registrate de forma segura y directa con los servidores oficiales de ${isDiscord ? 'Discord' : 'Roblox'}:</p>
      <a class="btn" style="background:${isDiscord ? '#5865F2' : '#0284C7'};color:#FFFFFF;margin-bottom:10px;text-align:center;display:block;" href="${authUrl}">🌐 Iniciar Sesión con ${isDiscord ? 'Discord' : 'Roblox'} OAuth 2.0</a>
      <p style="margin-top:6px;font-size:0.72rem;color:#94A3B8;">Si el portal muestra <em>"Invalid redirect_uri / URL no válida"</em>, agregá esta redirección en tu aplicación:</p>
      <code class="uri-code">${callbackUrl}</code>
      ${sharedCallbackUrl !== callbackUrl ? `<code class="uri-code">${sharedCallbackUrl}</code>` : ''}
    </div>

    <div class="box">
      <div class="box-title">
        <span>🔑 Opción 2: Conexión Alternativa con Código en <code>/config</code></span>
      </div>
      ${isDiscord ? `
        <p style="margin-bottom:8px;font-size:0.8rem;">Método manual alternativo: tu clave personal se aloja en el comando <strong><code>/config</code></strong> dentro de Discord (apartado <strong>1. Cuenta de Discord</strong>). Copiala de ahí y pegala abajo:</p>
        <div class="input-row">
          <input id="quick-input" type="text" value="${discordId && !discordId.startsWith('guest_') && discordId !== 'default_session' ? discordId : ''}" placeholder="Tu Discord ID (ej: 123456789012345678)" />
        </div>
        <div id="verify-step2-box" style="margin-top:8px;">
          <div class="input-row">
            <input id="quick-code-input" type="text" placeholder="Tu código de /config (Ej: KTX-123456)" />
          </div>
          <button type="button" class="btn btn-secondary" style="margin-top:8px;" onclick="runQuickLink('verify')">Conectar con Código de /config</button>
        </div>
      ` : `
        <p style="margin-bottom:8px;font-size:0.8rem;">Método manual alternativo: escribí tu <strong>@Usuario de Roblox</strong> o tu <strong>ID numérico</strong> para generar tu código de propiedad en tu biografía:</p>
        <div class="input-row">
          <input id="quick-input" type="text" placeholder="Ej: TuUsuarioRoblox o tu ID de Roblox" />
        </div>
        <button type="button" class="btn btn-secondary" id="btn-step1" style="margin-top:8px;" onclick="runQuickLink('start')">Paso 1: Generar Código de Propiedad</button>
        <div id="verify-step2-box" style="display:none;margin-top:12px;padding-top:10px;border-top:1px solid #22293A;">
          <p style="margin-bottom:6px;font-size:0.78rem;color:#E2E8F0;">Paso 2: Pegá este código único en la descripción (<strong>"Acerca de"</strong>) de tu perfil en Roblox y guardá:</p>
          <code class="uri-code" id="roblox-verify-phrase" style="font-size:0.9rem;font-weight:800;color:#4ADE80;text-align:center;">KORTEX-0000</code>
          <a id="roblox-profile-link" class="btn btn-secondary" href="https://www.roblox.com" target="_blank" rel="noopener" style="margin-bottom:6px;">🔗 Abrir Mi Perfil en Roblox</a>
          <button type="button" class="btn" style="background:#23A55A;" onclick="runQuickLink('verify')">✅ Ya pegué el código / Comprobar Propiedad</button>
        </div>
      `}
      <div id="quick-status" class="status-msg"></div>
    </div>
  </div>

  <script>
    var gatewayPollTimer = null;
    function startGatewayAutoPoll() {
      if (!${isDiscord ? 'true' : 'false'}) return;
      if (gatewayPollTimer) clearInterval(gatewayPollTimer);
      gatewayPollTimer = setInterval(function() {
        runQuickLink('poll');
      }, 2200);
    }

    async function runQuickLink(actionMode) {
      var val = (document.getElementById('quick-input').value || '').trim();
      var codeEl = document.getElementById('quick-code-input');
      var codeVal = codeEl ? (codeEl.value || '').trim() : '';
      var st = document.getElementById('quick-status');
      if (actionMode !== 'poll') {
        st.style.color = '#9BA5BA';
        st.textContent = actionMode === 'verify' ? 'Comprobando confirmación de la cuenta...' : 'Iniciando verificación de seguridad...';
      }
      try {
        var res = await fetch('/api/auth/${isDiscord ? 'discord' : 'roblox'}/quick-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: actionMode || 'start',
            discordId: val || '${discordId || ''}',
            query: val,
            code: codeVal
          })
        });
        var data = await res.json();
        if (!data.ok) {
          if (actionMode === 'poll') return;
          st.style.color = '#F23F43';
          st.textContent = data.message || 'No se pudo verificar la cuenta.';
          if (data.step === 'verify_required') {
            var box = document.getElementById('verify-step2-box');
            if (box) box.style.display = 'block';
            startGatewayAutoPoll();
          }
          return;
        }
        if (data.step === 'verify_required') {
          if (actionMode !== 'poll') {
            st.style.color = '#F0B232';
            st.textContent = data.message;
            var step2 = document.getElementById('verify-step2-box');
            if (step2) step2.style.display = 'block';
            var phraseEl = document.getElementById('roblox-verify-phrase');
            if (phraseEl && data.verifyCode) phraseEl.textContent = data.verifyCode;
            var profLink = document.getElementById('roblox-profile-link');
            if (profLink && data.profile && data.profile.roblox_user_id) {
              profLink.href = 'https://www.roblox.com/users/' + data.profile.roblox_user_id + '/profile';
            }
            startGatewayAutoPoll();
          }
          return;
        }
        if (gatewayPollTimer) {
          clearInterval(gatewayPollTimer);
          gatewayPollTimer = null;
        }
        st.style.color = '#4ADE80';
        st.textContent = data.message || '¡Cuenta verificada y conectada con éxito!';
        if (window.opener) {
          try {
            window.opener.postMessage(data.payload, '*');
            setTimeout(function() { window.close(); }, 900);
          } catch (e) {}
        }
      } catch (err) {
        if (actionMode !== 'poll') {
          st.style.color = '#F23F43';
          st.textContent = 'Error de red al conectar la cuenta.';
        }
      }
    }
  </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
    try {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            return res.end();
        }

        const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = urlObj.pathname.replace(/\/+$/, '') || '/';
        const baseOrigin = getBaseOrigin(req, urlObj);

        if (pathname === '/api/health') {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
                status: 'ok',
                botReady: client.isReady(),
                botTag: client.user?.tag || null,
                supabaseMode: supabase.isMemoryFallback ? 'in-memory-fallback' : 'connected',
                commands: nombresComandos,
                handlersCount: resumenInteracciones?.total || 0,
                categories: 4,
                tools: 20
            }));
        }

        if (pathname === '/privacy') {
            res.writeHead(302, { 'Location': 'https://damianduns.github.io/Kortex/privacy.html' });
            return res.end();
        }

        if (pathname === '/terms') {
            res.writeHead(302, { 'Location': 'https://damianduns.github.io/Kortex/terms.html' });
            return res.end();
        }

        // ==========================================================
        // ENDPOINTS DE VINCULACIÓN DE CUENTAS: ROBLOX (/roblox) Y DISCORD (/config)
        // ==========================================================
        const DEFAULT_DISCORD_CLIENT_ID = '1041724988690018364';
        const DEFAULT_DISCORD_CLIENT_SECRET = 'GRqhrvQrnb8bUnuDm1audrrLJtfJSQY2';

        if (pathname === '/api/auth/config') {
            const discordClientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || DEFAULT_DISCORD_CLIENT_ID;
            const discordSecret = process.env.DISCORD_CLIENT_SECRET || DEFAULT_DISCORD_CLIENT_SECRET;
            const discordConfigured = Boolean(discordClientId && discordSecret);
            const robloxConfigured = Boolean(process.env.ROBLOX_CLIENT_ID && process.env.ROBLOX_CLIENT_SECRET);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
                discordClientId,
                discordConfigured,
                robloxConfigured,
                discordCallbackUrl: `${baseOrigin}/auth/discord/callback`,
                robloxCallbackUrl: `${baseOrigin}/auth/roblox/callback`
            }));
        }

        if (pathname === '/api/auth/status') {
            const rawHint = (urlObj.searchParams.get('discord_id') || '').trim();
            const targetId = resolveActiveSessionDiscordId(rawHint);

            if (!targetId) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                    ok: true,
                    authenticated: false,
                    discordId: null,
                    discordSession: null,
                    discordConfig: null,
                    linkedAccount: null,
                    hasActiveAccount: false,
                    history: [],
                    stats: { wishlistCount: 0, pendingRobuxCount: 0, redeemedCodesCount: 0, gameSubsCount: 0 },
                    savedItems: { wishlist: [], pendingRobux: [], gameSubs: [] }
                }));
            }

            const linkedRoblox = await verificarAutorizacionRobloxOAuth(targetId).catch(() => null);
            const discordCfg = await verificarAutorizacionDiscordOAuth(targetId).catch(() => null);
            const discordSession = discordCfg?.oauth_verified
                ? (verifiedDiscordSessions.get(targetId) || {
                    id: targetId,
                    username: discordCfg.discord_username,
                    tag: discordCfg.discord_tag || discordCfg.discord_username,
                    avatar: discordCfg.discord_avatar
                })
                : null;
            const summary = await obtenerHistorialYEstadoCuenta(targetId).catch(() => null);
            const hasActive = Boolean((discordCfg && discordCfg.oauth_verified) || (linkedRoblox && linkedRoblox.roblox_user_id));

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
                ok: true,
                authenticated: hasActive,
                discordId: targetId,
                discordSession,
                discordConfig: discordCfg || null,
                linkedAccount: linkedRoblox || null,
                hasActiveAccount: Boolean(summary?.hasActiveAccount || hasActive),
                history: summary?.history || [],
                stats: summary?.stats || { wishlistCount: 0, pendingRobuxCount: 0, redeemedCodesCount: 0, gameSubsCount: 0 },
                savedItems: summary?.savedItems || { wishlist: [], pendingRobux: [], gameSubs: [] }
            }));
        }

        // Endpoint de Respaldo Automático: Si el bot se actualiza o reinicia, restaura la sesión e historial del navegador
        if (pathname === '/api/auth/restore' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const targetId = resolveActiveSessionDiscordId(body.discordId);
            if (!targetId) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                    ok: false,
                    message: 'No hay identificador de sesión para restaurar.'
                }));
            }

            const restored = await restaurarRespaldoCliente(targetId, body);
            if (restored?.discordConfig?.oauth_verified) {
                verifiedDiscordSessions.set(targetId, {
                    id: targetId,
                    username: restored.discordConfig.discord_username || 'Usuario',
                    tag: restored.discordConfig.discord_tag || restored.discordConfig.discord_username || 'Usuario',
                    avatar: restored.discordConfig.discord_avatar || null,
                    verifiedAt: restored.discordConfig.verified_at || new Date().toISOString()
                });
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
                ok: true,
                discordId: targetId,
                discordConfig: restored?.discordConfig || null,
                linkedAccount: restored?.linkedAccount || null,
                history: restored?.history || [],
                stats: restored?.stats || { wishlistCount: 0, pendingRobuxCount: 0, redeemedCodesCount: 0, gameSubsCount: 0 },
                savedItems: restored?.savedItems || { wishlist: [], pendingRobux: [], gameSubs: [] }
            }));
        }

        // Endpoint para desvincular manualmente una cuenta si el usuario desea cambiarla
        if (pathname === '/api/auth/disconnect' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const targetId = resolveActiveSessionDiscordId(body.discordId);
            if (!targetId) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                    ok: true,
                    message: 'No hay sesión activa para desconectar.',
                    discordConfig: null,
                    linkedAccount: null,
                    history: [],
                    stats: { wishlistCount: 0, pendingRobuxCount: 0, redeemedCodesCount: 0, gameSubsCount: 0 }
                }));
            }
            const provider = body.provider === 'discord' ? 'discord' : 'roblox';

            if (provider === 'discord') {
                verifiedDiscordSessions.delete(targetId);
            }
            await eliminarCuentaVinculada(targetId, provider);
            const summary = await obtenerHistorialYEstadoCuenta(targetId).catch(() => null);

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
                ok: true,
                discordId: targetId,
                discordConfig: summary?.discordConfig || null,
                linkedAccount: summary?.linkedAccount || null,
                history: summary?.history || [],
                stats: summary?.stats || { wishlistCount: 0, pendingRobuxCount: 0, redeemedCodesCount: 0, gameSubsCount: 0 }
            }));
        }

        // Endpoint de Vinculación Directa de Discord con Verificación de Propiedad y Anti-Spam
        if (pathname === '/api/auth/discord/quick-link' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const rawInput = String(body.query || body.discordId || '').trim();
            const action = String(body.action || (body.code ? 'verify' : 'start')).trim().toLowerCase();
            const requesterIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();

            if (!rawInput || rawInput === 'default_session') {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                    ok: false,
                    message: 'Ingresá tu Discord ID numérico (17 a 20 dígitos) o usá Discord OAuth 2.0.'
                }));
            }

            if (action === 'verify' || action === 'poll') {
                const verifyRes = await confirmarVerificacionDiscordWeb(rawInput, body.code || '', client, {
                    isPoll: action === 'poll'
                });
                if (!verifyRes.ok) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    return res.end(JSON.stringify(verifyRes));
                }
                if (verifyRes.step === 'verify_required') {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    return res.end(JSON.stringify(verifyRes));
                }

                const targetId = String(verifyRes.discordId);
                const savedCfg = verifyRes.discordConfig;
                verifiedDiscordSessions.set(targetId, {
                    id: targetId,
                    username: savedCfg.discord_username,
                    tag: savedCfg.discord_tag || savedCfg.discord_username,
                    avatar: savedCfg.discord_avatar || null,
                    verifiedAt: savedCfg.verified_at
                });

                const summary = await obtenerHistorialYEstadoCuenta(targetId).catch(() => null);
                const payload = {
                    type: 'KORTEX_OAUTH_SUCCESS',
                    provider: 'discord',
                    discordId: targetId,
                    discordUsername: savedCfg.discord_username,
                    discordConfig: savedCfg,
                    linkedAccount: summary?.linkedAccount || null,
                    history: summary?.history || []
                };

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                    ok: true,
                    step: 'verified',
                    message: verifyRes.message,
                    discordId: targetId,
                    discordConfig: savedCfg,
                    linkedAccount: summary?.linkedAccount || null,
                    history: summary?.history || [],
                    payload
                }));
            }

            // Paso 1: Iniciar desafío de verificación (o auto-completar si el titular YA tocó "✅ Sí, fui yo" en Discord)
            const startRes = await iniciarVerificacionDiscordWeb(rawInput, { client, requesterIp });
            if (startRes.ok && startRes.step === 'verified' && startRes.discordConfig) {
                const targetId = String(startRes.discordId);
                const savedCfg = startRes.discordConfig;
                verifiedDiscordSessions.set(targetId, {
                    id: targetId,
                    username: savedCfg.discord_username,
                    tag: savedCfg.discord_tag || savedCfg.discord_username,
                    avatar: savedCfg.discord_avatar || null,
                    verifiedAt: savedCfg.verified_at
                });
                const summary = await obtenerHistorialYEstadoCuenta(targetId).catch(() => null);
                const payload = {
                    type: 'KORTEX_OAUTH_SUCCESS',
                    provider: 'discord',
                    discordId: targetId,
                    discordUsername: savedCfg.discord_username,
                    discordConfig: savedCfg,
                    linkedAccount: summary?.linkedAccount || null,
                    history: summary?.history || []
                };
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                    ok: true,
                    step: 'verified',
                    message: startRes.message,
                    discordId: targetId,
                    discordConfig: savedCfg,
                    linkedAccount: summary?.linkedAccount || null,
                    history: summary?.history || [],
                    payload
                }));
            }

            res.writeHead(startRes.ok ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify(startRes));
        }

        // Endpoint de Vinculación de Roblox por @Usuario o ID numérico con Verificación Obligatoria de Propiedad
        if (pathname === '/api/auth/roblox/quick-link' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const query = String(body.query || body.username || '').trim();
            const action = String(body.action || 'start').trim().toLowerCase();
            const targetDiscordId = resolveActiveSessionDiscordId(body.discordId) || (body.discordId ? String(body.discordId).trim() : ('guest_' + Date.now().toString(36)));
            const requesterIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();

            if (action === 'verify') {
                const verifyRes = await confirmarVerificacionCodigoRoblox(targetDiscordId, body.code || '');
                if (!verifyRes.ok) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    return res.end(JSON.stringify(verifyRes));
                }

                const linkedRecord = verifyRes.linkedAccount;
                const summary = await obtenerHistorialYEstadoCuenta(targetDiscordId).catch(() => null);
                const payload = {
                    type: 'KORTEX_OAUTH_SUCCESS',
                    provider: 'roblox',
                    discordId: targetDiscordId,
                    linkedAccount: linkedRecord,
                    discordConfig: summary?.discordConfig || null,
                    history: summary?.history || []
                };

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                    ok: true,
                    step: 'verified',
                    message: verifyRes.message,
                    discordId: targetDiscordId,
                    linkedAccount: linkedRecord,
                    discordConfig: summary?.discordConfig || null,
                    history: summary?.history || [],
                    payload
                }));
            }

            if (!query) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                    ok: false,
                    message: 'Escribí tu @Usuario de Roblox o tu ID numérico para iniciar la verificación de propiedad.'
                }));
            }

            // Paso 1: Iniciar verificación de propiedad con código KORTEX-XXXX en el perfil (nunca vincular en 1 clic sin permiso)
            const challengeRes = await iniciarVerificacionCodigoRoblox(targetDiscordId, query, { requesterIp });
            if (!challengeRes.ok) {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify(challengeRes));
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify(challengeRes));
        }

        // Construir URL OAuth2 de Discord (exclusivo para /config y sesión de Discord)
        if (pathname === '/api/auth/discord/url' || pathname === '/api/auth/discord/redirect') {
            const discordIdHint = resolveActiveSessionDiscordId(urlObj.searchParams.get('discord_id'));
            const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || DEFAULT_DISCORD_CLIENT_ID;
            const clientSecret = process.env.DISCORD_CLIENT_SECRET || DEFAULT_DISCORD_CLIENT_SECRET;
            const redirectUri = normalizarUrlPublica(process.env.DISCORD_REDIRECT_URI) || `${baseOrigin}/auth/discord/callback`;

            if (!clientId || !clientSecret) {
                if (pathname.endsWith('/redirect')) {
                    res.writeHead(302, { Location: `${baseOrigin}/?oauth_notice=discord_missing` });
                    return res.end();
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                    ok: false,
                    configured: false,
                    message: 'Falta configurar DISCORD_CLIENT_SECRET.'
                }));
            }

            const state = `disc_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
            oauthStates.set(state, { discordId: discordIdHint, provider: 'discord', redirectUri, createdAt: Date.now() });

            const params = new URLSearchParams({
                client_id: clientId,
                redirect_uri: redirectUri,
                response_type: 'code',
                scope: 'openid identify',
                state
            });
            const authUrl = `https://discord.com/oauth2/authorize?${params.toString()}`;

            if (pathname.endsWith('/redirect')) {
                if (urlObj.searchParams.get('direct') === '1') {
                    res.writeHead(302, { Location: authUrl });
                    return res.end();
                }
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(renderOAuthGatewayPage({
                    provider: 'discord',
                    discordId: discordIdHint,
                    authUrl,
                    callbackUrl: redirectUri,
                    baseOrigin
                }));
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
                ok: true,
                configured: true,
                url: authUrl,
                gatewayUrl: `${baseOrigin}/api/auth/discord/redirect?discord_id=${encodeURIComponent(discordIdHint)}`,
                callbackUrl: redirectUri
            }));
        }

        // Callback OAuth2 de Discord
        if (pathname === '/auth/discord/callback' || pathname === '/api/auth/discord/callback') {
            const code = urlObj.searchParams.get('code');
            const state = urlObj.searchParams.get('state');
            const stateData = state ? oauthStates.get(state) : null;
            if (state) oauthStates.delete(state);

            const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || DEFAULT_DISCORD_CLIENT_ID;
            const clientSecret = process.env.DISCORD_CLIENT_SECRET || DEFAULT_DISCORD_CLIENT_SECRET;
            const redirectUri = stateData?.redirectUri || normalizarUrlPublica(process.env.DISCORD_REDIRECT_URI) || `${baseOrigin}/auth/discord/callback`;

            if (!code || !clientId || !clientSecret) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(renderOAuthCallbackPage({
                    ok: false,
                    title: '⚠️ Autorización de Discord incompleta',
                    subtitle: 'No se recibió el código de autorización de Discord.',
                    payload: { type: 'KORTEX_OAUTH_ERROR', provider: 'discord' }
                }));
            }

            try {
                const tokenParams = new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri
                });

                const tokenRes = await axios.post('https://discord.com/api/oauth2/token', tokenParams.toString(), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 8000
                });

                const accessToken = tokenRes.data?.access_token;
                const refreshToken = tokenRes.data?.refresh_token || null;
                const userRes = await axios.get('https://discord.com/api/users/@me', {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    timeout: 8000
                });

                const discordUser = userRes.data;
                const verifiedId = String(discordUser.id);
                const verifiedUsername = discordUser.global_name || discordUser.username;
                const avatarUrl = discordUser.avatar
                    ? `https://cdn.discordapp.com/avatars/${verifiedId}/${discordUser.avatar}.png?size=256`
                    : null;

                // Si el usuario había vinculado Roblox primero en sesión previa, unificar todo bajo su Discord ID real
                if (stateData?.discordId && stateData.discordId !== verifiedId) {
                    await migrarDatosDeSesion(stateData.discordId, verifiedId);
                }

                verifiedDiscordSessions.set(verifiedId, {
                    id: verifiedId,
                    username: verifiedUsername,
                    tag: discordUser.username,
                    avatar: avatarUrl,
                    verifiedAt: new Date().toISOString()
                });

                const savedDiscordCfg = guardarConfigDiscord(verifiedId, {
                    discord_username: verifiedUsername,
                    discord_tag: discordUser.username,
                    discord_avatar: avatarUrl,
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    oauth_verified: true,
                    verified_at: new Date().toISOString()
                });

                registrarEventoHistorialCuenta(verifiedId, {
                    category: 'discord',
                    title: `Sesión de Discord iniciada: @${verifiedUsername}`,
                    detail: `ID ${verifiedId} • OAuth 2.0 Persistente`
                });

                const summary = await obtenerHistorialYEstadoCuenta(verifiedId).catch(() => null);

                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(renderOAuthCallbackPage({
                    ok: true,
                    title: `✅ Cuenta de Discord Conectada: @${verifiedUsername}`,
                    subtitle: `Tu sesión y tu historial quedaron guardados de forma persistente (incluso cuando el bot se actualice).`,
                    payload: {
                        type: 'KORTEX_OAUTH_SUCCESS',
                        provider: 'discord',
                        discordId: verifiedId,
                        discordUsername: verifiedUsername,
                        discordConfig: savedDiscordCfg,
                        linkedAccount: summary?.linkedAccount || null,
                        history: summary?.history || []
                    }
                }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(renderOAuthCallbackPage({
                    ok: false,
                    title: '❌ Error al verificar Discord OAuth2',
                    subtitle: `No se pudo completar el intercambio OAuth2 con Discord (${err.response?.data?.error_description || err.message}). Asegurate de tener agregada la redirección ${redirectUri} en Discord Developer Portal.`,
                    payload: { type: 'KORTEX_OAUTH_ERROR', provider: 'discord', hint: stateData?.discordId || null }
                }));
            }
        }

        // Construir URL OAuth 2.0 de Roblox (Exclusivo para Cuenta de Roblox en /roblox)
        if (pathname === '/api/auth/roblox/url' || pathname === '/api/auth/roblox/redirect') {
            const discordId = resolveActiveSessionDiscordId(urlObj.searchParams.get('discord_id'));
            const robloxClientId = process.env.ROBLOX_CLIENT_ID;
            const redirectUri = normalizarUrlPublica(process.env.ROBLOX_REDIRECT_URI) || `${baseOrigin}/auth/roblox/callback`;

            if (!robloxClientId || !process.env.ROBLOX_CLIENT_SECRET) {
                if (pathname.endsWith('/redirect')) {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    return res.end(renderOAuthGatewayPage({
                        provider: 'roblox',
                        discordId,
                        authUrl: `${baseOrigin}/?oauth_notice=roblox_missing`,
                        callbackUrl: redirectUri,
                        baseOrigin
                    }));
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                    ok: false,
                    configured: false,
                    message: 'Falta configurar ROBLOX_CLIENT_ID y ROBLOX_CLIENT_SECRET en las variables de entorno.'
                }));
            }

            const state = `rblx_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
            oauthStates.set(state, { discordId, provider: 'roblox', redirectUri, createdAt: Date.now() });

            const params = new URLSearchParams({
                client_id: robloxClientId,
                redirect_uri: redirectUri,
                response_type: 'code',
                scope: 'openid profile',
                state
            });
            const authUrl = `https://apis.roblox.com/oauth/v1/authorize?${params.toString()}`;

            if (pathname.endsWith('/redirect')) {
                if (urlObj.searchParams.get('direct') === '1') {
                    res.writeHead(302, { Location: authUrl });
                    return res.end();
                }
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(renderOAuthGatewayPage({
                    provider: 'roblox',
                    discordId,
                    authUrl,
                    callbackUrl: redirectUri,
                    baseOrigin
                }));
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
                ok: true,
                configured: true,
                url: authUrl,
                gatewayUrl: `${baseOrigin}/api/auth/roblox/redirect?discord_id=${encodeURIComponent(discordId)}`,
                callbackUrl: redirectUri
            }));
        }

        // Callback OAuth 2.0 de Roblox
        if (pathname === '/auth/roblox/callback' || pathname === '/api/auth/roblox/callback') {
            const code = urlObj.searchParams.get('code');
            const state = urlObj.searchParams.get('state');
            const stateData = state ? oauthStates.get(state) : null;
            if (state) oauthStates.delete(state);

            const robloxClientId = process.env.ROBLOX_CLIENT_ID;
            const robloxClientSecret = process.env.ROBLOX_CLIENT_SECRET;
            const redirectUri = stateData?.redirectUri || normalizarUrlPublica(process.env.ROBLOX_REDIRECT_URI) || `${baseOrigin}/auth/roblox/callback`;

            if (!code || !robloxClientId || !robloxClientSecret) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(renderOAuthCallbackPage({
                    ok: false,
                    title: '⚠️ Autorización de Roblox incompleta',
                    subtitle: 'No se recibió el código OAuth2 de Roblox o faltan las credenciales ROBLOX_CLIENT_ID / ROBLOX_CLIENT_SECRET.',
                    payload: { type: 'KORTEX_OAUTH_ERROR', provider: 'roblox' }
                }));
            }

            try {
                const tokenParams = new URLSearchParams({
                    client_id: robloxClientId,
                    client_secret: robloxClientSecret,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri
                });

                const tokenRes = await axios.post('https://apis.roblox.com/oauth/v1/token', tokenParams.toString(), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 8000
                });

                const accessToken = tokenRes.data?.access_token;
                const userInfoRes = await axios.get('https://apis.roblox.com/oauth/v1/userinfo', {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    timeout: 8000
                });

                const rUser = userInfoRes.data;
                const robloxUserId = Number(rUser.sub);
                const robloxUsername = rUser.preferred_username || rUser.name || `User_${robloxUserId}`;
                const fullResolved = await resolverUsuarioRoblox(String(robloxUserId)).catch(() => null);

                const targetDiscordId = resolveActiveSessionDiscordId(stateData?.discordId) || (stateData?.discordId ? String(stateData.discordId).trim() : ('guest_' + Date.now().toString(36)));

                const linkedRecord = await guardarCuentaVinculada(targetDiscordId, {
                    roblox_user_id: robloxUserId,
                    roblox_username: fullResolved?.roblox_username || robloxUsername,
                    display_name: rUser.nickname || fullResolved?.display_name || robloxUsername,
                    avatar_url: rUser.picture || fullResolved?.avatar_url || null,
                    avatar_full_url: fullResolved?.avatar_full_url || rUser.picture || null,
                    auth_method: 'oauth',
                    roblox_oauth_verified: true,
                    roblox_access_token: accessToken
                });

                const summary = await obtenerHistorialYEstadoCuenta(targetDiscordId).catch(() => null);

                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(renderOAuthCallbackPage({
                    ok: true,
                    title: `✅ Cuenta de Roblox Conectada: @${linkedRecord.roblox_username}`,
                    subtitle: `Tu perfil de Roblox (ID ${linkedRecord.roblox_user_id}) y tu historial quedaron guardados de forma persistente.`,
                    payload: {
                        type: 'KORTEX_OAUTH_SUCCESS',
                        provider: 'roblox',
                        discordId: targetDiscordId,
                        linkedAccount: linkedRecord,
                        discordConfig: summary?.discordConfig || null,
                        history: summary?.history || []
                    }
                }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(renderOAuthCallbackPage({
                    ok: false,
                    title: '❌ Error al verificar Roblox OAuth2',
                    subtitle: `No se pudo completar el intercambio OAuth2 con Roblox (${err.response?.data?.error_description || err.message}). Asegurate de registrar ${redirectUri} en Roblox Creator Hub.`,
                    payload: { type: 'KORTEX_OAUTH_ERROR', provider: 'roblox' }
                }));
            }
        }

        // Endpoint en vivo para renderizar vistas previas visuales en la guía web
        if (pathname.startsWith('/api/canvas/')) {
            const kind = pathname.replace('/api/canvas/', '').trim();
            let pngBuffer = null;

            if (kind === 'floors') {
                const { data: floors } = await supabase.memoryFrom('price_floors_history').select('*');
                pngBuffer = await generatePriceFloorsChart(floors || []);
            } else if (kind === 'sandbox') {
                pngBuffer = await generateOutfitSandboxCard(
                    { username: 'DamianDuns', wornCount: 6, avatarFullUrl: null },
                    [
                        { id: 1365767, name: 'Valkyrie Helm', price: 65 },
                        { id: 48474294, name: 'Cyberpunk Katana Back', price: 85 },
                        { id: 62724852, name: 'Shadow Crown Aura', price: 50 }
                    ],
                    200,
                    120
                );
            } else if (kind === 'clones') {
                pngBuffer = await generateClonesComparisonCanvas(
                    { id: 1365767, name: 'Original Valkyrie Helm', price: 850 },
                    [
                        { id: 147144678, name: 'Valkyrie Helm (UGC Floor)', price: 65, creatorName: 'UGC Studio' },
                        { id: 162066019, name: 'Feather Valkyrie Crown', price: 75, creatorName: 'Avatar Lab' },
                        { id: 173829104, name: 'Classic Valkyrie Mesh', price: 85, creatorName: 'Mesh Creators' }
                    ]
                );
            } else if (kind === 'colormatch') {
                pngBuffer = await generateColorMatchCanvas(
                    [
                        { hex: '#5865F2', r: 88, g: 101, b: 242 },
                        { hex: '#00B8D9', r: 0, g: 184, b: 217 },
                        { hex: '#23A55A', r: 35, g: 165, b: 90 }
                    ],
                    [
                        { id: 1365767, name: 'Cobalt Cyber Visor', price: 65, matchPct: 96, detectedHex: '#5865F2' },
                        { id: 1028606, name: 'Indigo Valkyrie Wings', price: 85, matchPct: 93, detectedHex: '#4F5BD5' },
                        { id: 48474294, name: 'Azure Tactical Halo', price: 55, matchPct: 89, detectedHex: '#00B8D9' },
                        { id: 62724852, name: 'Neon Sapphire Horns', price: 65, matchPct: 85, detectedHex: '#3B82F6' }
                    ],
                    'Camisa Base #5865F2'
                );
            } else if (kind === 'mannequin') {
                pngBuffer = await generateMannequinTemplateCanvas(null, 'Plantilla Clásica 585×559');
            } else if (kind === 'watchlist') {
                pngBuffer = await generateWatchlistOverviewCanvas(
                    [
                        { id: 1, id_objet: '1365767', item_name: 'Valkyrie Helm', item_type: 'catalog', last_price: 42000, target_price: 45000, is_paused: false },
                        { id: 2, id_objet: '1029025', item_name: 'Classic Roblox Fedora', item_type: 'catalog', last_price: 58000, target_price: 50000, is_paused: false },
                        { id: 3, id_objet: '96678548', item_name: 'Black Shades', item_type: 'catalog', last_price: 95, target_price: 100, is_paused: false }
                    ],
                    new Map()
                );
            } else if (kind === 'calc') {
                pngBuffer = await generateCalculatorBreakdownCard({
                    basePrice: 1000,
                    regionalPrice: 600,
                    cashback: 240,
                    plusDiscount: 60,
                    finalPrice: 300,
                    totalSaved: 700,
                    pctSaved: 70
                });
            } else if (kind === 'pending') {
                pngBuffer = await generatePendingRobuxCard([
                    { source_type: 'group_funds', source_label: '👥 Fondos de Grupo', amount_robux: 450, estimated_release_min: new Date(Date.now() - 3600000).toISOString() },
                    { source_type: 'gamepass_sale', source_label: '🎟️ Venta de Gamepass', amount_robux: 800, estimated_release_min: new Date(Date.now() + 86400000).toISOString() }
                ]);
            } else if (kind === 'servers') {
                pngBuffer = await generateEmptyServersRadarCard(
                    { name: 'Blox Fruits', playing: 412900, maxPlayers: 12 },
                    [
                        { id: 'srv-1', playing: 1, maxPlayers: 12, ping: 48, fps: 60 },
                        { id: 'srv-2', playing: 2, maxPlayers: 12, ping: 62, fps: 60 },
                        { id: 'srv-3', playing: 2, maxPlayers: 12, ping: 74, fps: 59 }
                    ]
                );
            } else if (kind === 'tycoon') {
                const demoState = await getOrCreatePlayerState('demo_preview_player');
                const sectionParam = urlObj.searchParams.get('section') || 'sec_studio';
                const langParam = urlObj.searchParams.get('lang') === 'en' ? 'en' : 'es';
                if (sectionParam === 'sec_studio') {
                    pngBuffer = await renderTycoonSnapshot({
                        state: demoState,
                        username: 'PlayerDemo',
                        avatarUrl: null,
                        lang: langParam
                    });
                } else {
                    const leaderboard = sectionParam === 'sec_perks' ? await getTycoonLeaderboard(5) : [];
                    pngBuffer = await renderTycoonSectionCanvas(sectionParam, {
                        state: demoState,
                        username: 'PlayerDemo',
                        avatarUrl: null,
                        lang: langParam,
                        leaderboard
                    });
                }
            } else if (kind === 'status') {
                const statusSnapshot = await obtenerEstadoServidoresRoblox(false);
                pngBuffer = await generateRobloxStatusCanvas(
                    statusSnapshot,
                    urlObj.searchParams.get('lang') === 'en' ? 'en' : 'es'
                );
            } else if (kind === 'trending') {
                const trendingSnapshot = await obtenerJuegosEnTendenciaRoblox(false);
                pngBuffer = await generateTrendingGamesCanvas(
                    trendingSnapshot,
                    urlObj.searchParams.get('lang') === 'en' ? 'en' : 'es'
                );
            } else if (kind === 'profile') {
                const profileSnapshot = await obtenerPerfilAnaliticoRoblox(urlObj.searchParams.get('user') || 'Roblox');
                pngBuffer = await generateProfileInspectorCanvas(
                    profileSnapshot,
                    urlObj.searchParams.get('lang') === 'en' ? 'en' : 'es'
                );
            } else if (kind === 'limiteds') {
                pngBuffer = await generateLimitedsRadarCanvas(
                    null,
                    urlObj.searchParams.get('lang') === 'en' ? 'en' : 'es'
                );
            } else if (kind === 'compare') {
                const trendingSnapshot = await obtenerJuegosEnTendenciaRoblox(false);
                const gameA = trendingSnapshot.games?.[0] || { name: 'Brookhaven RP', playing: 448200, visits: 58400000000, favoritedCount: 24500000, maxPlayers: 26 };
                const gameB = trendingSnapshot.games?.[1] || { name: 'Blox Fruits', playing: 412900, visits: 43100000000, favoritedCount: 16900000, maxPlayers: 12 };
                pngBuffer = await generateCompareGamesCanvas(
                    gameA,
                    gameB,
                    urlObj.searchParams.get('lang') === 'en' ? 'en' : 'es'
                );
            } else {
                const now = Date.now();
                pngBuffer = await generatePriceChart(
                    [
                        { price: 240, timestamp: new Date(now - 6 * 86400000) },
                        { price: 210, timestamp: new Date(now - 4 * 86400000) },
                        { price: 180, timestamp: new Date(now - 2 * 86400000) },
                        { price: 145, timestamp: new Date(now) }
                    ],
                    'Valkyrie Helm UGC',
                    { itemId: 'demo', daysRange: '7d', targetPrice: 150 }
                );
            }

            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Cache-Control': 'no-cache'
            });
            return res.end(pngBuffer);
        }

        // Redirigir la navegación web hacia la web oficial unificada en GitHub Pages
        if (pathname === '/' || pathname === '/docs' || pathname === '/index.html' || pathname === '/app') {
            res.writeHead(302, { 'Location': 'https://damianduns.github.io/Kortex/' });
            return res.end();
        }

        // Si la ruta no pertenece a APIs o OAuth, redirigir a GitHub Pages
        if (!pathname.startsWith('/api/') && !pathname.startsWith('/auth/')) {
            res.writeHead(302, { 'Location': 'https://damianduns.github.io/Kortex/' });
            return res.end();
        }

        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Internal Server Error: ${err.message}`);
    }
});

server.listen(PORT, '0.0.0.0', () => {
    logger.ok(`Servidor Web y Guía Interactiva Kortex escuchando en http://0.0.0.0:${PORT}`);
});

// ==========================================
// 4. REGISTRO DE COMANDOS SLASH Y CONEXIÓN A DISCORD
// ==========================================
async function registrarComandos() {
    const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
    const CLIENT_ID = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID || '1041724988690018364';
    const GUILD_ID = process.env.GUILD_ID;
    if (!DISCORD_TOKEN || !CLIENT_ID) return;

    const rest = new REST().setToken(DISCORD_TOKEN);
    const inicio = Date.now();
    const lista = nombresComandos.map(n => `/${n}`).join(', ');

    try {
        logger.deploy(`Sincronizando ${commandsForDeploy.length} comando(s) slash globales con Discord (${lista})...`);
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commandsForDeploy }
        );

        const guildIds = new Set();
        if (GUILD_ID) guildIds.add(GUILD_ID);
        try {
            const guilds = await rest.get(Routes.userGuilds());
            if (Array.isArray(guilds)) {
                guilds.forEach(g => guildIds.add(g.id));
            }
        } catch {
            // Continuar con GUILD_ID si existe
        }

        for (const gid of guildIds) {
            try {
                await rest.put(Routes.applicationGuildCommands(CLIENT_ID, gid), { body: [] });
            } catch {
                // Ignorar si no tiene acceso
            }
        }

        const ms = Date.now() - inicio;
        logger.ok(`Comandos slash sincronizados globalmente (sin duplicados de servidor) en ${ms}ms.`);
    } catch (error) {
        logger.error('DEPLOY', error);
    }
}

// 5. Manejadores Anti-Crash y Apagado Limpio
process.on('unhandledRejection', (reason) => logger.error('UNHANDLED REJECTION', reason));
process.on('uncaughtException', (error) => logger.error('UNCAUGHT EXCEPTION', error));

async function apagar(signal) {
    logger.warn(`Señal ${signal} recibida. Cerrando sesión de Discord y servidor HTTP de forma segura...`);
    try {
        server.close();
        await client.destroy();
    } finally {
        process.exit(0);
    }
}
process.once('SIGINT', () => apagar('SIGINT'));
process.once('SIGTERM', () => apagar('SIGTERM'));

// 6. Inicialización condicional de Discord Gateway
(async () => {
    if (!process.env.DISCORD_TOKEN) {
        logger.info('DISCORD_TOKEN no definido en .env — el servidor web en el puerto 3000 está activo y listo. Configurá DISCORD_TOKEN para conectar el bot.');
        return;
    }

    await registrarComandos();
    try {
        logger.info('Autenticando cliente con Discord Gateway...');
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        logger.error('LOGIN', `No se pudo iniciar sesión en Discord (${error.message}). El servidor web sigue activo en el puerto ${PORT}.`);
    }
})();