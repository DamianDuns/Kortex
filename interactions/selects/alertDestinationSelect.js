// ==========================================
// ARCHIVO: interactions/selects/alertDestinationSelect.js
// ==========================================

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const supabase = require('../../db');
const { renderizarPanelConfig } = require('../buttons/manageActions');

module.exports = {
    customIdPrefix: 'select_alert_destination:',

    async execute(interaction) {
        const dbId = interaction.customId.split(':')[1];
        const opcion = interaction.values[0];

        // 1. Opción Webhook -> Abre Modal de texto
        if (opcion === 'dest_webhook') {
            const modal = new ModalBuilder()
                .setCustomId(`modal_webhook_submit:${dbId}`)
                .setTitle('Configurar Webhook de Alertas');

            const inputWebhook = new TextInputBuilder()
                .setCustomId('input_webhook_url')
                .setLabel('URL del Webhook de Discord')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('https://discord.com/api/webhooks/...')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(inputWebhook));
            return await interaction.showModal(modal);
        }

        // 2. Opción Canal de Servidor -> Abre Modal para ingresar ID
        if (opcion === 'dest_channel') {
            const modal = new ModalBuilder()
                .setCustomId(`modal_channel_submit:${dbId}`)
                .setTitle('Vincular Canal por ID');

            const inputChannel = new TextInputBuilder()
                .setCustomId('input_channel_id')
                .setLabel('ID del Canal de Discord')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ejemplo: 123456789012345678')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(inputChannel));
            return await interaction.showModal(modal);
        }

        await interaction.deferUpdate();

        // 3. Opción Mensaje Directo (DM)
        if (opcion === 'dest_dm') {
            await supabase
                .from('roblox_wishlist')
                .update({ channel_id: null, webhook_url: null })
                .eq('id', dbId)
                .eq('user_id', interaction.user.id);
        }

        // Re-renderizar panel actualizado
        const { data: itemActualizado } = await supabase
            .from('roblox_wishlist')
            .select('*')
            .eq('id', dbId)
            .eq('user_id', interaction.user.id)
            .maybeSingle();

        if (itemActualizado) {
            const panelData = await renderizarPanelConfig(itemActualizado);
            await interaction.editReply(panelData);

            if (opcion === 'dest_dm') {
                await interaction.followUp({
                    content: `💬 **Mensaje Directo configurado:** Las alertas para **${itemActualizado.item_name}** te llegarán por privado.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
};
