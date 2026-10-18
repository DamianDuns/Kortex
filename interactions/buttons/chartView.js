// ==========================================
// ARCHIVO: interactions/buttons/chartView.js
// Vista 3: Inspector del Objeto, Gráfica Local en RAM y Filtros de Tiempo
// ==========================================

const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    AttachmentBuilder,
    MessageFlags
} = require('discord.js');
const supabase = require('../../db');
const PriceItem = require('../../models/PriceItem');
const { generatePriceChart } = require('../../utils/chartGenerator');
const { obtenerMiniaturasBatch, obtenerUrlRoblox } = require('../../utils/roblox');
const { EMOJI_TIPO, NOMBRE_TIPO, EMOJI_ROBUX, footer, separador, boton, formatearPrecio, formatearPrecioTexto } = require('../../utils/ui');

const ETIQUETA_RANGO = {
    '24h': '24 horas',
    '7d': '7 días',
    '30d': '30 días',
    'all': 'Histórico total'
};

/**
 * Construye el payload de la Vista 3 (Inspector de Objeto + Gráfica + Botones de Rango debajo de la gráfica).
 */
async function renderizarVistaGrafica(item, itemsUsuario = null, rangeKey = '7d') {
    const rangoActivo = ['24h', '7d', '30d', 'all'].includes(rangeKey) ? rangeKey : '7d';

    // 1. Obtener todos los objetos del usuario para el menú desplegable de salto rápido
    let listaObjetos = itemsUsuario;
    if (!Array.isArray(listaObjetos) || listaObjetos.length === 0) {
        const { data } = await supabase
            .from('roblox_wishlist')
            .select('*')
            .eq('user_id', item.user_id)
            .order('id', { ascending: true });
        listaObjetos = data || [item];
    }

    // 2. Obtener miniatura e historial desde Supabase (garantizando mínimo 2 puntos)
    const [miniaturas, priceRecord] = await Promise.all([
        obtenerMiniaturasBatch([item]).catch(() => new Map()),
        PriceItem.getOrInitItem(item)
    ]);

    const imagenUrl = miniaturas.get(String(item.id_objet)) || null;
    const historial = priceRecord?.history || [];
    const stats = PriceItem.filterHistoryAndStats(historial, rangoActivo, item.last_price);

    const tipo = (item.item_type || 'catalog').toLowerCase();
    const esUSD = tipo === 'plugin';
    const emojiCat = EMOJI_TIPO[tipo] || '📦';
    const nombreCat = NOMBRE_TIPO[tipo] || tipo.toUpperCase();
    const nombreObj = item.item_name || `Objeto ${item.id_objet}`;

    const fmtActual = formatearPrecio(item.last_price, esUSD);

    // Borde verde (0x23a55a) si subió o se mantuvo, rojo (0xf23f43) si bajó
    const colorBorde = stats.isUpOrFlat ? 0x23a55a : 0xf23f43;

    const tieneMeta = item.target_price !== null && item.target_price !== undefined;
    const fmtMeta = tieneMeta ? `🟠 ${formatearPrecio(item.target_price, esUSD)}` : '`Sin meta`';

    const container = new ContainerBuilder().setAccentColor(colorBorde);

    const textoEstadisticas = new TextDisplayBuilder().setContent(
        `# 📈 __**${nombreObj}**__\n` +
        `-# ${emojiCat} **${nombreCat}**  •  ID \`${item.id_objet}\`\n\n` +
        `${EMOJI_ROBUX} **Precio Actual:** ${fmtActual}   •   🎯 **Meta:** ${fmtMeta}`
    );

    if (imagenUrl) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(textoEstadisticas)
                .setThumbnailAccessory(thumb => thumb.setURL(imagenUrl))
        );
    } else {
        container.addTextDisplayComponents(textoEstadisticas);
    }

    // 3. Generar SIEMPRE la gráfica en RAM (incluyendo la línea de Meta en amarillo/naranja si tiene meta)
    const chartBuffer = await generatePriceChart(stats.filtered, nombreObj, {
        itemId: item.id_objet,
        daysRange: rangoActivo,
        esUSD,
        targetPrice: item.target_price
    });
    const attachment = new AttachmentBuilder(chartBuffer, { name: 'chart.png' });

    container.addSeparatorComponents(separador());
    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://chart.png')
        )
    );

    // Botones de filtro temporal (24h, 7d, 30d, Todo) justo debajo de la imagen de la gráfica
    const botonesRango = [
        { key: '24h', label: '24h' },
        { key: '7d', label: '7d' },
        { key: '30d', label: '30d' },
        { key: 'all', label: 'Todo' }
    ].map(r =>
        new ButtonBuilder()
            .setCustomId(`roblox_chart_${item.id}_${r.key}`)
            .setLabel(r.label)
            .setStyle(rangoActivo === r.key ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
    container.addActionRowComponents(new ActionRowBuilder().addComponents(botonesRango));

    container.addSeparatorComponents(separador(true));

    // Menú desplegable para cambiar rápidamente a otro objeto de la lista
    const selectOptions = listaObjetos.slice(0, 25).map((obj, idx) => {
        const objType = (obj.item_type || 'catalog').toLowerCase();
        const objEsUSD = objType === 'plugin';
        const label = `${idx + 1}. ${obj.item_name || `Objeto ${obj.id_objet}`}`.substring(0, 100);
        const desc = `${formatearPrecioTexto(obj.last_price, objEsUSD)}  •  ${obj.is_paused ? 'En pausa' : 'Activo'}`.substring(0, 100);

        return new StringSelectMenuOptionBuilder()
            .setLabel(label)
            .setDescription(desc)
            .setValue(String(obj.id))
            .setEmoji(obj.is_paused ? '⏸️' : (EMOJI_TIPO[objType] || '⚡'))
            .setDefault(String(obj.id) === String(item.id));
    });

    if (selectOptions.length > 0) {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_manage_item')
                    .setPlaceholder('📈 Elegí otro objeto de tu lista...')
                    .addOptions(selectOptions)
            )
        );
    }

    // Fila inferior: Configurar, Volver a la lista y Ver en Roblox
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton(`btn_action_open_config:${item.id}`, 'Configurar', '⚙️', ButtonStyle.Primary),
            boton('btn_nav_wishlist', 'Volver a la lista', '⬅️', ButtonStyle.Secondary),
            new ButtonBuilder()
                .setLabel('Ver en Roblox')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link)
                .setURL(obtenerUrlRoblox(item.id_objet, item.item_type))
        )
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(footer(`Variaciones en historial: ${stats.totalRecords}/500  •  Renderizado en RAM`))
    );

    return {
        components: [container],
        files: [attachment],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    customIdPrefix: 'roblox_chart_',
    renderizarVistaGrafica,

    async execute(interaction) {
        await interaction.deferUpdate();

        const resto = interaction.customId.replace('roblox_chart_', '');
        const lastUnderscore = resto.lastIndexOf('_');
        const dbId = lastUnderscore !== -1 ? resto.slice(0, lastUnderscore) : resto;
        const daysRange = lastUnderscore !== -1 ? resto.slice(lastUnderscore + 1) : '7d';

        const { data: itemsUsuario, error } = await supabase
            .from('roblox_wishlist')
            .select('*')
            .eq('user_id', interaction.user.id)
            .order('id', { ascending: true });

        if (error || !itemsUsuario || itemsUsuario.length === 0) {
            return await interaction.followUp({
                content: '❌ No se encontró el objeto en tu lista de monitoreo.',
                flags: MessageFlags.Ephemeral
            });
        }

        const item = itemsUsuario.find(i => String(i.id) === String(dbId)) ||
                     itemsUsuario.find(i => String(i.id_objet) === String(dbId));

        if (!item) {
            return await interaction.followUp({
                content: '❌ Este objeto ya no está en tu lista.',
                flags: MessageFlags.Ephemeral
            });
        }

        const payload = await renderizarVistaGrafica(item, itemsUsuario, daysRange);
        return await interaction.editReply(payload);
    }
};
