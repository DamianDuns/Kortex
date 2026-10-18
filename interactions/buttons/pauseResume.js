// ==========================================
// ARCHIVO: interactions/buttons/pauseResume.js
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
                content: '🔒 Solo el dueño de esta alerta puede pausar o reanudar su monitoreo.',
                flags: MessageFlags.Ephemeral
            });
        }

        const tipo = (item.item_type || 'catalog').toLowerCase();
        const emojiCat = EMOJI_TIPO[tipo] || '📦';
        const nombre = item.item_name || 'este objeto';
        const robloxUrl = obtenerUrlRoblox(item.id_objet, tipo);

        const rowReanudar = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Ver en Roblox')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link)
                .setURL(robloxUrl),
            boton(`btn_resume_item_${rowId}`, 'Reanudar Alertas', '▶️', ButtonStyle.Success)
        );

        // Conservar intacto el mensaje de alerta y su gráfica adjunta; solo alternar el botón de pausa
        const rawContainer = interaction.message?.components?.[0]?.toJSON?.();
        if (rawContainer && Array.isArray(rawContainer.components)) {
            rawContainer.components = rawContainer.components.map(comp =>
                comp.type === 1 ? rowReanudar.toJSON() : comp
            );

            await interaction.update({
                components: [new ContainerBuilder(rawContainer)],
                flags: MessageFlags.IsComponentsV2
            });

            return await interaction.followUp({
                content: `⏸️ **Alertas en pausa** para **${nombre}**. Podés reanudarlas cuando quieras desde el botón de la alerta.`,
                flags: MessageFlags.Ephemeral
            });
        }

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
            .addActionRowComponents(rowReanudar)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer('Podés reanudarlo cuando quieras')));

        return await interaction.update({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
};
