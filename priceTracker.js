// ==========================================
// ARCHIVO: services/priceTracker.js
// ==========================================

const supabase = require('../db');
const { obtenerDetallesCompletos } = require('../utils/roblox');
const logger = require('../utils/logger');
const { 
    ContainerBuilder, 
    SectionBuilder, 
    TextDisplayBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    MessageFlags 
} = require('discord.js');
const axios = require('axios');

const delay = ms => new Promise(res => setTimeout(res, ms));

function dividirEnLotes(array, tamano) {
    const lotes = [];
    for (let i = 0; i < array.length; i += tamano) {
        lotes.push(array.slice(i, i + tamano));
    }
    return lotes;
}

async function procesarItem(client, item, stats) {
    const type = (item.item_type || 'catalog').toLowerCase();
    const detalles = await obtenerDetallesCompletos(item.id_objet, type);

    if (!detalles || !detalles.exito) {
        stats.errores++;
        logger.warn(`No se obtuvo información de Roblox para "${item.item_name || 'Objeto'}" (ID: ${item.id_objet})`);
        return;
    }

    if (detalles.sinVendedores) {
        stats.sinVendedores++;
        return;
    }

    const precioNuevo = parseFloat(detalles.precio);
    const precioAnterior = parseFloat(item.last_price);
    const targetPrice = (item.target_price !== null && item.target_price !== undefined)
        ? parseFloat(item.target_price)
        : null;

    if (isNaN(precioNuevo) || isNaN(precioAnterior)) {
        stats.errores++;
        return;
    }

    if (precioNuevo !== precioAnterior) {
        stats.cambios++;
        const esUSD = type === 'plugin' || (type === 'paid_access' && detalles.esUSD === true);
        const simbolo = esUSD ? '$' : '';
        const sufijo = esUSD ? ' USD' : ' Robux';

        const fmtAnterior = `${simbolo}${esUSD ? precioAnterior.toFixed(2) : precioAnterior.toLocaleString('es-AR')}${sufijo}`;
        const fmtNuevo = `${simbolo}${esUSD ? precioNuevo.toFixed(2) : precioNuevo.toLocaleString('es-AR')}${sufijo}`;
        const fmtTarget = targetPrice !== null 
            ? `${simbolo}${esUSD ? targetPrice.toFixed(2) : targetPrice.toLocaleString('es-AR')}${sufijo}` 
            : 'Sin meta';

        const diferencia = precioNuevo - precioAnterior;
        const bajoPrecio = diferencia < 0;
        const difAbs = Math.abs(diferencia);
        const difTexto = `${bajoPrecio ? '-' : '+'}${simbolo}${esUSD ? difAbs.toFixed(2) : difAbs.toLocaleString('es-AR')}${sufijo}`;

        const iconoCambio = bajoPrecio ? '🟢 BAJÓ' : '🔴 SUBIÓ';
        logger.sniper(`${iconoCambio} │ "${item.item_name}" (ID: ${item.id_objet}): ${fmtAnterior} ➔ ${fmtNuevo} (${difTexto})`);

        const { error: updateError } = await supabase
            .from('roblox_wishlist')
            .update({ last_price: precioNuevo })
            .eq('id', item.id);

        if (updateError) {
            stats.errores++;
            logger.error(`DB UPDATE ID ${item.id}`, updateError.message);
            return;
        }

        const sinMeta = targetPrice === null;
        const alcanzoMeta = targetPrice !== null && precioNuevo <= targetPrice;

        if (sinMeta || alcanzoMeta || bajoPrecio) {
            let notificado = false;
            let medioNotificacion = '';

            let robloxUrl = `https://www.roblox.com/catalog/${item.id_objet}`;
            if (type === 'gamepass') {
                robloxUrl = `https://www.roblox.com/game-pass/${item.id_objet}`;
            } else if (type === 'plugin') {
                robloxUrl = `https://create.roblox.com/store/asset/${item.id_objet}`;
            } else if (type === 'paid_access') {
                robloxUrl = `https://www.roblox.com/games/${item.id_objet}`;
            }

            // 1. WEBHOOK (Embed tradicional 100% compatible)
            if (item.webhook_url) {
                try {
                    await axios.post(item.webhook_url, {
                        content: `<@${item.user_id}>`,
                        embeds: [{
                            title: `${bajoPrecio ? '🟢 ¡Bajó de Precio!' : '🔴 Cambio de Precio'}: ${detalles.nombre}`,
                            url: robloxUrl,
                            description: `> **Variación:** \`${fmtAnterior}\` ➔ **\`${fmtNuevo}\`** (\`${difTexto}\`)

` +
                                `• 🎯 **Meta:** \`${fmtTarget}\`
` +
                                `• 📁 **Categoría:** \`${type.toUpperCase()}\`
` +
                                `• 🆔 **ID:** \`${item.id_objet}\``,
                            color: bajoPrecio ? 0x00FF88 : 0xFF3366,
                            thumbnail: detalles.imagenUrl ? { url: detalles.imagenUrl } : undefined,
                            footer: { text: 'Kortex • Roblox Price Sniper' },
                            timestamp: new Date().toISOString()
                        }]
                    });
                    notificado = true;
                    medioNotificacion = 'Webhook';
                } catch (whErr) {
                    logger.error(`WEBHOOK ID ${item.id}`, whErr.message);
                }
            }

            // CONSTRUCTOR DE ALERTA COMPONENTS V2 (PRO)
            const construirAlertaV2 = (incluirPing = false) => {
                const headerEmoji = bajoPrecio ? '🟢 ¡Bajó de Precio!' : '🔴 Cambio de Precio';
                const tagPing = incluirPing ? `<@${item.user_id}>\n` : '';

                const textoAlerta = new TextDisplayBuilder().setContent(
                    `${tagPing}` +
                    `## ${headerEmoji} — ${detalles.nombre}\n` +
                    `> **Variación:** \`${fmtAnterior}\` ➔ **\`${fmtNuevo}\`** (\`${difTexto}\`)\n\n` +
                    `• 🎯 **Meta:** \`${fmtTarget}\`\n` +
                    `• 📁 **Categoría:** \`${type.toUpperCase()}\`\n` +
                    `• 👀 **Monitoreo:** ⚡ Activo\n` +
                    `• 🆔 **ID:** \`${item.id_objet}\``
                );

                const container = new ContainerBuilder();

                if (detalles.imagenUrl) {
                    const section = new SectionBuilder()
                        .addTextDisplayComponents(textoAlerta)
                        .setThumbnailAccessory(thumb => thumb.setURL(detalles.imagenUrl));
                    container.addSectionComponents(section);
                } else {
                    container.addTextDisplayComponents(textoAlerta);
                }

                container.addSeparatorComponents(sep => sep.setDivider(true));

                const rowAction = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Ver en Roblox')
                        .setEmoji('🔗')
                        .setStyle(ButtonStyle.Link)
                        .setURL(robloxUrl),
                    new ButtonBuilder()
                        .setCustomId(`btn_pause_item_${item.id}`)
                        .setLabel('Pausar')
                        .setEmoji('⏸️')
                        .setStyle(ButtonStyle.Secondary)
                );

                return { container, rowAction };
            };

            // 2. CANAL DE SERVIDOR
            if (!notificado && item.channel_id) {
                try {
                    const canal = await client.channels.fetch(item.channel_id);
                    if (canal && canal.isTextBased()) {
                        const { container, rowAction } = construirAlertaV2(true);

                        await canal.send({
                            components: [container, rowAction],
                            flags: MessageFlags.IsComponentsV2
                        });
                        notificado = true;
                        medioNotificacion = `Canal #${canal.name}`;
                    }
                } catch (chanErr) {
                    logger.error(`CANAL ${item.channel_id}`, chanErr.message);
                }
            }

            // 3. DM (Mensaje Directo)
            if (!notificado) {
                try {
                    const user = await client.users.fetch(item.user_id);
                    const { container, rowAction } = construirAlertaV2(false);

                    await user.send({ 
                        components: [container, rowAction], 
                        flags: MessageFlags.IsComponentsV2 
                    });
                    notificado = true;
                    medioNotificacion = `DM (${user.tag})`;
                } catch (dmErr) {
                    logger.error(`DM ${item.user_id}`, dmErr.message);
                }
            }

            if (notificado) {
                stats.alertas++;
                logger.ok(`Alerta enviada vía ${medioNotificacion} para "${item.item_name}"`);
            }
        }
    } else {
        stats.sinCambios++;
    }
}

