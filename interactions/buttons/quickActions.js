// ==========================================
// ARCHIVO: interactions/buttons/quickActions.js
// ==========================================

const { construirMenuSniper } = require('./navigation');
const { construirPanelCalculadoraLimpio } = require('../calcHelpers');

module.exports = {
    customIdPrefix: 'btn_quick_',

    async execute(interaction) {
        await interaction.deferUpdate();

        if (interaction.customId === 'btn_quick_sniper') {
            const panelSniper = construirMenuSniper();
            return await interaction.editReply(panelSniper);
        }

        if (interaction.customId === 'btn_quick_calc') {
            const panelCalc = construirPanelCalculadoraLimpio();
            return await interaction.editReply(panelCalc);
        }
    }
};