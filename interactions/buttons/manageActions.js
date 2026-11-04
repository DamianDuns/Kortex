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
const PriceItem = require('../../models/PriceItem');
const { obtenerDetallesCompletos, obtenerMiniaturasBatch, obtenerUrlRoblox } = require('../../utils/roblox');
const { enviarAlertaPrueba } = require('../../services/priceTracker');
const { renderizarVistaGrafica } = require('./chartView');
const { COLORES, EMOJI_TIPO, NOMBRE_TIPO, EMOJI_ROBUX, footer, separador, boton, formatearPrecio, formatearPrecioTexto } = require('../../utils/ui');

async function ejecutarCheckInObjeto(item) {
    const type = (item.item_type || 'catalog').toLowerCase();
    const esUSD = type === 'plugin';
    const precioPrevio = Number(item.last_price || 0);

    let precioVerificado = precioPrevio;
    let detallesLive = null;
    try {
        detallesLive = await obtenerDetallesCompletos(item.id_objet, type, true);
        if (detallesLive && detallesLive.exito && !detallesLive.sinVendedores && !isNaN(Number(detallesLive.precio))) {
            precioVerificado = Number(detallesLive.precio);
        }
    } catch {
        // Conservar último precio conocido si la red de Roblox no responde
    }

    if (precioVerificado !== precioPrevio) {
        try {
            await supabase
                .from('roblox_wishlist')
                .update({ last_price: precioVerificado })
                .eq('id', item.id);
        } catch {
            // Silencioso
        }
    }

    const updatedItem = { ...item, last_price: precioVerificado };
    const priceRecord = await PriceItem.recordPrice(
        item.id_objet,
        detallesLive?.nombre || item.item_name,
        precioVerificado,
        {
            previousPrice: precioPrevio,
            existingHistory: item.price_history,
            createdAt: item.created_at
        }
    ).catch(() => null);

    const summary = PriceItem.getPriceCheckSummary(updatedItem, priceRecord?.history || null);
    const fmtActual = formatearPrecio(summary.lastPrice, esUSD);
    const fmtOrig = formatearPrecio(summary.firstPrice, esUSD);

    let notice = '';
    if (summary.isTargetMet) {
        const fmtMeta = formatearPrecio(summary.targetPrice, esUSD);
        const ahorroOrigTxt = summary.isBelowOriginal
            ? ` y está **-${formatearPrecioTexto(summary.savedVsOriginal, esUSD)} (-${summary.pctSavedVsOriginal.toFixed(1).replace('.0', '')}%) más bajo** que su precio original (${fmtOrig})`
            : '';
        const bajoMetaTxt = summary.belowTargetAmount > 0
            ? ` *(**-${formatearPrecioTexto(summary.belowTargetAmount, esUSD)}** más barato que tu meta de ${fmtMeta})*`
            : ` *(alcanzó tu meta de ${fmtMeta})*`;
        notice = `🎯 **Check-in completado — ¡META ALCANZADA!:** Precio actual verificado en **${fmtActual}**${bajoMetaTxt}${ahorroOrigTxt}.`;
    } else if (summary.isBelowOriginal) {
        const pctStr = summary.pctSavedVsOriginal.toFixed(1).replace('.0', '');
        const faltaMeta = summary.hasTarget
            ? ` • Faltan **${formatearPrecioTexto(summary.remainingToTarget, esUSD)}** para tu meta (${formatearPrecio(summary.targetPrice, esUSD)})`
            : '';
        notice = `📉 **Check-in completado:** Precio verificado en **${fmtActual}** — está **-${formatearPrecioTexto(summary.savedVsOriginal, esUSD)} (-${pctStr}%) más bajo** que el precio original (${fmtOrig})${faltaMeta}.`;
    } else {
        const faltaMeta = summary.hasTarget
            ? ` • Faltan **${formatearPrecioTexto(summary.remainingToTarget, esUSD)}** para tu meta (${formatearPrecio(summary.targetPrice, esUSD)})`
            : '';
        notice = `🔄 **Check-in completado:** Precio verificado en **${fmtActual}** (Precio original: ${fmtOrig})${faltaMeta}.`;
    }

    return { updatedItem, summary, notice };
}

