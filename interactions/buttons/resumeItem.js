// ==========================================
// ARCHIVO: interactions/buttons/resumeItem.js
// ==========================================

const {
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const supabase = require('../../db');
const { obtenerUrlRoblox } = require('../../utils/roblox');
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
                content: '🔒 Solo el dueño de esta alerta puede reanudar o pausar su monitoreo.',
                flags: MessageFlags.Ephemeral
            });
        }

        const tipo = (item.item_type || 'catalog').toLowerCase();
        const emojiCat = EMOJI_TIPO[tipo] || '📦';
        const nombre = item.item_name || 'este objeto';
        const robloxUrl = obtenerUrlRoblox(item.id_objet, tipo);

        const rowPausar = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Ver en Roblox')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link)
                .setURL(robloxUrl),
            boton(`btn_pause_item_${rowId}`, 'Pausar Alertas', '⏸️', ButtonStyle.Secondary)
        );

        // Conservar intacto el mensaje de alerta y su gráfica adjunta; solo alternar el botón de pausa
        const rawContainer = interaction.message?.components?.[0]?.toJSON?.();
        if (rawContainer && Array.isArray(rawContainer.components)) {
            rawContainer.components = rawContainer.components.map(comp =>
                comp.type === 1 ? rowPausar.toJSON() : comp
            );

            await interaction.update({
                components: [new ContainerBuilder(rawContainer)],
                flags: MessageFlags.IsComponentsV2
            });

            return await interaction.followUp({
                content: `▶️ **Alertas reanudadas** para **${nombre}**. Volvés a recibir notificaciones de cambios de precio.`,
                flags: MessageFlags.Ephemeral
            });
        }

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
            .addActionRowComponents(rowPausar)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer('Price Sniper activo')));

        return await interaction.update({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
};
