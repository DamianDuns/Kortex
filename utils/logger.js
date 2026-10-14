// ==========================================
// ARCHIVO: utils/logger.js
// ==========================================

const os = require('node:os');
const { version: djsVersion } = require('discord.js');
const pkg = require('../package.json');

const usarColor = !process.env.NO_COLOR;

const c = {
    reset: usarColor ? '\x1b[0m' : '',
    bold: usarColor ? '\x1b[1m' : '',
    dim: usarColor ? '\x1b[2m' : '',
    cyan: usarColor ? '\x1b[36m' : '',
    green: usarColor ? '\x1b[32m' : '',
    yellow: usarColor ? '\x1b[33m' : '',
    red: usarColor ? '\x1b[31m' : '',
    magenta: usarColor ? '\x1b[35m' : '',
    blue: usarColor ? '\x1b[34m' : '',
    white: usarColor ? '\x1b[37m' : '',
    gray: usarColor ? '\x1b[90m' : ''
};

function timestamp() {
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-AR', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    return `${c.gray}[${hora}]${c.reset}`;
}

function tag(label, color) {
    const padded = label.padEnd(7, ' ');
    return `${color}${c.bold}${padded}${c.reset}`;
}

function linea(char = '─', ancho = 64) {
    return `${c.gray}${char.repeat(ancho)}${c.reset}`;
}

function imprimirBanner(modoDeploy = false) {
    const modoTexto = modoDeploy
        ? `${c.yellow}${c.bold}DEPLOY + START${c.reset}`
        : `${c.green}${c.bold}STANDARD START${c.reset}`;

    console.log('');
    console.log(`${c.cyan}${c.bold}╭──────────────────────────────────────────────────────────────╮${c.reset}`);
    console.log(`${c.cyan}${c.bold}│${c.reset}  ⚡ ${c.bold}${c.white}KORTEX BOT${c.reset} ${c.gray}v${pkg.version || '1.0.0'}${c.reset} • ${c.cyan}Roblox Economy & Price Sniper${c.reset}       ${c.cyan}${c.bold}│${c.reset}`);
    console.log(`${c.cyan}${c.bold}│${c.reset}  ${c.gray}Node ${process.version} │ discord.js v${djsVersion} │ Modo:${c.reset} ${modoTexto}   ${c.cyan}${c.bold}│${c.reset}`);
    console.log(`${c.cyan}${c.bold}╰──────────────────────────────────────────────────────────────╯${c.reset}`);
}

function imprimirResumenCarga({ comandos = [], eventos = [], interacciones = null }) {
    console.log(linea());
    console.log(`${timestamp()} ${tag('INIT', c.cyan)} ${c.bold}Cargando módulos del sistema...${c.reset}`);

    const listaCmds = comandos.map(n => `${c.cyan}/${n}${c.reset}`).join(', ') || 'ninguno';
    console.log(`  ${c.gray}├─${c.reset} 📦 ${c.bold}Comandos (${comandos.length}):${c.reset} ${listaCmds}`);

    const listaEvts = eventos.map(e => `${c.white}${e}${c.reset}`).join(', ') || 'ninguno';
    console.log(`  ${c.gray}├─${c.reset} 📡 ${c.bold}Eventos  (${eventos.length}):${c.reset} ${listaEvts}`);

    if (interacciones) {
        const { botones, selects, modales, total } = interacciones;
        console.log(
            `  ${c.gray}╰─${c.reset} 🧩 ${c.bold}UI Router (${total}):${c.reset} ` +
            `${c.green}${botones.length} Botones${c.reset} ${c.gray}│${c.reset} ` +
            `${c.yellow}${selects.length} Selects${c.reset} ${c.gray}│${c.reset} ` +
            `${c.magenta}${modales.length} Modales${c.reset}`
        );
    } else {
        console.log(`  ${c.gray}╰─${c.reset} 🧩 ${c.bold}UI Router:${c.reset} Cargado`);
    }
    console.log(linea());
}

function imprimirPanelOnline({ client, guildsSyncOk, guildsCount, intervaloMinutos }) {
    const memMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    const totalUsers = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
    const dbEstado = guildsSyncOk
        ? `${c.green}Conectado (${guildsCount} servidor/es sincronizado/s)${c.reset}`
        : `${c.yellow}Con advertencias (revisar logs de Supabase)${c.reset}`;

    console.log('');
    console.log(`${c.green}${c.bold}╭─────────────────── 🤖 ESTADO DEL SISTEMA ────────────────────╮${c.reset}`);
    console.log(`${c.green}${c.bold}│${c.reset}  • ${c.bold}Sesión:${c.reset}      ${c.white}${client.user.tag}${c.reset} ${c.gray}(ID: ${client.user.id})${c.reset}`);
    console.log(`${c.green}${c.bold}│${c.reset}  • ${c.bold}Alcance:${c.reset}     ${c.cyan}${guildsCount} servidor(es)${c.reset} ${c.gray}│ ~${totalUsers.toLocaleString('es-AR')} miembros${c.reset}`);
    console.log(`${c.green}${c.bold}│${c.reset}  • ${c.bold}Supabase:${c.reset}    ${dbEstado}`);
    console.log(`${c.green}${c.bold}│${c.reset}  • ${c.bold}Sniper:${c.reset}      ${c.magenta}Activo (escaneo cada ${intervaloMinutos} min)${c.reset}`);
    console.log(`${c.green}${c.bold}│${c.reset}  • ${c.bold}Recursos:${c.reset}    ${c.white}${memMB} MB RAM${c.reset} ${c.gray}│ Host: ${os.hostname()}${c.reset}`);
    console.log(`${c.green}${c.bold}╰──────────────────────────────────────────────────────────────╯${c.reset}`);
    console.log('');
}

const logger = {
    c,
    linea,
    imprimirBanner,
    imprimirResumenCarga,
    imprimirPanelOnline,

    info(msg) {
        console.log(`${timestamp()} ${tag('INFO', c.cyan)} ${msg}`);
    },
    ok(msg) {
        console.log(`${timestamp()} ${tag('OK', c.green)} ${msg}`);
    },
    warn(msg) {
        console.warn(`${timestamp()} ${tag('WARN', c.yellow)} ${msg}`);
    },
    error(scope, err) {
        const detalle = err?.stack || err?.message || err || 'Error desconocido';
        console.error(`${timestamp()} ${tag('ERROR', c.red)} ${c.red}[${scope}]${c.reset} ${detalle}`);
    },
    deploy(msg) {
        console.log(`${timestamp()} ${tag('DEPLOY', c.yellow)} ${msg}`);
    },
    db(msg) {
        console.log(`${timestamp()} ${tag('DB', c.blue)} ${msg}`);
    },
    sniper(msg) {
        console.log(`${timestamp()} ${tag('SNIPER', c.magenta)} ${msg}`);
    }
};

module.exports = logger;
