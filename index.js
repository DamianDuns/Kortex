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
    generatePriceFloorsChart,
    generateOutfitSandboxCard,
    generateClonesComparisonCanvas,
    generateMannequinTemplateCanvas,
    generateColorMatchCanvas
} = require('./src/utils/chartGenerator');

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
    resolverUsuarioRoblox,
    guardarCuentaVinculada,
    eliminarCuentaVinculada,
    iniciarVerificacionCodigoRoblox,
    confirmarVerificacionCodigoRoblox,
    cancelarVerificacionCodigoRoblox,
    obtenerVerificacionPendienteRoblox,
    guardarConfigDiscord,
    verificarAutorizacionDiscordOAuth,
    verificarAutorizacionRobloxOAuth,
    registrarEventoHistorialCuenta,
    obtenerHistorialYEstadoCuenta,
    migrarDatosDeSesion,
    restaurarRespaldoCliente
} = require('./src/utils/fastLink');

const PORT = Number(process.env.PORT) || 3000;
const DOCS_HTML_PATH = path.join(__dirname, 'docs', 'index.html');

// Almacén temporal de estados OAuth2 (state -> { discordId, provider, mode, createdAt })
const oauthStates = new Map();
// Sesiones verificadas de Discord OAuth2 hidratadas desde disco al iniciar el servidor
const verifiedDiscordSessions = new Map();
let lastActiveDiscordId = '';

