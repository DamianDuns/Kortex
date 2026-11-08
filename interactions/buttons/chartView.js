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
const { obtenerPreferenciasUsuario } = require('../../src/utils/i18n');

const ETIQUETA_RANGO = {
    '24h': '24 horas',
    '7d': '7 días',
    '30d': '30 días',
    'all': 'Histórico total'
};

/**
 * Construye el payload de la Vista 3 (Inspector de Objeto + Gráfica + Botones de Rango debajo de la gráfica).
 */
async function renderizarVistaGrafica(item, itemsUsuario = null, rangeKey = null, checkInNotice = null) {
    const prefs = item?.user_id ? obtenerPreferenciasUsuario(item.user_id) : { lang: 'es' };
    const isEn = (prefs.lang || 'es') === 'en';
    const prefRange = prefs.default_chart_range || '7d';
    const candidateRange = rangeKey || prefRange || '7d';
    const rangoActivo = ['24h', '7d', '30d', 'all'].includes(candidateRange) ? candidateRange : '7d';

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
    const summary = PriceItem.getPriceCheckSummary(item, stats.filtered);

    const tipo = (item.item_type || 'catalog').toLowerCase();
    const esUSD = tipo === 'plugin';
    const emojiCat = EMOJI_TIPO[tipo] || '📦';
    const nombreCat = NOMBRE_TIPO[tipo] || tipo.toUpperCase();
    const nombreObj = item.item_name || `Objeto ${item.id_objet}`;

    const fmtActual = formatearPrecio(summary.lastPrice, esUSD);
    const fmtOriginal = formatearPrecio(summary.firstPrice, esUSD);
    const fmtMetaValor = summary.hasTarget ? formatearPrecio(summary.targetPrice, esUSD) : '`Sin meta`';

    // Borde verde esmeralda brillante cuando se completó la meta o está más bajo del precio original
    const colorBorde = summary.isTargetMet
        ? 0x22c55e
        : (summary.isBelowOriginal ? 0x10b981 : (stats.isUpOrFlat ? 0x38bdf8 : 0xf23f43));

    const container = new ContainerBuilder().setAccentColor(colorBorde);

    const bannerCheckIn = checkInNotice ? `> ${checkInNotice}\n\n` : '';
    let bloqueEstadoMetaYOriginal = '';

    if (summary.isTargetMet) {
        const extraBajoMeta = summary.belowTargetAmount > 0
            ? ` *(¡**${formatearPrecioTexto(summary.belowTargetAmount, esUSD)} más barato** que tu meta!)*`
            : ' *(¡En tu precio objetivo!)*';

        const comparativaOrig = summary.isBelowOriginal
            ? `**-${formatearPrecioTexto(summary.savedVsOriginal, esUSD)} (-${summary.pctSavedVsOriginal.toFixed(1).replace('.0', '')}%) más bajo** que su precio original (${fmtOriginal})`
            : `Se mantiene en ${fmtOriginal} (precio original)`;

        bloqueEstadoMetaYOriginal =
            `${bannerCheckIn}` +
            `# 🎯 ¡META COMPLETADA! — __**${nombreObj}**__\n` +
            `-# ${emojiCat} **${nombreCat}**  •  ID \`${item.id_objet}\`  •  ✅ **¡Objetivo Alcanzado!**\n\n` +
            `> 🎉 **¡YA LLEGASTE A LA META QUE ESTABLECISTE!**\n` +
            `> 🏷️ **Precio Actual:** **${fmtActual}**  •  🎯 **Tu Meta:** ${fmtMetaValor} ✅${extraBajoMeta}\n` +
            `> 📉 **vs. Precio Original:** ${comparativaOrig}`;
    } else if (summary.isBelowOriginal) {
        const pctOrigStr = summary.pctSavedVsOriginal.toFixed(1).replace('.0', '');
        const lineaMeta = summary.hasTarget
            ? `🎯 **Tu Meta (${fmtMetaValor}):** ⏳ Faltan bajar **${formatearPrecio(summary.remainingToTarget, esUSD)}** *(progreso: \`${summary.progressToTargetPct}%\`)*`
            : `🎯 **Meta:** \`Sin meta configurada\` *(usá Configurar para fijar una)*`;

        bloqueEstadoMetaYOriginal =
            `${bannerCheckIn}` +
            `# 📉 __**${nombreObj}**__\n` +
            `-# ${emojiCat} **${nombreCat}**  •  ID \`${item.id_objet}\`  •  🟢 **Más bajo que el precio original**\n\n` +
            `🏷️ **Precio Actual:** **${fmtActual}**   •   🕒 **Precio Original:** ~~${fmtOriginal}~~\n` +
            `> 📉 **Ahorro actual:** Está **-${formatearPrecioTexto(summary.savedVsOriginal, esUSD)} (-${pctOrigStr}%) más bajo** que el precio original.\n` +
            `> ${lineaMeta}`;
    } else {
        const diffSubida = summary.lastPrice - summary.firstPrice;
        const notaOrig = diffSubida > 0
            ? `${fmtOriginal} *(subió +${formatearPrecioTexto(diffSubida, esUSD)})*`
            : `${fmtOriginal} *(sin cambios)*`;
        const lineaMeta = summary.hasTarget
            ? `🟠 ${fmtMetaValor} *(faltan bajar **${formatearPrecioTexto(summary.remainingToTarget, esUSD)}**)*`
            : '`Sin meta`';

        bloqueEstadoMetaYOriginal =
            `${bannerCheckIn}` +
            `# 📈 __**${nombreObj}**__\n` +
            `-# ${emojiCat} **${nombreCat}**  •  ID \`${item.id_objet}\`\n\n` +
            `🏷️ **Precio Actual:** ${fmtActual}   •   🕒 **Precio Original:** ${notaOrig}\n` +
            `🎯 **Meta establecida:** ${lineaMeta}`;
    }

    const textoEstadisticas = new TextDisplayBuilder().setContent(bloqueEstadoMetaYOriginal);

    if (imagenUrl) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(textoEstadisticas)
                .setThumbnailAccessory(thumb => thumb.setURL(imagenUrl))
        );
    } else {
        container.addTextDisplayComponents(textoEstadisticas);
    }

    // 3. Generar SIEMPRE la gráfica en RAM con Apache ECharts + Skia Canvas v2.0 (incluyendo miniatura y línea de Meta)
    const chartBuffer = await generatePriceChart(stats.filtered, nombreObj, {
        itemId: item.id_objet,
        daysRange: rangoActivo,
        esUSD,
        targetPrice: item.target_price,
        imageUrl: imagenUrl
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
        const objSummary = PriceItem.getPriceCheckSummary(obj);
        const label = `${idx + 1}. ${obj.item_name || `Objeto ${obj.id_objet}`}`.substring(0, 100);
        const estadoMetaDesc = objSummary.isTargetMet
            ? '✅ ¡META COMPLETADA!'
            : (objSummary.isBelowOriginal
                ? `📉 -${formatearPrecioTexto(objSummary.savedVsOriginal, objEsUSD)} vs Orig.`
                : (obj.is_paused ? 'En pausa' : 'Activo'));
        const desc = `${formatearPrecioTexto(obj.last_price, objEsUSD)}  •  ${estadoMetaDesc}`.substring(0, 100);

        return new StringSelectMenuOptionBuilder()
            .setLabel(label)
            .setDescription(desc)
            .setValue(String(obj.id))
            .setEmoji(objSummary.isTargetMet ? '🎯' : (obj.is_paused ? '⏸️' : (EMOJI_TIPO[objType] || '⚡')))
            .setDefault(String(obj.id) === String(item.id));
    });

    if (selectOptions.length > 0) {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_manage_item')
                    .setPlaceholder(isEn ? '📈 Select another item from your list...' : '📈 Elegí otro objeto de tu lista...')
                    .addOptions(selectOptions)
            )
        );
    }

    // Fila inferior: Comprobar Precio, Configurar, Volver a la lista y Ver en Roblox
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton(`btn_action_checkin:${item.id}`, isEn ? 'Check Price' : 'Comprobar Precio', '🔄', ButtonStyle.Success),
            boton(`btn_action_open_config:${item.id}`, isEn ? 'Configure' : 'Configurar', '⚙️', ButtonStyle.Primary),
            boton('btn_nav_wishlist', isEn ? 'Go Back' : 'Volver Atrás', '⬅️', ButtonStyle.Secondary),
            new ButtonBuilder()
                .setLabel(isEn ? 'View on Roblox' : 'Ver en Roblox')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link)
                .setURL(obtenerUrlRoblox(item.id_objet, item.item_type))
        )
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(footer(isEn ? `History variations: ${stats.totalRecords}/500` : `Variaciones en historial: ${stats.totalRecords}/500`))
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
