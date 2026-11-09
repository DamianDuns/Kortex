// ==========================================
// ARCHIVO: commands/tycoon.js
// Comando Principal /tycoon — Estudio Roblox Tycoon en 3ra Persona,
// Colector de Tix, Tienda Normal, Taller UGC, Bóveda Limited / Limited U,
// Trading P2P, Pociones y Beneficios VIP de Comunidad
// ==========================================

const { SlashCommandBuilder } = require('discord.js');
const { construirPanelTycoon } = require('../interactions/tycoonHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tycoon')
        .setDescription('Abrí tu Estudio Kortex Tycoon: Estaciones, Perfil, Tienda Unificada, Cofres, Misiones y Ranking'),

    async execute(interaction) {
        const panel = await construirPanelTycoon(interaction.user, 'sec_studio', null, interaction.member);
        await interaction.reply(panel);
    }
};
