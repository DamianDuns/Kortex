// ==========================================
// ARCHIVO: commands/roblox.js
// ==========================================

const { SlashCommandBuilder } = require('discord.js');
const { construirMenuPrincipal, construirLista, construirListaVacia } = require('../interactions/buttons/navigation');
const { renderizarVistaGrafica } = require('../interactions/buttons/chartView');
const { obtenerCuentaVinculada } = require('../src/utils/fastLink');
const routerInteracciones = require('../interactions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roblox')
        .setDescription('Hub simétrico de 20 herramientas en 4 categorías: economía, avatares 3D/2D, juegos y estadísticas'),

    // Vista 1 — Comando Slash (/roblox)
    async execute(interaction) {
        await obtenerCuentaVinculada(interaction.user.id).catch(() => null);
        const hub = construirMenuPrincipal(interaction.user.id);
        await interaction.reply(hub);
    },

    // Vista 1 — Comando por Prefijo (!roblox o mención @Kortex)
    async executePrefix(message) {
        await obtenerCuentaVinculada(message.author.id).catch(() => null);
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