// Hidratar sesiones guardadas en disco y calibrar subsistemas para que el bot arranque de forma óptima
(function hydratePersistedSessionsOnBoot() {
    for (const [discId, cfg] of discordConfigCache.entries()) {
        if (cfg && (cfg.oauth_verified || cfg.discord_username)) {
            verifiedDiscordSessions.set(String(discId), {
                id: String(discId),
                username: cfg.discord_username || 'Usuario',
                tag: cfg.discord_tag || cfg.discord_username || 'Usuario',
                avatar: cfg.discord_avatar || null,
                verifiedAt: cfg.verified_at || cfg.updated_at || new Date().toISOString()
            });
            if (!lastActiveDiscordId && discId !== 'default_session') {
                lastActiveDiscordId = String(discId);
            }
        }
    }
    if (!lastActiveDiscordId) {
        for (const [discId] of fastLinkCache.entries()) {
            if (discId && discId !== 'default_session') {
                lastActiveDiscordId = String(discId);
                break;
            }
        }
    }

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
    if (cleanHint && cleanHint !== 'default_session') return cleanHint;
    if (lastActiveDiscordId && lastActiveDiscordId !== 'default_session') return lastActiveDiscordId;
    for (const [k] of verifiedDiscordSessions.entries()) {
        if (k !== 'default_session') return k;
    }
    for (const [k] of discordConfigCache.entries()) {
        if (k !== 'default_session') return k;
    }
    for (const [k] of fastLinkCache.entries()) {
        if (k !== 'default_session') return k;
    }
    return cleanHint || 'default_session';
}

function getBaseOrigin(req) {
    if (process.env.APP_URL) {
        return process.env.APP_URL.replace(/\/+$/, '');
    }
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    return `${proto}://${host}`;
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
    <a class="btn" href="/" onclick="if(window.opener){window.close();return false;}">Volver a Kortex</a>
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
        const pathname = urlObj.pathname;
        const baseOrigin = getBaseOrigin(req);

        if (pathname === '/api/health') {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
                status: 'ok',
                botReady: client.isReady(),
                botTag: client.user?.tag || null,
                supabaseMode: supabase.isMemoryFallback ? 'in-memory-fallback' : 'connected',
                commands: nombresComandos,
                handlersCount: resumenInteracciones?.total || 0,
                categories: 3,
                tools: 15
            }));
        }

        if (pathname === '/privacy' || pathname === '/terms') {
            const isPrivacy = pathname === '/privacy';
            const pageTitle = isPrivacy ? 'Política de Privacidad — Kortex' : 'Términos de Servicio — Kortex';
            const htmlLegal = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-base: #090B10;
            --bg-surface: #11141D;
            --bg-elevated: #171B26;
            --border-subtle: #222736;
            --border-hover: #36405A;
            --text-primary: #F3F5F9;
            --text-secondary: #9CA5B8;
            --text-muted: #687287;
            --brand-blurple: #5865F2;
            --font-sans: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            --font-mono: 'JetBrains Mono', monospace;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            min-height: 100vh;
            background-color: var(--bg-base);
            color: var(--text-primary);
            font-family: var(--font-sans);
            line-height: 1.65;
            background-image: radial-gradient(circle at 18% 8%, rgba(88, 101, 242, 0.1), transparent 35%);
        }
        .topbar {
            position: sticky;
            top: 0;
            z-index: 100;
            backdrop-filter: blur(16px);
            background: rgba(13, 16, 23, 0.9);
            border-bottom: 1px solid var(--border-subtle);
        }
        .topbar-inner {
            max-width: 1040px;
            margin: 0 auto;
            padding: 0.85rem 1.5rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1.5rem;
        }
        .brand {
            display: inline-flex;
            align-items: center;
            gap: 0.65rem;
            text-decoration: none;
            color: var(--text-primary);
            font-weight: 800;
            font-size: 1.1rem;
        }
        .brand-mark {
            width: 30px;
            height: 30px;
            border-radius: 7px;
            background: var(--brand-blurple);
            display: grid;
            place-items: center;
            color: #fff;
            font-weight: 800;
            font-size: 0.9rem;
        }
        .legal-switch {
            display: inline-flex;
            gap: 0.35rem;
            background: var(--bg-surface);
            border: 1px solid var(--border-subtle);
            padding: 0.25rem;
            border-radius: 8px;
        }
        .legal-switch a {
            text-decoration: none;
            font-size: 0.82rem;
            font-weight: 600;
            padding: 0.38rem 0.85rem;
            border-radius: 6px;
            color: var(--text-secondary);
            transition: all 0.15s ease;
        }
        .legal-switch a.active {
            background: var(--bg-elevated);
            color: var(--text-primary);
        }
        .back-btn {
            text-decoration: none;
            font-size: 0.82rem;
            font-weight: 600;
            color: var(--text-primary);
            background: var(--bg-elevated);
            border: 1px solid var(--border-subtle);
            padding: 0.45rem 0.9rem;
            border-radius: 8px;
            transition: border-color 0.15s ease;
        }
        .back-btn:hover { border-color: var(--border-hover); }
        .container {
            max-width: 860px;
            margin: 0 auto;
            padding: 3rem 1.5rem 5rem;
        }
        .doc-kicker {
            font-family: var(--font-mono);
            font-size: 0.76rem;
            color: var(--text-muted);
            margin-bottom: 0.5rem;
        }
        h1 {
            font-size: clamp(1.85rem, 3vw, 2.5rem);
            font-weight: 800;
            letter-spacing: -0.02em;
            margin-bottom: 0.75rem;
        }
        .lead {
            color: var(--text-secondary);
            font-size: 1rem;
            margin-bottom: 2.25rem;
            padding-bottom: 1.75rem;
            border-bottom: 1px solid var(--border-subtle);
        }
        .clauses {
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
        }
        .clause-card {
            background: var(--bg-surface);
            border: 1px solid var(--border-subtle);
            border-radius: 12px;
            padding: 1.4rem 1.5rem;
        }
        .clause-num {
            font-family: var(--font-mono);
            font-size: 0.75rem;
            color: var(--text-muted);
            font-weight: 600;
            margin-bottom: 0.25rem;
            display: block;
        }
        .clause-card h2 {
            font-size: 1.08rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            color: var(--text-primary);
        }
        .clause-card p {
            color: var(--text-secondary);
            font-size: 0.92rem;
        }
        footer {
            margin-top: 3.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid var(--border-subtle);
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 1rem;
            font-size: 0.82rem;
            color: var(--text-muted);
        }
        footer a { color: var(--text-secondary); text-decoration: none; }
        footer a:hover { color: var(--text-primary); }
    </style>