let escaneoEnCurso = false;
let intervaloMonitoreo = null;

async function revisarPrecios(client) {
    if (escaneoEnCurso) {
        logger.warn('El escaneo anterior sigue en curso. Salteando este ciclo.');
        return;
    }
    escaneoEnCurso = true;
    const inicio = Date.now();

    try {
        const { data: items, error } = await supabase
            .from('roblox_wishlist')
            .select('*')
            .eq('is_paused', false);

        if (error) {
            logger.error('MONITOREO SUPABASE', error.message);
            return;
        }

        if (!items || items.length === 0) {
            logger.sniper('Escaneo omitido: no hay objetos activos en seguimiento.');
            return;
        }

        const stats = {
            total: items.length,
            sinCambios: 0,
            cambios: 0,
            alertas: 0,
            sinVendedores: 0,
            errores: 0
        };

        const CHUNK_SIZE = 5;
        const lotes = dividirEnLotes(items, CHUNK_SIZE);

        for (const lote of lotes) {
            await Promise.allSettled(lote.map(item => procesarItem(client, item, stats)));
            await delay(1200);
        }

        const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
        const { c } = logger;
        logger.sniper(
            `Ciclo completado en ${c.bold}${segundos}s${c.reset} │ ` +
            `Total: ${c.white}${stats.total}${c.reset} │ ` +
            `Sin cambios: ${c.gray}${stats.sinCambios}${c.reset} │ ` +
            `Cambios: ${stats.cambios > 0 ? c.yellow + stats.cambios + c.reset : stats.cambios} │ ` +
            `Alertas: ${stats.alertas > 0 ? c.green + stats.alertas + c.reset : stats.alertas}` +
            (stats.sinVendedores > 0 ? ` │ Sin stock: ${stats.sinVendedores}` : '') +
            (stats.errores > 0 ? ` │ ${c.red}Errores: ${stats.errores}${c.reset}` : '')
        );
    } catch (err) {
        logger.error('PRICE TRACKER FATAL', err);
    } finally {
        escaneoEnCurso = false;
    }
}

function iniciarMonitoreo(client, intervaloMinutos = 5) {
    if (intervaloMonitoreo) return;

    const minutos = Number(intervaloMinutos) > 0 ? Number(intervaloMinutos) : 5;
    const ms = minutos * 60 * 1000;
    revisarPrecios(client);
    intervaloMonitoreo = setInterval(() => revisarPrecios(client), ms);
}

module.exports = { iniciarMonitoreo, revisarPrecios };
