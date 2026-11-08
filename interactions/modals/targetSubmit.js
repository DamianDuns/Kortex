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
const { COLORES, EMOJI_TIPO, NOMBRE_TIPO, EMOJI_ROBUX, footer, separador, boton, formatearPrecio, formatearPrecioTexto } = require('../../utils/ui');
const { MAX_WISHLIST_ITEMS } = require('../../src/utils/fastLink');
const { obtenerConfigPropietario } = require('../../src/utils/performanceManager');
const { obtenerPreferenciasUsuario } = require('../../src/utils/i18n');

module.exports = {
    customIdPrefix: 'modal_set_target_submit:',

    async execute(interaction) {
        await interaction.deferUpdate();
        const prefs = obtenerPreferenciasUsuario(interaction.user.id);
        const isEn = (prefs.lang || 'es') === 'en';
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

        const { data: listaUsuario } = await supabase
            .from('roblox_wishlist')
            .select('*')
            .eq('user_id', interaction.user.id);

        const itemsActuales = listaUsuario || [];
        const existente = itemsActuales.find(i => String(i.id_objet) === String(idObjet));

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
            const maxItems = Number(obtenerConfigPropietario().maxWishlistItems || MAX_WISHLIST_ITEMS || 5);
            if (itemsActuales.length >= maxItems) {
                return await interaction.followUp({
                    content: `🚫 Llegaste al límite de **${maxItems} objetos** en tu lista de seguimiento. Eliminá alguno desde **Mi Lista** para agregar uno nuevo.`,
                    flags: MessageFlags.Ephemeral
                });
            }

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

        const priceRecord = await PriceItem.recordPrice(idObjet, detalles.nombre, detalles.precio, {
            previousPrice: existente ? existente.last_price : detalles.precio,
            existingHistory: existente?.price_history || null,
            createdAt: existente?.created_at || null
        }).catch(() => null);

        const summary = PriceItem.getPriceCheckSummary(
            registroGuardado || { id_objet: idObjet, last_price: detalles.precio, target_price: finalTarget },
            priceRecord?.history || null
        );

        let precioFmt = '`Gratis`';
        if (detalles.sinVendedores) {
            precioFmt = '`Sin revendedores activos`';
        } else if (detalles.precio > 0) {
            precioFmt = formatearPrecio(detalles.precio, detalles.esUSD);
        }

        const targetFmt = finalTarget !== null
            ? `${formatearPrecio(finalTarget, detalles.esUSD)}${summary.isTargetMet ? '  ✅ **¡META COMPLETADA!**' : ` *(⏳ faltan ${formatearPrecioTexto(summary.remainingToTarget, detalles.esUSD)})*`}`
            : '`Sin meta (notifica todo cambio)`';

        const origFmt = formatearPrecio(summary.firstPrice, detalles.esUSD);
        const lineaOrig = summary.isBelowOriginal
            ? `🕒 **Precio original:** ~~${origFmt}~~  ➔  📉 **-${formatearPrecioTexto(summary.savedVsOriginal, detalles.esUSD)} (-${summary.pctSavedVsOriginal.toFixed(1).replace('.0', '')}%) más bajo**`
            : `🕒 **Precio original:** ${origFmt}`;

        const bannerMetaCumplida = summary.isTargetMet
            ? `\n\n> 🎉 **¡META YA ALCANZADA!** El precio actual (**${precioFmt}**) ya está en o por debajo de la meta que estableciste` +
              (summary.belowTargetAmount > 0 ? ` (**-${formatearPrecioTexto(summary.belowTargetAmount, detalles.esUSD)}** más barato que tu meta)` : '') +
              (summary.isBelowOriginal ? ` y **-${formatearPrecioTexto(summary.savedVsOriginal, detalles.esUSD)}** más bajo que el precio original.` : '.')
            : '';

        const emojiCat = EMOJI_TIPO[finalType] || '📦';
        const nombreCat = NOMBRE_TIPO[finalType] || finalType.toUpperCase();

        const textoConfirm = new TextDisplayBuilder().setContent(
            `# 🎯 ${summary.isTargetMet ? '¡Meta Completada!' : (existente ? 'Meta Actualizada' : '¡Monitoreo Activado!')}\n` +
            `### ${detalles.nombre}\n` +
            `-# ${emojiCat} Categoría: **${nombreCat}**  •  ID \`${idObjet}\`\n\n` +
            `🏷️ **Precio actual:** ${precioFmt}\n` +
            `${lineaOrig}\n` +
            `🎯 **Meta objetivo:** ${targetFmt}\n` +
            `📡 **Estado:** 🟢 Activo` +
            `${bannerMetaCumplida}`
        );

        const container = new ContainerBuilder()
            .setAccentColor( COLORES.exito );

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
            boton(`roblox_chart_${registroGuardado.id}_7d`, isEn ? 'View Chart & Status' : 'Ver Gráfica y Estado', '📈', ButtonStyle.Success),
            boton(`btn_action_open_config:${registroGuardado.id}`, isEn ? 'Configure' : 'Configurar', '⚙️', ButtonStyle.Primary),
            boton('btn_nav_wishlist', isEn ? 'View Watchlist' : 'Ver Mi Lista', '📋', ButtonStyle.Secondary),
            new ButtonBuilder()
                .setLabel(isEn ? 'View on Roblox' : 'Ver en Roblox')
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
