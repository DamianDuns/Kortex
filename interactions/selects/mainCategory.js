// ==========================================
// ARCHIVO: interactions/selects/mainCategory.js
// ==========================================
// Mantiene compatibilidad con paneles viejos que todavía tienen el menú
// desplegable "Elegí una herramienta..." (el Hub nuevo usa botones).

const { MessageFlags } = require('discord.js');
const { construirMenuSniper } = require('../buttons/navigation');
const { construirPanelCalculadoraLimpio, obtenerSeleccion } = require('../calcHelpers');

module.exports = {
    customIdPrefix: 'select_main_category',

    async execute(interaction) {
        const [, ownerId] = interaction.customId.split(':');

        if (ownerId && interaction.user.id !== ownerId) {
            return await interaction.reply({
                content: '❌ Solo la persona que invocó este comando puede interactuar con el menú.',
                flags: MessageFlags.Ephemeral
            });
        }

        const opcion = interaction.values[0];

        if (opcion === 'cat_sniper') {
            return await interaction.update(construirMenuSniper());
        }

        if (opcion === 'cat_calculators') {
            // Antes abría un menú (select_calc_type) que ningún handler procesaba
            return await interaction.update(construirPanelCalculadoraLimpio(obtenerSeleccion(interaction.user.id)));
        }
    }
};