</head>
<body>
    <header class="topbar">
        <div class="topbar-inner">
            <a href="/" class="brand">
                <span class="brand-mark">K</span>
                <span>Kortex</span>
            </a>
            <nav class="legal-switch">
                <a href="/privacy" class="${isPrivacy ? 'active' : ''}">Política de Privacidad</a>
                <a href="/terms" class="${!isPrivacy ? 'active' : ''}">Términos de Servicio</a>
            </nav>
            <a href="/" class="back-btn">Volver a la Documentación</a>
        </div>
    </header>

    <main class="container">
        <div class="doc-kicker">DOCUMENTACIÓN LEGAL OFICIAL · KORTEX</div>
        <h1>${isPrivacy ? 'Política de Privacidad' : 'Términos de Servicio'}</h1>
        <p class="lead">
            ${isPrivacy
                ? 'Explicación clara y transparente sobre qué información básica se procesa al usar los comandos públicos del bot o al iniciar sesión voluntariamente con tus cuentas de Discord y Roblox.'
                : 'Condiciones de uso de los comandos interactivos, herramientas de consulta y sistemas opcionales de conexión de cuentas de Kortex en Discord.'}
        </p>

        <div class="clauses">
            ${isPrivacy ? `
            <article class="clause-card">
                <span class="clause-num">SECCIÓN 01</span>
                <h2>Uso sin Registro vs. Funciones con Cuenta Conectada</h2>
                <p>Podés consultar las herramientas generales de Kortex en Discord sin necesidad de iniciar sesión ni vincular cuentas. El inicio de sesión únicamente se solicita cuando deseás desbloquear funciones que dependen de tu perfil personal (como guardar listas de seguimiento, recibir alertas automáticas por Discord o cargar tu propio avatar de Roblox).</p>
            </article>
            <article class="clause-card">
                <span class="clause-num">SECCIÓN 02</span>
                <h2>Alcance de la Autorización con Discord y Roblox (OAuth 2.0)</h2>
                <p>Cuando iniciás sesión voluntariamente mediante Discord OAuth 2.0 (ámbitos <code>openid</code> e <code>identify</code>) o Roblox OAuth 2.0 (ámbitos <code>openid</code> y <code>profile</code>), Kortex únicamente lee tu identificador público, nombre de usuario y miniatura de avatar. Nunca accedemos a contraseñas, correos privados, mensajes privados de terceros ni métodos de pago.</p>
            </article>
            <article class="clause-card">
                <span class="clause-num">SECCIÓN 03</span>
                <h2>Listas de Seguimiento, Códigos y Alertas Automáticas</h2>
                <p>Los objetos que agregás a tu lista de monitoreo de precios, tus lotes agendados de Robux pendientes, tu progreso de códigos canjeados y tus suscripciones a actualizaciones de juegos se almacenan asociados a tu identificador de usuario únicamente para enviarte los avisos que configuraste.</p>
            </article>
            <article class="clause-card">
                <span class="clause-num">SECCIÓN 04</span>
                <h2>Revocación de Permisos y Desvinculación Automática</h2>
                <p>En cualquier momento podés retirar la autorización desde <em>Ajustes de Usuario → Aplicaciones Autorizadas</em> en Discord o desde los ajustes de seguridad de tu cuenta de Roblox. El bot detecta automáticamente la revocación del permiso y limpia el estado de conexión sin requerir pasos adicionales.</p>
            </article>
            ` : `
            <article class="clause-card">
                <span class="clause-num">CLÁUSULA 01</span>
                <h2>Propósito del Bot y Disponibilidad de Herramientas</h2>
                <p>Kortex proporciona comandos interactivos en Discord (<code>/roblox</code>, <code>/config</code>, <code>/help</code> y <code>/ping</code>) junto con 15 utilidades de consulta económica, taller de avatares 3D/2D y buscadores de experiencias de Roblox. Las herramientas de consulta general están abiertas a todos los usuarios.</p>
            </article>
            <article class="clause-card">
                <span class="clause-num">CLÁUSULA 02</span>
                <h2>Desbloqueo Funcional de Herramientas Personales</h2>
                <p>Algunas mecánicas específicas requieren iniciar sesión para poder cumplir su función técnica sin errores: las funciones que envían alertas automáticas o guardan listas personales requieren iniciar sesión con tu Cuenta de Discord, y las funciones que importan o cotizan tu personaje requieren vincular tu Cuenta de Roblox.</p>
            </article>
            <article class="clause-card">
                <span class="clause-num">CLÁUSULA 03</span>
                <h2>Uso Adecuado de Paneles Interactivos</h2>
                <p>Cada panel interactivo abierto en un servidor de Discord está protegido para que únicamente el autor que ejecutó el comando pueda operar sus botones y menús desplegables. Se prohíbe el uso automatizado masivo (spam) que busque degradar la velocidad de respuesta del servicio.</p>
            </article>
            <article class="clause-card">
                <span class="clause-num">CLÁUSULA 04</span>
                <h2>Independencia de Plataformas Oficiales</h2>
                <p>Kortex utiliza las APIs públicas y los sistemas oficiales de autorización OAuth 2.0 de Discord y Roblox conforme a sus directrices para desarrolladores. Los precios del catálogo y el estado de los servidores reflejan la información pública reportada en tiempo real por Roblox.</p>
            </article>
            `}
        </div>

        <footer>
            <span>Kortex — Documentación Oficial del Bot</span>
            <div style="display: flex; gap: 1.25rem;">
                <a href="/">Inicio</a>
                <a href="/privacy">Política de Privacidad</a>
                <a href="/terms">Términos de Servicio</a>
            </div>
        </footer>
    </main>
