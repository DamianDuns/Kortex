// ==========================================
// ARCHIVO: interactions/modals/sniperAdd.js
// ==========================================

const { 
    ContainerBuilder, SectionBuilder, TextDisplayBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags 
} = require('discord.js');
const supabase = require('../../db');
const { extractIdFromInput, obtenerDetallesCompletos } = require('../../utils/roblox');

const MAX_WISHLIST_ITEMS = 5;

module.exports = {
    customIdPrefix: 'modal_add_sniper_',

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const itemType = interaction.customId.replace('modal_add_sniper_', '');
        const rawInput = interaction.fields.getTextInputValue('input_id_or_url');
        const idObjet = extractIdFromInput(rawInput);

        if (!idObjet) {
            return await interaction.editReply({ content: '❌ No se pudo extraer un ID numérico válido del texto o enlace ingresado.' });
        }

        const { data: existente } = await supabase
            .from('roblox_wishlist')
            .select('id_objet')
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

        const detalles = await obtenerDetallesCompletos(idObjet, itemType);

        if (!detalles.exito) {
            return await interaction.editReply({
                content: `❌ **Objeto no encontrado.** El ID \`${idObjet}\` no existe en Roblox o no corresponde a **${itemType.toUpperCase()}**.`
            });
        }

        const monedaCode = detalles.esUSD ? 'USD' : 'ROBUX';
        let precioFmt = 'Gratis';

        if (detalles.sinVendedores) {
            precioFmt = 'Sin revendedores activos';
        } else if (detalles.precio > 0) {
            precioFmt = detalles.esUSD ? `$${detalles.precio.toFixed(2)} USD` : `${detalles.precio.toLocaleString('es-AR')} Robux`;
        }

        const container = new ContainerBuilder();

        const textoPreview = new TextDisplayBuilder().setContent(
            `## 🔎 Objeto Detectado: ${detalles.nombre}\n\n` +
            `• 🏷️ **Precio Actual:** \`${precioFmt}\`\n` +
            `• 📁 **Categoría:** \`${itemType.toUpperCase()}\`\n` +
            `• 🆔 **ID:** \`${idObjet}\``
        );

        if (detalles.imagenUrl) {
            const section = new SectionBuilder()
                .addTextDisplayComponents(textoPreview)
                .setThumbnailAccessory(thumb => thumb.setURL(detalles.imagenUrl));
            container.addSectionComponents(section);
        } else {
            container.addTextDisplayComponents(textoPreview);
        }

        container.addSeparatorComponents(sep => sep.setDivider(true));

        const rowButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`btn_target_modal:${itemType}:${idObjet}:${monedaCode}`)
                .setLabel('Fijar Meta de Precio')
                .setEmoji('🎯')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`btn_save_no_target:${itemType}:${idObjet}`)
                .setLabel('Monitorear Sin Meta')
                .setEmoji('💾')
                .setStyle(ButtonStyle.Secondary)
        );

        container.addActionRowComponents(rowButtons);

        return await interaction.editReply({ 
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
};