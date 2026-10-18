// ==========================================
// ARCHIVO: utils/ui.js
// Tema visual compartido para todos los paneles (Components V2)
// ==========================================

const { ButtonBuilder, ButtonStyle, SeparatorSpacingSize } = require('discord.js');

// Paleta de colores de acento (barra lateral de cada panel)
const COLORES = {
    primario: 0x5865F2, // Blurple: Hub, ayuda
    sniper: 0xFF6B35,   // Naranja: Price Sniper
    lista: 0x2ECC71,    // Verde: lista de monitoreo
    calc: 0x00B8D9,     // Cian: calculadoras
    exito: 0x57F287,
    alerta: 0xFEE75C,
    error: 0xED4245,
    neutro: 0x4E5058
};

// Emoji por categoría de objeto
const EMOJI_TIPO = {
    catalog: '👕',
    gamepass: '🎫',
    plugin: '🔌',
    paid_access: '🎮'
};

const NOMBRE_TIPO = {
    catalog: 'Catálogo',
    gamepass: 'Gamepass',
    plugin: 'Plugin',
    paid_access: 'Acceso Pago'
};

/** Línea de pie de panel en texto chico y gris. */
function footer(texto) {
    return `-# ⚡ Kortex  •  ${texto}`;
}

/** Separador con línea divisoria. `grande` agrega más espacio vertical. */
function separador(grande = false) {
    return sep => sep
        .setDivider(true)
        .setSpacing(grande ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

/** Espacio vertical sin línea. */
function espacio() {
    return sep => sep.setDivider(false).setSpacing(SeparatorSpacingSize.Small);
}

/** Atajo para crear botones con menos código. */
function boton(customId, label, emoji, style = ButtonStyle.Secondary) {
    const b = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
    if (emoji) b.setEmoji(emoji);
    return b;
}

/** Convierte milisegundos a "2d 3h 15m". */
function formatearUptime(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const partes = [];
    if (d) partes.push(`${d}d`);
    if (h) partes.push(`${h}h`);
    partes.push(`${m}m`);
    return partes.join(' ');
}

const EMOJI_ROBUX = '<:Robux:1547677277590913114>';

/** Formatea un precio con Markdown y el emoji de Robux para paneles y mensajes de Discord. */
function formatearPrecio(valor, esUSD) {
    const n = Number(valor || 0);
    return esUSD ? `\`$${n.toFixed(2)} USD\`` : `\`${n.toLocaleString('es-AR')}\` ${EMOJI_ROBUX}`;
}

/** Formatea un precio en texto plano (para descripciones de menús desplegables o consola). */
function formatearPrecioTexto(valor, esUSD) {
    const n = Number(valor || 0);
    return esUSD ? `$${n.toFixed(2)} USD` : `${n.toLocaleString('es-AR')} Robux`;
}

module.exports = {
    COLORES,
    EMOJI_TIPO,
    NOMBRE_TIPO,
    EMOJI_ROBUX,
    footer,
    separador,
    espacio,
    boton,
    formatearUptime,
    formatearPrecio,
    formatearPrecioTexto
};
