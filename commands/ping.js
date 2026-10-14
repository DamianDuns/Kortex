// ==========================================
// ARCHIVO: commands/ping.js
// ==========================================

const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const { COLORES, footer, separador, boton, formatearUptime } = require('../utils/ui');

function evaluarLatencia(ms) {
    if (ms < 0) return { emoji: '⚪', texto: 'Midiendo...', color: COLORES.neutro };
    if (ms < 200) return { emoji: '🟢', texto: 'Excelente', color: COLORES.exito };
    if (ms < 400) return { emoji: '🟡', texto: 'Estable', color: COLORES.alerta };
    return { emoji: '🔴', texto: 'Lenta', color: COLORES.error };
}

/**
 * Construye el panel de estado del bot.
 * @param {import('discord.js').Client} client
 * @param {number} latenciaRespuesta ms entre el mensaje del usuario y la respuesta
 */
function construirPanelPing(client, latenciaRespuesta) {
    const wsPing = client.ws.ping;
    const peor = Math.max(latenciaRespuesta, wsPing);
    const estado = evaluarLatencia(peor);

    const ramMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    const uptime = formatearUptime(client.uptime || 0);
    const servidores = client.guilds.cache.size;
    const ahora = Math.floor(Date.now() / 1000);

    const container = new ContainerBuilder().setAccentColor(estado.color);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '## 🏓 Pong!\n' +
        `Estado de la conexión: ${estado.emoji} **${estado.texto}**`
    ));

    container.addSeparatorComponents(separador());

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> ⚡ **Respuesta:** \`${latenciaRespuesta}ms\`\n` +
        `> 🌐 **WebSocket (API):** \`${wsPing < 0 ? '—' : `${wsPing}ms`}\`\n` +
        `> ⏱️ **Uptime:** \`${uptime}\`\n` +
        `> 🖥️ **Servidores:** \`${servidores}\`  •  💾 **RAM:** \`${ramMB} MB\``
    ));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_ping_refresh', 'Actualizar', '🔄', ButtonStyle.Secondary),
            boton('btn_nav_main_menu', 'Abrir Hub', '⚡', ButtonStyle.Primary)
        )
    );

    container.addSeparatorComponents(separador());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(`Actualizado <t:${ahora}:R>`)));

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Muestra la latencia y el estado del bot.'),

    construirPanelPing,

    async execute(interaction) {
        const latencia = Math.max(0, Date.now() - interaction.createdTimestamp);
        await interaction.reply(construirPanelPing(interaction.client, latencia));
    },
};
