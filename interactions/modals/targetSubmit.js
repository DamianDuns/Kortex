// ==========================================
// ARCHIVO: interactions/modals/targetSubmit.js
// ==========================================

const { ContainerBuilder, SectionBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const supabase = require('../../db');
const { obtenerDetallesCompletos } = require('../../utils/roblox');

const EMOJI_ROBUX = '<:Robux:1547677277590913114>';

module.exports = {
    customIdPrefix: 'modal_set_target_submit:',

    async execute(interaction) {
        await interaction.deferUpdate();
        const [, itemType, idObjet] = interaction.customId.split(':');

        const detalles = await obtenerDetallesCompletos(idObjet, itemType);
        const rawTarget = interaction.fields.getTextInputValue('input_target_price_val').trim();
        const parsedTarget = parseFloat(rawTarget);

        if (isNaN(parsedTarget) || parsedTarget < 0) {
            return await interaction.editReply({ content: '❌ Ingresá un valor numérico válido para la meta.', embeds: [], components: [] });
        }

        const { data: existente } = await supabase
            .from('roblox_wishlist')
            .select('id')
            .eq('user_id', interaction.user.id)
            .eq('id_objet', idObjet)
            .maybeSingle();

        let dbError = null;

        if (existente) {
            const { error } = await supabase
                .from('roblox_wishlist')
                .update({ target_price: parsedTarget, last_price: detalles.precio })
                .eq('id', existente.id);
            dbError = error;
        } else {
            const { error } = await supabase
                .from('roblox_wishlist')
                .insert([{
                    user_id: interaction.user.id,
                    guild_id: interaction.guildId || 'DM',
                    id_objet: String(idObjet),
                    item_type: itemType,
                    item_name: detalles.nombre,
                    last_price: detalles.precio,
                    target_price: parsedTarget,
                    is_paused: false
                }]);
            dbError = error;
        }

        if (dbError) return await interaction.editReply({ content: `Error al guardar en Supabase: ${dbError.message}`, embeds: [], components: [] });

        let precioFmt = '`Gratis`';
        if (detalles.sinVendedores) {
            precioFmt = '`Sin revendedores activos`';
        } else if (detalles.precio > 0) {
            precioFmt = `\`${detalles.esUSD ? '$' + detalles.precio.toFixed(2) : detalles.precio.toLocaleString()}\` ${detalles.esUSD ? '💵' : EMOJI_ROBUX}`;
        }

        const targetFmt = `\`${detalles.esUSD ? '$' + parsedTarget.toFixed(2) : parsedTarget.toLocaleString()}\` ${detalles.esUSD ? '💵' : EMOJI_ROBUX}`;

        const textoConfirm = new TextDisplayBuilder().setContent(
            `## 🎯 Sniper Activo: ${detalles.nombre}\n\n` +
            `Monitoreando en categoría **${itemType.toUpperCase()}**.\n\n` +
            `🏷️ **Precio Actual:** ${precioFmt}\n` +
            `🎯 **Precio Objetivo:** ${targetFmt}\n` +
            `🆔 \`${idObjet}\``
        );

        const section = new SectionBuilder().addTextDisplayComponents(textoConfirm);
        if (detalles.imagenUrl) {
            section.setThumbnailAccessory(thumb => thumb.setURL(detalles.imagenUrl));
        }

        const container = new ContainerBuilder().addSectionComponents(section);

        return await interaction.editReply({ 
            embeds: [], 
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
};
