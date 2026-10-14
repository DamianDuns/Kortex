// ==========================================
// ARCHIVO: services/priceTracker.js
// ==========================================

const supabase = require('../db');
const { obtenerDetallesCompletos } = require('../utils/roblox');
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

async function procesarItem(client, item) {
    const type = (item.item_type || 'catalog').toLowerCase();
    const detalles = await obtenerDetallesCompletos(item.id_objet, type);

    if (!detalles || !detalles.exito) {
        console.log(`[PRICE TRACKER] ⚠️ No se obtuvo info para ID ${item.id_objet} (${item.item_name})`);
        return;
    }

    if (detalles.sinVendedores) {
        console.log(`[PRICE TRACKER] ⏳ "${item.item_name}" (ID: ${item.id_objet}) no tiene revendedores activos. Salteando ciclo.`);
        return;
    }

    const precioNuevo = parseFloat(detalles.precio);
    const precioAnterior = parseFloat(item.last_price);
    const targetPrice = (item.target_price !== null && item.target_price !== undefined)
        ? parseFloat(item.target_price)
        : null;

    if (isNaN(precioNuevo) || isNaN(precioAnterior)) return;

    if (precioNuevo !== precioAnterior) {
        console.log(`[CAMBIO DETECTADO] "${item.item_name}" (ID: ${item.id_objet}) | Anterior: ${precioAnterior} | Nuevo: ${precioNuevo}`);

        const { error: updateError } = await supabase
            .from('roblox_wishlist')
            .update({ last_price: precioNuevo })
            .eq('id', item.id);

        if (updateError) {
            console.error(`[DB UPDATE ERROR] ID ${item.id}:`, updateError.message);
            return;
        }

        console.log(`[DB ÉXITO] Precio guardado correctamente para ID ${item.id}`);

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

        const sinMeta = targetPrice === null;
        const alcanzoMeta = targetPrice !== null && precioNuevo <= targetPrice;

        if (sinMeta || alcanzoMeta || bajoPrecio) {
            let notificado = false;

            let robloxUrl = `https://www.roblox.com/catalog/${item.id_objet}`;
            if (type === 'gamepass') {
                robloxUrl = `https://www.roblox.com/game-pass/${item.id_objet}`;
            } else if (type === 'plugin') {
                robloxUrl = `https://create.roblox.com/store/asset/${item.id_objet}`;
            } else if (type === 'paid_access') {
                robloxUrl = `https://www.roblox.com/games/${item.id_objet}`;
            }

            // ==========================================
            // 1. WEBHOOK (Embed tradicional 100% compatible)
            // ==========================================
            if (item.webhook_url) {
                try {
                    await axios.post(item.webhook_url, {
                        content: `<@${item.user_id}>`,
                        embeds: [{
                            title: `${bajoPrecio ? '🟢 ¡Bajó de Precio!' : '🔴 Cambio de Precio'}: ${detalles.nombre}`,
                            url: robloxUrl,
                            description: `> **Variación:** \`${fmtAnterior}\` ➔ **\`${fmtNuevo}\`** (\`${difTexto}\`)\n\n` +
                                `• 🎯 **Meta:** \`${fmtTarget}\`\n` +
                                `• 📁 **Categoría:** \`${type.toUpperCase()}\`\n` +
                                `• 🆔 **ID:** \`${item.id_objet}\``,
                            color: bajoPrecio ? 0x00FF88 : 0xFF3366,
                            thumbnail: detalles.imagenUrl ? { url: detalles.imagenUrl } : undefined,
                            footer: { text: 'Kortex • Roblox Price Sniper' },
                            timestamp: new Date().toISOString()
                        }]
                    });
                    notificado = true;
                    console.log(`[ALERTA ENVIADA] Webhook para ${item.item_name}`);
                } catch (whErr) {
                    console.error(`[ERROR ENVIAR WEBHOOK ${item.id}]:`, whErr.message);
                }
            }

            // ==========================================
            // CONSTRUCTOR DE ALERTA COMPONENTS V2 (PRO)
            // ==========================================
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

            // ==========================================
            // 2. CANAL DE SERVIDOR (Con Ping adentro del v2)
            // ==========================================
            if (!notificado && item.channel_id) {
                try {
                    const canal = await client.channels.fetch(item.channel_id);
                    if (canal && canal.isTextBased()) {
                        // El ping va DENTRO del componente para no romper la API de Discord
                        const { container, rowAction } = construirAlertaV2(true);

                        await canal.send({
                            components: [container, rowAction],
                            flags: MessageFlags.IsComponentsV2
                        });
                        notificado = true;
                        console.log(`[ALERTA ENVIADA] Canal #${canal.name} para ${item.item_name}`);
                    }
                } catch (chanErr) {
                    console.error(`[ERROR ENVIAR CANAL ${item.channel_id}]:`, chanErr.message);
                }
            }

            // ==========================================
            // 3. DM (Mensaje Directo - Solo si no hay canal ni webhook)
            // ==========================================
            if (!notificado) {
                try {
                    const user = await client.users.fetch(item.user_id);
                    const { container, rowAction } = construirAlertaV2(false);

                    await user.send({ 
                        components: [container, rowAction], 
                        flags: MessageFlags.IsComponentsV2 
                    });
                    console.log(`[ALERTA ENVIADA] DM a ${user.tag} para ${item.item_name}`);
                } catch (dmErr) {
                    console.error(`[ERROR ENVIAR DM ${item.user_id}]:`, dmErr.message);
                }
            }
        } else {
            console.log(`[ALERTA OMITIDA] "${item.item_name}" aumentó de precio (${precioAnterior} -> ${precioNuevo}) y supera la meta (${targetPrice}).`);
        }
    } else {
        console.log(`[SIN CAMBIOS] "${item.item_name}" se mantiene en ${precioAnterior}`);
    }
}

