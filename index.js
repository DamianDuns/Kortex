// ==========================================
// ARCHIVO: index.js
// Punto de entrada de Kortex: Cliente Discord.js v14
// ==========================================

const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require('discord.js');
require('dotenv').config();
const logger = require('./utils/logger');
const supabase = require('./db');
const {
    sincronizarPersistenciaDesdeSupabase
} = require('./src/utils/fastLink');

const modoDeploy = process.argv.includes('--deploy') || process.env.DEPLOY_COMMANDS === 'true';
logger.imprimirBanner(modoDeploy);

// Verificación no bloqueante de variables de entorno
const REQUIRED_ENV = ['DISCORD_TOKEN', 'CLIENT_ID', 'SUPABASE_URL'];
const faltantes = REQUIRED_ENV.filter(key => !process.env[key]);
if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_KEY) {
    faltantes.push('SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_KEY)');
}
if (faltantes.length > 0) {
    logger.warn(`Variables de entorno no configuradas aún: ${faltantes.join(', ')}.`);
}

const routerInteracciones = require('./interactions');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Channel,
        Partials.Message
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

// Sincronizar cuentas persistentes con Supabase en segundo plano al iniciar
sincronizarPersistenciaDesdeSupabase().then(() => {
    logger.ok('Persistencia remota con Supabase sincronizada e hidratada.');
}).catch((err) => {
    logger.warn('Sincronización inicial con Supabase en background:', err.message);
});

(function runDiagnosticsOnBoot() {
    try {
        const { ejecutarDiagnosticoArranqueYCalibracion } = require('./src/utils/performanceManager');
        ejecutarDiagnosticoArranqueYCalibracion();
    } catch {
        // Silencioso
    }
})();

// 3. Registro de comandos slash globales con Discord
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

// 4. Manejadores Anti-Crash y Apagado Limpio
process.on('unhandledRejection', (reason) => logger.error('UNHANDLED REJECTION', reason));
process.on('uncaughtException', (error) => logger.error('UNCAUGHT EXCEPTION', error));

async function apagar(signal) {
    logger.warn(`Señal ${signal} recibida. Cerrando sesión de Discord de forma segura...`);
    try {
        await client.destroy();
    } finally {
        process.exit(0);
    }
}
process.once('SIGINT', () => apagar('SIGINT'));
process.once('SIGTERM', () => apagar('SIGTERM'));

// 5. Inicialización de Discord Gateway
(async () => {
    if (!process.env.DISCORD_TOKEN) {
        logger.warn('DISCORD_TOKEN no definido en variables de entorno.');
        return;
    }

    await registrarComandos();
    try {
        logger.info('Autenticando cliente con Discord Gateway...');
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        logger.error('LOGIN', `No se pudo iniciar sesión en Discord: ${error.message}`);
    }
})();
