// ==========================================
// ARCHIVO: commands/config.js
// Comando de Configuración por Categorías (/config)
// ==========================================

const { SlashCommandBuilder } = require('discord.js');
const { construirPanelConfigDiscord } = require('../src/utils/fastLink');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Abrí el panel de configuración por categorías (Cuentas y Conexión / Moderación del Bot).'),

    async execute(interaction) {
        const panel = await construirPanelConfigDiscord(interaction.user, null, 'cat_accounts', interaction.client);
        await interaction.reply(panel);
    }
};
