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
const { obtenerMiniaturasBatch } = require('../../utils/roblox');

async function renderizarPanelConfig(item) {
    const miniaturas = await obtenerMiniaturasBatch([item]);
    const imagenUrl = miniaturas.get(String(item.id_objet)) || null;

    const esUSD = (item.item_type || '').toLowerCase() === 'plugin';
    const estadoTexto = item.is_paused ? '⏸️ En pausa' : '⚡ Activo';

    let canalTexto = '💬 Privado (DM)';
    let defaultDest = 'dest_dm';

    if (item.webhook_url) {
        canalTexto = '🌐 Webhook';
        defaultDest = 'dest_webhook';
    } else if (item.channel_id) {
        canalTexto = `<#${item.channel_id}>`;
        defaultDest = 'dest_channel';
    }

    const fmtActual = esUSD 
        ? `$${Number(item.last_price || 0).toFixed(2)} USD` 
        : `${Number(item.last_price || 0).toLocaleString('es-AR')} Robux`;

    const fmtMeta = (item.target_price !== null && item.target_price !== undefined)
        ? (esUSD ? `$${Number(item.target_price).toFixed(2)} USD` : `${Number(item.target_price).toLocaleString('es-AR')} Robux`)
        : 'Sin meta';

    const labelPausa = item.is_paused ? 'Reanudar' : 'Pausar';
    const emojiPausa = item.is_paused ? '▶️' : '⏸️';
    const stylePausa = item.is_paused ? ButtonStyle.Success : ButtonStyle.Secondary;

    // Formato simétrico y espaciado que no se rompe en pantallas angostas
    const textoConfig = new TextDisplayBuilder().setContent(
        `## ⚙️ Configurar: ${item.item_name || 'Objeto'}\n\n` +
        `• 🏷️ **Precio:** \`${fmtActual}\`\n` +
        `• 🎯 **Meta:** \`${fmtMeta}\`\n` +
        `• 🔔 **Alerta en:** ${canalTexto}\n` +
        `• 👀 **Monitoreo:** ${estadoTexto}\n` +
        `• 🆔 **ID:** \`${item.id_objet}\``
    );

    const container = new ContainerBuilder();

    if (imagenUrl) {
        const section = new SectionBuilder()
            .addTextDisplayComponents(textoConfig)
            .setThumbnailAccessory(thumb => thumb.setURL(imagenUrl));
        container.addSectionComponents(section);
    } else {
        container.addTextDisplayComponents(textoConfig);
    }

    // Separador nativo v2
    container.addSeparatorComponents(sep => sep.setDivider(true));

    const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`btn_action_edit_target:${item.id}:${item.item_type}:${item.id_objet}`)
            .setLabel('Editar Meta')
            .setEmoji('✏️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`btn_action_toggle_pause:${item.id}`)
            .setLabel(labelPausa)
            .setEmoji(emojiPausa)
            .setStyle(stylePausa),
        new ButtonBuilder()
            .setCustomId(`btn_action_delete:${item.id}`)
            .setLabel('Eliminar')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Danger)
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
                .setDescription('Vincular un canal usando su ID')
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

    const rowSelect = new ActionRowBuilder().addComponents(selectDestino);

    return { 
        components: [container, rowSelect],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    customIdPrefix: 'btn_action_',
    renderizarPanelConfig,

    async execute(interaction) {
        if (interaction.customId.startsWith('btn_action_edit_target:')) {
            const [, dbId, itemType, idObjet] = interaction.customId.split(':');
            const esUSD = (itemType || '').toLowerCase() === 'plugin';

            const modal = new ModalBuilder()
                .setCustomId(`modal_set_target_submit:${itemType}:${idObjet}`)
                .setTitle('Editar Meta de Precio');

            const inputTarget = new TextInputBuilder()
                .setCustomId('input_target_price_val')
                .setLabel(esUSD ? 'Nueva Meta en Dólares ($ USD)' : 'Nueva Meta en Robux')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(esUSD ? 'Ejemplo: 1.99' : 'Ejemplo: 100')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(inputTarget));
            return await interaction.showModal(modal);
        }

        await interaction.deferUpdate();

        if (interaction.customId.startsWith('btn_action_toggle_pause:')) {
            const dbId = interaction.customId.split(':')[1];
            const { data: item } = await supabase
                .from('roblox_wishlist')
                .select('is_paused')
                .eq('id', dbId)
                .eq('user_id', interaction.user.id)
                .maybeSingle();

            if (item) {
                await supabase
                    .from('roblox_wishlist')
                    .update({ is_paused: !item.is_paused })
                    .eq('id', dbId)
                    .eq('user_id', interaction.user.id);
            }
        }

        if (interaction.customId.startsWith('btn_action_delete:')) {
            const dbId = interaction.customId.split(':')[1];
            const { error } = await supabase
                .from('roblox_wishlist')
                .delete()
                .eq('id', dbId)
                .eq('user_id', interaction.user.id);

            if (!error) {
                const containerDelete = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('✅ **Objeto eliminado de la lista de monitoreo.**')
                    );

                return await interaction.editReply({ 
                    components: [containerDelete], 
                    flags: MessageFlags.IsComponentsV2 
                });
            }
        }

        const selectedDbId = interaction.customId.split(':')[1];
        const { data: itemActualizado } = await supabase
            .from('roblox_wishlist')
            .select('*')
            .eq('id', selectedDbId)
            .eq('user_id', interaction.user.id)
            .maybeSingle();

        if (itemActualizado) {
            const panelData = await renderizarPanelConfig(itemActualizado);
            return await interaction.editReply(panelData);
        }
    }
};