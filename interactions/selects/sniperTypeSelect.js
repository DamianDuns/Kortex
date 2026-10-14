// ==========================================
// ARCHIVO: interactions/selects/sniperTypeSelect.js
// ==========================================

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    customIdPrefix: 'select_sniper_type',

    async execute(interaction) {
        const itemType = interaction.values[0];

        const modal = new ModalBuilder()
            .setCustomId(`modal_add_sniper_${itemType}`)
            .setTitle('Añadir Objeto al Monitoreo');

        const inputId = new TextInputBuilder()
            .setCustomId('input_id_or_url')
            .setLabel('ID o Enlace del Objeto')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ejemplo: 10159610478 o enlace de Roblox')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputId));

        return await interaction.showModal(modal);
    }
};
