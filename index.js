// ==========================================
// ARCHIVO: index.js
// ==========================================

const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ]
});

client.commands = new Collection();
const commandsForDeploy = [];

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
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }
}

// 3. Registro condicional vía parámetro CLI (--deploy)
async function registrarComandos() {
    const { DISCORD_TOKEN, CLIENT_ID } = process.env;
    if (!DISCORD_TOKEN || !CLIENT_ID) return;

    const rest = new REST().setToken(DISCORD_TOKEN);
    try {
        console.log(`[DEPLOY] Sincronizando ${commandsForDeploy.length} comando(s) con Discord...`);
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commandsForDeploy }
        );
        console.log('[DEPLOY ÉXITO] Sincronización finalizada.');
    } catch (error) {
        console.error('[DEPLOY ERROR]:', error);
    }
}

// 4. Manejadores Anti-Crash
process.on('unhandledRejection', (reason) => console.error('[ANTI-CRASH] Unhandled Rejection:', reason));
process.on('uncaughtException', (error) => console.error('[ANTI-CRASH] Uncaught Exception:', error));

// 5. Inicialización
(async () => {
    if (process.argv.includes('--deploy')) {
        await registrarComandos();
    }
    client.login(process.env.DISCORD_TOKEN);
})();
