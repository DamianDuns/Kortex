// ==========================================
// ARCHIVO: events/interactionCreate.js
// ==========================================

const { Events, MessageFlags } = require('discord.js');
const routerInteracciones = require('../interactions');

// Avisa al usuario cuando algo falla, en vez de dejar "La interacción ha fallado"
async function responderError(interaction) {
    if (!interaction.isRepliable()) return;
    const payload = {
        content: '❌ Ocurrió un error inesperado al procesar tu solicitud. Intentá de nuevo en unos segundos.',
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
        // 1. Ejecución de comandos slash
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (command) {
                try {
                    await command.execute(interaction);
                } catch (err) {
                    console.error(`[ERROR COMANDO /${interaction.commandName}]:`, err);
                    await responderError(interaction);
                }
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
    },
};
