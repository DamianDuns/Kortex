// ==========================================
// ARCHIVO: events/messageCreate.js
// ==========================================

const { Events } = require('discord.js');
const { construirMenuPrincipal } = require('../interactions/buttons/navigation');
const { construirPanelPing } = require('../commands/ping');
const { construirPanelHelp } = require('../commands/help');
const { construirPanelConfigDiscord } = require('../src/utils/fastLink');
const { construirPanelEstadoRoblox } = require('../src/modules/statusModule');
const { construirPanelTycoon } = require('../interactions/tycoonHandler');
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

            // Soporte directo para prefijo !tycoon
            if (lowerContent === '!tycoon' || lowerContent.startsWith('!tycoon ')) {
                if (!haSeleccionadoIdioma(userId)) {
                    return await message.reply(construirPanelSeleccionIdiomaInicial(userId, 'tycoon'));
                }
                const panel = await construirPanelTycoon(message.author, 'sec_studio', null);
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
                const esOwner = await esPropietarioDelBot(userId, message.client);
                if (!esOwner) {
                    return await message.reply(traducirPayloadDiscord(construirPanelAvisoModeracion({
                        titulo: '🛠️ Mantenimiento Temporal',
                        descripcion: 'El bot se encuentra en mantenimiento temporalmente. Volvé a intentarlo en unos minutos.',
                        includeBackButton: false
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

            // 5. @Kortex tycoon -> Abre el Estudio Tycoon
            if (texto === 'tycoon' || texto === '!tycoon') {
                const panel = await construirPanelTycoon(message.author, 'sec_studio', null);
                return await message.reply(panel);
            }

            // 6. @Kortex solo, @Kortex roblox o @Kortex !roblox -> Abre el Action Hub directo
            const hub = construirMenuPrincipal(userId);
            await message.reply(traducirPayloadDiscord(hub, lang));
        });
    }
};