// ==========================================
// ARCHIVO: commands/ping.js
// ==========================================

const fs = require('fs');
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
 * Obtiene el desglose real de memoria del proceso Node.js y del contenedor Linux (Railway).
 */
function obtenerMemoriaDetallada() {
    const mem = process.memoryUsage();
    const aMB = (bytes) => (bytes / 1024 / 1024).toFixed(1);

    const rssMB = aMB(mem.rss);
    const heapUsadoMB = aMB(mem.heapUsed);
    const heapTotalMB = aMB(mem.heapTotal);
    const nativoCanvasMB = aMB((mem.external || 0) + (mem.arrayBuffers || 0));

    // Lectura opcional de cgroups en Linux (Railway / Docker) para coincidir con el panel de Railway
    let contenedorMB = null;
    try {
        if (fs.existsSync('/sys/fs/cgroup/memory.current')) {
            const raw = fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim();
            const bytes = Number(raw);
            if (Number.isFinite(bytes) && bytes > 0) {
                contenedorMB = aMB(bytes);
            }
        } else if (fs.existsSync('/sys/fs/cgroup/memory/memory.usage_in_bytes')) {
            const raw = fs.readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8').trim();
            const bytes = Number(raw);
            if (Number.isFinite(bytes) && bytes > 0) {
                contenedorMB = aMB(bytes);
            }
        }
    } catch {
        contenedorMB = null;
    }

    return {
        rssMB,
        heapUsadoMB,
        heapTotalMB,
        nativoCanvasMB,
        contenedorMB
    };
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

    const lineaContenedor = mem.contenedorMB
        ? `\n> 📦 **Contenedor (Railway):** \`${mem.contenedorMB} MB\``
        : '';

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> ⚡ **Respuesta:** \`${latenciaRespuesta}ms\`\n` +
        `> 🌐 **WebSocket (API):** \`${wsPing < 0 ? '—' : `${wsPing}ms`}\`\n` +
        `> ⏱️ **Uptime:** \`${uptime}\`  •  🖥️ **Servidores:** \`${servidores}\`\n` +
        `> 💾 **RAM Proceso (RSS):** \`${mem.rssMB} MB\` *(JS: \`${mem.heapUsadoMB} MB\` • Canvas/Caché: \`${mem.nativoCanvasMB} MB\`)*` +
        lineaContenedor
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
        .setDescription('Muestra la latencia, el estado del bot y el consumo real de RAM.'),

    construirPanelPing,

    async execute(interaction) {
        const latencia = Math.max(0, Date.now() - interaction.createdTimestamp);
        await interaction.reply(construirPanelPing(interaction.client, latencia));
    },
};
