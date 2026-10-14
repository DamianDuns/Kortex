const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { obtenerSeleccion } = require('../calcHelpers');

module.exports = {
    customIdPrefix: 'btn_calc_execute_modal',

    async execute(interaction) {
        const seleccionadas = obtenerSeleccion(interaction.user.id);

        if (seleccionadas.length === 0) {
            return await interaction.reply({ content: '⚠️ Seleccioná al menos una opción en el menú desplegable antes de calcular.', flags: MessageFlags.Ephemeral });
        }

        const modal = new ModalBuilder().setCustomId('modal_calc_limpio_submit').setTitle('Calculadora de Economía');
        const inputPrice = new TextInputBuilder().setCustomId('input_price').setLabel('Precio base en Robux').setStyle(TextInputStyle.Short).setPlaceholder('Ejemplo: 50').setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputPrice));
        return await interaction.showModal(modal);
    }
};
