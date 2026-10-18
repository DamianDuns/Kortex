// ==========================================
// ARCHIVO: interactions/buttons/chartView.js
// Vista 3: Estado del Objeto, Estadísticas de Rango y Gráfica Local en RAM
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
const { EMOJI_TIPO, NOMBRE_TIPO, footer, separador, boton, formatearPrecio } = require('../../utils/ui');

const ETIQUETA_RANGO = {
    '24h': '24 horas',
    '7d': '7 días',
    '30d': '30 días',
    'all': 'Histórico total'
};

/**
 * Construye el payload de la Vista 3 (Estado del Objeto + Gráfica + Selector + Filtros de Tiempo).
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

    // 2. Obtener miniatura e historial con Delta Logging
    const [miniaturas, priceRecord] = await Promise.all([
        obtenerMiniaturasBatch([item]).catch(() => new Map()),
        PriceItem.getOrInitItem(item)
    ]);

    const imagenUrl = miniaturas.get(String(item.id_objet)) || null;
    const historial = priceRecord?.history || [];
    const stats = PriceItem.filterHistoryAndStats(historial, rangoActivo);

    const tipo = (item.item_type || 'catalog').toLowerCase();
    const esUSD = tipo === 'plugin';
    const emojiCat = EMOJI_TIPO[tipo] || '📦';
    const nombreCat = NOMBRE_TIPO[tipo] || tipo.toUpperCase();
    const nombreObj = item.item_name || `Objeto ${item.id_objet}`;

    const fmtActual = formatearPrecio(item.last_price, esUSD);
    const fmtMin = formatearPrecio(stats.minPrice, esUSD);
    const fmtMax = formatearPrecio(stats.maxPrice, esUSD);

    const signo = stats.diff > 0 ? '+' : '';
    const pctFmt = `${signo}${stats.pctChange.toFixed(2).replace('.00', '')}%`;
    const diffFmt = stats.diff === 0
        ? '0% (Sin cambios)'
        : `${signo}${formatearPrecio(stats.diff, esUSD)} (${pctFmt})`;

    const tieneGrafica = stats.filtered.length >= 2;
    const colorBorde = tieneGrafica
        ? (stats.isUpOrFlat ? 0x23a55a : 0xf23f43)
        : 0x2b2d31;

    const tieneMeta = item.target_price !== null && item.target_price !== undefined;
    const fmtMeta = tieneMeta ? formatearPrecio(item.target_price, esUSD) : 'Sin meta';

    const container = new ContainerBuilder().setAccentColor(colorBorde);

    const bloqueAviso = !tieneGrafica
        ? `\n\n> ℹ️ **Historial en recopilación (${stats.totalRecords}/2 variaciones mínimas):**\n` +
          `> La gráfica se generará automáticamente apenas Kortex detecte el primer cambio de precio en este objeto.`
        : '';

    const textoEstadisticas = new TextDisplayBuilder().setContent(
        `# 📈 __**${nombreObj}**__\n` +
        `-# ${emojiCat} **${nombreCat}**  •  ID \`${item.id_objet}\`  •  Rango: **${ETIQUETA_RANGO[rangoActivo]}**\n\n` +
        `🏷️ **Precio Actual:** \`${fmtActual}\`   •   📊 **Variación (%)**: \`${diffFmt}\`\n` +
        `📉 **Mín / Máx (${rangoActivo === 'all' ? 'Todo' : rangoActivo}):** \`${fmtMin}\` / \`${fmtMax}\`   •   🎯 **Meta:** \`${fmtMeta}\`` +
        bloqueAviso
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

    const files = [];

    if (tieneGrafica) {
        const chartBuffer = await generatePriceChart(stats.filtered, nombreObj, {
            itemId: item.id_objet,
            daysRange: rangoActivo,
            esUSD
        });
        files.push(new AttachmentBuilder(chartBuffer, { name: 'chart.png' }));

        container.addSeparatorComponents(separador());
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://chart.png')
            )
        );
    }

    container.addSeparatorComponents(separador(true));

    // Fila 1: StringSelectMenuBuilder con el objeto actual marcado como default para saltar directo a otro objeto
    const selectOptions = listaObjetos.slice(0, 25).map((obj, idx) => {
        const objType = (obj.item_type || 'catalog').toLowerCase();
        const objEsUSD = objType === 'plugin';
        const label = `${idx + 1}. ${obj.item_name || `Objeto ${obj.id_objet}`}`.substring(0, 100);
        const desc = `${formatearPrecio(obj.last_price, objEsUSD)}  •  ${obj.is_paused ? 'En pausa' : 'Activo'}`.substring(0, 100);

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
                    .setPlaceholder('🔎 Cambiar a otro objeto de tu lista...')
                    .addOptions(selectOptions)
            )
        );
    }

    // Fila 2: Botones de filtro temporal (24h, 7d, 30d, Todo) + Volver a la lista
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

    botonesRango.push(boton('btn_nav_wishlist', 'Volver a la lista', '⬅️', ButtonStyle.Secondary));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(botonesRango));

    // Fila 3: Accesos rápidos para Configurar Alertas, Probar Alerta y Ver en Roblox
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton(`btn_action_open_config:${item.id}`, 'Configurar Alertas', '⚙️', ButtonStyle.Success),
            boton(`btn_action_test_alert:${item.id}`, 'Probar Alerta', '🔔', ButtonStyle.Secondary),
            new ButtonBuilder()
                .setLabel('Ver en Roblox')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Link)
                .setURL(obtenerUrlRoblox(item.id_objet, item.item_type))
        )
    );

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(footer(`Variaciones registradas: ${stats.totalRecords}/500  •  Renderizado en RAM`))
    );

    return {
        components: [container],
        files,
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    customIdPrefix: 'roblox_chart_',
    renderizarVistaGrafica,

    async execute(interaction) {
        await interaction.deferUpdate();

        // Formato: roblox_chart_${dbId}_${daysRange}
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
