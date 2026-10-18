// ==========================================
// ARCHIVO: commands/help.js
// ==========================================

const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags
} = require('discord.js');
const { COLORES, footer, separador } = require('../utils/ui');

function construirPanelHelp() {
    const container = new ContainerBuilder().setAccentColor(COLORES.primario);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '# ⚡ Centro de Ayuda — Kortex\n' +
        'Guía rápida de las herramientas y comandos disponibles en el bot.'
    ));

    container.addSeparatorComponents(separador(true));

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '## 🎮 `/roblox` — Panel Principal\n' +
        'Abre el menú interactivo con las dos categorías de herramientas:\n\n' +
        '### 🎯 Price Sniper y Lista de Seguimiento\n' +
        '> • **Monitoreo de precios:** Añadí hasta **5 objetos** (*Catálogo, Limiteds, Gamepasses, Plugins o Accesos Pagos*) pegando su ID o enlace.\n' +
        '> • **Mi Lista y Gráficas:** Consultá tus objetos dentro de Price Sniper, revisá sus **gráficas de evolución** (`24h`, `7d`, `30d`, `Todo`) y fijá una **meta de precio**.\n' +
        '> • **Alertas automáticas:** Recibí avisos con gráfica incluida por **DM**, **Canal** o **Webhook** apenas cambie el precio.\n\n' +
        '### 🧮 Calculadoras de Roblox\n' +
        '> • Calculá al instante descuentos e impuestos de **Cashback de grupo (40%)**, **Roblox Plus (10% / 20%)** y **Precios Regionales**.'
    ));

    container.addSeparatorComponents(separador(true));

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '## 🏓 `/ping` — Estado del Bot\n' +
        'Muestra la latencia de respuesta (`ms`), conexión con Discord y tiempo activo en línea.'
    ));

    container.addSeparatorComponents(separador());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Ejecutá los comandos con / en el chat o mencionando a @Kortex')
    ));

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Muestra la lista y explicación de los comandos de Kortex.'),

    construirPanelHelp,

    // Funciona tanto con interacciones (/help) como con mensajes (@Kortex ayuda)
    async execute(interaction) {
        await interaction.reply(construirPanelHelp(interaction.client));
    }
};