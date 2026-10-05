const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const supabase = require('../../db');

module.exports = {
    customIdPrefix: 'btn_resume_item_',

    async execute(interaction) {
        const rowId = interaction.customId.replace('btn_resume_item_', '');
        const { error } = await supabase.from('roblox_wishlist').update({ is_paused: false }).eq('id', rowId).eq('user_id', interaction.user.id);
        if (error) return await interaction.reply({ content: `Error al reanudar: ${error.message}`, ephemeral: true });

        const rowPause = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`btn_pause_item_${rowId}`).setLabel('Pausar Monitoreo').setEmoji('⏸️').setStyle(ButtonStyle.Secondary)
        );
        return await interaction.update({ content: '▶️ **Monitoreo reanudado.** Volverás a recibir notificaciones.', components: [rowPause] });
    }
};
