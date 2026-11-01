// ==========================================
// ARCHIVO: events/interactionCreate.js
// ==========================================

const { Events, MessageFlags } = require('discord.js');
const routerInteracciones = require('../interactions');
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
    envolverInteraccionConI18n
} = require('../src/utils/i18n');

// Avisa al usuario cuando algo falla, en vez de dejar "La interacción ha fallado"
async function responderError(interaction) {
    if (!interaction.isRepliable()) return;
    const isEn = obtenerIdiomaUsuario(interaction.user?.id) === 'en';
    const payload = {
        content: isEn
            ? '❌ An unexpected error occurred while processing your request. Please try again in a few seconds.'
            : '❌ Ocurrió un error inesperado al procesar tu solicitud. Intentá de nuevo en unos segundos.',
        flags: MessageFlags.Ephemeral
    };
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);
        } else {
            await interaction.reply(payload);
        }
    } catch {
        // La interacción pudo haber expirado; no hay nada más que hacer
    }
}

module.exports = {
    name: Events.InteractionCreate,

    async execute(interaction) {
        return await ejecutarConContextoIdioma(interaction.user?.id, async () => {
            // Envolver la interacción con traducción automática Español / Inglés según la preferencia del usuario
            envolverInteraccionConI18n(interaction);

            // 1. Ejecución de comandos slash (/roblox, /config, /ping, /help)
            if (interaction.isChatInputCommand()) {
                try {
                    const ownerCfg = obtenerConfigPropietario();
                    if (ownerCfg.maintenanceMode && interaction.commandName !== 'config') {
                        const esOwner = await esPropietarioDelBot(interaction.user.id, interaction.client);
                        if (!esOwner) {
                            return await interaction.reply(construirPanelAvisoModeracion({
                                titulo: '🛠️ Bot en Mantenimiento Temporal',
                                descripcion: 'El propietario del bot activó el **Modo Mantenimiento** para realizar ajustes o liberar recursos. Volvé a intentarlo en unos minutos.'
                            }));
                        }
                    }

                    // Si es la primera vez que el usuario ejecuta un comando, mostrar selector de idioma (Español / English)
                    if (!haSeleccionadoIdioma(interaction.user.id)) {
                        return await interaction.reply(
                            construirPanelSeleccionIdiomaInicial(interaction.user.id, interaction.commandName)
                        );
                    }

                    const command = interaction.client.commands.get(interaction.commandName);
                    if (command) {
                        await command.execute(interaction);
                    }
                } catch (err) {
                    console.error(`[ERROR COMANDO /${interaction.commandName}]:`, err);
                    await responderError(interaction);
                }
                return;
            }

            // 2. Delegación de componentes UI al ruteador
            try {
                await routerInteracciones(interaction);
            } catch (err) {
                console.error('[ERROR ROUTER INTERACCIONES]:', err);
                await responderError(interaction);
            }
        });
    },
};
