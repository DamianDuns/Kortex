// ==========================================
// ARCHIVO: utils/chartGenerator.js
// Renderizador local en RAM de gráficas financieras para Discord (#2b2d31)
// ==========================================

const { createCanvas } = require('@napi-rs/canvas');
const Chart = require('chart.js/auto');

const CHART_WIDTH = 700;
const CHART_HEIGHT = 320;
const DISCORD_DARK_BG = '#2b2d31';

// Caché en memoria: Map<`${itemId}_${daysRange}_${historyLength}`, Buffer>
const chartCache = new Map();
const MAX_CACHE_ENTRIES = 100;

/**
 * Formatea una fecha para las etiquetas del eje X según la amplitud del rango.
 */
function formatearEtiquetaFecha(fecha, spanMs) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    const pad = n => String(n).padStart(2, '0');
    const dia = pad(d.getDate());
    const mes = pad(d.getMonth() + 1);
    const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    // Si el rango total es menor o igual a 36 horas, mostramos hora y día corto
    if (spanMs <= 36 * 60 * 60 * 1000) {
        return `${dia}/${mes} ${hora}`;
    }
    return `${dia}/${mes}`;
}

/**
 * Genera en memoria RAM un Buffer PNG con la gráfica de evolución de precios.
 *
 * @param {Array<{ price: number, timestamp: Date|string }>} historyData Datos filtrados del historial
 * @param {string} itemName Nombre del objeto
 * @param {object} [options] Opciones adicionales para caché y formato ({ itemId, daysRange, esUSD })
 * @returns {Promise<Buffer>} Buffer de la imagen PNG
 */
async function generatePriceChart(historyData, itemName, options = {}) {
    const {
        itemId = itemName || 'item',
        daysRange = 'all',
        esUSD = false
    } = options;

    const puntos = Array.isArray(historyData) ? historyData : [];
    const historyLength = puntos.length;
    const ultimoPrecio = historyLength > 0 ? puntos[historyLength - 1].price : 0;

    // Clave de caché según especificación: `${itemId}_${daysRange}_${historyLength}`
    const cacheKey = `${itemId}_${daysRange}_${historyLength}`;
    const cachedEntry = chartCache.get(cacheKey);
    if (cachedEntry && cachedEntry.lastPrice === ultimoPrecio) {
        return cachedEntry.buffer;
    }

    const firstPrice = historyLength > 0 ? Number(puntos[0].price) : 0;
    const lastPrice = historyLength > 0 ? Number(puntos[historyLength - 1].price) : 0;
    const subioOMantuvo = lastPrice >= firstPrice;

    // Colores dinámicos según tendencia
    const lineColor = subioOMantuvo ? '#23a55a' : '#f23f43';
    const gradientTop = subioOMantuvo ? 'rgba(35, 165, 90, 0.28)' : 'rgba(242, 63, 67, 0.28)';
    const gradientBottom = subioOMantuvo ? 'rgba(35, 165, 90, 0.0)' : 'rgba(242, 63, 67, 0.0)';

    const firstTime = historyLength > 0 ? new Date(puntos[0].timestamp).getTime() : 0;
    const lastTime = historyLength > 0 ? new Date(puntos[historyLength - 1].timestamp).getTime() : 0;
    const spanMs = Math.max(0, lastTime - firstTime);

    const labels = puntos.map(p => formatearEtiquetaFecha(p.timestamp, spanMs));
    const values = puntos.map(p => Number(p.price));

    const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Degradado lineal vertical para el área bajo la curva
    const gradient = ctx.createLinearGradient(0, 20, 0, CHART_HEIGHT - 40);
    gradient.addColorStop(0, gradientTop);
    gradient.addColorStop(1, gradientBottom);

    // Plugin personalizado para pintar el fondo exacto del modo oscuro de Discord (#2b2d31)
    const customCanvasBackgroundColor = {
        id: 'customCanvasBackgroundColor',
        beforeDraw: (chart) => {
            const { ctx: chartCtx, width, height } = chart;
            chartCtx.save();
            chartCtx.globalCompositeOperation = 'destination-over';
            chartCtx.fillStyle = DISCORD_DARK_BG;
            chartCtx.fillRect(0, 0, width, height);
            chartCtx.restore();
        }
    };

    const pointRadius = historyLength > 25 ? 0 : 3;

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
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
                    pointBorderColor: DISCORD_DARK_BG,
                    pointBorderWidth: 1.5
                }
            ]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: false,
            layout: {
                padding: {
                    top: 20,
                    right: 24,
                    bottom: 12,
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
                        display: false
                    },
                    border: {
                        color: 'rgba(255, 255, 255, 0.08)'
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
                    grid: {
                        color: 'rgba(255, 255, 255, 0.06)'
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: '#dbdee1',
                        font: {
                            size: 11,
                            family: 'sans-serif'
                        },
                        callback: (value) => {
                            const num = Number(value);
                            if (esUSD) return `$${num.toFixed(2)}`;
                            return `${num.toLocaleString('es-AR')} R$`;
                        }
                    }
                }
            }
        },
        plugins: [customCanvasBackgroundColor]
    });

    const buffer = canvas.toBuffer('image/png');
    chart.destroy();

    if (chartCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = chartCache.keys().next().value;
        if (oldestKey) chartCache.delete(oldestKey);
    }
    chartCache.set(cacheKey, { buffer, lastPrice: ultimoPrecio });

    return buffer;
}

module.exports = {
    generatePriceChart,
    chartCache
};
