// ==========================================
// ARCHIVO: commands/roblox.js
// ==========================================

const { SlashCommandBuilder } = require('discord.js');
const { construirMenuPrincipal } = require('../interactions/buttons/navigation');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roblox')
        .setDescription('Hub de herramientas y economía de Roblox'),

    async execute(interaction) {
        const hub = construirMenuPrincipal(interaction.user.id);
        await interaction.reply(hub);
    },
};