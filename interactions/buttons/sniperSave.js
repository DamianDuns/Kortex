// ==========================================
// ARCHIVO: interactions/buttons/sniperSave.js
// ==========================================

const { ContainerBuilder, SectionBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const supabase = require('../../db');
const PriceItem = require('../../models/PriceItem');
const { obtenerDetallesCompletos, obtenerUrlRoblox } = require('../../utils/roblox');
const { COLORES, EMOJI_TIPO, NOMBRE_TIPO, EMOJI_ROBUX, footer, separador, boton, formatearPrecio } = require('../../utils/ui');

module.exports = {
    customIdPrefix: 'btn_save_no_target:',

    async execute(interaction) {
        await interaction.deferUpdate();
        const [, itemType, idObjet] = interaction.customId.split(':');

        const { data: existente } = await supabase
            .from('roblox_wishlist')
            .select('id')
            .eq('user_id', interaction.user.id)
            .eq('id_objet', idObjet)
            .maybeSingle();

        if (existente) {
            return await interaction.followUp({
                content: `⚠️ El objeto (ID: \`${idObjet}\`) ya está en tu lista de seguimiento.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const detalles = await obtenerDetallesCompletos(idObjet, itemType, true);

        if (!detalles.exito) {
            return await interaction.followUp({
                content: '❌ No se pudo confirmar el objeto en Roblox.',
                flags: MessageFlags.Ephemeral
            });
        }

        const finalType = (detalles.tipoDetectado || itemType).toLowerCase();

        const { data: nuevo, error } = await supabase
            .from('roblox_wishlist')
            .insert([{
                user_id: interaction.user.id,
                guild_id: interaction.guildId || 'DM',
                id_objet: String(idObjet),
                item_type: finalType,
                item_name: detalles.nombre,
                last_price: detalles.precio,
                target_price: null,
                is_paused: false
            }])
            .select()
            .single();

        if (error) {
            return await interaction.followUp({
                content: `❌ Error al guardar: ${error.message}`,
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

        const emojiCat = EMOJI_TIPO[finalType] || '📦';
        const nombreCat = NOMBRE_TIPO[finalType] || finalType.toUpperCase();

        const container = new ContainerBuilder()
            .setAccentColor(COLORES.exito);

        const textoConfirm = new TextDisplayBuilder().setContent(
            `# ✅ ¡Monitoreo Activado!\n` +
            `### ${detalles.nombre}\n` +
            `-# ${emojiCat} Categoría: **${nombreCat}**  •  ID \`${idObjet}\`\n\n` +
            `🏷️ **Precio inicial:** ${precioFmt}\n` +
            `🎯 **Meta objetivo:** \`Sin meta (notifica todo cambio)\`\n` +
            `🔔 **Destino actual:** 💬 Privado (DM)\n` +
            `📡 **Estado:** 🟢 Activo`
        );

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
            boton(`btn_action_open_config:${nuevo.id}`, 'Configurar', '⚙️', ButtonStyle.Primary),
            boton('btn_nav_wishlist', 'Ver Mi Lista', '📋', ButtonStyle.Secondary),
            new ButtonBuilder()
                .setLabel('Ver en Roblox')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link)
                .setURL(obtenerUrlRoblox(idObjet, finalType))
        );

        container.addActionRowComponents(rowButtons);
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(footer('Objeto guardado en tu lista de monitoreo'))
        );

        return await interaction.editReply({ 
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
};