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
        '## ⌨️ Comandos de Kortex\n' +
        'Referencia de todos los comandos disponibles y cómo ejecutarlos:'
    ));

    container.addSeparatorComponents(separador(true));

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '### 🎮 `/roblox`\n' +
        'Abre el panel interactivo con las herramientas de Roblox:\n' +
        '> • **Price Sniper:** Añadí objetos (Catálogo, Limiteds, Gamepasses, Plugins o Accesos Pagos) para recibir alertas cuando baje el precio.\n' +
        '> • **Mi Lista:** Consultá tus objetos en seguimiento (máx. 5), cambiá la meta, pausá el monitoreo o configurá el canal/DM/webhook de alerta.\n' +
        '> • **Calculadoras:** Calculá descuentos de Cashback de grupo (40%), Roblox Plus (10% / 20%) y Precios Regionales.\n' +
        '-# 💬 Por mención: `@Kortex` o `@Kortex roblox`'
    ));

    container.addSeparatorComponents(separador());

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '### 🏓 `/ping`\n' +
        'Comprueba el estado técnico y la conexión del bot en tiempo real:\n' +
        '> • Muestra la **latencia de respuesta** (`ms`) y el ping del **WebSocket** con la API de Discord.\n' +
        '> • Indica el **tiempo activo** (*uptime*), servidores conectados y consumo de **RAM**.\n' +
        '-# 💬 Por mención: `@Kortex ping`'
    ));

    container.addSeparatorComponents(separador());

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '### 📖 `/help`\n' +
        'Muestra este panel con la lista y explicación de todos los comandos del bot.\n' +
        '-# 💬 Por mención: `@Kortex help` o `@Kortex ayuda`'
    ));

    container.addSeparatorComponents(separador());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Usá / en el chat o mencioná a @Kortex para ejecutar cualquier comando')
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