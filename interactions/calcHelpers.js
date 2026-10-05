// ==========================================
// ARCHIVO: interactions/calcHelpers.js
// ==========================================

const { 
    ContainerBuilder, 
    TextDisplayBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    MessageFlags 
} = require('discord.js');

const EMOJI_ROBUX = '<:Robux:1547677277590913114>';
const estadoCalculadoraUsuario = new Map();

const TIERS_ROBLOX = {
    TIER_100: { nombre: 'Tier 100% (Global / EE.UU. / España / Europa)', factor: 1.0, desc: 'Sin descuento regional' },
    TIER_80:  { nombre: 'Tier 80% (México / Chile / Uruguay / Rusia)', factor: 0.8, desc: '20% de descuento regional' },
    TIER_60:  { nombre: 'Tier 60% (Argentina / Brasil / Colombia / Perú)', factor: 0.6, desc: '40% de descuento regional' },
    TIER_40:  { nombre: 'Tier 40% (Venezuela / Bolivia / Paraguay / Filipinas)', factor: 0.4, desc: '60% de descuento regional' }
};

function construirPanelCalculadoraLimpio(opcionesSeleccionadas = ['grupo_40']) {
    const isGrupo = opcionesSeleccionadas.includes('grupo_40');
    const isPlus10 = opcionesSeleccionadas.includes('plus_10');
    const isPlus20 = opcionesSeleccionadas.includes('plus_20');
    const isRegionalRoblox = opcionesSeleccionadas.includes('roblox_regional');

    let estadoTexto = '';
    estadoTexto += isGrupo ? '• ✅ **Cashback Grupo (40%)** — Activado\n' : '• ⏹️ **Cashback Grupo (40%)** — Desactivado\n';
    estadoTexto += isPlus10 ? '• ✅ **Roblox Plus (10%)** — Activado\n' : '• ⏹️ **Roblox Plus (10%)** — Desactivado\n';
    estadoTexto += isPlus20 ? '• ✅ **Roblox Plus 2+ Meses (20%)** — Activado\n' : '• ⏹️ **Roblox Plus 2+ Meses (20%)** — Desactivado\n';
    estadoTexto += isRegionalRoblox ? '• ✅ **Precio Regional Roblox** — Activado\n' : '• ⏹️ **Precio Regional Roblox** — Desactivado\n';

    const selectOptions = new StringSelectMenuBuilder()
        .setCustomId('select_calc_multiselect')
        .setPlaceholder('Elegí los beneficios a aplicar...')
        .setMinValues(0)
        .setMaxValues(4)
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel('Cashback de Grupo (40%)')
                .setValue('grupo_40')
                .setDefault(isGrupo)
                .setEmoji('👥'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Roblox Plus (10% Descuento)')
                .setValue('plus_10')
                .setDefault(isPlus10)
                .setEmoji('⭐'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Roblox Plus 2+ Meses (20% Descuento)')
                .setValue('plus_20')
                .setDefault(isPlus20)
                .setEmoji('🌟'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Precio Regional Roblox')
                .setValue('roblox_regional')
                .setDefault(isRegionalRoblox)
                .setEmoji('🌎')
        ]);

    const rowSelect = new ActionRowBuilder().addComponents(selectOptions);
    const rowActions = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_calc_execute_modal')
            .setLabel('Calcular Precio')
            .setEmoji('🧮')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('btn_back_main')
            .setLabel('Menú Principal')
            .setEmoji('⬅️')
            .setStyle(ButtonStyle.Secondary)
    );

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '## 🧮 Calculadora de Economía\n\n' +
                'Seleccioná los beneficios que querés aplicar y después presioná **Calcular Precio**.\n\n' +
                '**Configuración actual:**\n' + estadoTexto
            )
        )
        .addActionRowComponents(rowSelect)
        .addActionRowComponents(rowActions);

    return { 
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
}

function calcularEmbedResultado(basePrice, seleccionadas, tierKey = 'TIER_100') {
    let precioAjustadoRobux = basePrice;
    let detallesTexto = `🏷️ **Precio Base Global:** \`${basePrice.toLocaleString('es-AR')} Robux\`\n`;

    if (seleccionadas.includes('roblox_regional')) {
        const tierConfig = TIERS_ROBLOX[tierKey] || TIERS_ROBLOX.TIER_100;
        precioAjustadoRobux = Math.floor(basePrice * tierConfig.factor);
        detallesTexto += `🌎 **Precio Regional:** \`${precioAjustadoRobux.toLocaleString('es-AR')} Robux\`\n`;
        detallesTexto += `*(${tierConfig.nombre})*\n`;
    }

    let totalAhorroRobux = 0;

    if (seleccionadas.includes('grupo_40')) {
        const cashbackGrupo = Math.floor(precioAjustadoRobux * 0.40);
        totalAhorroRobux += cashbackGrupo;
        detallesTexto += `👥 **Cashback Grupo (40%):** \`+${cashbackGrupo.toLocaleString('es-AR')} Robux\`\n`;
    }

    if (seleccionadas.includes('plus_10')) {
        const descPlus10 = Math.floor(precioAjustadoRobux * 0.10);
        totalAhorroRobux += descPlus10;
        detallesTexto += `⭐ **Roblox Plus (10%):** \`-${descPlus10.toLocaleString('es-AR')} Robux\`\n`;
    }

    if (seleccionadas.includes('plus_20')) {
        const descPlus20 = Math.floor(precioAjustadoRobux * 0.20);
        totalAhorroRobux += descPlus20;
        detallesTexto += `🌟 **Roblox Plus 2+ Meses (20%):** \`-${descPlus20.toLocaleString('es-AR')} Robux\`\n`;
    }

    const precioFinalEfectivo = Math.max(0, precioAjustadoRobux - totalAhorroRobux);

    detallesTexto += `\n📊 **Total Ahorro:** \`${totalAhorroRobux.toLocaleString('es-AR')} Robux\`\n` +
                     `📉 **Precio Final Efectivo:** \`${precioFinalEfectivo.toLocaleString('es-AR')} Robux\``;

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '## 📊 Resultado del Cálculo\n\n' +
                detallesTexto
            )
        );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    estadoCalculadoraUsuario,
    construirPanelCalculadoraLimpio,
    calcularEmbedResultado,
    TIERS_ROBLOX,
    EMOJI_ROBUX
};