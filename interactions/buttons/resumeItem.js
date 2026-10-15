// ==========================================
// ARCHIVO: interactions/buttons/resumeItem.js
// ==========================================

const {
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const supabase = require('../../db');
const { COLORES, separador, boton, footer } = require('../../utils/ui');

module.exports = {
    customIdPrefix: 'btn_resume_item_',

    async execute(interaction) {
        const rowId = interaction.customId.replace('btn_resume_item_', '');
        const { data: item, error } = await supabase
            .from('roblox_wishlist')
            .update({ is_paused: false })
            .eq('id', rowId)
            .eq('user_id', interaction.user.id)
            .select('item_name')
            .maybeSingle();

        if (error) {
            return await interaction.reply({
                content: `❌ Error al reanudar: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }

        const nombre = item?.item_name || 'este objeto';
        const container = new ContainerBuilder()
            .setAccentColor(COLORES.exito)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `## ▶️ Monitoreo reanudado
` +
                    `Volvés a recibir alertas de precio para **${nombre}**.`
                )
            )
            .addSeparatorComponents(separador())
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    boton(`btn_pause_item_${rowId}`, 'Pausar Monitoreo', '⏸️', ButtonStyle.Secondary),
                    boton('btn_nav_wishlist', 'Ver Mi Lista', '📋', ButtonStyle.Primary)
                )
            )
            .addSeparatorComponents(separador())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer('Price Sniper activo')));

        return await interaction.update({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
};
