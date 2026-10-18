// ==========================================
// ARCHIVO: interactions/buttons/manageActions.js
// ==========================================

const { 
    ContainerBuilder, 
    SectionBuilder, 
    TextDisplayBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    MessageFlags 
} = require('discord.js');
const supabase = require('../../db');
const { obtenerMiniaturasBatch, obtenerUrlRoblox } = require('../../utils/roblox');
const { enviarAlertaPrueba } = require('../../services/priceTracker');
const { COLORES, EMOJI_TIPO, NOMBRE_TIPO, EMOJI_ROBUX, footer, separador, boton, formatearPrecio } = require('../../utils/ui');

async function renderizarPanelConfig(item) {
    const miniaturas = await obtenerMiniaturasBatch([item]);
    const imagenUrl = miniaturas.get(String(item.id_objet)) || null;

    const tipo = (item.item_type || 'catalog').toLowerCase();
    const esUSD = tipo === 'plugin';
    const emojiCat = EMOJI_TIPO[tipo] || '📦';
    const nombreCat = NOMBRE_TIPO[tipo] || tipo.toUpperCase();
    const estadoTexto = item.is_paused ? '⏸️ En pausa' : '🟢 Activo';

    let canalTexto = '💬 Privado (DM)';
    let defaultDest = 'dest_dm';

    if (item.webhook_url) {
        canalTexto = '🌐 Webhook';
        defaultDest = 'dest_webhook';
    } else if (item.channel_id) {
        canalTexto = `<#${item.channel_id}>`;
        defaultDest = 'dest_channel';
    }

    const fmtActual = formatearPrecio(item.last_price, esUSD);
    const tieneMeta = item.target_price !== null && item.target_price !== undefined;
    const fmtMeta = tieneMeta
        ? formatearPrecio(item.target_price, esUSD)
        : '`Sin meta (avisa todo cambio)`';

    const labelPausa = item.is_paused ? 'Reanudar' : 'Pausar';
    const emojiPausa = item.is_paused ? '▶️' : '⏸️';
    const stylePausa = item.is_paused ? ButtonStyle.Success : ButtonStyle.Secondary;

    const textoConfig = new TextDisplayBuilder().setContent(
        `# ⚙️ Configuración — ${item.item_name || 'Objeto'}\n` +
        `-# ${emojiCat} Categoría: **${nombreCat}**  •  ID \`${item.id_objet}\`\n\n` +
        `🏷️ **Precio actual:** ${fmtActual}\n` +
        `🎯 **Meta objetivo:** ${fmtMeta}\n` +
        `🔔 **Destino de alerta:** ${canalTexto}\n` +
        `📡 **Estado:** ${estadoTexto}`
    );

    const container = new ContainerBuilder()
        .setAccentColor(item.is_paused ? COLORES.alerta : COLORES.lista);

    if (imagenUrl) {
        const section = new SectionBuilder()
            .addTextDisplayComponents(textoConfig)
            .setThumbnailAccessory(thumb => thumb.setURL(imagenUrl));
        container.addSectionComponents(section);
    } else {
        container.addTextDisplayComponents(textoConfig);
    }

    container.addSeparatorComponents(separador(true));

    const rowButtons = new ActionRowBuilder().addComponents(
        boton(`btn_action_edit_target:${item.id}:${item.item_type}:${item.id_objet}`, tieneMeta ? 'Editar Meta' : 'Fijar Meta', '✏️', ButtonStyle.Primary),
        boton(`btn_action_toggle_pause:${item.id}`, labelPausa, emojiPausa, stylePausa),
        boton(`btn_action_test_alert:${item.id}`, 'Probar Alerta', '🔔', ButtonStyle.Secondary),
        boton(`btn_action_delete:${item.id}`, 'Eliminar', '🗑️', ButtonStyle.Danger)
    );
    container.addActionRowComponents(rowButtons);

    const selectDestino = new StringSelectMenuBuilder()
        .setCustomId(`select_alert_destination:${item.id}`)
        .setPlaceholder('🔔 Cambiar destino de alerta...')
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel('Mensaje Directo (DM)')
                .setDescription('Recibir alertas por mensaje privado')
                .setValue('dest_dm')
                .setEmoji('💬')
                .setDefault(defaultDest === 'dest_dm'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Canal de Servidor')
                .setDescription('Elegir un canal de este servidor o por ID')
                .setValue('dest_channel')
                .setEmoji('📢')
                .setDefault(defaultDest === 'dest_channel'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Webhook')
                .setDescription('Enviar alertas a una URL de Webhook')
                .setValue('dest_webhook')
                .setEmoji('🌐')
                .setDefault(defaultDest === 'dest_webhook')
        ]);

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectDestino));
    container.addSeparatorComponents(separador());

    const navButtons = [
        boton(`roblox_chart_${item.id}_7d`, 'Volver', '⬅️', ButtonStyle.Secondary)
    ];

    if (tieneMeta) {
        navButtons.push(boton(`btn_action_clear_target:${item.id}`, 'Quitar Meta', '🎯', ButtonStyle.Secondary));
    }

    navButtons.push(
        new ButtonBuilder()
            .setLabel('Ver en Roblox')
            .setEmoji('🔗')
            .setStyle(ButtonStyle.Link)
            .setURL(obtenerUrlRoblox(item.id_objet, item.item_type))
    );

    container.addActionRowComponents(new ActionRowBuilder().addComponents(navButtons));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(footer('Configuración del objeto'))
    );

    return { 
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    customIdPrefix: 'btn_action_',
    renderizarPanelConfig,

    async execute(interaction) {
        if (interaction.customId.startsWith('btn_action_edit_target:')) {
            const [, , itemType, idObjet] = interaction.customId.split(':');
            const esUSD = (itemType || '').toLowerCase() === 'plugin';

            const modal = new ModalBuilder()
                .setCustomId(`modal_set_target_submit:${itemType}:${idObjet}`)
                .setTitle('Configurar Meta de Precio');

            const inputTarget = new TextInputBuilder()
                .setCustomId('input_target_price_val')
                .setLabel(esUSD ? 'Meta en Dólares ($ USD) — 0 para quitar' : 'Meta en Robux — 0 para quitar')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(esUSD ? 'Ej: 1.99 (o 0 para monitorear sin meta)' : 'Ej: 100 (o 0 para monitorear sin meta)')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(inputTarget));
            return await interaction.showModal(modal);
        }

        if (interaction.customId.startsWith('btn_action_open_channel_modal:')) {
            const dbId = interaction.customId.split(':')[1];
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
        const selectedDbId = interaction.customId.split(':')[1];

        if (interaction.customId.startsWith('btn_action_test_alert:')) {
            const { data: item } = await supabase
                .from('roblox_wishlist')
                .select('*')
                .eq('id', selectedDbId)
                .eq('user_id', interaction.user.id)
                .maybeSingle();

            if (!item) {
                return await interaction.followUp({
                    content: '❌ No se encontró el objeto en tu lista.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const resultado = await enviarAlertaPrueba(interaction.client, item);
            if (resultado.ok) {
                return await interaction.followUp({
                    content: `✅ **Alerta de prueba enviada** con éxito a ${resultado.destino}.`,
                    flags: MessageFlags.Ephemeral
                });
            } else {
                return await interaction.followUp({
                    content: `❌ **No se pudo enviar la alerta de prueba (${resultado.destino}):** ${resultado.error}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        let mensajeFollowUp = null;

        if (interaction.customId.startsWith('btn_action_clear_target:')) {
            await supabase
                .from('roblox_wishlist')
                .update({ target_price: null })
                .eq('id', selectedDbId)
                .eq('user_id', interaction.user.id);
            mensajeFollowUp = '🎯 **Meta eliminada:** Ahora recibirás alertas ante cualquier cambio de precio.';
        }

        if (interaction.customId.startsWith('btn_action_toggle_pause:')) {
            const { data: item } = await supabase
                .from('roblox_wishlist')
                .select('is_paused')
                .eq('id', selectedDbId)
                .eq('user_id', interaction.user.id)
                .maybeSingle();

            if (item) {
                await supabase
                    .from('roblox_wishlist')
                    .update({ is_paused: !item.is_paused })
                    .eq('id', selectedDbId)
                    .eq('user_id', interaction.user.id);
            }
        }

        if (interaction.customId.startsWith('btn_action_delete:')) {
            const { error } = await supabase
                .from('roblox_wishlist')
                .delete()
                .eq('id', selectedDbId)
                .eq('user_id', interaction.user.id);

            if (!error) {
                const containerDelete = new ContainerBuilder()
                    .setAccentColor(COLORES.error)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `### 🗑️ Objeto eliminado\n` +
                            `El objeto fue quitado de tu lista de monitoreo correctamente.`
                        )
                    )
                    .addSeparatorComponents(separador())
                    .addActionRowComponents(
                        new ActionRowBuilder().addComponents(
                            boton('btn_nav_wishlist', 'Volver a Mi Lista', '⬅️', ButtonStyle.Secondary),
                            boton('btn_nav_sniper', 'Ir al Sniper', '🎯', ButtonStyle.Primary)
                        )
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(footer('Objeto eliminado del monitoreo'))
                    );

                return await interaction.editReply({ 
                    components: [containerDelete], 
                    flags: MessageFlags.IsComponentsV2 
                });
            }
        }

        const { data: itemActualizado } = await supabase
            .from('roblox_wishlist')
            .select('*')
            .eq('id', selectedDbId)
            .eq('user_id', interaction.user.id)
            .maybeSingle();

        if (itemActualizado) {
            const panelData = await renderizarPanelConfig(itemActualizado);
            await interaction.editReply(panelData);
            if (mensajeFollowUp) {
                await interaction.followUp({
                    content: mensajeFollowUp,
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
};