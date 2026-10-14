// ==========================================
// ARCHIVO: commands/help.js
// ==========================================

const { 
    SlashCommandBuilder, 
    ContainerBuilder, 
    TextDisplayBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    MessageFlags 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Guía de comandos y herramientas disponibles en Kortex'),

    async execute(interaction) {
        const container = new ContainerBuilder();

        const textoHelp = new TextDisplayBuilder().setContent(
            '# 📖 GUÍA DE USUARIO // KORTEX\n' +
            'Conocé las herramientas disponibles y cómo aprovecharlas al máximo:'
        );
        container.addTextDisplayComponents(textoHelp);
        container.addSeparatorComponents(sep => sep.setDivider(true));

        const textoComandos = new TextDisplayBuilder().setContent(
            '### 🎮 `/roblox` • Hub de Herramientas\n' +
            '> Abre el panel de operaciones donde podés rastrear precios, ver tu lista y calcular finanzas.\n\n' +
            '### 🎯 Price Sniper & Alertas en Vivo\n' +
            '> Monitorea variaciones de precio en Catálogo, Limiteds, Gamepasses y Plugins. Te notifica en DMs, Canales o Webhooks.\n\n' +
            '### 🧮 Calculadoras Financieras\n' +
            '> Simulá el **Cashback de Grupo (40%)**, descuentos de **Roblox Plus (10%/20%)** y **Precios Regionales** por país.\n\n' +
            '### 🏓 `/ping` • Estado del Sistema\n' +
            '> Comprueba la latencia del bot y la conexión en tiempo real con la API.'
        );
        container.addTextDisplayComponents(textoComandos);
        container.addSeparatorComponents(sep => sep.setDivider(true));

        const footerHelp = new TextDisplayBuilder().setContent(
            '-# 💡 Tip: También podés invocar las herramientas mencionando a @Kortex en el chat.'
        );
        container.addTextDisplayComponents(footerHelp);

        const rowAction = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_nav_main_menu')
                .setLabel('Abrir Hub de Roblox')
                .setEmoji('⚡')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({
            components: [container, rowAction],
            flags: MessageFlags.IsComponentsV2
        });
    }
};