let escaneoEnCurso = false;
let intervaloMonitoreo = null;

async function revisarPrecios(client) {
    // Evita que dos escaneos corran a la vez (alertas duplicadas) si uno tarda más que el intervalo
    if (escaneoEnCurso) {
        console.log('[MONITOREO] El escaneo anterior sigue en curso. Salteando este ciclo.');
        return;
    }
    escaneoEnCurso = true;
    const inicio = Date.now();

    try {
        console.log(`\n[MONITOREO] Iniciando escaneo de precios en Supabase...`);
        const { data: items, error } = await supabase
            .from('roblox_wishlist')
            .select('*')
            .eq('is_paused', false);

        if (error) {
            console.error('[MONITOREO] Error al consultar Supabase:', error.message);
            return;
        }

        if (!items || items.length === 0) {
            console.log('[MONITOREO] Sin objetos activos para revisar.');
            return;
        }

        console.log(`[MONITOREO] Revisando ${items.length} objeto(s) activo(s)...`);

        const CHUNK_SIZE = 5;
        const lotes = dividirEnLotes(items, CHUNK_SIZE);

        for (const lote of lotes) {
            await Promise.allSettled(lote.map(item => procesarItem(client, item)));
            await delay(1200);
        }
        const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
        console.log(`[MONITOREO] Escaneo finalizado correctamente en ${segundos}s.\n`);
    } catch (err) {
        console.error('[PRICE TRACKER FATAL ERROR]:', err.message);
    } finally {
        escaneoEnCurso = false;
    }
}

function iniciarMonitoreo(client, intervaloMinutos = 5) {
    if (intervaloMonitoreo) return; // Ya estaba iniciado (ej: reconexión)

    const minutos = Number(intervaloMinutos) > 0 ? Number(intervaloMinutos) : 5;
    const ms = minutos * 60 * 1000;
    console.log(`[MONITOREO] Servicio iniciado. Intervalo: cada ${minutos} minuto(s).`);
    revisarPrecios(client);
    intervaloMonitoreo = setInterval(() => revisarPrecios(client), ms);
}

module.exports = { iniciarMonitoreo, revisarPrecios };