// ==========================================
// ARCHIVO: events/interactionCreate.js
// ==========================================

const { Events } = require('discord.js');
const routerInteracciones = require('../interactions');

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
                }
            }
            return;
        }

        // 2. Delegación de componentes UI al ruteador
        try {
            await routerInteracciones(interaction);
        } catch (err) {
            console.error('[ERROR ROUTER INTERACCIONES]:', err);
        }
    },
};
