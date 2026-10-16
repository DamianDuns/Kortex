// ==========================================
// ARCHIVO: interactions/modals/sniperAdd.js
// ==========================================

const { 
    ContainerBuilder, SectionBuilder, TextDisplayBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags 
} = require('discord.js');
const supabase = require('../../db');
const { extractIdFromInput, detectarTipoDesdeInput, obtenerDetallesCompletos, obtenerUrlRoblox } = require('../../utils/roblox');
const { COLORES, EMOJI_TIPO, NOMBRE_TIPO, footer, separador, boton, formatearPrecio } = require('../../utils/ui');

const MAX_WISHLIST_ITEMS = 5;

module.exports = {
    customIdPrefix: 'modal_add_sniper_',

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const selectedType = interaction.customId.replace('modal_add_sniper_', '');
        const rawInput = interaction.fields.getTextInputValue('input_id_or_url');
        const idObjet = extractIdFromInput(rawInput);

        if (!idObjet) {
            return await interaction.editReply({ content: '❌ No se pudo extraer un ID numérico válido del texto o enlace ingresado.' });
        }

        const { data: existente } = await supabase
            .from('roblox_wishlist')
            .select('id, id_objet')
            .eq('user_id', interaction.user.id)
            .eq('id_objet', idObjet)
            .maybeSingle();

        if (existente) {
            return await interaction.editReply({ content: `⚠️ El objeto (ID: \`${idObjet}\`) ya se encuentra en tu lista de seguimiento.` });
        }

        const { count } = await supabase
            .from('roblox_wishlist')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', interaction.user.id);

        if (count >= MAX_WISHLIST_ITEMS) {
            return await interaction.editReply({ content: `⚠️ Alcanzaste el límite de ${MAX_WISHLIST_ITEMS} objetos en seguimiento.` });
        }

        const initialType = detectarTipoDesdeInput(rawInput, selectedType);
        const detalles = await obtenerDetallesCompletos(idObjet, initialType, true);

        if (!detalles.exito) {
            return await interaction.editReply({
                content: `❌ **Objeto no encontrado.** El ID \`${idObjet}\` no existe en Roblox o no está disponible públicamente.`
            });
        }

        const itemType = (detalles.tipoDetectado || initialType).toLowerCase();
        const emojiCat = EMOJI_TIPO[itemType] || '📦';
        const nombreCat = NOMBRE_TIPO[itemType] || itemType.toUpperCase();
        const monedaCode = detalles.esUSD ? 'USD' : 'ROBUX';
        let precioFmt = 'Gratis';

        if (detalles.sinVendedores) {
            precioFmt = 'Sin revendedores activos';
        } else if (detalles.precio > 0) {
            precioFmt = formatearPrecio(detalles.precio, detalles.esUSD);
        }

        const notaAutodeteccion = itemType !== selectedType.toLowerCase()
            ? `\n-# 💡 Categoría ajustada automáticamente a **${nombreCat}**`
            : '';

        const container = new ContainerBuilder()
            .setAccentColor(COLORES.sniper);

        const textoPreview = new TextDisplayBuilder().setContent(
            `# 🔎 ${detalles.nombre}\n` +
            `-# ${emojiCat} Categoría: **${nombreCat}**  •  ID \`${idObjet}\`${notaAutodeteccion}\n\n` +
            `🏷️ **Precio actual:** \`${precioFmt}\`\n` +
            ` Elegí si querés fijar un **precio objetivo** o monitorear **cualquier cambio de precio**:`
        );

        if (detalles.imagenUrl) {
            const section = new SectionBuilder()
                .addTextDisplayComponents(textoPreview)
                .setThumbnailAccessory(thumb => thumb.setURL(detalles.imagenUrl));
            container.addSectionComponents(section);
        } else {
            container.addTextDisplayComponents(textoPreview);
        }

        container.addSeparatorComponents(separador(true));

        const rowButtons = new ActionRowBuilder().addComponents(
            boton(`btn_target_modal:${itemType}:${idObjet}:${monedaCode}`, 'Fijar Meta de Precio', '🎯', ButtonStyle.Primary),
            boton(`btn_save_no_target:${itemType}:${idObjet}`, 'Monitorear Sin Meta', '💾', ButtonStyle.Secondary),
            new ButtonBuilder()
                .setLabel('Ver en Roblox')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link)
                .setURL(obtenerUrlRoblox(idObjet, itemType))
        );

        container.addActionRowComponents(rowButtons);
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(footer('Vista previa del objeto • Kortex Sniper'))
        );

        return await interaction.editReply({ 
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
};