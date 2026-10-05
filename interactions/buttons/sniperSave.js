// ==========================================
// ARCHIVO: interactions/buttons/sniperSave.js
// ==========================================

const { ContainerBuilder, SectionBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const supabase = require('../../db');
const { obtenerDetallesCompletos } = require('../../utils/roblox');

module.exports = {
    customIdPrefix: 'btn_save_no_target:',

    async execute(interaction) {
        const [, itemType, idObjet] = interaction.customId.split(':');

        const { data: existente } = await supabase
            .from('roblox_wishlist')
            .select('id')
            .eq('user_id', interaction.user.id)
            .eq('id_objet', idObjet)
            .maybeSingle();

        if (existente) {
            return await interaction.update({
                content: `⚠️ El objeto (ID: \`${idObjet}\`) ya está en tu lista de seguimiento.`,
                embeds: [],
                components: []
            });
        }

        await interaction.deferUpdate();
        const detalles = await obtenerDetallesCompletos(idObjet, itemType);

        if (!detalles.exito) {
            return await interaction.editReply({ content: '❌ No se pudo confirmar el objeto en Roblox.', embeds: [], components: [] });
        }

        const { data: nuevo, error } = await supabase
            .from('roblox_wishlist')
            .insert([{
                user_id: interaction.user.id,
                guild_id: interaction.guildId || 'DM',
                id_objet: String(idObjet),
                item_type: itemType,
                item_name: detalles.nombre,
                last_price: detalles.precio,
                target_price: null,
                is_paused: false
            }])
            .select()
            .single();

        if (error) return await interaction.editReply({ content: `Error al guardar: ${error.message}`, embeds: [], components: [] });

        let precioFmt = 'Gratis';
        if (detalles.sinVendedores) {
            precioFmt = 'Sin revendedores activos';
        } else if (detalles.precio > 0) {
            precioFmt = detalles.esUSD ? `$${detalles.precio.toFixed(2)} USD` : `${detalles.precio.toLocaleString('es-AR')} Robux`;
        }

        const container = new ContainerBuilder();

        const textoConfirm = new TextDisplayBuilder().setContent(
            `## 🎯 ¡Monitoreo Activado! — ${detalles.nombre}\n\n` +
            `• 🏷️ **Precio Inicial:** \`${precioFmt}\`\n` +
            `• 🎯 **Meta:** \`Sin meta (notifica todo cambio)\`\n` +
            `• 👀 **Monitoreo:** ⚡ Activo\n` +
            `• 🆔 **ID:** \`${idObjet}\``
        );

        if (detalles.imagenUrl) {
            const section = new SectionBuilder()
                .addTextDisplayComponents(textoConfirm)
                .setThumbnailAccessory(thumb => thumb.setURL(detalles.imagenUrl));
            container.addSectionComponents(section);
        } else {
            container.addTextDisplayComponents(textoConfirm);
        }

        container.addSeparatorComponents(sep => sep.setDivider(true));

        const rowButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`btn_action_edit_target:${nuevo.id}:${itemType}:${idObjet}`)
                .setLabel('Configurar Alertas')
                .setEmoji('⚙️')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('btn_nav_wishlist')
                .setLabel('Ver Mi Lista')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Secondary)
        );

        container.addActionRowComponents(rowButtons);

        return await interaction.editReply({ 
            embeds: [], 
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
};