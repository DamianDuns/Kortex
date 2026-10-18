// ==========================================
// ARCHIVO: interactions/calcHelpers.js
// ==========================================

const {
    ContainerBuilder,
    TextDisplayBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const { COLORES, footer, separador, boton } = require('../utils/ui');

const EMOJI_ROBUX = '<:Robux:1547677277590913114>';
const estadoCalculadoraUsuario = new Map();
const OPCIONES_DEFAULT = ['grupo_40'];

const TIERS_ROBLOX = {
    TIER_100: { nombre: 'Tier 100% (Global / EE.UU. / España / Europa)', factor: 1.0, desc: 'Sin descuento regional' },
    TIER_80:  { nombre: 'Tier 80% (México / Chile / Uruguay / Rusia)', factor: 0.8, desc: '20% de descuento regional' },
    TIER_60:  { nombre: 'Tier 60% (Argentina / Brasil / Colombia / Perú)', factor: 0.6, desc: '40% de descuento regional' },
    TIER_40:  { nombre: 'Tier 40% (Venezuela / Bolivia / Paraguay / Filipinas)', factor: 0.4, desc: '60% de descuento regional' }
};

/** Devuelve las opciones guardadas del usuario o las de por defecto (las que ve marcadas al abrir el panel). */
function obtenerSeleccion(userId) {
    return estadoCalculadoraUsuario.get(userId) ?? [...OPCIONES_DEFAULT];
}

const fmt = n => Number(n).toLocaleString('es-AR');

function barraProgreso(porcentaje, largo = 10) {
    const llenos = Math.round((Math.min(100, Math.max(0, porcentaje)) / 100) * largo);
    return '▰'.repeat(llenos) + '▱'.repeat(largo - llenos);
}

function construirPanelCalculadoraLimpio(opcionesSeleccionadas = OPCIONES_DEFAULT) {
    const isGrupo = opcionesSeleccionadas.includes('grupo_40');
    const isPlus10 = opcionesSeleccionadas.includes('plus_10');
    const isPlus20 = opcionesSeleccionadas.includes('plus_20');
    const isRegionalRoblox = opcionesSeleccionadas.includes('roblox_regional');

    const linea = (activo, texto) => `${activo ? '🟢' : '⚫'} ${activo ? `**${texto}**` : texto}`;
    const estadoTexto = [
        linea(isGrupo, 'Cashback de Grupo (40%)'),
        linea(isPlus10, 'Roblox Plus (10%)'),
        linea(isPlus20, 'Roblox Plus 2+ meses (20%)'),
        linea(isRegionalRoblox, 'Precio Regional')
    ].join('\n');

    const selectOptions = new StringSelectMenuBuilder()
        .setCustomId('select_calc_multiselect')
        .setPlaceholder('✨ Elegí los beneficios a aplicar...')
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
                .setLabel('Precio Regional')
                .setDescription('Te pregunto tu región después de ingresar el precio')
                .setValue('roblox_regional')
                .setDefault(isRegionalRoblox)
                .setEmoji('🌎')
        ]);

    const container = new ContainerBuilder()
        .setAccentColor(COLORES.calc)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '## 🧮 Calculadora de Economía\n' +
                'Elegí los beneficios en el menú y presioná **Calcular**.'
            )
        )
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('### ⚙️ Configuración actual\n' + estadoTexto)
        )
        .addSeparatorComponents(separador())
        .addActionRowComponents(new ActionRowBuilder().addComponents(selectOptions))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_calc_execute_modal', 'Calcular', '🧮', ButtonStyle.Primary),
                boton('btn_nav_main_menu', 'Menú Principal', '⬅️')
            )
        );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
}

function calcularEmbedResultado(basePrice, seleccionadas, tierKey = 'TIER_100') {
    let precioAjustadoRobux = basePrice;
    const lineas = [`${EMOJI_ROBUX} **Precio base:** \`${fmt(basePrice)}\` ${EMOJI_ROBUX}`];

    if (seleccionadas.includes('roblox_regional')) {
        const tierConfig = TIERS_ROBLOX[tierKey] || TIERS_ROBLOX.TIER_100;
        precioAjustadoRobux = Math.floor(basePrice * tierConfig.factor);
        lineas.push(`🌎 **Precio regional:** \`${fmt(precioAjustadoRobux)}\` ${EMOJI_ROBUX}`);
        lineas.push(`-# ${tierConfig.nombre} — ${tierConfig.desc}`);
    }

    let totalAhorroRobux = 0;

    if (seleccionadas.includes('grupo_40')) {
        const cashbackGrupo = Math.floor(precioAjustadoRobux * 0.40);
        totalAhorroRobux += cashbackGrupo;
        lineas.push(`👥 **Cashback de grupo (40%):** \`+${fmt(cashbackGrupo)}\` ${EMOJI_ROBUX}`);
    }

    if (seleccionadas.includes('plus_10')) {
        const descPlus10 = Math.floor(precioAjustadoRobux * 0.10);
        totalAhorroRobux += descPlus10;
        lineas.push(`⭐ **Roblox Plus (10%):** \`-${fmt(descPlus10)}\` ${EMOJI_ROBUX}`);
    }

    if (seleccionadas.includes('plus_20')) {
        const descPlus20 = Math.floor(precioAjustadoRobux * 0.20);
        totalAhorroRobux += descPlus20;
        lineas.push(`🌟 **Roblox Plus 2+ meses (20%):** \`-${fmt(descPlus20)}\` ${EMOJI_ROBUX}`);
    }

    const precioFinalEfectivo = Math.max(0, precioAjustadoRobux - totalAhorroRobux);
    const ahorroTotalVsBase = basePrice - precioFinalEfectivo;
    const porcentaje = basePrice > 0 ? Math.round((ahorroTotalVsBase / basePrice) * 100) : 0;

    const container = new ContainerBuilder()
        .setAccentColor(COLORES.exito)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📊 Resultado del Cálculo'))
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lineas.join('\n')))
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### ${EMOJI_ROBUX} Precio final efectivo: \`${fmt(precioFinalEfectivo)}\` ${EMOJI_ROBUX}\n` +
            `Ahorrás **\`${fmt(ahorroTotalVsBase)}\`** ${EMOJI_ROBUX} (${porcentaje}%)\n` +
            `\`${barraProgreso(porcentaje)}\``
        ))
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer('Valores estimados • Roblox redondea hacia abajo')
        ));

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    estadoCalculadoraUsuario,
    obtenerSeleccion,
    construirPanelCalculadoraLimpio,
    calcularEmbedResultado,
    TIERS_ROBLOX,
    EMOJI_ROBUX
};