</body>
</html>`;
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(htmlLegal);
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
            if (rawHint && rawHint !== 'default_session') {
                lastActiveDiscordId = rawHint;
            }
            const targetId = resolveActiveSessionDiscordId(rawHint);

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
            const pendingVerif = obtenerVerificacionPendienteRoblox(targetId);

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
                ok: true,
                discordId: targetId,
                discordSession,
                discordConfig: discordCfg || null,
                linkedAccount: linkedRoblox || null,
                hasActiveAccount: Boolean(summary?.hasActiveAccount),
                pendingVerification: pendingVerif
                    ? {
                        profile: pendingVerif.profile,
                        botInboxMessage: pendingVerif.botInboxMessage,
                        robloxMessageDelivered: Boolean(pendingVerif.robloxMessageDelivered),
                        deliveryChannel: pendingVerif.deliveryChannel || null
                    }
                    : null,
                history: summary?.history || [],
                stats: summary?.stats || { wishlistCount: 0, pendingRobuxCount: 0, redeemedCodesCount: 0, gameSubsCount: 0 },
                savedItems: summary?.savedItems || { wishlist: [], pendingRobux: [], gameSubs: [] }
            }));
        }

        // Endpoint de Respaldo Automático: Si el bot se actualiza o reinicia, restaura la sesión e historial del navegador
        if (pathname === '/api/auth/restore' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const targetId = resolveActiveSessionDiscordId(body.discordId);
            if (targetId && targetId !== 'default_session') {
                lastActiveDiscordId = targetId;
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

        // Construir URL OAuth2 de Discord (exclusivo para /config y sesión de Discord)
        if (pathname === '/api/auth/discord/url' || pathname === '/api/auth/discord/redirect') {
            const discordIdHint = resolveActiveSessionDiscordId(urlObj.searchParams.get('discord_id'));
            const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || DEFAULT_DISCORD_CLIENT_ID;
            const clientSecret = process.env.DISCORD_CLIENT_SECRET || DEFAULT_DISCORD_CLIENT_SECRET;
            const redirectUri = process.env.DISCORD_REDIRECT_URI || `${baseOrigin}/auth/discord/callback`;

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
                res.writeHead(302, { Location: authUrl });
                return res.end();
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ ok: true, configured: true, url: authUrl }));
        }

        // Callback OAuth2 de Discord
        if (pathname === '/auth/discord/callback') {
            const code = urlObj.searchParams.get('code');
            const state = urlObj.searchParams.get('state');
            const stateData = state ? oauthStates.get(state) : null;
            if (state) oauthStates.delete(state);

            const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || DEFAULT_DISCORD_CLIENT_ID;
            const clientSecret = process.env.DISCORD_CLIENT_SECRET || DEFAULT_DISCORD_CLIENT_SECRET;
            const redirectUri = stateData?.redirectUri || process.env.DISCORD_REDIRECT_URI || `${baseOrigin}/auth/discord/callback`;

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

                // Si el usuario había vinculado Roblox primero en default_session o sesión previa, unificar todo bajo su Discord ID real
                if (stateData?.discordId && stateData.discordId !== verifiedId) {
                    await migrarDatosDeSesion(stateData.discordId, verifiedId);
                }
                await migrarDatosDeSesion('default_session', verifiedId);

                lastActiveDiscordId = verifiedId;

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
            const redirectUri = process.env.ROBLOX_REDIRECT_URI || `${baseOrigin}/auth/roblox/callback`;

            if (!robloxClientId || !process.env.ROBLOX_CLIENT_SECRET) {
                if (pathname.endsWith('/redirect')) {
                    res.writeHead(302, { Location: `${baseOrigin}/?oauth_notice=roblox_missing` });
                    return res.end();
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
                res.writeHead(302, { Location: authUrl });
                return res.end();
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ ok: true, configured: true, url: authUrl }));
        }

        // Callback OAuth 2.0 de Roblox
        if (pathname === '/auth/roblox/callback') {
            const code = urlObj.searchParams.get('code');
            const state = urlObj.searchParams.get('state');
            const stateData = state ? oauthStates.get(state) : null;
            if (state) oauthStates.delete(state);

            const robloxClientId = process.env.ROBLOX_CLIENT_ID;
            const robloxClientSecret = process.env.ROBLOX_CLIENT_SECRET;
            const redirectUri = stateData?.redirectUri || process.env.ROBLOX_REDIRECT_URI || `${baseOrigin}/auth/roblox/callback`;

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

                const targetDiscordId = resolveActiveSessionDiscordId(stateData?.discordId);
                if (targetDiscordId !== 'default_session') {
                    lastActiveDiscordId = targetDiscordId;
                }

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
                    subtitle: `No se pudo completar el intercambio OAuth2 con Roblox (${err.response?.data?.error_description || err.message}).`,
                    payload: { type: 'KORTEX_OAUTH_ERROR', provider: 'roblox' }
                }));
            }
        }

        // Vinculación Rápida por Usuario o ID de Roblox protegida en 2 pasos con Código de Seguridad (Bot Verificador por MD / Buzón)
        if (pathname === '/api/auth/manual-link' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const targetDiscordId = resolveActiveSessionDiscordId(body.discordId);
            const step = String(body.step || (body.verificationCode ? 'verify' : 'request')).trim();

            if (step === 'cancel') {
                cancelarVerificacionCodigoRoblox(targetDiscordId);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({ ok: true, step: 'cancelled' }));
            }

            // PASO 2: Confirmar código de 6 dígitos enviado por el Bot Verificador
            if (step === 'verify') {
                const codeInput = String(body.verificationCode || '').trim();
                const verifyResult = await confirmarVerificacionCodigoRoblox(targetDiscordId, codeInput);
                if (!verifyResult.ok) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    return res.end(JSON.stringify({
                        ok: false,
                        step: 'verify_failed',
                        message: verifyResult.message
                    }));
                }

                if (targetDiscordId !== 'default_session') {
                    lastActiveDiscordId = targetDiscordId;
                }

                const summary = await obtenerHistorialYEstadoCuenta(targetDiscordId).catch(() => null);

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                    ok: true,
                    step: 'verified',
                    discordId: targetDiscordId,
                    linkedAccount: verifyResult.linkedAccount,
                    discordConfig: summary?.discordConfig || null,
                    hasActiveAccount: true,
                    history: summary?.history || [],
                    stats: summary?.stats || { wishlistCount: 0, pendingRobuxCount: 0, redeemedCodesCount: 0, gameSubsCount: 0 },
                    message: verifyResult.message
                }));
            }

            // PASO 1: Enviar código de seguridad de 6 dígitos en la Galería de Mensajes de Roblox (roblox.com/messages)
            const robloxInput = String(body.robloxInput || '').trim();
            const requestResult = await iniciarVerificacionCodigoRoblox(targetDiscordId, robloxInput);

            if (!requestResult.ok) {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({
                    ok: false,
                    step: 'request_failed',
                    message: requestResult.message
                }));
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
                ok: true,
                step: 'verify_required',
                discordId: targetDiscordId,
                profile: requestResult.profile,
                robloxMessageDelivered: Boolean(requestResult.robloxMessageDelivered),
                deliveryChannel: requestResult.deliveryChannel || null,
                botInboxMessage: requestResult.botInboxMessage,
                message: requestResult.message
            }));
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

        // Servir docs/index.html por defecto
        if (fs.existsSync(DOCS_HTML_PATH)) {
            const html = fs.readFileSync(DOCS_HTML_PATH, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(html);
        }

        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Kortex v2.0 Server Online');
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