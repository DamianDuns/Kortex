// ==========================================
// ARCHIVO: events/messageCreate.js
// ==========================================

const { Events } = require('discord.js');
const { construirMenuPrincipal } = require('../interactions/buttons/navigation');
const { construirPanelPing } = require('../commands/ping');
const { construirPanelHelp } = require('../commands/help');
const { construirPanelConfigDiscord } = require('../src/utils/fastLink');
const {
    obtenerConfigPropietario,
    esPropietarioDelBot,
    construirPanelAvisoModeracion
} = require('../src/utils/performanceManager');
const {
    haSeleccionadoIdioma,
    obtenerIdiomaUsuario,
    ejecutarConContextoIdioma,
    construirPanelSeleccionIdiomaInicial,
    traducirPayloadDiscord
} = require('../src/utils/i18n');

module.exports = {
    name: Events.MessageCreate,

    async execute(message) {
        if (message.author.bot) return;

        const clientUser = message.client.user;
        const rawContent = (message.content || '').trim();
        const lowerContent = rawContent.toLowerCase();
        const userId = message.author.id;
        const lang = obtenerIdiomaUsuario(userId);

        return await ejecutarConContextoIdioma(userId, async () => {
            // Soporte directo para prefijo !config
            if (lowerContent === '!config' || lowerContent.startsWith('!config ')) {
                if (!haSeleccionadoIdioma(userId)) {
                    return await message.reply(construirPanelSeleccionIdiomaInicial(userId, 'config'));
                }
                const panel = await construirPanelConfigDiscord(message.author, null, 'cat_accounts', message.client);
                return await message.reply(traducirPayloadDiscord(panel, lang));
            }

            const esRobloxPrefijo = lowerContent === '!roblox' || lowerContent.startsWith('!roblox ');
            const mencionaBot = message.mentions.has(clientUser, { ignoreEveryone: true, ignoreRoles: true });

            if (!esRobloxPrefijo && !mencionaBot) {
                return;
            }

            // Si el propietario activó Modo Mantenimiento, restringir menciones/prefijos para usuarios comunes
            const ownerCfg = obtenerConfigPropietario();
            if (ownerCfg.maintenanceMode) {
                const esOwner = await esPropietarioDelBot(userId, message.client);
                if (!esOwner) {
                    return await message.reply(traducirPayloadDiscord(construirPanelAvisoModeracion({
                        titulo: '🛠️ Bot en Mantenimiento Temporal',
                        descripcion: 'El propietario del bot activó el **Modo Mantenimiento** para realizar ajustes o liberar recursos. Volvé a intentarlo en unos minutos.'
                    }), lang));
                }
            }

            // Si es la primera vez que el usuario interactúa con el bot, pedirle que elija Español o English
            if (!haSeleccionadoIdioma(userId)) {
                return await message.reply(construirPanelSeleccionIdiomaInicial(userId, 'roblox'));
            }

            if (esRobloxPrefijo) {
                return await message.reply(traducirPayloadDiscord(construirMenuPrincipal(userId), lang));
            }

            const texto = rawContent
                .replace(new RegExp(`<@!?${clientUser.id}>`, 'g'), '')
                .trim()
                .toLowerCase();

            // 1. @Kortex ping -> mismo panel que /ping
            if (texto === 'ping' || texto === '!ping') {
                const latencia = Math.max(0, Date.now() - message.createdTimestamp);
                return await message.reply(construirPanelPing(message.client, latencia, lang));
            }

            // 2. @Kortex config -> Abre la configuración
            if (texto === 'config' || texto === 'configuracion' || texto === '!config') {
                const panel = await construirPanelConfigDiscord(message.author, null, 'cat_accounts', message.client);
                return await message.reply(traducirPayloadDiscord(panel, lang));
            }

            // 3. @Kortex help -> Abre la guía
            if (texto === 'help' || texto === 'ayuda' || texto === '!help') {
                return await message.reply(construirPanelHelp('cmd_overview', 'sub_economy', lang));
            }

            // 4. @Kortex solo, @Kortex roblox o @Kortex !roblox -> Abre el Action Hub directo
            const hub = construirMenuPrincipal(userId);
            await message.reply(traducirPayloadDiscord(hub, lang));
        });
    }
};