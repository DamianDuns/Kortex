// ==========================================
// ARCHIVO: interactions/buttons/pauseResume.js
// ==========================================

const {
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const supabase = require('../../db');
const { COLORES, EMOJI_TIPO, separador, boton, footer } = require('../../utils/ui');

module.exports = {
    customIdPrefix: 'btn_pause_item_',

    async execute(interaction) {
        const rowId = interaction.customId.replace('btn_pause_item_', '');
        const { data: item, error } = await supabase
            .from('roblox_wishlist')
            .update({ is_paused: true })
            .eq('id', rowId)
            .eq('user_id', interaction.user.id)
            .select('item_name, item_type, id_objet')
            .maybeSingle();

        if (error) {
            return await interaction.reply({
                content: `❌ Error al pausar: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (!item) {
            return await interaction.reply({
                content: '🔒 Solo el dueño de esta alerta puede pausar o modificar su monitoreo.',
                flags: MessageFlags.Ephemeral
            });
        }

        const tipo = (item.item_type || 'catalog').toLowerCase();
        const emojiCat = EMOJI_TIPO[tipo] || '📦';
        const nombre = item.item_name || 'este objeto';

        const container = new ContainerBuilder()
            .setAccentColor(COLORES.alerta)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# ⏸️ Monitoreo en Pausa\n` +
                    `## ${emojiCat} __**${nombre}**__\n` +
                    `> Dejaste de recibir alertas de precio para este objeto temporalmente.`
                )
            )
            .addSeparatorComponents(separador())
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    boton(`btn_resume_item_${rowId}`, 'Reanudar Monitoreo', '▶️', ButtonStyle.Success),
                    boton(`btn_action_open_config:${rowId}`, 'Configurar', '⚙️', ButtonStyle.Primary),
                    boton('btn_nav_wishlist', 'Ver Mi Lista', '📋', ButtonStyle.Secondary)
                )
            )
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer('Podés reanudarlo cuando quieras')));

        return await interaction.update({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
};
