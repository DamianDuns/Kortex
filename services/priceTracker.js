// ==========================================
// ARCHIVO: services/priceTracker.js
// ==========================================

const supabase = require('../db');
const PriceItem = require('../models/PriceItem');
const { generatePriceChart } = require('../utils/chartGenerator');
const { obtenerDetallesCompletos, obtenerMiniaturasBatch, obtenerUrlRoblox } = require('../utils/roblox');
const { COLORES, EMOJI_TIPO, NOMBRE_TIPO, EMOJI_ROBUX, footer, separador, boton, formatearPrecio, formatearPrecioTexto } = require('../utils/ui');
const logger = require('../utils/logger');
const { 
    ContainerBuilder, 
    SectionBuilder, 
    TextDisplayBuilder, 
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    AttachmentBuilder,
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

    // Registrar en Supabase con Delta Logging (si el historial estaba vacío y hubo cambio,
    // inserta primero previousPrice y luego newPrice para garantizar mínimo 2 puntos)
    const priceRecord = await PriceItem.recordPrice(
        item.id_objet,
        detalles.nombre || item.item_name,
        precioNuevo,
        {
            previousPrice: precioAnterior,
            existingHistory: item.price_history,
            createdAt: item.created_at
        }
    ).catch(() => null);

    if (precioNuevo !== precioAnterior) {
        stats.cambios++;
        const esUSD = type === 'plugin' || (type === 'paid_access' && detalles.esUSD === true);

        const fmtAnterior = formatearPrecio(precioAnterior, esUSD);
        const fmtNuevo = formatearPrecio(precioNuevo, esUSD);
        const fmtTarget = targetPrice !== null 
            ? formatearPrecio(targetPrice, esUSD)
            : '`Sin meta (avisa todo cambio)`';

        const diferencia = precioNuevo - precioAnterior;
        const bajoPrecio = diferencia < 0;
        const difAbs = Math.abs(diferencia);
        const signo = bajoPrecio ? '-' : '+';
        const difTexto = esUSD
            ? `\`${signo}$${difAbs.toFixed(2)} USD\``
            : `\`${signo}${difAbs.toLocaleString('es-AR')}\` ${EMOJI_ROBUX}`;
        const difTextoPlano = `${signo}${formatearPrecioTexto(difAbs, esUSD)}`;

        let porcentajeStr = '';
        if (precioAnterior > 0) {
            const pct = ((diferencia / precioAnterior) * 100).toFixed(1).replace('.0', '');
            porcentajeStr = ` • \`${bajoPrecio ? '' : '+'}${pct}%\``;
        }

        const iconoCambio = bajoPrecio ? '🟢 BAJÓ' : '🔴 SUBIÓ';
        logger.sniper(`${iconoCambio} │ "${item.item_name}" (ID: ${item.id_objet}): ${formatearPrecioTexto(precioAnterior, esUSD)} ➔ ${formatearPrecioTexto(precioNuevo, esUSD)} (${difTextoPlano})`);

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

            const robloxUrl = obtenerUrlRoblox(item.id_objet, type);
            const emojiCat = EMOJI_TIPO[type] || '📦';
            const nombreCat = NOMBRE_TIPO[type] || type.toUpperCase();
            const nombreObj = detalles.nombre || item.item_name || `Objeto ${item.id_objet}`;

            let tituloEstado = '📉 ¡Bajó de Precio!';
            let subtituloWebhook = '🟢 **¡El precio acaba de bajar en Roblox!**';
            let colorAlerta = COLORES.lista;

            if (alcanzoMeta) {
                tituloEstado = '🎯 ¡Meta de Precio Alcanzada!';
                subtituloWebhook = '🎯 **¡El objeto llegó al precio objetivo que configuraste!**';
                colorAlerta = COLORES.exito;
            } else if (!bajoPrecio) {
                tituloEstado = '📈 Subió de Precio';
                subtituloWebhook = '🔔 **Se detectó un aumento de precio en este objeto.**';
                colorAlerta = COLORES.sniper;
            }

            // Generar el Buffer de la gráfica en RAM con el historial actualizado (mínimo 2 puntos garantizados)
            const statsGrafica = PriceItem.filterHistoryAndStats(
                priceRecord?.history || [
                    { price: precioAnterior, timestamp: new Date(Date.now() - 5 * 60 * 1000) },
                    { price: precioNuevo, timestamp: new Date() }
                ],
                '7d',
                precioNuevo
            );
            const chartBuffer = await generatePriceChart(statsGrafica.filtered, nombreObj, {
                itemId: item.id_objet,
                daysRange: '7d',
                esUSD,
                targetPrice
            });

            // 1. WEBHOOK (Embed clásico adaptado con estética similar al panel V2)
            if (item.webhook_url) {
                try {
                    await axios.post(item.webhook_url, {
                        content: `🔔 <@${item.user_id}>`,
                        embeds: [{
                            author: {
                                name: '⚡ KORTEX PRICE SNIPER  •  ALERTA DE PRECIO'
                            },
                            title: tituloEstado,
                            url: robloxUrl,
                            description:
                                `## ${emojiCat} __**${nombreObj}**__\n` +
                                `${subtituloWebhook}\n\n` +
                                `> ${EMOJI_ROBUX} **Nuevo precio:** **${fmtNuevo}**  *(${difTexto}${porcentajeStr})*\n` +
                                `> 📉 **Precio anterior:** ~~${fmtAnterior}~~\n` +
                                `> 🎯 **Tu meta:** ${fmtTarget}${alcanzoMeta ? '  ✅' : ''}\n\n` +
                                `──────────────────────────────\n` +
                                `📦 **Categoría:** ${emojiCat} ${nombreCat}   •   🆔 **ID:** \`${item.id_objet}\`\n` +
                                `🔗 **[Abrir objeto en Roblox ↗](${robloxUrl})**`,
                            color: colorAlerta,
                            thumbnail: detalles.imagenUrl ? { url: detalles.imagenUrl } : undefined,
                            footer: { text: '⚡ Kortex  •  Monitoreo automático de precios' },
                            timestamp: new Date().toISOString()
                        }]
                    });
                    notificado = true;
                    medioNotificacion = 'Webhook';
                } catch (whErr) {
                    logger.error(`WEBHOOK ID ${item.id}`, whErr.message);
                }
            }

            // CONSTRUCTOR DE ALERTA COMPONENTS V2 CON GRÁFICA INCRUSTADA (Canal y DM)
            const construirAlertaV2 = (incluirPing = false) => {
                const lineaPing = incluirPing ? `-# 🔔 Alerta para <@${item.user_id}>\n` : '';
                const attachment = new AttachmentBuilder(chartBuffer, { name: 'chart.png' });

                const textoAlerta = new TextDisplayBuilder().setContent(
                    `${lineaPing}` +
                    `# ${tituloEstado}\n` +
                    `## ${emojiCat} __**${nombreObj}**__\n` +
                    `-# ${emojiCat} Categoría: **${nombreCat}**  •  ID \`${item.id_objet}\`\n\n` +
                    `> ${EMOJI_ROBUX} **Nuevo precio:** **${fmtNuevo}**  *(${difTexto}${porcentajeStr})*\n` +
                    `> 📉 **Precio anterior:** ~~${fmtAnterior}~~\n` +
                    `> 🎯 **Tu meta:** ${fmtTarget}${alcanzoMeta ? '  ✅' : ''}`
                );

                const container = new ContainerBuilder()
                    .setAccentColor(colorAlerta);

                if (detalles.imagenUrl) {
                    const section = new SectionBuilder()
                        .addTextDisplayComponents(textoAlerta)
                        .setThumbnailAccessory(thumb => thumb.setURL(detalles.imagenUrl));
                    container.addSectionComponents(section);
                } else {
                    container.addTextDisplayComponents(textoAlerta);
                }

                container.addSeparatorComponents(separador());
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL('attachment://chart.png')
                    )
                );
                container.addSeparatorComponents(separador(true));

                const rowAction = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Ver en Roblox')
                        .setEmoji('🔗')
                        .setStyle(ButtonStyle.Link)
                        .setURL(robloxUrl),
                    boton(`btn_pause_item_${item.id}`, 'Pausar Alertas', '⏸️', ButtonStyle.Secondary)
                );

                container.addActionRowComponents(rowAction);
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(footer('Kortex Price Sniper • Alerta en tiempo real'))
                );

                return {
                    components: [container],
                    files: [attachment],
                    flags: MessageFlags.IsComponentsV2
                };
            };

            // 2. CANAL DE SERVIDOR
            if (!notificado && item.channel_id) {
                try {
                    const canal = await client.channels.fetch(item.channel_id);
                    if (canal && canal.isTextBased()) {
                        await canal.send(construirAlertaV2(true));
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
                    await user.send(construirAlertaV2(false));
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

/**
 * Envía una alerta de prueba al destino configurado del objeto (Webhook, Canal o DM).
 */
async function enviarAlertaPrueba(client, item) {
    const type = (item.item_type || 'catalog').toLowerCase();
    const esUSD = type === 'plugin';
    const emojiCat = EMOJI_TIPO[type] || '📦';
    const nombreCat = NOMBRE_TIPO[type] || type.toUpperCase();

    const [miniaturas, priceRecord] = await Promise.all([
        obtenerMiniaturasBatch([item]).catch(() => new Map()),
        PriceItem.getOrInitItem(item).catch(() => null)
    ]);
    const imagenUrl = miniaturas.get(String(item.id_objet)) || null;

    const fmtActual = formatearPrecio(item.last_price, esUSD);
    const tieneMeta = item.target_price !== null && item.target_price !== undefined;
    const fmtTarget = tieneMeta
        ? formatearPrecio(item.target_price, esUSD)
        : '`Sin meta (avisa todo cambio)`';

    const robloxUrl = obtenerUrlRoblox(item.id_objet, type);
    const nombre = item.item_name || `Objeto ${item.id_objet}`;

    const statsGrafica = PriceItem.filterHistoryAndStats(priceRecord?.history || [], '7d', item.last_price);
    const chartBuffer = await generatePriceChart(statsGrafica.filtered, nombre, {
        itemId: item.id_objet,
        daysRange: '7d',
        esUSD,
        targetPrice: item.target_price
    });

    // 1. Webhook (Embed clásico adaptado al estilo V2)
    if (item.webhook_url) {
        const destino = 'tu **Webhook**';
        try {
            await axios.post(item.webhook_url, {
                content: `🔔 <@${item.user_id}>`,
                embeds: [{
                    author: {
                        name: '⚡ KORTEX PRICE SNIPER  •  PRUEBA DE CONEXIÓN'
                    },
                    title: '🔔 Alerta de Prueba Exitosa',
                    url: robloxUrl,
                    description:
                        `## ${emojiCat} __**${nombre}**__\n` +
                        `✅ **¡Tu Webhook está conectado!** Así se verán las alertas cuando este objeto baje o cambie de precio.\n\n` +
                        `> ${EMOJI_ROBUX} **Precio actual:** **${fmtActual}**\n` +
                        `> 🎯 **Meta objetivo:** ${fmtTarget}\n` +
                        `> 📡 **Destino:** 🌐 Webhook activo\n\n` +
                        `──────────────────────────────\n` +
                        `📦 **Categoría:** ${emojiCat} ${nombreCat}   •   🆔 **ID:** \`${item.id_objet}\`\n` +
                        `🔗 **[Abrir objeto en Roblox ↗](${robloxUrl})**`,
                    color: COLORES.primario,
                    thumbnail: imagenUrl ? { url: imagenUrl } : undefined,
                    footer: { text: '⚡ Kortex  •  Prueba de notificación' },
                    timestamp: new Date().toISOString()
                }]
            });
            return { ok: true, destino, medio: destino };
        } catch (err) {
            return { ok: false, destino, error: `No se pudo enviar al Webhook (${err.message}). Verificá que la URL siga activa.` };
        }
    }

    const construirPruebaV2 = (incluirPing = false, etiquetaDestino = '💬 Mensaje Directo (DM)') => {
        const lineaPing = incluirPing ? `-# 🔔 Alerta de prueba para <@${item.user_id}>\n` : '';
        const attachment = new AttachmentBuilder(chartBuffer, { name: 'chart.png' });

        const texto = new TextDisplayBuilder().setContent(
            `${lineaPing}` +
            `# 🔔 Alerta de Prueba\n` +
            `## ${emojiCat} __**${nombre}**__\n` +
            `-# ${emojiCat} Categoría: **${nombreCat}**  •  ID \`${item.id_objet}\`\n\n` +
            `> ✅ **¡Conexión lista!** Recibirás las notificaciones de este objeto por este medio apenas cambie su precio.\n\n` +
            `${EMOJI_ROBUX} **Precio actual:** ${fmtActual}  •  🎯 **Meta:** ${fmtTarget}\n` +
            `📡 **Destino verificado:** ${etiquetaDestino}`
        );

        const container = new ContainerBuilder()
            .setAccentColor(COLORES.primario);

        if (imagenUrl) {
            const section = new SectionBuilder()
                .addTextDisplayComponents(texto)
                .setThumbnailAccessory(thumb => thumb.setURL(imagenUrl));
            container.addSectionComponents(section);
        } else {
            container.addTextDisplayComponents(texto);
        }

        container.addSeparatorComponents(separador());
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://chart.png')
            )
        );
        container.addSeparatorComponents(separador(true));

        const btnPausaPrueba = item.is_paused
            ? boton(`btn_resume_item_${item.id}`, 'Reanudar Alertas', '▶️', ButtonStyle.Success)
            : boton(`btn_pause_item_${item.id}`, 'Pausar Alertas', '⏸️', ButtonStyle.Secondary);

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Ver en Roblox')
                    .setEmoji('🔗')
                    .setStyle(ButtonStyle.Link)
                    .setURL(robloxUrl),
                btnPausaPrueba
            )
        );

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(footer('Kortex Price Sniper • Prueba de notificación'))
        );

        return {
            components: [container],
            files: [attachment],
            flags: MessageFlags.IsComponentsV2
        };
    };

    // 2. Canal de servidor
    if (item.channel_id) {
        const destino = `el canal <#${item.channel_id}>`;
        try {
            const canal = await client.channels.fetch(item.channel_id);
            if (!canal || !canal.isTextBased()) {
                return { ok: false, destino, error: 'El canal configurado ya no existe o no es de texto.' };
            }
            await canal.send(construirPruebaV2(true, `📢 <#${canal.id}>`));
            return { ok: true, destino, medio: destino };
        } catch (err) {
            return { ok: false, destino, error: `No pude enviar mensajes en <#${item.channel_id}> (${err.message}). Revisá mis permisos.` };
        }
    }

    // 3. DM
    const destino = 'tus **Mensajes Directos (DM)**';
    try {
        const user = await client.users.fetch(item.user_id);
        await user.send(construirPruebaV2(false, '💬 Mensaje Directo (DM)'));
        return { ok: true, destino, medio: destino };
    } catch {
        return { ok: false, destino, error: 'No pude enviarte un DM. Asegurate de tener habilitados los mensajes directos de miembros del servidor.' };
    }
}

module.exports = { iniciarMonitoreo, revisarPrecios, enviarAlertaPrueba };
