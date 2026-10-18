// ==========================================
// ARCHIVO: interactions/modals/targetSubmit.js
// ==========================================

const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const supabase = require('../../db');
const PriceItem = require('../../models/PriceItem');
const { obtenerDetallesCompletos, obtenerUrlRoblox } = require('../../utils/roblox');
const { COLORES, EMOJI_TIPO, NOMBRE_TIPO, EMOJI_ROBUX, footer, separador, boton, formatearPrecio } = require('../../utils/ui');

module.exports = {
    customIdPrefix: 'modal_set_target_submit:',

    async execute(interaction) {
        await interaction.deferUpdate();
        const [, itemType, idObjet] = interaction.customId.split(':');

        const rawTarget = interaction.fields.getTextInputValue('input_target_price_val').trim().replace(',', '.');
        const parsedTarget = parseFloat(rawTarget);

        if (isNaN(parsedTarget) || parsedTarget < 0) {
            return await interaction.followUp({
                content: '❌ Ingresá un valor numérico válido para la meta (o `0` para monitorear sin meta).',
                flags: MessageFlags.Ephemeral
            });
        }

        const finalTarget = parsedTarget === 0 ? null : parsedTarget;
        const detalles = await obtenerDetallesCompletos(idObjet, itemType, true);
        const finalType = (detalles.tipoDetectado || itemType).toLowerCase();

        const { data: existente } = await supabase
            .from('roblox_wishlist')
            .select('id')
            .eq('user_id', interaction.user.id)
            .eq('id_objet', idObjet)
            .maybeSingle();

        let registroGuardado = null;
        let dbError = null;

        if (existente) {
            const { data, error } = await supabase
                .from('roblox_wishlist')
                .update({ target_price: finalTarget, last_price: detalles.precio })
                .eq('id', existente.id)
                .select()
                .single();
            registroGuardado = data;
            dbError = error;
        } else {
            const { data, error } = await supabase
                .from('roblox_wishlist')
                .insert([{
                    user_id: interaction.user.id,
                    guild_id: interaction.guildId || 'DM',
                    id_objet: String(idObjet),
                    item_type: finalType,
                    item_name: detalles.nombre,
                    last_price: detalles.precio,
                    target_price: finalTarget,
                    is_paused: false
                }])
                .select()
                .single();
            registroGuardado = data;
            dbError = error;
        }

        if (dbError) {
            return await interaction.followUp({
                content: `❌ Error al guardar en la base de datos: ${dbError.message}`,
                flags: MessageFlags.Ephemeral
            });
        }

        await PriceItem.recordPrice(idObjet, detalles.nombre, detalles.precio).catch(() => null);

        let precioFmt = '`Gratis`';
        if (detalles.sinVendedores) {
            precioFmt = '`Sin revendedores activos`';
        } else if (detalles.precio > 0) {
            precioFmt = formatearPrecio(detalles.precio, detalles.esUSD);
        }

        const targetFmt = finalTarget !== null
            ? formatearPrecio(finalTarget, detalles.esUSD)
            : '`Sin meta (notifica todo cambio)`';

        const emojiCat = EMOJI_TIPO[finalType] || '📦';
        const nombreCat = NOMBRE_TIPO[finalType] || finalType.toUpperCase();

        const textoConfirm = new TextDisplayBuilder().setContent(
            `# 🎯 ${existente ? 'Meta Actualizada' : '¡Monitoreo Activado!'}\n` +
            `### ${detalles.nombre}\n` +
            `-# ${emojiCat} Categoría: **${nombreCat}**  •  ID \`${idObjet}\`\n\n` +
            `🏷️ **Precio actual:** ${precioFmt}\n` +
            `🎯 **Meta objetivo:** ${targetFmt}\n` +
            `📡 **Estado:** 🟢 Activo`
        );

        const container = new ContainerBuilder()
            .setAccentColor(COLORES.exito);

        if (detalles.imagenUrl) {
            const section = new SectionBuilder()
                .addTextDisplayComponents(textoConfirm)
                .setThumbnailAccessory(thumb => thumb.setURL(detalles.imagenUrl));
            container.addSectionComponents(section);
        } else {
            container.addTextDisplayComponents(textoConfirm);
        }

        container.addSeparatorComponents(separador(true));

        const rowButtons = new ActionRowBuilder().addComponents(
            boton(`btn_action_open_config:${registroGuardado.id}`, 'Configurar', '⚙️', ButtonStyle.Primary),
            boton('btn_nav_wishlist', 'Ver Mi Lista', '📋', ButtonStyle.Secondary),
            new ButtonBuilder()
                .setLabel('Ver en Roblox')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link)
                .setURL(obtenerUrlRoblox(idObjet, finalType))
        );

        container.addActionRowComponents(rowButtons);
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(footer('Meta guardada • Kortex Sniper'))
        );

        return await interaction.editReply({ 
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
};
