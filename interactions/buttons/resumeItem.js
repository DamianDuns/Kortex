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
const { COLORES, EMOJI_TIPO, separador, boton, footer } = require('../../utils/ui');

module.exports = {
    customIdPrefix: 'btn_resume_item_',

    async execute(interaction) {
        const rowId = interaction.customId.replace('btn_resume_item_', '');
        const { data: item, error } = await supabase
            .from('roblox_wishlist')
            .update({ is_paused: false })
            .eq('id', rowId)
            .eq('user_id', interaction.user.id)
            .select('item_name, item_type, id_objet')
            .maybeSingle();

        if (error) {
            return await interaction.reply({
                content: `❌ Error al reanudar: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (!item) {
            return await interaction.reply({
                content: '🔒 Solo el dueño de esta alerta puede reanudar o modificar su monitoreo.',
                flags: MessageFlags.Ephemeral
            });
        }

        const tipo = (item.item_type || 'catalog').toLowerCase();
        const emojiCat = EMOJI_TIPO[tipo] || '📦';
        const nombre = item.item_name || 'este objeto';

        const container = new ContainerBuilder()
            .setAccentColor(COLORES.exito)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# ▶️ Monitoreo Reanudado\n` +
                    `## ${emojiCat} __**${nombre}**__\n` +
                    `> Volvés a recibir alertas de precio en tiempo real para este objeto.`
                )
            )
            .addSeparatorComponents(separador())
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    boton(`btn_pause_item_${rowId}`, 'Pausar Alertas', '⏸️', ButtonStyle.Secondary),
                    boton(`btn_action_open_config:${rowId}`, 'Configurar', '⚙️', ButtonStyle.Primary),
                    boton('btn_nav_wishlist', 'Ver Mi Lista', '📋', ButtonStyle.Secondary)
                )
            )
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer('Price Sniper activo')));

        return await interaction.update({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
};