async function renderizarPanelConfig(item, checkInFeedback = null) {
    const [miniaturas, priceRecord] = await Promise.all([
        obtenerMiniaturasBatch([item]).catch(() => new Map()),
        PriceItem.getOrInitItem(item).catch(() => null)
    ]);
    const imagenUrl = miniaturas.get(String(item.id_objet)) || null;
    const summary = PriceItem.getPriceCheckSummary(item, priceRecord?.history || null);

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

    const fmtActual = formatearPrecio(summary.lastPrice, esUSD);
    const fmtOriginal = formatearPrecio(summary.firstPrice, esUSD);
    const tieneMeta = summary.hasTarget;
    const fmtMeta = tieneMeta
        ? `${formatearPrecio(summary.targetPrice, esUSD)}${summary.isTargetMet ? '  ✅ **¡META COMPLETADA!**' : ` *(⏳ faltan ${formatearPrecioTexto(summary.remainingToTarget, esUSD)})*`}`
        : '`Sin meta (avisa todo cambio)`';

    const lineaOriginal = summary.isBelowOriginal
        ? `🕒 **Precio original:** ~~${fmtOriginal}~~  ➔  📉 **-${formatearPrecioTexto(summary.savedVsOriginal, esUSD)} (-${summary.pctSavedVsOriginal.toFixed(1).replace('.0', '')}%) más bajo**`
        : `🕒 **Precio original:** ${fmtOriginal}`;

    const bannerMetaCompletada = summary.isTargetMet
        ? `\n\n> 🎉 **¡META COMPLETADA!** El precio actual (**${fmtActual}**) ya llegó a la meta que estableciste` +
          (summary.belowTargetAmount > 0 ? ` (**-${formatearPrecioTexto(summary.belowTargetAmount, esUSD)}** por debajo de tu meta)` : '') +
          (summary.isBelowOriginal ? ` y está **-${formatearPrecioTexto(summary.savedVsOriginal, esUSD)}** más bajo que el precio original.` : '.')
        : '';

    const bannerFeedback = checkInFeedback ? `> ${checkInFeedback}\n\n` : '';

    const labelPausa = item.is_paused ? 'Reanudar' : 'Pausar';
    const emojiPausa = item.is_paused ? '▶️' : '⏸️';
    const stylePausa = item.is_paused ? ButtonStyle.Success : ButtonStyle.Secondary;

    const textoConfig = new TextDisplayBuilder().setContent(
        `${bannerFeedback}` +
        `# ⚙️ Configuración — ${item.item_name || 'Objeto'}\n` +
        `-# ${emojiCat} Categoría: **${nombreCat}**  •  ID \`${item.id_objet}\`\n\n` +
        `🏷️ **Precio actual:** ${fmtActual}\n` +
        `${lineaOriginal}\n` +
        `🎯 **Meta objetivo:** ${fmtMeta}\n` +
        `🔔 **Destino de alerta:** ${canalTexto}\n` +
        `📡 **Estado:** ${estadoTexto}` +
        `${bannerMetaCompletada}`
    );

    const container = new ContainerBuilder()
        .setAccentColor(summary.isTargetMet ? COLORES.exito : (item.is_paused ? COLORES.alerta : COLORES.lista));

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
        boton(`btn_action_checkin:${item.id}:config`, 'Check-in', '🔄', ButtonStyle.Success),
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
        boton(`roblox_chart_${item.id}_7d`, 'Volver Atrás', '⬅️', ButtonStyle.Secondary)
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
    ejecutarCheckInObjeto,

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
        const parts = interaction.customId.split(':');
        const selectedDbId = parts[1];

        if (interaction.customId.startsWith('btn_action_checkin:')) {
            const originView = parts[2] || 'chart';
            const { data: itemsUsuario } = await supabase
                .from('roblox_wishlist')
                .select('*')
                .eq('user_id', interaction.user.id)
                .order('id', { ascending: true });

            const item = (itemsUsuario || []).find(i => String(i.id) === String(selectedDbId));
            if (!item) {
                return await interaction.followUp({
                    content: '❌ No se encontró el objeto en tu lista.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const { updatedItem, notice } = await ejecutarCheckInObjeto(item);
            if (originView === 'config') {
                return await interaction.editReply(await renderizarPanelConfig(updatedItem, notice));
            }
            const updatedList = (itemsUsuario || []).map(i => String(i.id) === String(updatedItem.id) ? updatedItem : i);
            return await interaction.editReply(await renderizarVistaGrafica(updatedItem, updatedList, null, notice));
        }

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
                            boton('btn_nav_wishlist', 'Volver Atrás', '⬅️', ButtonStyle.Secondary),
                            boton('btn_nav_sniper', 'Seguimiento de Precios', '🎯', ButtonStyle.Primary)
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