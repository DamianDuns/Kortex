const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    customIdPrefix: 'btn_target_modal:',

    async execute(interaction) {
        const [, itemType, idObjet, moneda] = interaction.customId.split(':');

        const modal = new ModalBuilder()
            .setCustomId(`modal_set_target_submit:${itemType}:${idObjet}`)
            .setTitle('Establecer Meta de Precio');

        const labelTexto = moneda === 'USD' 
            ? 'Precio Objetivo en Dólares ($ USD)' 
            : 'Precio Objetivo en Robux';

        const placeholderTexto = moneda === 'USD' ? 'Ejemplo: 1.99' : 'Ejemplo: 100';

        const inputTarget = new TextInputBuilder()
            .setCustomId('input_target_price_val')
            .setLabel(labelTexto)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(placeholderTexto)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputTarget));
        return await interaction.showModal(modal);
    }
};
