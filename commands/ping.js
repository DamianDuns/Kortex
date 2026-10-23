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
const { leerEstadoRecursos } = require('../src/utils/performanceManager');

function evaluarLatencia(ms) {
    if (ms < 0) return { emoji: '⚪', texto: 'Midiendo...', color: COLORES.neutro };
    if (ms < 200) return { emoji: '🟢', texto: 'Excelente', color: COLORES.exito };
    if (ms < 400) return { emoji: '🟡', texto: 'Estable', color: COLORES.alerta };
    return { emoji: '🔴', texto: 'Lenta', color: COLORES.error };
}

/**
 * Obtiene el desglose real de memoria del proceso Node.js y del contenedor/servidor de cualquier plataforma de hosting.
 */
function obtenerMemoriaDetallada() {
    const estado = leerEstadoRecursos();
    return {
        rssMB: estado.rssMB.toFixed(1),
        heapUsadoMB: estado.heapUsadoMB.toFixed(1),
        heapTotalMB: estado.heapTotalMB.toFixed(1),
        nativoCanvasMB: estado.nativoCanvasMB.toFixed(1),
        hostUsadaMB: estado.hostUsadaMB.toFixed(1),
        hostLimiteMB: estado.hostLimiteMB ? estado.hostLimiteMB.toFixed(1) : null,
        porcentajeUso: estado.pctHost ? estado.pctHost.toFixed(1) : null
    };
}

/**
 * Construye el panel de estado del bot (/ping).
 * @param {import('discord.js').Client} client
 * @param {number} latenciaRespuesta ms entre el mensaje del usuario y la respuesta
 */
function construirPanelPing(client, latenciaRespuesta) {
    const wsPing = client.ws.ping;
    const peor = Math.max(latenciaRespuesta, wsPing);
    const estado = evaluarLatencia(peor);

    const mem = obtenerMemoriaDetallada();
    const uptime = formatearUptime(client.uptime || 0);
    const servidores = client.guilds.cache.size;
    const ahora = Math.floor(Date.now() / 1000);

    const container = new ContainerBuilder().setAccentColor(estado.color);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '## 🏓 Pong!\n' +
        `Estado de la conexión: ${estado.emoji} **${estado.texto}**`
    ));

    container.addSeparatorComponents(separador());

    const detalleLimiteHost = mem.hostLimiteMB
        ? ` / \`${mem.hostLimiteMB} MB\` *(${mem.porcentajeUso}%)*`
        : '';

    const lineaHost = `\n> 📦 **RAM Contenedor / Host:** \`${mem.hostUsadaMB} MB\`${detalleLimiteHost}`;

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> ⚡ **Respuesta:** \`${latenciaRespuesta}ms\`\n` +
        `> 🌐 **WebSocket (API):** \`${wsPing < 0 ? '—' : `${wsPing}ms`}\`\n` +
        `> ⏱️ **Uptime:** \`${uptime}\`  •  🖥️ **Servidores:** \`${servidores}\`\n` +
        `> 💾 **RAM Proceso (Bot):** \`${mem.rssMB} MB\` *(JS: \`${mem.heapUsadoMB} MB\` • Canvas/Caché: \`${mem.nativoCanvasMB} MB\`)*` +
        lineaHost
    ));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_ping_refresh', 'Actualizar', '🔄', ButtonStyle.Secondary)
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
        .setDescription('Muestra la latencia, el estado del bot y el consumo de RAM del proceso y del servidor.'),

    construirPanelPing,

    async execute(interaction) {
        const latencia = Math.max(0, Date.now() - interaction.createdTimestamp);
        await interaction.reply(construirPanelPing(interaction.client, latencia));
    },
};
