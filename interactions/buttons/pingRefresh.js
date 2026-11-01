// ==========================================
// ARCHIVO: interactions/buttons/pingRefresh.js
// ==========================================

const { construirPanelPing } = require('../../commands/ping');
const { obtenerIdiomaUsuario } = require('../../src/utils/i18n');

module.exports = {
    customIdPrefix: 'btn_ping_',

    async execute(interaction) {
        const latencia = Math.max(0, Date.now() - interaction.createdTimestamp);
        const lang = obtenerIdiomaUsuario(interaction.user?.id);
        await interaction.update(construirPanelPing(interaction.client, latencia, lang));
    }
};
