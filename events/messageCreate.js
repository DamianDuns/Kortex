// ==========================================
// ARCHIVO: events/messageCreate.js
// Manejo unificado de prefijos configurables, fallback '!' y menciones (@Kortex)
// ==========================================

const { Events } = require('discord.js');
const logger = require('../utils/logger');
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

function limpiarPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const clean = { ...payload };
    if (Array.isArray(clean.attachments) && clean.attachments.length === 0) {
        delete clean.attachments;
    }
    if (Array.isArray(clean.files) && clean.files.length === 0) {
        delete clean.files;
    }
    return clean;
}

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
        const userPrefix = (prefs && prefs.custom_prefix) ? String(prefs.custom_prefix).trim() : '!';

        // Detectar si el mensaje usa mención directa al bot (@Kortex ...)
        const botMentionRegex = new RegExp(`^<@!?${clientUser.id}>(?:\\s+)?`, 'i');
        const empiezaConMencion = botMentionRegex.test(rawContent);

        let commandBody = null;
        const rawLower = rawContent.toLowerCase();
        const prefixLower = userPrefix.toLowerCase();

        if (empiezaConMencion) {
            commandBody = rawContent.replace(botMentionRegex, '').trim();
        } else if (rawLower.startsWith(prefixLower)) {
            commandBody = rawContent.slice(userPrefix.length).trim();
        } else if (userPrefix !== '!' && rawLower.startsWith('!')) {
            // Fallback universal '!' para que nunca quede bloqueado si olvida su prefijo
            commandBody = rawContent.slice(1).trim();
        }

        // Si el mensaje no inicia con el prefijo configurado, fallback o mención, ignorar
        if (commandBody === null) {
            return;
        }

        const responder = async (payload) => {
            const clean = limpiarPayload(payload);
            try {
                return await message.reply(clean);
            } catch {
                return await message.channel.send(clean);
            }
        };

        try {
            return await ejecutarConContextoIdioma(userId, async () => {
                // Modo Mantenimiento activado por el propietario
                const ownerCfg = obtenerConfigPropietario();
                if (ownerCfg.maintenanceMode) {
                    const esOwner = await esPropietarioDelBot(userId, message.client);
                    if (!esOwner) {
                        return await responder(traducirPayloadDiscord(construirPanelAvisoModeracion({
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
                    return await responder(construirPanelSeleccionIdiomaInicial(userId, cmd || 'roblox'));
                }

                logger.info(`[PREFIX] Comando '${cmd || 'hub'}' solicitado por ${message.author.tag} (${userId})`);

                // 1. Comando /config
                if (cmd === 'config') {
                    const panel = await construirPanelConfigDiscord(message.author, null, 'cat_accounts', message.client);
                    return await responder(traducirPayloadDiscord(panel, lang));
                }

                // 2. Comando /tycoon
                if (cmd === 'tycoon') {
                    const panel = await construirPanelTycoon(message.author, 'sec_studio', null);
                    return await responder(panel);
                }

                // 3. Comando /ping
                if (cmd === 'ping') {
                    const latencia = Math.max(0, Date.now() - message.createdTimestamp);
                    return await responder(construirPanelPing(message.client, latencia, lang));
                }

                // 4. Comando /help
                if (cmd === 'help') {
                    return await responder(construirPanelHelp('cmd_overview', 'sub_economy', lang));
                }

                // 5. Comando /roblox o mención directa sola (@Kortex)
                if (cmd === 'roblox' || (cmd === '' && empiezaConMencion)) {
                    await obtenerCuentaVinculada(userId).catch(() => null);
                    const hub = construirMenuPrincipal(userId);
                    return await responder(traducirPayloadDiscord(hub, lang));
                }

                // Si no coincide con ninguno de los comandos oficiales, no ejecutar nada
                return;
            });
        } catch (err) {
            logger.error(`[PREFIX] Error al procesar mensaje con prefijo de ${message.author?.tag || userId}:`, err);
        }
    }
};
