// ==========================================
// ARCHIVO: events/messageCreate.js
// ==========================================

const { Events } = require('discord.js');
const { construirMenuPrincipal } = require('../interactions/buttons/navigation');
const { construirPanelPing } = require('../commands/ping');
const { construirPanelConfigDiscord } = require('../src/utils/fastLink');
const {
    obtenerConfigPropietario,
    esPropietarioDelBot,
    construirPanelAvisoModeracion
} = require('../src/utils/performanceManager');

module.exports = {
    name: Events.MessageCreate,

    async execute(message) {
        if (message.author.bot) return;

        const clientUser = message.client.user;
        const rawContent = (message.content || '').trim();
        const lowerContent = rawContent.toLowerCase();

        // Soporte directo para prefijo !config
        if (lowerContent === '!config' || lowerContent.startsWith('!config ')) {
            const panel = await construirPanelConfigDiscord(message.author, null, 'cat_accounts', message.client);
            return await message.reply(panel);
        }

        const esRobloxPrefijo = lowerContent === '!roblox' || lowerContent.startsWith('!roblox ');
        const mencionaBot = message.mentions.has(clientUser, { ignoreEveryone: true, ignoreRoles: true });

        if (!esRobloxPrefijo && !mencionaBot) {
            return;
        }

        // Si el propietario activó Modo Mantenimiento, restringir menciones/prefijos para usuarios comunes
        const ownerCfg = obtenerConfigPropietario();
        if (ownerCfg.maintenanceMode) {
            const esOwner = await esPropietarioDelBot(message.author.id, message.client);
            if (!esOwner) {
                return await message.reply(construirPanelAvisoModeracion({
                    titulo: '🛠️ Bot en Mantenimiento Temporal',
                    descripcion: 'El propietario del bot activó el **Modo Mantenimiento** para realizar ajustes o liberar recursos. Volvé a intentarlo en unos minutos.'
                }));
            }
        }

        if (esRobloxPrefijo) {
            const robloxCommand = message.client.commands.get('roblox');
            if (robloxCommand && typeof robloxCommand.executePrefix === 'function') {
                return await robloxCommand.executePrefix(message);
            }
            return await message.reply(construirMenuPrincipal(message.author.id));
        }

        const texto = rawContent
            .replace(new RegExp(`<@!?${clientUser.id}>`, 'g'), '')
            .trim()
            .toLowerCase();

        // 1. @Kortex ping -> mismo panel que /ping
        if (texto === 'ping' || texto === '!ping') {
            const latencia = Math.max(0, Date.now() - message.createdTimestamp);
            return await message.reply(construirPanelPing(message.client, latencia));
        }

        // 2. @Kortex config -> Abre la configuración
        if (texto === 'config' || texto === 'configuracion' || texto === '!config') {
            const panel = await construirPanelConfigDiscord(message.author, null, 'cat_accounts', message.client);
            return await message.reply(panel);
        }

        // 3. @Kortex help -> Abre la guía
        if (texto === 'help' || texto === 'ayuda' || texto === '!help') {
            const helpCommand = message.client.commands.get('help');
            if (helpCommand) {
                return await helpCommand.execute(message);
            }
        }

        // 4. @Kortex solo, @Kortex roblox o @Kortex !roblox -> Abre el Action Hub directo
        const robloxCommand = message.client.commands.get('roblox');
        if (robloxCommand && typeof robloxCommand.executePrefix === 'function') {
            return await robloxCommand.executePrefix(message);
        }
        const hub = construirMenuPrincipal(message.author.id);
        await message.reply(hub);
    }
};