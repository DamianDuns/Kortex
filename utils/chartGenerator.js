// ==========================================
// ARCHIVO: utils/chartGenerator.js
// Renderizador local en RAM de gráficas financieras con HUD completo para Discord (#2b2d31)
// ==========================================

const { createCanvas } = require('@napi-rs/canvas');
const Chart = require('chart.js/auto');

const CHART_WIDTH = 740;
const CHART_HEIGHT = 380;
const DISCORD_DARK_BG = '#2b2d31';
const HUD_CARD_BG = '#232428';
const TARGET_COLOR = '#f59e0b'; // Naranja / Amarillo ámbar para la línea de Meta

const RANGO_TEXTO = {
    '24h': '24 HORAS',
    '7d': '7 DÍAS',
    '30d': '30 DÍAS',
    'all': 'HISTÓRICO TOTAL'
};

// Caché en memoria: Map<`${itemId}_${daysRange}_${historyLength}`, { buffer, signature }>
const chartCache = new Map();
const MAX_CACHE_ENTRIES = 100;

/**
 * Formatea un valor numérico según la moneda (Robux o USD).
 */
function fmtMoneda(val, esUSD = false) {
    const n = Number(val || 0);
    if (esUSD) return `$${n.toFixed(2)} USD`;
    return `${Math.round(n).toLocaleString('es-AR')} R$`;
}

/**
 * Formatea una fecha para las etiquetas del eje X según la amplitud del rango.
 */
function formatearEtiquetaFecha(fecha, spanMs) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    const pad = n => String(n).padStart(2, '0');
    const dia = pad(d.getDate());
    const mes = pad(d.getMonth() + 1);
    const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    if (spanMs <= 48 * 60 * 60 * 1000) {
        return `${dia}/${mes} ${hora}`;
    }
    return `${dia}/${mes} ${hora}`;
}

/**
 * Dibuja un rectángulo redondeado en el contexto 2D.
 */
function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
    } else {
        ctx.rect(x, y, w, h);
    }
}

/**
 * Genera en memoria RAM un Buffer PNG con la gráfica de evolución de precios,
 * panel HUD superior (Variación, Mínimo, Máximo, Inicial -> Actual) y línea de Meta.
 *
 * @param {Array<{ price: number, timestamp: Date|string }>} historyData Datos filtrados del historial
 * @param {string} itemName Nombre del objeto
 * @param {object} [options] Opciones adicionales ({ itemId, daysRange, esUSD, targetPrice })
 * @returns {Promise<Buffer>} Buffer de la imagen PNG
 */
