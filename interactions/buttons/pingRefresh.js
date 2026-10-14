// ==========================================
// ARCHIVO: interactions/buttons/pingRefresh.js
// ==========================================

const { construirPanelPing } = require('../../commands/ping');

module.exports = {
    customIdPrefix: 'btn_ping_refresh',

    async execute(interaction) {
        const latencia = Math.max(0, Date.now() - interaction.createdTimestamp);
        await interaction.update(construirPanelPing(interaction.client, latencia));
    }
};
