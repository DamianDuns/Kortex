// ==========================================
// ARCHIVO: interactions/calcHelpers.js
// ==========================================

const {
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    AttachmentBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const { COLORES, footer, separador, boton } = require('../utils/ui');
const { generateCalculatorBreakdownCard } = require('../src/utils/chartGenerator');
const { obtenerPreferenciasUsuario, REGIONAL_TIERS_LIST } = require('../src/utils/i18n');

const EMOJI_ROBUX = '<:Robux:1547677277590913114>';
const estadoCalculadoraUsuario = new Map();
const estadoTierCalculadoraUsuario = new Map();
const OPCIONES_DEFAULT = ['grupo_40'];

const TIERS_ROBLOX = {
    TIER_100: {
        nombre: '🌐 Tier 100% — EE.UU., España, Global',
        factor: 1.0,
        desc: 'Pagás el 100% del precio base (0% de descuento regional)'
    },
    TIER_80: {
        nombre: '🇲🇽 Tier 80% — México, Chile, Uruguay',
        factor: 0.8,
        desc: 'Pagás el 80% del precio base (20% de descuento regional)'
    },
    TIER_60: {
        nombre: '🇦🇷 Tier 60% — Argentina, Brasil, Colombia, Perú',
        factor: 0.6,
        desc: 'Pagás el 60% del precio base (40% de descuento regional)'
    },
    TIER_40: {
        nombre: '🇻🇪 Tier 40% — Venezuela, Bolivia, Paraguay',
        factor: 0.4,
        desc: 'Pagás el 40% del precio base (60% de descuento regional)'
    }
};

/** Devuelve el Tier regional activo del usuario en la calculadora (o su predeterminado de /config). */
function obtenerTierCalculadora(userId) {
    if (userId && estadoTierCalculadoraUsuario.has(String(userId))) {
        return estadoTierCalculadoraUsuario.get(String(userId));
    }
    const prefs = obtenerPreferenciasUsuario(userId);
    return TIERS_ROBLOX[prefs.default_tier] ? prefs.default_tier : 'TIER_100';
}

/** Devuelve las opciones guardadas del usuario o las configuradas en sus preferencias de /config. */
function obtenerSeleccion(userId) {
    if (userId && estadoCalculadoraUsuario.has(String(userId))) {
        return estadoCalculadoraUsuario.get(String(userId));
    }
    const prefs = obtenerPreferenciasUsuario(userId);
    const defaults = [];
    if (prefs.auto_cashback_40 !== false) {
        defaults.push('grupo_40');
    }
    const tier = obtenerTierCalculadora(userId);
    if (tier && tier !== 'TIER_100') {
        defaults.push('roblox_regional');
    }
    return defaults;
}

const fmt = n => Number(n).toLocaleString('es-AR');

function barraProgreso(porcentaje, largo = 10) {
    const llenos = Math.round((Math.min(100, Math.max(0, porcentaje)) / 100) * largo);
    return '▰'.repeat(llenos) + '▱'.repeat(largo - llenos);
}

function construirOpcionesMenuTiers(activeTier = 'TIER_100') {
    return REGIONAL_TIERS_LIST.map(t =>
        new StringSelectMenuOptionBuilder()
            .setLabel(t.label_es)
            .setDescription(t.desc_es)
            .setValue(t.value)
            .setEmoji(t.emoji)
            .setDefault(activeTier === t.value)
    );
}

function construirPanelCalculadoraLimpio(opcionesSeleccionadas = OPCIONES_DEFAULT, userId = null) {
    const activeTier = obtenerTierCalculadora(userId);
    const isGrupo = opcionesSeleccionadas.includes('grupo_40');
    const isPlus10 = opcionesSeleccionadas.includes('plus_10');
    const isPlus20 = opcionesSeleccionadas.includes('plus_20');
    const isRegionalRoblox = opcionesSeleccionadas.includes('roblox_regional') || activeTier !== 'TIER_100';
    const tierInfo = TIERS_ROBLOX[activeTier] || TIERS_ROBLOX.TIER_100;

    const linea = (activo, texto) => `${activo ? '🟢' : '⚫'} ${activo ? `**${texto}**` : texto}`;
    const estadoTexto = [
        linea(isGrupo, 'Cashback de Grupo (40%)'),
        linea(isPlus10, 'Roblox Plus (10%)'),
        linea(isPlus20, 'Roblox Plus 2+ meses (20%)'),
        linea(isRegionalRoblox, `Precio Regional: ${tierInfo.nombre}`)
    ].join('\n');

    const selectOptions = new StringSelectMenuBuilder()
        .setCustomId('select_calc_multiselect')
        .setPlaceholder('✨ 1. Elegí los beneficios a aplicar...')
        .setMinValues(0)
        .setMaxValues(4)
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel('Cashback de Grupo (40%)')
                .setDescription('Comprás desde tu grupo y recuperás el 40%')
                .setValue('grupo_40')
                .setDefault(isGrupo)
                .setEmoji('👥'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Roblox Plus (10%)')
                .setDescription('Descuento de suscriptor')
                .setValue('plus_10')
                .setDefault(isPlus10)
                .setEmoji('⭐'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Roblox Plus 2+ meses (20%)')
                .setDescription('Reemplaza al 10% si elegís ambos')
                .setValue('plus_20')
                .setDefault(isPlus20)
                .setEmoji('🌟'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Precio Regional (Tier 100% / 80% / 60% / 40%)')
                .setDescription('Aplica el descuento de tu región seleccionada abajo')
                .setValue('roblox_regional')
                .setDefault(isRegionalRoblox)
                .setEmoji('🌎')
        ]);

    const selectTierPreset = new StringSelectMenuBuilder()
        .setCustomId('select_calc_tier_preset')
        .setPlaceholder('🌎 2. Elegí el Tier de Región de Precios (100% / 80% / 60% / 40%)...')
        .addOptions(construirOpcionesMenuTiers(activeTier));

    const container = new ContainerBuilder()
        .setAccentColor(COLORES.calc)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '## 🧮 Calculadora de Economía\n' +
                'Elegí los beneficios, tu **Tier de Región de Precios (100% / 80% / 60% / 40%)** y presioná **Calcular**.'
            )
        )
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('### ⚙️ Configuración actual\n' + estadoTexto)
        )
        .addSeparatorComponents(separador())
        .addActionRowComponents(new ActionRowBuilder().addComponents(selectOptions))
        .addActionRowComponents(new ActionRowBuilder().addComponents(selectTierPreset))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_calc_execute_modal', 'Calcular', '🧮', ButtonStyle.Primary),
                boton('btn_nav_cat:cat_economy', 'Volver Atrás', '⬅️')
            )
        );

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

