const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const supabase = require('../../db');

module.exports = {
    customIdPrefix: 'btn_pause_item_',

    async execute(interaction) {
        if (interaction.customId.startsWith('btn_pause_item_')) {
            const rowId = interaction.customId.replace('btn_pause_item_', '');
            const { error } = await supabase.from('roblox_wishlist').update({ is_paused: true }).eq('id', rowId).eq('user_id', interaction.user.id);
            if (error) return await interaction.reply({ content: `Error al pausar: ${error.message}`, flags: MessageFlags.Ephemeral });

            const rowResume = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`btn_resume_item_${rowId}`).setLabel('Reanudar Monitoreo').setEmoji('▶️').setStyle(ButtonStyle.Success)
            );
            return await interaction.update({ content: '⏸️ **Monitoreo pausado.** No recibirás más alertas de este objeto.', components: [rowResume] });
        }
    }
};
