// ==========================================
// ARCHIVO: interactions/buttons/quickActions.js
// ==========================================

const { construirMenuSniper } = require('./navigation');
const { construirPanelCalculadoraLimpio, obtenerSeleccion } = require('../calcHelpers');
const { obtenerIdiomaUsuario } = require('../../src/utils/i18n');

module.exports = {
    customIdPrefix: 'btn_quick_',

    async execute(interaction) {
        await interaction.deferUpdate();
        const lang = obtenerIdiomaUsuario(interaction.user.id);

        if (interaction.customId === 'btn_quick_sniper') {
            const panelSniper = construirMenuSniper(lang);
            return await interaction.editReply(panelSniper);
        }

        if (interaction.customId === 'btn_quick_calc') {
            const panelCalc = construirPanelCalculadoraLimpio(obtenerSeleccion(interaction.user.id), interaction.user.id);
            return await interaction.editReply(panelCalc);
        }
    }
};