// ==========================================
// ARCHIVO: commands/roblox.js
// ==========================================

const { SlashCommandBuilder } = require('discord.js');
const { construirMenuPrincipal, construirLista, construirListaVacia } = require('../interactions/buttons/navigation');
const { renderizarVistaGrafica } = require('../interactions/buttons/chartView');
const routerInteracciones = require('../interactions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roblox')
        .setDescription('Hub de herramientas, monitoreo y gráficas de precios de Roblox'),

    // Vista 1 — Comando Slash (/roblox)
    async execute(interaction) {
        const hub = construirMenuPrincipal(interaction.user.id);
        await interaction.reply(hub);
    },

    // Vista 1 — Comando por Prefijo (!roblox o mención @Kortex)
    async executePrefix(message) {
        const hub = construirMenuPrincipal(message.author.id);
        await message.reply(hub);
    },

    // Manejador unificado de componentes (Vista 1 <-> Vista 2 <-> Vista 3)
    async handleComponent(interaction) {
        return await routerInteracciones(interaction);
    },

    construirMenuPrincipal,
    construirLista,
    construirListaVacia,
    renderizarVistaGrafica
};