async function calcularEmbedResultado(basePrice, seleccionadas, tierKey = null, userId = null) {
    const resolvedTierKey = tierKey || obtenerTierCalculadora(userId) || 'TIER_100';
    const tierConfig = TIERS_ROBLOX[resolvedTierKey] || TIERS_ROBLOX.TIER_100;
    const aplicarRegional = seleccionadas.includes('roblox_regional') || resolvedTierKey !== 'TIER_100';

    let precioAjustadoRobux = basePrice;
    const lineas = [`🏷️ **Precio base:** \`${fmt(basePrice)} R$\` ${EMOJI_ROBUX}`];

    if (aplicarRegional) {
        precioAjustadoRobux = Math.floor(basePrice * tierConfig.factor);
        lineas.push(`🌎 **Precio regional:** \`${fmt(precioAjustadoRobux)} R$\` ${EMOJI_ROBUX}`);
        lineas.push(`-# ${tierConfig.nombre} — ${tierConfig.desc}`);
    }

    let totalAhorroRobux = 0;
    let cashbackGrupoMonto = 0;
    let plusDiscountMonto = 0;

    if (seleccionadas.includes('grupo_40')) {
        cashbackGrupoMonto = Math.floor(precioAjustadoRobux * 0.40);
        totalAhorroRobux += cashbackGrupoMonto;
        lineas.push(`👥 **Cashback de grupo (40%):** \`+${fmt(cashbackGrupoMonto)} R$\` ${EMOJI_ROBUX}`);
    }

    if (seleccionadas.includes('plus_10')) {
        const descPlus10 = Math.floor(precioAjustadoRobux * 0.10);
        plusDiscountMonto += descPlus10;
        totalAhorroRobux += descPlus10;
        lineas.push(`⭐ **Roblox Plus (10%):** \`-${fmt(descPlus10)} R$\` ${EMOJI_ROBUX}`);
    }

    if (seleccionadas.includes('plus_20')) {
        const descPlus20 = Math.floor(precioAjustadoRobux * 0.20);
        plusDiscountMonto += descPlus20;
        totalAhorroRobux += descPlus20;
        lineas.push(`🌟 **Roblox Plus 2+ meses (20%):** \`-${fmt(descPlus20)} R$\` ${EMOJI_ROBUX}`);
    }

    const precioFinalEfectivo = Math.max(0, precioAjustadoRobux - totalAhorroRobux);
    const ahorroTotalVsBase = basePrice - precioFinalEfectivo;
    const porcentaje = basePrice > 0 ? Math.round((ahorroTotalVsBase / basePrice) * 100) : 0;

    const files = [];
    const container = new ContainerBuilder()
        .setAccentColor(COLORES.exito)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📊 Resultado del Cálculo (Motor Apache ECharts + Skia)'))
        .addSeparatorComponents(separador());

    try {
        const cardBuf = await generateCalculatorBreakdownCard({
            basePrice,
            regionalPrice: precioAjustadoRobux,
            cashback: cashbackGrupoMonto,
            plusDiscount: plusDiscountMonto,
            finalPrice: precioFinalEfectivo,
            totalSaved: ahorroTotalVsBase,
            pctSaved: porcentaje
        });
        if (cardBuf) {
            files.push(new AttachmentBuilder(cardBuf, { name: 'calc_breakdown.png' }));
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://calc_breakdown.png')
                )
            );
            container.addSeparatorComponents(separador());
        }
    } catch (err) {
        console.error('[CALC BREAKDOWN CARD ERROR]:', err.message);
    }

    const selectRegionResult = new StringSelectMenuBuilder()
        .setCustomId(`select_calc_region:${basePrice}`)
        .setPlaceholder('🌎 Cambiar Tier de Región (100% / 80% / 60% / 40%)...')
        .addOptions(construirOpcionesMenuTiers(resolvedTierKey));

    container
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lineas.join('\n')))
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### ✨ Precio final efectivo: \`${fmt(precioFinalEfectivo)} R$\` ${EMOJI_ROBUX}\n` +
            `Ahorrás **\`${fmt(ahorroTotalVsBase)} R$\`** ${EMOJI_ROBUX} (${porcentaje}%)\n` +
            `\`${barraProgreso(porcentaje)}\``
        ))
        .addSeparatorComponents(separador())
        .addActionRowComponents(new ActionRowBuilder().addComponents(selectRegionResult));

    const rowBotones = [
        boton('btn_quick_calc', 'Nuevo Cálculo', '🧮', ButtonStyle.Primary),
        boton('btn_nav_cat:cat_economy', 'Volver Atrás', '⬅️', ButtonStyle.Secondary)
    ];

    container.addActionRowComponents(new ActionRowBuilder().addComponents(rowBotones));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Valores estimados • Roblox redondea hacia abajo')
    ));

    return {
        components: [container],
        files,
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    estadoCalculadoraUsuario,
    estadoTierCalculadoraUsuario,
    obtenerTierCalculadora,
    obtenerSeleccion,
    construirOpcionesMenuTiers,
    construirPanelCalculadoraLimpio,
    calcularEmbedResultado,
    TIERS_ROBLOX,
    EMOJI_ROBUX
};