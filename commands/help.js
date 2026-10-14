// ==========================================
// ARCHIVO: commands/help.js
// ==========================================

const {
    SlashCommandBuilder,
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const { COLORES, footer, separador, boton } = require('../utils/ui');

function construirPanelHelp(client) {
    const container = new ContainerBuilder().setAccentColor(COLORES.primario);

    // Encabezado con el avatar del bot a la derecha
    const header = new TextDisplayBuilder().setContent(
        '# 📖 Guía de Kortex\n' +
        'Tu asistente para la **economía de Roblox**: rastreá precios, recibí alertas ' +
        'y calculá descuentos sin salir de Discord.'
    );
    const avatar = client.user?.displayAvatarURL({ size: 256 });
    if (avatar) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(header)
                .setThumbnailAccessory(thumb => thumb.setURL(avatar))
        );
    } else {
        container.addTextDisplayComponents(header);
    }

    container.addSeparatorComponents(separador(true));

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '### ⌨️ Comandos\n' +
        '> `/roblox` — Abre el **Hub** con todas las herramientas.\n' +
        '> `/ping` — Estado del bot: latencia, uptime y recursos.\n' +
        '> `/help` — Muestra esta guía.'
    ));

    container.addSeparatorComponents(separador());

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '### 🎯 Price Sniper\n' +
        'Seguí hasta **5 objetos** (👕 Catálogo y Limiteds, 🎫 Gamepasses, 🔌 Plugins y 🎮 Accesos Pagos). ' +
        'Te aviso por **DM**, **canal** o **webhook** cuando el precio baja o llega a tu meta.\n\n' +
        '### 🧮 Calculadoras\n' +
        'Simulá el **cashback de grupo (40%)**, los descuentos de **Roblox Plus (10% / 20%)** ' +
        'y los **precios regionales** por país.'
    ));

    container.addSeparatorComponents(separador());

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '### 💡 Atajos por mención\n' +
        '`@Kortex` abre el Hub  •  `@Kortex ping`  •  `@Kortex ayuda`'
    ));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_nav_main_menu', 'Abrir Hub', '⚡', ButtonStyle.Primary),
            boton('btn_quick_sniper', 'Añadir Objeto', '🎯', ButtonStyle.Success),
            boton('btn_quick_calc', 'Calculadoras', '🧮'),
            boton('btn_ping_refresh', 'Estado', '📡')
        )
    );

    container.addSeparatorComponents(separador());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footer('Roblox Economy & Price Sniper')));

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Guía de comandos y herramientas disponibles en Kortex'),

    construirPanelHelp,

    // Funciona tanto con interacciones (/help) como con mensajes (@Kortex ayuda)
    async execute(interaction) {
        await interaction.reply(construirPanelHelp(interaction.client));
    }
};