async function generatePriceChart(historyData, itemName, options = {}) {
    const {
        itemId = itemName || 'item',
        daysRange = '7d',
        esUSD = false,
        targetPrice = null
    } = options;

    let puntos = Array.isArray(historyData) ? [...historyData] : [];

    // Garantizar mínimo 2 puntos
    if (puntos.length === 0) {
        const ahora = Date.now();
        puntos = [
            { price: 0, timestamp: new Date(ahora - 5 * 60 * 1000) },
            { price: 0, timestamp: new Date(ahora) }
        ];
    } else if (puntos.length === 1) {
        const unico = puntos[0];
        const t = new Date(unico.timestamp || Date.now()).getTime();
        puntos = [
            { price: Number(unico.price || 0), timestamp: new Date(t - 5 * 60 * 1000) },
            { price: Number(unico.price || 0), timestamp: new Date(t) }
        ];
    }

    const tieneMeta = targetPrice !== null && targetPrice !== undefined && !isNaN(Number(targetPrice)) && Number(targetPrice) > 0;
    const metaNum = tieneMeta ? Number(targetPrice) : null;

    const historyLength = puntos.length;
    const firstPrice = Number(puntos[0].price || 0);
    const lastPrice = Number(puntos[historyLength - 1].price || 0);

    // Clave de caché: `${itemId}_${daysRange}_${historyLength}`
    const cacheKey = `${itemId}_${daysRange}_${historyLength}`;
    const signature = `v2_${firstPrice}_${lastPrice}_${metaNum ?? 'none'}`;
    const cachedEntry = chartCache.get(cacheKey);
    if (cachedEntry && cachedEntry.signature === signature) {
        return cachedEntry.buffer;
    }

    const values = puntos.map(p => Number(p.price));
    const minPrice = Math.min(...values);
    const maxPrice = Math.max(...values);
    const diff = lastPrice - firstPrice;
    const pctChange = firstPrice > 0 ? ((diff / firstPrice) * 100) : 0;

    // Color dinámico según tendencia: verde (#23a55a) si subió o se mantuvo, rojo (#f23f43) si bajó
    const subioOMantuvo = lastPrice >= firstPrice;
    const lineColor = subioOMantuvo ? '#23a55a' : '#f23f43';
    const gradientTop = subioOMantuvo ? 'rgba(35, 165, 90, 0.30)' : 'rgba(242, 63, 67, 0.30)';
    const gradientBottom = subioOMantuvo ? 'rgba(35, 165, 90, 0.02)' : 'rgba(242, 63, 67, 0.02)';

    const firstTime = new Date(puntos[0].timestamp).getTime();
    const lastTime = new Date(puntos[historyLength - 1].timestamp).getTime();
    const spanMs = Math.max(0, lastTime - firstTime);

    const labels = puntos.map(p => formatearEtiquetaFecha(p.timestamp, spanMs));

    const todosLosValores = tieneMeta ? [...values, metaNum] : values;
    const minEscala = Math.min(...todosLosValores);
    const maxEscala = Math.max(...todosLosValores);
    const amplitud = maxEscala - minEscala;
    const margen = amplitud === 0
        ? (minEscala === 0 ? 10 : Math.max(2, Number((minEscala * 0.15).toFixed(2))))
        : Number((amplitud * 0.22).toFixed(2));

    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Degradado lineal vertical para el área bajo la curva
    const gradient = ctx.createLinearGradient(0, 95, 0, CHART_HEIGHT - 45);
    gradient.addColorStop(0, gradientTop);
    gradient.addColorStop(1, gradientBottom);

    // Plugin 1: Pintar el fondo oscuro (#2b2d31) y el HUD superior con métricas (Variación, Mín, Máx, Inicial)
    const hudAndBackgroundPlugin = {
        id: 'hudAndBackgroundPlugin',
        beforeDraw: (chart) => {
            const { ctx: c, width, height } = chart;
            c.save();

            // 1. Fondo general del lienzo (#2b2d31)
            c.globalCompositeOperation = 'destination-over';
            c.fillStyle = DISCORD_DARK_BG;
            c.fillRect(0, 0, width, height);
            c.restore();

            c.save();
            // 2. Barra superior HUD (y = 12..78)
            const rangoLabel = RANGO_TEXTO[daysRange] || String(daysRange).toUpperCase();
            c.fillStyle = '#949ba4';
            c.font = 'bold 11px sans-serif';
            c.fillText(`EVOLUCIÓN DE PRECIO  •  ${rangoLabel}  (${historyLength} PTS)`, 20, 24);

            // Precio actual grande a la izquierda
            const textoActual = fmtMoneda(lastPrice, esUSD);
            c.fillStyle = '#ffffff';
            c.font = 'bold 23px sans-serif';
            c.fillText(textoActual, 20, 54);
            const anchoPrecio = c.measureText(textoActual).width;

            // Cápsula de Variación (%) al lado del precio actual
            const signo = diff > 0 ? '+' : '';
            const pctStr = `${signo}${pctChange.toFixed(1).replace('.0', '')}%`;
            const varTexto = diff === 0
                ? '0% (Estable)'
                : `${signo}${fmtMoneda(diff, esUSD)} (${pctStr})`;

            c.font = 'bold 12px sans-serif';
            const textVarW = c.measureText(varTexto).width;
            const varWidth = textVarW + 20;
            const varX = 20 + anchoPrecio + 12;
            const varY = 34;
            const varH = 24;

            const badgeBg = diff === 0
                ? 'rgba(148, 155, 164, 0.16)'
                : (subioOMantuvo ? 'rgba(35, 165, 90, 0.20)' : 'rgba(242, 63, 67, 0.22)');
            const badgeColor = diff === 0 ? '#dbdee1' : lineColor;

            c.fillStyle = badgeBg;
            c.strokeStyle = badgeColor;
            c.lineWidth = 1.2;
            drawRoundedRect(c, varX, varY, varWidth, varH, 6);
            c.fill();
            c.stroke();

            c.fillStyle = badgeColor;
            c.textBaseline = 'middle';
            c.fillText(varTexto, varX + 10, varY + varH / 2);
            c.textBaseline = 'alphabetic';

            // 3. Tarjetas de estadísticas a la derecha (INICIAL, MÍNIMO, MÁXIMO)
            const cards = [
                { label: 'INICIAL', value: fmtMoneda(firstPrice, esUSD), color: '#b5bac1' },
                { label: 'MÍNIMO', value: fmtMoneda(minPrice, esUSD), color: '#23a55a' },
                { label: 'MÁXIMO', value: fmtMoneda(maxPrice, esUSD), color: '#f23f43' }
            ];

            const cardW = 112;
            const cardH = 50;
            const gap = 8;
            const startX = width - 20 - (cards.length * cardW + (cards.length - 1) * gap);
            const cardY = 14;

            cards.forEach((card, idx) => {
                const cx = startX + idx * (cardW + gap);
                c.fillStyle = HUD_CARD_BG;
                c.strokeStyle = 'rgba(255, 255, 255, 0.07)';
                c.lineWidth = 1;
                drawRoundedRect(c, cx, cardY, cardW, cardH, 7);
                c.fill();
                c.stroke();

                c.fillStyle = '#949ba4';
                c.font = 'bold 10px sans-serif';
                c.fillText(card.label, cx + 10, cardY + 18);

                c.fillStyle = card.color;
                c.font = 'bold 13px sans-serif';
                c.fillText(card.value, cx + 10, cardY + 39);
            });

            // Línea divisoria entre el HUD superior y el gráfico
            c.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(20, 76);
            c.lineTo(width - 20, 76);
            c.stroke();

            c.restore();
        }
    };

    // Plugin 2: Etiquetas de valores sobre los puntos clave y cápsula de Meta naranja
    const annotationsPlugin = {
        id: 'annotationsPlugin',
        afterDatasetsDraw: (chart) => {
            const yScale = chart.scales.y;
            const chartArea = chart.chartArea;
            if (!yScale || !chartArea) return;

            const c = chart.ctx;
            const metaDatasetMeta = chart.getDatasetMeta(0);

            // A) Dibujar etiquetas de precio sobre puntos clave de la curva (primero, último, mín, máx)
            if (metaDatasetMeta && Array.isArray(metaDatasetMeta.data) && metaDatasetMeta.data.length > 0) {
                const elems = metaDatasetMeta.data;
                const indicesClave = new Set([0, elems.length - 1]);

                let idxMin = 0;
                let idxMax = 0;
                values.forEach((v, i) => {
                    if (v < values[idxMin]) idxMin = i;
                    if (v > values[idxMax]) idxMax = i;
                });
                indicesClave.add(idxMin);
                indicesClave.add(idxMax);

                if (elems.length <= 8) {
                    for (let i = 0; i < elems.length; i++) indicesClave.add(i);
                }

                c.save();
                c.font = 'bold 11px sans-serif';
                c.textBaseline = 'middle';

                for (const idx of indicesClave) {
                    const pt = elems[idx];
                    if (!pt) continue;

                    const val = values[idx];
                    const esUltimo = idx === elems.length - 1;
                    const txt = fmtMoneda(val, esUSD);
                    const tw = c.measureText(txt).width;
                    const pw = tw + 12;
                    const ph = 18;

                    let px = pt.x - pw / 2;
                    px = Math.max(chartArea.left + 4, Math.min(chartArea.right - pw - 4, px));
                    let py = pt.y - ph - 8;
                    if (py < chartArea.top + 4) {
                        py = pt.y + 8;
                    }

                    // Halo destacado en el punto actual (último)
                    if (esUltimo) {
                        c.beginPath();
                        c.arc(pt.x, pt.y, 6.5, 0, Math.PI * 2);
                        c.fillStyle = lineColor;
                        c.fill();
                        c.lineWidth = 2;
                        c.strokeStyle = '#ffffff';
                        c.stroke();
                    }

                    c.fillStyle = esUltimo ? lineColor : 'rgba(35, 36, 40, 0.90)';
                    c.strokeStyle = lineColor;
                    c.lineWidth = 1.2;
                    drawRoundedRect(c, px, py, pw, ph, 4);
                    c.fill();
                    c.stroke();

                    c.fillStyle = '#ffffff';
                    c.fillText(txt, px + 6, py + ph / 2);
                }
                c.restore();
            }

            // B) Etiqueta de la línea de Meta en amarillo/naranja (#f59e0b)
            if (tieneMeta) {
                const yPos = yScale.getPixelForValue(metaNum);
                if (yPos >= chartArea.top - 6 && yPos <= chartArea.bottom + 6) {
                    const textoMeta = `Meta: ${fmtMoneda(metaNum, esUSD)}`;

                    c.save();
                    c.font = 'bold 11px sans-serif';
                    const textWidth = c.measureText(textoMeta).width;
                    const padX = 9;
                    const boxW = textWidth + padX * 2;
                    const boxH = 20;
                    const boxX = chartArea.left + 10;
                    const boxY = Math.max(chartArea.top + 2, Math.min(chartArea.bottom - boxH - 2, yPos - boxH / 2));

                    c.fillStyle = 'rgba(30, 31, 34, 0.94)';
                    c.strokeStyle = TARGET_COLOR;
                    c.lineWidth = 1.5;
                    drawRoundedRect(c, boxX, boxY, boxW, boxH, 5);
                    c.fill();
                    c.stroke();

                    c.fillStyle = TARGET_COLOR;
                    c.textBaseline = 'middle';
                    c.fillText(textoMeta, boxX + padX, boxY + boxH / 2);
                    c.restore();
                }
            }
        }
    };

    const pointRadius = historyLength > 25 ? 0 : 4;

    const datasets = [
        {
            label: itemName || 'Precio',
            data: values,
            borderColor: lineColor,
            backgroundColor: gradient,
            borderWidth: 3,
            tension: 0.25,
            fill: true,
            pointRadius,
            pointBackgroundColor: lineColor,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
            order: 1
        }
    ];

    // Línea horizontal de Meta en color amarillo/naranja (#f59e0b)
    if (tieneMeta) {
        datasets.push({
            label: 'Meta',
            data: labels.map(() => metaNum),
            borderColor: TARGET_COLOR,
            borderWidth: 2.2,
            borderDash: [7, 5],
            pointRadius: 0,
            fill: false,
            tension: 0,
            order: 0
        });
    }

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: false,
            layout: {
                padding: {
                    top: 94,
                    right: 24,
                    bottom: 14,
                    left: 16
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: true,
                        color: 'rgba(255, 255, 255, 0.035)'
                    },
                    border: {
                        color: 'rgba(255, 255, 255, 0.10)'
                    },
                    ticks: {
                        color: '#949ba4',
                        maxTicksLimit: 7,
                        maxRotation: 0,
                        font: {
                            size: 11,
                            family: 'sans-serif'
                        }
                    }
                },
                y: {
                    suggestedMin: Math.max(0, minEscala - margen),
                    suggestedMax: maxEscala + margen,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.06)'
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: '#dbdee1',
                        maxTicksLimit: 6,
                        font: {
                            size: 11,
                            family: 'sans-serif'
                        },
                        callback: (value) => fmtMoneda(value, esUSD)
                    }
                }
            }
        },
        plugins: [hudAndBackgroundPlugin, annotationsPlugin]
    });

    const buffer = canvas.toBuffer('image/png');
    chart.destroy();

    if (chartCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = chartCache.keys().next().value;
        if (oldestKey) chartCache.delete(oldestKey);
    }
    chartCache.set(cacheKey, { buffer, signature });

    return buffer;
}

module.exports = {
    generatePriceChart,
    chartCache
};
