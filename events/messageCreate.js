// ==========================================
// ARCHIVO: events/messageCreate.js
// Manejo unificado de prefijos configurables, fallback '!' y menciones (@Kortex)
// ==========================================

const { Events } = require('discord.js');
const { construirMenuPrincipal } = require('../interactions/buttons/navigation');
const { construirPanelPing } = require('../commands/ping');
const { construirPanelHelp } = require('../commands/help');
const { construirPanelConfigDiscord, obtenerCuentaVinculada } = require('../src/utils/fastLink');
const { construirPanelTycoon } = require('../interactions/tycoonHandler');
const {
    obtenerConfigPropietario,
    esPropietarioDelBot,
    construirPanelAvisoModeracion
} = require('../src/utils/performanceManager');
const {
    haSeleccionadoIdioma,
    obtenerIdiomaUsuario,
    obtenerPreferenciasUsuario,
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
        if (!rawContent) return;

        const userId = message.author.id;
        const lang = obtenerIdiomaUsuario(userId);

        // Obtener preferencias y prefijo personalizado (default '!')
        const prefs = obtenerPreferenciasUsuario(userId);
        const userPrefix = (prefs && prefs.custom_prefix) ? prefs.custom_prefix : '!';

        // Detectar si el mensaje usa mención directa al bot (@Kortex ...)
        const botMentionRegex = new RegExp(`^<@!?${clientUser.id}>(?:\\s+)?`, 'i');
        const empiezaConMencion = botMentionRegex.test(rawContent);

        let commandBody = null;
        if (empiezaConMencion) {
            commandBody = rawContent.replace(botMentionRegex, '').trim();
        } else if (rawContent.startsWith(userPrefix)) {
            commandBody = rawContent.slice(userPrefix.length).trim();
        } else if (userPrefix !== '!' && rawContent.startsWith('!')) {
            // Fallback universal '!' para que nunca quede bloqueado si olvida su prefijo
            commandBody = rawContent.slice(1).trim();
        }

        // Si el mensaje no inicia con el prefijo configurado, fallback o mención, ignorar
        if (commandBody === null) {
            return;
        }

        return await ejecutarConContextoIdioma(userId, async () => {
            // Modo Mantenimiento activado por el propietario
            const ownerCfg = obtenerConfigPropietario();
            if (ownerCfg.maintenanceMode) {
                const esOwner = await esPropietarioDelBot(userId, message.client);
                if (!esOwner) {
                    return await message.reply(traducirPayloadDiscord(construirPanelAvisoModeracion({
                        titulo: '🛠️ Mantenimiento Temporal',
                        descripcion: 'El bot se encuentra en mantenimiento temporalmente. Intentá nuevamente en unos minutos.',
                        includeBackButton: false
                    }), lang));
                }
            }

            const tokens = commandBody.split(/\s+/);
            const cmd = (tokens[0] || '').toLowerCase();

            // Si es la primera vez que interactúa, solicitar idioma
            if (!haSeleccionadoIdioma(userId)) {
                return await message.reply(construirPanelSeleccionIdiomaInicial(userId, cmd || 'roblox'));
            }

            // 1. Comando /config (o !config, @Kortex config, !prefijo)
            if (cmd === 'config' || cmd === 'configuracion' || cmd === 'settings' || cmd === 'prefijo' || cmd === 'prefix') {
                const targetCat = (cmd === 'prefijo' || cmd === 'prefix') ? 'cat_preferences' : 'cat_accounts';
                const panel = await construirPanelConfigDiscord(message.author, null, targetCat, message.client);
                return await message.reply(traducirPayloadDiscord(panel, lang));
            }

            // 2. Comando /tycoon (o !tycoon, @Kortex tycoon)
            if (cmd === 'tycoon' || cmd === 'estudio' || cmd === 'studio') {
                const panel = await construirPanelTycoon(message.author, 'sec_studio', null);
                return await message.reply(panel);
            }

            // 3. Comando /ping (o !ping, @Kortex ping)
            if (cmd === 'ping' || cmd === 'latencia' || cmd === 'ms') {
                const latencia = Math.max(0, Date.now() - message.createdTimestamp);
                return await message.reply(construirPanelPing(message.client, latencia, lang));
            }

            // 4. Comando /help (o !help, !ayuda, @Kortex help)
            if (cmd === 'help' || cmd === 'ayuda' || cmd === 'guia') {
                return await message.reply(construirPanelHelp('cmd_overview', 'sub_economy', lang));
            }

            // 5. Comando /roblox o mención directa sola (@Kortex o !roblox)
            if (cmd === '' || cmd === 'roblox' || cmd === 'menu' || cmd === 'hub' || cmd === 'inicio') {
                await obtenerCuentaVinculada(userId).catch(() => null);
                const hub = construirMenuPrincipal(userId);
                return await message.reply(traducirPayloadDiscord(hub, lang));
            }

            // Si se envió un comando desconocido con prefijo o mención, abrir Action Hub principal
            await obtenerCuentaVinculada(userId).catch(() => null);
            const hub = construirMenuPrincipal(userId);
            return await message.reply(traducirPayloadDiscord(hub, lang));
        });
    }
};
