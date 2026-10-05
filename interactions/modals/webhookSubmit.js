// ==========================================
// ARCHIVO: interactions/modals/webhookSubmit.js
// ==========================================

const { MessageFlags } = require('discord.js');
const supabase = require('../../db');

module.exports = {
    customIdPrefix: 'modal_webhook_submit:',

    async execute(interaction) {
        await interaction.deferUpdate();
        const dbId = interaction.customId.split(':')[1];
        const rawUrl = interaction.fields.getTextInputValue('input_webhook_url').trim();

        const esValido = /^https:\/\/(canary\.|ptb\.)?discord\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(rawUrl);

        if (!esValido) {
            return await interaction.followUp({ 
                content: '❌ Ingresá una URL de Webhook de Discord válida.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        const { error } = await supabase
            .from('roblox_wishlist')
            .update({ webhook_url: rawUrl, channel_id: null })
            .eq('id', dbId)
            .eq('user_id', interaction.user.id);

        if (error) {
            return await interaction.followUp({ 
                content: `Error al guardar el Webhook: ${error.message}`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        return await interaction.followUp({ 
            content: '🌐 **Webhook vinculado con éxito.** Las alertas se enviarán a ese Webhook.', 
            flags: MessageFlags.Ephemeral 
        });
    }
};
