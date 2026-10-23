// ==========================================
// ARCHIVO: src/utils/chartGenerator.js
// Renderizador local en RAM de gráficas financieras y tarjetas de estudio 3D/2D (#2b2d31)
// ==========================================

const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const Chart = require('chart.js/auto');
const axios = require('axios');

// Registrar fuentes TTF locales incluidas en el repositorio
const FONT_REGULAR_PATH = path.join(__dirname, '../../assets/fonts/LiberationSans-Regular.ttf');
const FONT_BOLD_PATH = path.join(__dirname, '../../assets/fonts/LiberationSans-Bold.ttf');
const FONT_FAMILY = 'KortexSans';

try {
    GlobalFonts.registerFromPath(FONT_REGULAR_PATH, FONT_FAMILY);
    GlobalFonts.registerFromPath(FONT_BOLD_PATH, FONT_FAMILY);
    GlobalFonts.registerFromPath(FONT_REGULAR_PATH, 'sans-serif');
    GlobalFonts.registerFromPath(FONT_BOLD_PATH, 'sans-serif');
    Chart.defaults.font.family = FONT_FAMILY;
} catch (err) {
    console.error('[ChartGenerator] Error registrando fuentes TTF:', err.message);
}

const CHART_WIDTH = 740;
const CHART_HEIGHT = 380;
const DISCORD_DARK_BG = '#2b2d31';
const HUD_CARD_BG = '#232428';
const TARGET_COLOR = '#f59e0b';

const RANGO_TEXTO = {
    '24h': '24 HORAS',
    '7d': '7 DÍAS',
    '30d': '30 DÍAS',
    'all': 'HISTÓRICO TOTAL'
};

const chartCache = new Map();
const MAX_CACHE_ENTRIES = 80;
const remoteImageBufferCache = new Map();
const MAX_IMAGE_CACHE_ENTRIES = 45;

try {
    const { registerCachePurger } = require('./performanceManager');
    registerCachePurger(
        'chartGenerator',
        () => {
            const count = chartCache.size + remoteImageBufferCache.size;
            chartCache.clear();
            remoteImageBufferCache.clear();
            return count;
        },
        {
            label: '🖼️ Buffers Gráficos PNG y Lienzos Canvas',
            whatItCleans: 'Gráficas PNG renderizadas y miniaturas descargadas en memoria nativa',
            inspectFn: () => {
                let bytes = 0;
                for (const v of chartCache.values()) {
                    bytes += v?.buffer?.length || 32768;
                }
                for (const b of remoteImageBufferCache.values()) {
                    bytes += b?.buf?.length || 16384;
                }
                const entries = chartCache.size + remoteImageBufferCache.size;
                const approxKB = Math.round(bytes / 1024);
                return {
                    entries,
                    approxKB,
                    detail: `${chartCache.size} gráfica(s) + ${remoteImageBufferCache.size} textura(s) en RAM (~${approxKB} KB)`
                };
            }
        }
    );
} catch {
    // Silencioso
}

function fmtMoneda(val, esUSD = false) {
    const n = Number(val || 0);
    if (esUSD) return `$${n.toFixed(2)} USD`;
    return `${Math.round(n).toLocaleString('es-AR')} R$`;
}

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

function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
    } else {
        ctx.rect(x, y, w, h);
    }
}

async function fetchImageSafe(urlOrBuffer) {
    if (!urlOrBuffer) return null;
    try {
        if (Buffer.isBuffer(urlOrBuffer)) {
            return await loadImage(urlOrBuffer);
        }
        const urlStr = String(urlOrBuffer).trim();
        if (!urlStr.startsWith('http')) return null;

        const cached = remoteImageBufferCache.get(urlStr);
        if (cached && (Date.now() - cached.ts < 180000)) {
            return await loadImage(cached.buf);
        }

        let buf = null;
        try {
            const res = await axios.get(urlStr, {
                responseType: 'arraybuffer',
                timeout: 5500,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            buf = Buffer.from(res.data);
        } catch {
            if (urlStr.includes('.roblox.com')) {
                const altUrl = urlStr.replace(/\.roblox\.com/gi, '.roproxy.com');
                const resAlt = await axios.get(altUrl, {
                    responseType: 'arraybuffer',
                    timeout: 5000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                buf = Buffer.from(resAlt.data);
            }
        }

        if (!buf || buf.length < 64) return null;

        if (remoteImageBufferCache.size >= MAX_IMAGE_CACHE_ENTRIES) {
            const oldest = remoteImageBufferCache.keys().next().value;
            if (oldest) remoteImageBufferCache.delete(oldest);
        }
        remoteImageBufferCache.set(urlStr, { buf, ts: Date.now() });

        return await loadImage(buf);
    } catch {
        return null;
    }
}

/**
 * 1. Gráfica Histórica de Precios (Price Sniper)
 */
async function generatePriceChart(historyData, itemName, options = {}) {
    const {
        itemId = itemName || 'item',
        daysRange = '7d',
        esUSD = false,
        targetPrice = null
    } = options;

    let puntos = Array.isArray(historyData) ? [...historyData] : [];

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

    const cacheKey = `${itemId}_${daysRange}_${historyLength}`;
    const signature = `v3_${firstPrice}_${lastPrice}_${metaNum ?? 'none'}`;
    const cachedEntry = chartCache.get(cacheKey);
    if (cachedEntry && cachedEntry.signature === signature) {
        return cachedEntry.buffer;
    }

    const values = puntos.map(p => Number(p.price));
    const minPrice = Math.min(...values);
    const maxPrice = Math.max(...values);
    const diff = lastPrice - firstPrice;
    const pctChange = firstPrice > 0 ? ((diff / firstPrice) * 100) : 0;

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

    const gradient = ctx.createLinearGradient(0, 95, 0, CHART_HEIGHT - 45);
    gradient.addColorStop(0, gradientTop);
    gradient.addColorStop(1, gradientBottom);

    const hudAndBackgroundPlugin = {
        id: 'hudAndBackgroundPlugin',
        beforeDraw: (chart) => {
            const { ctx: c, width, height } = chart;
            c.save();
            c.globalCompositeOperation = 'destination-over';
            c.fillStyle = DISCORD_DARK_BG;
            c.fillRect(0, 0, width, height);
            c.restore();

            c.save();
            const rangoLabel = RANGO_TEXTO[daysRange] || String(daysRange).toUpperCase();
            c.fillStyle = '#949ba4';
            c.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
            c.fillText(`EVOLUCIÓN DE PRECIO  •  ${rangoLabel}  (${historyLength} PTS)`, 20, 24);

            const textoActual = fmtMoneda(lastPrice, esUSD);
            c.fillStyle = '#ffffff';
            c.font = `bold 23px "${FONT_FAMILY}", sans-serif`;
            c.fillText(textoActual, 20, 54);
            const anchoPrecio = c.measureText(textoActual).width;

            const signo = diff > 0 ? '+' : '';
            const pctStr = `${signo}${pctChange.toFixed(1).replace('.0', '')}%`;
            const varTexto = diff === 0
                ? '0% (Estable)'
                : `${signo}${fmtMoneda(diff, esUSD)} (${pctStr})`;

            c.font = `bold 12px "${FONT_FAMILY}", sans-serif`;
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
                c.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
                c.fillText(card.label, cx + 10, cardY + 18);

                c.fillStyle = card.color;
                c.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
                c.fillText(card.value, cx + 10, cardY + 39);
            });

            c.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(20, 76);
            c.lineTo(width - 20, 76);
            c.stroke();

            c.restore();
        }
    };

    const annotationsPlugin = {
        id: 'annotationsPlugin',
        afterDatasetsDraw: (chart) => {
            const yScale = chart.scales.y;
            const chartArea = chart.chartArea;
            if (!yScale || !chartArea) return;

            const c = chart.ctx;
            const metaDatasetMeta = chart.getDatasetMeta(0);

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
                c.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
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

            if (tieneMeta) {
                const yPos = yScale.getPixelForValue(metaNum);
                if (yPos >= chartArea.top - 6 && yPos <= chartArea.bottom + 6) {
                    const textoMeta = `Meta: ${fmtMoneda(metaNum, esUSD)}`;

                    c.save();
                    c.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
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
        data: { labels, datasets },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: false,
            layout: { padding: { top: 94, right: 24, bottom: 14, left: 16 } },
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                x: {
                    grid: { display: true, color: 'rgba(255, 255, 255, 0.035)' },
                    border: { color: 'rgba(255, 255, 255, 0.10)' },
                    ticks: { color: '#949ba4', maxTicksLimit: 7, maxRotation: 0, font: { size: 11, family: FONT_FAMILY } }
                },
                y: {
                    suggestedMin: esUSD ? Math.max(0, minEscala - margen) : Math.max(0, Math.floor(minEscala - Math.max(1, margen))),
                    suggestedMax: esUSD ? (maxEscala + margen) : Math.ceil(maxEscala + Math.max(1, margen)),
                    grid: { color: 'rgba(255, 255, 255, 0.06)' },
                    border: { display: false },
                    ticks: {
                        color: '#dbdee1',
                        maxTicksLimit: 6,
                        precision: esUSD ? 2 : 0,
                        font: { size: 11, family: FONT_FAMILY },
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

/**
 * 2. Herramienta 1.1: Gráfica Comparativa de Pisos de Precios Dinámicos UGC (#2b2d31)
 */
async function generatePriceFloorsChart(floorsList) {
    const canvas = createCanvas(CHART_WIDTH, 390);
    const ctx = canvas.getContext('2d');

    const labels = floorsList.map(f => f.shortName || f.subcategory_name.split(' ')[0]);
    const currentPrices = floorsList.map(f => Number(f.floor_price || 0));
    const prevPrices = floorsList.map(f => Number(f.previous_floor_price || 0));

    const bgPlugin = {
        id: 'floorsBgPlugin',
        beforeDraw: (chart) => {
            const { ctx: c, width, height } = chart;
            c.save();
            c.globalCompositeOperation = 'destination-over';
            c.fillStyle = DISCORD_DARK_BG;
            c.fillRect(0, 0, width, height);
            c.restore();

            c.save();
            c.fillStyle = '#949ba4';
            c.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
            c.fillText('MONITOR DE PISOS DE PRECIOS UGC  •  ACTUAL VS SEMANA ANTERIOR', 20, 24);

            c.fillStyle = '#ffffff';
            c.font = `bold 20px "${FONT_FAMILY}", sans-serif`;
            c.fillText('Evolución de Pisos Oficiales de Roblox (R$)', 20, 52);

            c.fillStyle = '#23a55a';
            drawRoundedRect(c, width - 250, 22, 12, 12, 3);
            c.fill();
            c.fillStyle = '#dbdee1';
            c.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
            c.fillText('Piso Actual (R$)', width - 232, 32);

            c.fillStyle = '#5865F2';
            drawRoundedRect(c, width - 125, 22, 12, 12, 3);
            c.fill();
            c.fillStyle = '#949ba4';
            c.fillText('Semana Ant.', width - 107, 32);

            c.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            c.beginPath();
            c.moveTo(20, 68);
            c.lineTo(width - 20, 68);
            c.stroke();
            c.restore();
        }
    };

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Piso Actual',
                    data: currentPrices,
                    backgroundColor: floorsList.map(f => f.floor_price <= f.previous_floor_price ? 'rgba(35, 165, 90, 0.85)' : 'rgba(242, 63, 67, 0.85)'),
                    borderColor: floorsList.map(f => f.floor_price <= f.previous_floor_price ? '#23a55a' : '#f23f43'),
                    borderWidth: 1.5,
                    borderRadius: 6
                },
                {
                    label: 'Semana Anterior',
                    data: prevPrices,
                    backgroundColor: 'rgba(88, 101, 242, 0.35)',
                    borderColor: '#5865F2',
                    borderWidth: 1.5,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: false,
            layout: { padding: { top: 84, right: 20, bottom: 14, left: 16 } },
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#dbdee1', font: { size: 11, family: FONT_FAMILY } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.06)' },
                    ticks: {
                        color: '#949ba4',
                        font: { size: 11, family: FONT_FAMILY },
                        callback: v => `${v} R$`
                    }
                }
            }
        },
        plugins: [bgPlugin]
    });

    const buffer = canvas.toBuffer('image/png');
    chart.destroy();
    return buffer;
}

/**
 * Calcula la caja delimitadora (bounding box) exacta de los píxeles no transparentes de una imagen.
 */
function getOpaqueBounds(img) {
    if (!img || !img.width || !img.height) {
        return { minX: 0, minY: 0, maxX: 100, maxY: 100, bw: 100, bh: 100 };
    }
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;

    let minX = img.width;
    let minY = img.height;
    let maxX = 0;
    let maxY = 0;
    let found = false;

    for (let y = 0; y < img.height; y += 2) {
        for (let x = 0; x < img.width; x += 2) {
            if (d[(y * img.width + x) * 4 + 3] > 28) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            }
        }
    }

    if (!found) {
        return { minX: 0, minY: 0, maxX: img.width, maxY: img.height, bw: img.width, bh: img.height };
    }
    return {
        minX,
        minY,
        maxX,
        maxY,
        bw: Math.max(16, maxX - minX),
        bh: Math.max(16, maxY - minY)
    };
}

/**
 * Determina el slot anatómico de un objeto de Roblox según su assetTypeId, URL de miniatura o nombre.
 */
function resolveAnatomicalSlot(item) {
    const typeId = Number(item.assetTypeId || 0);
    const urlStr = String(item.highResUrl || item.imageUrl || '').toLowerCase();
    const nameStr = String(item.name || '').toLowerCase();
    const typeNameStr = String(item.assetTypeName || '').toLowerCase();

    if (typeId === 43 || urlStr.includes('/neckaccessory/') || typeNameStr.includes('neck') || typeNameStr.includes('cuello') || /\b(neck|scarf|collar|chain|choker|tie|bufanda|collar)\b/i.test(nameStr)) {
        return { key: 'neck', label: 'Cuello', layer: 'front' };
    }
    if (typeId === 42 || typeId === 18 || urlStr.includes('/faceaccessory/') || typeNameStr.includes('face') || typeNameStr.includes('cara') || /\b(glasses|shades|mask|goggles|visor|monocle|blush|lentes|mascara)\b/i.test(nameStr)) {
        return { key: 'face', label: 'Cara / Rostro', layer: 'front' };
    }
    if (typeId === 41 || urlStr.includes('/hairaccessory/') || typeNameStr.includes('hair') || typeNameStr.includes('pelo') || /\b(hair|pelo|cabello|ponytail|braids|mullet|bangs|messy|wolfcut)\b/i.test(nameStr)) {
        return { key: 'hair', label: 'Pelo / Cabello', layer: 'front' };
    }
    if (typeId === 46 || urlStr.includes('/backaccessory/') || typeNameStr.includes('back') || typeNameStr.includes('espalda') || /\b(wings|cape|back|backpack|katana|sword|greatsword|halo|scythe|guitar|alas|capa|mochila)\b/i.test(nameStr)) {
        return { key: 'back', label: 'Espalda', layer: 'back' };
    }
    if (typeId === 44 || urlStr.includes('/shoulderaccessory/') || typeNameStr.includes('shoulder') || typeNameStr.includes('hombro') || /\b(shoulder|pauldron|epaulette|hombro|pet)\b/i.test(nameStr)) {
        return { key: 'shoulder', label: 'Hombros', layer: 'front' };
    }
    if (
        [45, 11, 2, 64, 65, 67, 68].includes(typeId) ||
        urlStr.includes('/frontaccessory/') ||
        urlStr.includes('/shirt/') ||
        typeNameStr.includes('front') ||
        typeNameStr.includes('shirt') ||
        typeNameStr.includes('jacket') ||
        /\b(vest|armor|chest|torso|shirt|hoodie|jacket|sweater|cardigan|suit|tuxedo|camisa|pecho)\b/i.test(nameStr)
    ) {
        return { key: 'front', label: 'Torso / Camisa', layer: 'front', isClassicShirt: typeId === 11 };
    }
    if (
        [47, 12, 66, 69, 72].includes(typeId) ||
        urlStr.includes('/waistaccessory/') ||
        urlStr.includes('/pants/') ||
        typeNameStr.includes('waist') ||
        typeNameStr.includes('pants') ||
        /\b(waist|belt|tail|skirt|pants|jeans|shorts|trousers|cargo|cintura|pantalon)\b/i.test(nameStr)
    ) {
        return { key: 'waist', label: 'Cintura / Pantalón', layer: 'front', isClassicPants: typeId === 12 };
    }
    if (typeId === 19 || urlStr.includes('/gear/') || typeNameStr.includes('gear')) {
        return { key: 'gear', label: 'Mano / Gear', layer: 'front' };
    }
    return { key: 'hat', label: 'Cabeza / Sombrero', layer: 'front' };
}

/**
 * Posiciona y dibuja un accesorio o prenda recortada sobre las coordenadas anatómicas reales del avatar en el lienzo.
 */
function drawEquippedItemOnAvatar(ctx, itemImg, slotObj, charBox, isZoomed = false) {
    if (!itemImg) return;
    const slotKey = typeof slotObj === 'string' ? slotObj : slotObj.key;
    let ib = getOpaqueBounds(itemImg);

    // Si es una camisa o pantalón clásico 2D cuyo thumbnail 420x420 es un maniquí gris completo,
    // recortar únicamente la región del torso/brazos o de las piernas para no tapar la cabeza del usuario
    if (slotObj && slotObj.isClassicShirt) {
        const cropX = Math.round(itemImg.width * 0.18);
        const cropY = Math.round(itemImg.height * 0.24);
        const cropW = Math.round(itemImg.width * 0.64);
        const cropH = Math.round(itemImg.height * 0.36);
        ib = { minX: cropX, minY: cropY, maxX: cropX + cropW, maxY: cropY + cropH, bw: cropW, bh: cropH };
    } else if (slotObj && slotObj.isClassicPants) {
        const cropX = Math.round(itemImg.width * 0.24);
        const cropY = Math.round(itemImg.height * 0.52);
        const cropW = Math.round(itemImg.width * 0.52);
        const cropH = Math.round(itemImg.height * 0.42);
        ib = { minX: cropX, minY: cropY, maxX: cropX + cropW, maxY: cropY + cropH, bw: cropW, bh: cropH };
    }

    const { cx, topY, charW, charH } = charBox;
    let targetCenterX = cx;
    let targetCenterY = topY + charH * 0.14;
    let maxBoxW = charW * 0.58;
    let maxBoxH = charH * 0.28;

    if (isZoomed) {
        switch (slotKey) {
            case 'hat':
                targetCenterX = cx;
                targetCenterY = topY + charH * 0.23;
                maxBoxW = charW * 0.68;
                maxBoxH = charH * 0.42;
                break;
            case 'hair':
                targetCenterX = cx;
                targetCenterY = topY + charH * 0.36;
                maxBoxW = charW * 0.74;
                maxBoxH = charH * 0.54;
                break;
            case 'face':
                targetCenterX = cx;
                targetCenterY = topY + charH * 0.43;
                maxBoxW = charW * 0.48;
                maxBoxH = charH * 0.30;
                break;
            case 'neck':
                targetCenterX = cx;
                targetCenterY = topY + charH * 0.67;
                maxBoxW = charW * 0.64;
                maxBoxH = charH * 0.34;
                break;
            case 'shoulder':
                targetCenterX = cx - charW * 0.26;
                targetCenterY = topY + charH * 0.65;
                maxBoxW = charW * 0.42;
                maxBoxH = charH * 0.34;
                break;
            case 'front':
                targetCenterX = cx;
                targetCenterY = topY + charH * 0.82;
                maxBoxW = charW * 0.68;
                maxBoxH = charH * 0.36;
                break;
            case 'back':
                targetCenterX = cx;
                targetCenterY = topY + charH * 0.56;
                maxBoxW = charW * 0.96;
                maxBoxH = charH * 0.68;
                break;
            default:
                targetCenterX = cx;
                targetCenterY = topY + charH * 0.50;
                maxBoxW = charW * 0.60;
                maxBoxH = charH * 0.40;
                break;
        }
    } else {
        switch (slotKey) {
            case 'hat':
                targetCenterX = cx;
                targetCenterY = topY + charH * 0.09;
                maxBoxW = charW * 0.56;
                maxBoxH = charH * 0.25;
                break;
            case 'hair':
                targetCenterX = cx;
                targetCenterY = topY + charH * 0.14;
                maxBoxW = charW * 0.62;
                maxBoxH = charH * 0.30;
                break;
            case 'face':
                targetCenterX = cx;
                targetCenterY = topY + charH * 0.16;
                maxBoxW = charW * 0.42;
                maxBoxH = charH * 0.18;
                break;
            case 'neck':
                targetCenterX = cx;
                targetCenterY = topY + charH * 0.265;
                maxBoxW = charW * 0.54;
                maxBoxH = charH * 0.20;
                break;
            case 'shoulder':
                targetCenterX = cx - charW * 0.25;
                targetCenterY = topY + charH * 0.24;
                maxBoxW = charW * 0.38;
                maxBoxH = charH * 0.22;
                break;
            case 'front':
                targetCenterX = cx;
                targetCenterY = topY + charH * 0.41;
                maxBoxW = charW * 0.62;
                maxBoxH = charH * 0.34;
                break;
            case 'waist':
                targetCenterX = cx;
                targetCenterY = topY + charH * 0.64;
                maxBoxW = charW * 0.62;
                maxBoxH = charH * 0.34;
                break;
            case 'back':
                targetCenterX = cx;
                targetCenterY = topY + charH * 0.35;
                maxBoxW = charW * 1.25;
                maxBoxH = charH * 0.56;
                break;
            case 'gear':
                targetCenterX = cx - charW * 0.36;
                targetCenterY = topY + charH * 0.46;
                maxBoxW = charW * 0.44;
                maxBoxH = charH * 0.32;
                break;
        }
    }

    const scale = Math.min(maxBoxW / ib.bw, maxBoxH / ib.bh);
    const drawW = ib.bw * scale;
    const drawH = ib.bh * scale;
    const destX = targetCenterX - drawW / 2;
    const destY = targetCenterY - drawH / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.drawImage(itemImg, ib.minX, ib.minY, ib.bw, ib.bh, destX, destY, drawW, drawH);
    ctx.restore();
}

/**
 * 3. Herramienta 2.1: Tarjeta Visual del Probador de Combinaciones en Vivo (Outfit Sandbox)
 * Equipa visualmente las piezas agregadas sobre el avatar del usuario en su región anatómica real.
 */
async function generateOutfitSandboxCard(avatarInfo, addedItems, totalNormal, totalCashback) {
    const width = 760;
    const height = 435;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = DISCORD_DARK_BG;
    ctx.fillRect(0, 0, width, height);

    const isZoomed = Boolean(avatarInfo.zoomHead);

    // Header
    ctx.fillStyle = '#949ba4';
    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        `KORTEX OUTFIT SANDBOX  •  VISTA PREVIA CON OBJETOS EQUIPADOS (${isZoomed ? 'ZOOM CABEZA Y CUELLO' : 'CUERPO COMPLETO'})`,
        22,
        26
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 20px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(`Personaje: @${avatarInfo.username || 'Builderman'} (ID ${avatarInfo.userId || 156})`, 22, 52);

    // Panel Izquierdo: Visor en Vivo del Avatar con los ítems equipados encima
    const vpX = 22;
    const vpY = 68;
    const vpW = 258;
    const vpH = 348;

    ctx.fillStyle = '#1e1f22';
    ctx.strokeStyle = addedItems.length > 0 ? '#23a55a' : 'rgba(139, 92, 246, 0.55)';
    ctx.lineWidth = 1.8;
    drawRoundedRect(ctx, vpX, vpY, vpW, vpH, 12);
    ctx.fill();
    ctx.stroke();

    // Sutil grilla de probador 3D en el fondo del visor
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.11)';
    ctx.lineWidth = 1;
    for (let gx = vpX + 20; gx < vpX + vpW - 10; gx += 26) {
        ctx.beginPath();
        ctx.moveTo(gx, vpY + 34);
        ctx.lineTo(gx, vpY + vpH - 54);
        ctx.stroke();
    }
    for (let gy = vpY + 46; gy < vpY + vpH - 54; gy += 26) {
        ctx.beginPath();
        ctx.moveTo(vpX + 10, gy);
        ctx.lineTo(vpX + vpW - 10, gy);
        ctx.stroke();
    }

    ctx.fillStyle = '#8B5CF6';
    ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(isZoomed ? '🔍 CÁMARA: ROSTRO / CUELLO / CABEZA' : '🧍 CÁMARA: CUERPO COMPLETO', vpX + 14, vpY + 22);

    const activeAvatarUrl = isZoomed
        ? (avatarInfo.avatarHeadshotUrl || avatarInfo.avatarFullUrl || avatarInfo.avatarUrl)
        : (avatarInfo.avatarFullUrl || avatarInfo.avatarUrl || avatarInfo.avatarHeadshotUrl);

    const [avatarImg, ...itemImages] = await Promise.all([
        fetchImageSafe(activeAvatarUrl),
        ...addedItems.slice(0, 5).map(it => fetchImageSafe(it.highResUrl || it.imageUrl))
    ]);

    const equippedList = addedItems.slice(0, 5).map((it, idx) => ({
        item: it,
        img: itemImages[idx],
        slot: resolveAnatomicalSlot(it),
        isCustomTryOn: !it.isWorn
    }));

    const drawAvX = vpX + 14;
    const drawAvY = vpY + 30;
    const drawAvSize = 230;

    let charBox = {
        cx: drawAvX + drawAvSize / 2,
        topY: drawAvY + 24,
        charW: drawAvSize * 0.52,
        charH: drawAvSize * 0.78
    };

    if (avatarImg) {
        const ab = getOpaqueBounds(avatarImg);
        const scaleX = drawAvSize / (avatarImg.width || 420);
        const scaleY = drawAvSize / (avatarImg.height || 420);
        charBox = {
            cx: drawAvX + ((ab.minX + ab.maxX) / 2) * scaleX,
            topY: drawAvY + ab.minY * scaleY,
            charW: ab.bw * scaleX,
            charH: ab.bh * scaleY
        };
    }

    ctx.save();
    drawRoundedRect(ctx, vpX + 4, vpY + 28, vpW - 8, vpH - 82, 8);
    ctx.clip();

    // 1. Capa Trasera: Accesorios de Espalda en prueba
    for (const eq of equippedList) {
        if (eq.isCustomTryOn && eq.slot.layer === 'back' && eq.img) {
            drawEquippedItemOnAvatar(ctx, eq.img, eq.slot, charBox, isZoomed);
        }
    }

    // 2. Capa Central: Personaje del usuario
    if (avatarImg) {
        ctx.drawImage(avatarImg, drawAvX, drawAvY, drawAvSize, drawAvSize);
    } else {
        ctx.fillStyle = '#949ba4';
        ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText('Cargando Avatar...', vpX + 68, vpY + 150);
    }

    // 3. Capa Frontal: Accesorios equipados en prueba
    for (const eq of equippedList) {
        if (eq.isCustomTryOn && eq.slot.layer !== 'back' && eq.img) {
            drawEquippedItemOnAvatar(ctx, eq.img, eq.slot, charBox, isZoomed);
        }
    }
    ctx.restore();

    const customTryOnCount = equippedList.filter(e => e.isCustomTryOn).length;
    const wornCount = equippedList.filter(e => !e.isCustomTryOn).length;
    ctx.fillStyle = equippedList.length > 0 ? 'rgba(35, 165, 90, 0.20)' : 'rgba(139, 92, 246, 0.16)';
    drawRoundedRect(ctx, vpX + 12, vpY + vpH - 76, vpW - 24, 24, 6);
    ctx.fill();

    ctx.fillStyle = equippedList.length > 0 ? '#23a55a' : '#dbdee1';
    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    const statusText = customTryOnCount > 0
        ? `[OK] ${customTryOnCount} en prueba${wornCount > 0 ? ` + ${wornCount} puesto(s)` : ''}`
        : (wornCount > 0 ? `[OK] ${wornCount} prenda(s) equipada(s)` : 'Probá un conjunto o accesorio abajo');
    ctx.fillText(statusText, vpX + 18, vpY + vpH - 60);

    ctx.fillStyle = '#23a55a';
    ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(`Con 40% Grupo: ${fmtMoneda(totalCashback)}`, vpX + 14, vpY + vpH - 30);

    ctx.fillStyle = '#949ba4';
    ctx.font = `11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(`Precio Lista: ${fmtMoneda(totalNormal)}`, vpX + 14, vpY + vpH - 12);

    ctx.fillStyle = '#dbdee1';
    ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(`OBJETOS EN EL PROBADOR (${addedItems.length}/5)`, 296, 84);

    if (addedItems.length === 0) {
        ctx.fillStyle = HUD_CARD_BG;
        drawRoundedRect(ctx, 296, 96, 442, 320, 10);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 15px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText('Probate cualquier accesorio o ropa sobre el avatar', 332, 190);
        ctx.fillStyle = '#949ba4';
        ctx.font = `12px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText('1. Tocá "+ Probar Accesorio" o "⚡ Conjunto Demo" abajo.', 332, 222);
        ctx.fillText('2. También podés escribir @usuario para cambiar de personaje.', 332, 246);
        ctx.fillText('3. Kortex detecta el slot anatómico (Cabeza, Pelo, Cara, Cuello,', 332, 270);
        ctx.fillText('   Espalda, Torso) y calcula el ahorro del 40% en grupo.', 332, 292);
    } else {
        equippedList.forEach((eq, idx) => {
            const it = eq.item;
            const rowY = 96 + idx * 64;
            ctx.fillStyle = HUD_CARD_BG;
            ctx.strokeStyle = eq.isCustomTryOn ? 'rgba(35, 165, 90, 0.55)' : 'rgba(88, 101, 242, 0.45)';
            ctx.lineWidth = 1.2;
            drawRoundedRect(ctx, 296, rowY, 442, 56, 8);
            ctx.fill();
            ctx.stroke();

            if (eq.img) {
                ctx.drawImage(eq.img, 304, rowY + 6, 44, 44);
            }

            const tagStr = eq.isCustomTryOn ? '[PRUEBA]' : '[PUESTO]';
            ctx.fillStyle = eq.isCustomTryOn ? '#23a55a' : '#5865F2';
            ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
            ctx.fillText(tagStr, 356, rowY + 18);

            ctx.fillStyle = '#ffffff';
            ctx.font = `bold 12px "${FONT_FAMILY}", sans-serif`;
            const cleanName = String(it.name || `Asset ${it.id}`).substring(0, 24);
            ctx.fillText(`${cleanName}`, 412, rowY + 18);

            ctx.fillStyle = '#a78bfa';
            ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
            ctx.fillText(`Slot: ${eq.slot.label}  •  ID ${it.id}`, 356, rowY + 41);

            const itemPrice = Number(it.price || 0);
            const netPrice = Math.ceil(itemPrice * 0.6);
            ctx.fillStyle = '#23a55a';
            ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
            ctx.fillText(itemPrice > 0 ? `${fmtMoneda(netPrice)} (40%)` : 'Gratis / Offsale', 596, rowY + 22);

            ctx.fillStyle = '#949ba4';
            ctx.font = `11px "${FONT_FAMILY}", sans-serif`;
            ctx.fillText(`Lista: ${fmtMoneda(itemPrice)}`, 596, rowY + 42);
        });
    }

    return canvas.toBuffer('image/png');
}

/**
 * 4. Herramienta 2.2: Lienzo Comparativo de Clones UGC e Ítems Oficiales de Roblox Similares
 */
async function generateClonesComparisonCanvas(originalItem, alternatives) {
    const width = 760;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = DISCORD_DARK_BG;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#949ba4';
    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText('BUSCADOR DE SIMILARES (ROBLOX OFICIAL + CLONES UGC BARATOS)', 22, 26);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 19px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(`Referencia: ${String(originalItem.name || 'Accesorio').substring(0, 42)}`, 22, 52);

    // Izquierda: Ítem Original
    ctx.fillStyle = HUD_CARD_BG;
    ctx.strokeStyle = '#5865F2';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, 22, 68, 225, 330, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#5865F2';
    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText('ÍTEM DE REFERENCIA', 36, 90);

    const origImg = await fetchImageSafe(originalItem.imageUrl);
    if (origImg) {
        ctx.drawImage(origImg, 47, 102, 175, 175);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(String(originalItem.name || 'Original').substring(0, 22), 34, 300);

    ctx.fillStyle = '#f59e0b';
    ctx.font = `bold 17px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(originalItem.price > 0 ? fmtMoneda(originalItem.price) : 'Offsale / N/A', 34, 328);

    ctx.fillStyle = '#949ba4';
    ctx.font = `11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(`ID: ${originalItem.id}`, 34, 350);
    ctx.fillText(`Por: ${String(originalItem.creatorName || 'Roblox').substring(0, 20)}`, 34, 370);

    // Derecha: Hasta 4 Alternativas (Roblox Oficial + Clones UGC)
    const itemsToShow = alternatives.slice(0, 4);
    const altThumbs = await Promise.all(itemsToShow.map(a => fetchImageSafe(a.imageUrl)));

    itemsToShow.forEach((alt, idx) => {
        const y = 68 + idx * 84;
        const isOfficial = Boolean(alt.isOfficialRoblox);
        ctx.fillStyle = HUD_CARD_BG;
        ctx.strokeStyle = isOfficial ? '#00B8D9' : '#23a55a';
        ctx.lineWidth = 1.2;
        drawRoundedRect(ctx, 264, y, 474, 76, 9);
        ctx.fill();
        ctx.stroke();

        if (altThumbs[idx]) {
            ctx.drawImage(altThumbs[idx], 274, y + 8, 60, 60);
        }

        const tagText = isOfficial ? '[ROBLOX OFICIAL]' : '[CLON UGC]';
        ctx.fillStyle = isOfficial ? '#00B8D9' : '#23a55a';
        ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(tagText, 346, y + 20);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(`#${idx + 1} ${String(alt.name).substring(0, 28)}`, 346, y + 38);

        ctx.fillStyle = '#949ba4';
        ctx.font = `11px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(`ID: ${alt.id} • Por ${String(alt.creatorName || 'UGC').substring(0, 18)}`, 346, y + 58);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 14px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(alt.price > 0 ? fmtMoneda(alt.price) : 'Offsale', 605, y + 32);

        if (originalItem.price > 0 && alt.price > 0 && alt.price < originalItem.price) {
            const ahorroPct = Math.max(1, Math.round(((originalItem.price - alt.price) / originalItem.price) * 100));
            ctx.fillStyle = 'rgba(35, 165, 90, 0.22)';
            drawRoundedRect(ctx, 605, y + 40, 118, 24, 5);
            ctx.fill();
            ctx.fillStyle = '#23a55a';
            ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
            ctx.fillText(`-${ahorroPct}% Ahorro`, 616, y + 56);
        } else {
            ctx.fillStyle = '#949ba4';
            ctx.font = `11px "${FONT_FAMILY}", sans-serif`;
            ctx.fillText(`Con 40%: ${fmtMoneda(Math.ceil(alt.price * 0.6))}`, 605, y + 56);
        }
    });

    return canvas.toBuffer('image/png');
}

/**
 * Detecta automáticamente si una plantilla 585x559 corresponde a Camisa (Shirt), Pantalón (Pants) o T-Shirt/Decal.
 */
function detectGarmentModeFromImage(img, options = {}) {
    if (options.garmentMode && ['shirt', 'pants', 'full', 'tshirt'].includes(options.garmentMode)) {
        return options.garmentMode;
    }
    const typeId = Number(options.assetTypeId || 0);
    if (typeId === 11) return 'shirt';
    if (typeId === 12) return 'pants';
    if (typeId === 2) return 'tshirt';

    const titleLower = String(options.title || '').toLowerCase();
    if (titleLower.includes('pant') || titleLower.includes('jean') || titleLower.includes('short') || titleLower.includes('trouser')) {
        return 'pants';
    }
    if (titleLower.includes('t-shirt') || titleLower.includes('tshirt')) {
        return 'tshirt';
    }

    if (!img || !img.width || !img.height) return 'shirt';

    // Verificar si tiene proporción aproximada de plantilla Roblox (585x559 => ratio ~1.046) o si las regiones UV existen
    try {
        const tmp = createCanvas(img.width, img.height);
        const tctx = tmp.getContext('2d');
        tctx.drawImage(img, 0, 0);
        const sx = img.width / 585;
        const sy = img.height / 559;

        const countOpaque = (rx, ry, rw, rh) => {
            const x = Math.max(0, Math.round(rx * sx));
            const y = Math.max(0, Math.round(ry * sy));
            const w = Math.max(1, Math.min(img.width - x, Math.round(rw * sx)));
            const h = Math.max(1, Math.min(img.height - y, Math.round(rh * sy)));
            const data = tctx.getImageData(x, y, w, h).data;
            let op = 0;
            let total = 0;
            for (let i = 3; i < data.length; i += 16) {
                total++;
                if (data[i] > 30) op++;
            }
            return total > 0 ? op / total : 0;
        };

        // Región superior del torso (pecho alto) vs región de extremidades inferiores
        const upperChestOpacity = countOpaque(245, 82, 100, 50);
        const rightLimbOpacity = countOpaque(222, 365, 54, 110);
        const leftLimbOpacity = countOpaque(312, 365, 54, 110);

        if (upperChestOpacity < 0.15 && (rightLimbOpacity > 0.35 || leftLimbOpacity > 0.35)) {
            return 'pants';
        }
    } catch {
        // Fallback a shirt
    }

    return 'shirt';
}

/**
 * Dibuja un fondo damero (checkerboard) de estudio para que tanto prendas negras como blancas resalten con total claridad.
 */
function drawStudioCheckerboard(ctx, x, y, w, h, radius = 8, cellSize = 14) {
    ctx.save();
    drawRoundedRect(ctx, x, y, w, h, radius);
    ctx.clip();

    ctx.fillStyle = '#363940';
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = '#2d3036';
    for (let cy = y; cy < y + h; cy += cellSize) {
        const rowIdx = Math.floor((cy - y) / cellSize);
        for (let cx = x; cx < x + w; cx += cellSize) {
            const colIdx = Math.floor((cx - x) / cellSize);
            if ((rowIdx + colIdx) % 2 === 0) {
                ctx.fillRect(cx, cy, cellSize, cellSize);
            }
        }
    }
    ctx.restore();
}

/**
 * 5. Herramienta 2.3: Probador de Plantillas 2D sobre Maniquí Roblox (Vista Frontal y Trasera R6)
 */
async function generateMannequinTemplateCanvas(templateImageOrUrl, title = 'Plantilla 2D', options = {}) {
    const width = 780;
    const height = 445;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = DISCORD_DARK_BG;
    ctx.fillRect(0, 0, width, height);

    const img = await fetchImageSafe(templateImageOrUrl);
    const garmentMode = detectGarmentModeFromImage(img, { ...options, title });

    const modeLabels = {
        shirt: 'MODO CAMISA (SHIRT R6)',
        pants: 'MODO PANTALÓN (PANTS R6)',
        full: 'MODO TRAJE COMPLETO (CAMISA + PANTALÓN)',
        tshirt: 'MODO T-SHIRT (PECHO FRONTAL)'
    };

    // Encabezado
    ctx.fillStyle = '#a78bfa';
    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(`ESTUDIO 2D KORTEX  •  PROBADOR DE COSTURAS UV EN MANIQUÍ R6  •  ${modeLabels[garmentMode] || modeLabels.shirt}`, 22, 25);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 19px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(String(title).substring(0, 48), 22, 50);

    // =========================================================================
    // PANEL IZQUIERDO: PLANTILLA PNG EXTRAÍDA CON GUÍAS UV Y FONDO DAMERO
    // =========================================================================
    const leftX = 20;
    const leftY = 64;
    const leftW = 315;
    const leftH = 362;

    ctx.fillStyle = HUD_CARD_BG;
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.45)';
    ctx.lineWidth = 1.4;
    drawRoundedRect(ctx, leftX, leftY, leftW, leftH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#dbdee1';
    ctx.font = `bold 12px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText('PLANTILLA UV EN BRUTO (585×559)', leftX + 14, leftY + 22);

    const tplBoxX = leftX + 14;
    const tplBoxY = leftY + 32;
    const tplBoxW = 287;
    const tplBoxH = 274;

    drawStudioCheckerboard(ctx, tplBoxX, tplBoxY, tplBoxW, tplBoxH, 8, 12);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, tplBoxX, tplBoxY, tplBoxW, tplBoxH, 8);
    ctx.stroke();

    if (img) {
        ctx.drawImage(img, tplBoxX, tplBoxY, tplBoxW, tplBoxH);

        // Dibujar recuadros guía sutiles sobre la plantilla para mostrar de dónde sale cada pieza UV
        if (garmentMode !== 'tshirt') {
            const gx = tplBoxW / 585;
            const gy = tplBoxH / 559;
            const drawUvGuide = (rx, ry, rw, rh, color, label) => {
                const bx = tplBoxX + rx * gx;
                const by = tplBoxY + ry * gy;
                const bw = rw * gx;
                const bh = rh * gy;
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.3;
                ctx.strokeRect(bx, by, bw, bh);
                ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
                ctx.fillRect(bx + 1, by + 1, Math.min(bw - 2, label.length * 5.4 + 6), 12);
                ctx.fillStyle = color;
                ctx.font = `bold 8px "${FONT_FAMILY}", sans-serif`;
                ctx.fillText(label, bx + 4, by + 10);
                ctx.restore();
            };

            drawUvGuide(231, 74, 128, 128, '#38bdf8', 'FRENTE');
            drawUvGuide(427, 74, 128, 128, '#a78bfa', 'ESPALDA');
            drawUvGuide(217, 355, 64, 128, '#34d399', 'DER');
            drawUvGuide(308, 355, 64, 128, '#fbbf24', 'IZQ');
        }
    } else {
        ctx.fillStyle = '#949ba4';
        ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText('No se pudo cargar la imagen PNG', tplBoxX + 42, tplBoxY + 138);
    }

    // Leyenda inferior del panel izquierdo
    ctx.fillStyle = '#949ba4';
    ctx.font = `11px "${FONT_FAMILY}", sans-serif`;
    const resTxt = img ? `Resolución fuente: ${img.width}×${img.height} px` : 'Sin textura';
    ctx.fillText(`${resTxt}  •  Escala UV automática`, leftX + 14, leftY + 326);

    ctx.fillStyle = '#38bdf8';
    ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText('■ Frente', leftX + 14, leftY + 346);
    ctx.fillStyle = '#a78bfa';
    ctx.fillText('■ Espalda', leftX + 74, leftY + 346);
    ctx.fillStyle = '#34d399';
    ctx.fillText('■ Brazo/Pierna Der.', leftX + 142, leftY + 346);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('■ Izq.', leftX + 258, leftY + 346);

    // =========================================================================
    // PANEL DERECHO: MANIQUÍ R6 DOBLE (VISTA FRONTAL + VISTA TRASERA)
    // =========================================================================
    const rightX = 350;
    const rightY = 64;
    const rightW = 410;
    const rightH = 362;

    ctx.fillStyle = HUD_CARD_BG;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1.4;
    drawRoundedRect(ctx, rightX, rightY, rightW, rightH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#dbdee1';
    ctx.font = `bold 12px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText('PREVISUALIZACIÓN EN MANIQUÍ R6 (FRENTE Y ESPALDA)', rightX + 16, rightY + 22);

    // Estudio con iluminación de contraste detrás de los maniquíes para que la ropa negra se vea nítida
    const stageX = rightX + 14;
    const stageY = rightY + 32;
    const stageW = rightW - 28;
    const stageH = 292;

    drawStudioCheckerboard(ctx, stageX, stageY, stageW, stageH, 8, 16);

    // Gradiente radial suave de estudio sobre el damero para dar profundidad 3D
    const studioGrad = ctx.createRadialGradient(
        stageX + stageW / 2, stageY + stageH * 0.45, 20,
        stageX + stageW / 2, stageY + stageH * 0.5, stageW * 0.65
    );
    studioGrad.addColorStop(0, 'rgba(71, 85, 105, 0.55)');
    studioGrad.addColorStop(1, 'rgba(30, 32, 38, 0.72)');
    ctx.save();
    drawRoundedRect(ctx, stageX, stageY, stageW, stageH, 8);
    ctx.clip();
    ctx.fillStyle = studioGrad;
    ctx.fillRect(stageX, stageY, stageW, stageH);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, stageX, stageY, stageW, stageH, 8);
    ctx.stroke();

    // Función auxiliar para recortar y dibujar una región UV escalada de la plantilla 585x559
    const sx = img ? img.width / 585 : 1;
    const sy = img ? img.height / 559 : 1;

    const drawUvPatch = (srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH) => {
        if (!img) return;
        const realX = Math.max(0, Math.round(srcX * sx));
        const realY = Math.max(0, Math.round(srcY * sy));
        const realW = Math.max(1, Math.min(img.width - realX, Math.round(srcW * sx)));
        const realH = Math.max(1, Math.min(img.height - realY, Math.round(srcH * sy)));
        ctx.drawImage(img, realX, realY, realW, realH, dstX, dstY, dstW, dstH);
    };

    // Dibujar un maniquí R6 completo (isFront = true para Frente, false para Espalda)
    const drawR6Mannequin = (centerX, topY, isFront) => {
        const torsoW = 76;
        const torsoH = 76;
        const limbW = 36;
        const limbH = 76;
        const headSize = 42;
        const gap = 3;

        const headX = centerX - headSize / 2;
        const headY = topY + 20;
        const torsoX = centerX - torsoW / 2;
        const torsoY = headY + headSize + 4;
        const leftBoxX = torsoX - gap - limbW;   // En Frente: Brazo Derecho del personaje; en Espalda: Brazo Izquierdo
        const rightBoxX = torsoX + torsoW + gap; // En Frente: Brazo Izquierdo del personaje; en Espalda: Brazo Derecho
        const legsY = torsoY + torsoH + 3;
        const leftLegX = torsoX;
        const rightLegX = torsoX + limbW + 4;

        // Etiqueta superior (VISTA FRONTAL / VISTA TRASERA)
        ctx.fillStyle = isFront ? '#38bdf8' : '#a78bfa';
        ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
        const viewLabel = isFront ? 'VISTA FRONTAL (FRENTE)' : 'VISTA TRASERA (ESPALDA)';
        const labelW = ctx.measureText(viewLabel).width;
        ctx.fillText(viewLabel, centerX - labelW / 2, topY + 11);

        // Sombra elíptica en el piso del maniquí
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
        ctx.beginPath();
        ctx.ellipse(centerX, legsY + limbH + 9, 64, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 1. CABEZA R6 CLÁSICA CON SOMBREADO 3D
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = 5;
        ctx.fillStyle = '#f5cd30';
        drawRoundedRect(ctx, headX, headY, headSize, headSize, 9);
        ctx.fill();
        ctx.restore();

        // Brillo superior de la cabeza
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        drawRoundedRect(ctx, headX + 4, headY + 3, headSize - 8, 8, 4);
        ctx.fill();

        // Rostro clásico de Roblox en la vista frontal
        if (isFront) {
            ctx.fillStyle = '#1e1f22';
            ctx.beginPath();
            ctx.arc(centerX - 8, headY + 17, 2.6, 0, Math.PI * 2);
            ctx.arc(centerX + 8, headY + 17, 2.6, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#1e1f22';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(centerX, headY + 23, 8, 0.15 * Math.PI, 0.85 * Math.PI);
            ctx.stroke();
        }

        // 2. CUERPO BASE DEL MANIQUÍ (Piel + Ropa neutra en las zonas no cubiertas)
        // Brazos base (piel amarilla en manos + manga base gris claro)
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(leftBoxX, torsoY, limbW, limbH - 12);
        ctx.fillRect(rightBoxX, torsoY, limbW, limbH - 12);
        // Manos base color piel
        ctx.fillStyle = '#f5cd30';
        ctx.fillRect(leftBoxX, torsoY + limbH - 12, limbW, 12);
        ctx.fillRect(rightBoxX, torsoY + limbH - 12, limbW, 12);

        // Torso base
        ctx.fillStyle = garmentMode === 'pants' ? '#334155' : '#cbd5e1';
        ctx.fillRect(torsoX, torsoY, torsoW, torsoH);

        // Piernas base (Jeans oscuros de estudio cuando se prueba una camisa)
        ctx.fillStyle = garmentMode === 'shirt' || garmentMode === 'tshirt' ? '#1e293b' : '#cbd5e1';
        ctx.fillRect(leftLegX, legsY, limbW, limbH);
        ctx.fillRect(rightLegX, legsY, limbW, limbH);

        // Calzado base en modo camisa
        if (garmentMode === 'shirt' || garmentMode === 'tshirt') {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(leftLegX, legsY + limbH - 10, limbW, 10);
            ctx.fillRect(rightLegX, legsY + limbH - 10, limbW, 10);
        }

        // 3. APLICAR MAPEO UV REAL SEGÚN EL TIPO DE PRENDA
        if (img) {
            if (garmentMode === 'tshirt') {
                // T-Shirt: imagen pegada en el pecho frontal
                if (isFront) {
                    ctx.drawImage(img, torsoX + 8, torsoY + 8, torsoW - 16, torsoH - 16);
                }
            } else {
                const mapShirt = garmentMode === 'shirt' || garmentMode === 'full';
                const mapPants = garmentMode === 'pants' || garmentMode === 'full';

                if (mapShirt) {
                    if (isFront) {
                        // Torso Frontal: (231, 74, 128, 128)
                        drawUvPatch(231, 74, 128, 128, torsoX, torsoY, torsoW, torsoH);
                        // En Vista Frontal: a la izquierda del visor está el Brazo Derecho (217, 355, 64, 128)
                        drawUvPatch(217, 355, 64, 128, leftBoxX, torsoY, limbW, limbH);
                        // En Vista Frontal: a la derecha del visor está el Brazo Izquierdo (308, 355, 64, 128)
                        drawUvPatch(308, 355, 64, 128, rightBoxX, torsoY, limbW, limbH);
                    } else {
                        // Torso Trasero: (427, 74, 128, 128)
                        drawUvPatch(427, 74, 128, 128, torsoX, torsoY, torsoW, torsoH);
                        // En Vista Trasera: a la izquierda del visor está el Brazo Izquierdo Trasero (440, 355, 64, 128)
                        drawUvPatch(440, 355, 64, 128, leftBoxX, torsoY, limbW, limbH);
                        // En Vista Trasera: a la derecha del visor está el Brazo Derecho Trasero (85, 355, 64, 128)
                        drawUvPatch(85, 355, 64, 128, rightBoxX, torsoY, limbW, limbH);
                    }
                }

                if (mapPants) {
                    if (isFront) {
                        // Cintura/Pelvis en Torso si no es camisa encima
                        if (!mapShirt) {
                            drawUvPatch(231, 74, 128, 128, torsoX, torsoY, torsoW, torsoH);
                        }
                        // Pierna Derecha Frontal (217, 355, 64, 128) -> izquierda del visor
                        drawUvPatch(217, 355, 64, 128, leftLegX, legsY, limbW, limbH);
                        // Pierna Izquierda Frontal (308, 355, 64, 128) -> derecha del visor
                        drawUvPatch(308, 355, 64, 128, rightLegX, legsY, limbW, limbH);
                    } else {
                        if (!mapShirt) {
                            drawUvPatch(427, 74, 128, 128, torsoX, torsoY, torsoW, torsoH);
                        }
                        // Pierna Izquierda Trasera (440, 355, 64, 128) -> izquierda del visor
                        drawUvPatch(440, 355, 64, 128, leftLegX, legsY, limbW, limbH);
                        // Pierna Derecha Trasera (85, 355, 64, 128) -> derecha del visor
                        drawUvPatch(85, 355, 64, 128, rightLegX, legsY, limbW, limbH);
                    }
                }
            }
        }

        // 4. CONTORNOS Y BISELADO 3D DE LAS PARTES DEL MANIQUÍ (Permite distinguir costuras en ropa 100% negra)
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
        ctx.lineWidth = 1.1;
        ctx.strokeRect(torsoX, torsoY, torsoW, torsoH);
        ctx.strokeRect(leftBoxX, torsoY, limbW, limbH);
        ctx.strokeRect(rightBoxX, torsoY, limbW, limbH);
        ctx.strokeRect(leftLegX, legsY, limbW, limbH);
        ctx.strokeRect(rightLegX, legsY, limbW, limbH);

        // Sombreado lateral sutil en los brazos y piernas para volumen R6
        ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
        ctx.fillRect(leftBoxX, torsoY, 5, limbH);
        ctx.fillRect(rightBoxX + limbW - 5, torsoY, 5, limbH);
        ctx.fillRect(leftLegX, legsY, 5, limbH);
        ctx.fillRect(rightLegX + limbW - 5, legsY, 5, limbH);
        ctx.restore();
    };

    // Renderizar Maniquí Frontal (izquierda del escenario) y Maniquí Trasero (derecha del escenario)
    drawR6Mannequin(stageX + 94, stageY + 10, true);
    drawR6Mannequin(stageX + 286, stageY + 10, false);

    // Línea divisoria central punteada entre Frente y Espalda
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(stageX + stageW / 2, stageY + 12);
    ctx.lineTo(stageX + stageW / 2, stageY + stageH - 12);
    ctx.stroke();
    ctx.restore();

    // Pie de confirmación de costuras UV (sin caracteres Unicode faltantes)
    ctx.fillStyle = 'rgba(35, 165, 90, 0.18)';
    drawRoundedRect(ctx, rightX + 14, rightY + 330, rightW - 28, 22, 6);
    ctx.fill();

    ctx.fillStyle = '#23a55a';
    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText('[OK] Costuras UV R6 alineadas (Frente + Espalda) — Podés alternar Camisa / Pantalón abajo', rightX + 22, rightY + 345);

    return canvas.toBuffer('image/png');
}


/**
 * 6. Herramienta 2.4: Tarjeta de Alta Resolución del Exportador 3D (Render HD + Ficha Técnica .OBJ/.MTL)
 */
async function generate3DShowcaseCard(exportInfo) {
    const width = 760;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = DISCORD_DARK_BG;
    ctx.fillRect(0, 0, width, height);

    // Header
    ctx.fillStyle = '#949ba4';
    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText('KORTEX 3D STUDIO  •  RENDER PNG DE ALTA RESOLUCIÓN + PAQUETE WAVEFRONT (.OBJ / .MTL)', 22, 26);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 20px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(String(exportInfo.displayTitle || 'Modelo 3D Roblox').substring(0, 44), 22, 52);

    // Panel Izquierdo: Render 3D HD con retícula espacial
    ctx.fillStyle = '#1e1f22';
    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 1.8;
    drawRoundedRect(ctx, 22, 68, 330, 330, 12);
    ctx.fill();
    ctx.stroke();

    // Dibujar grilla de estudio 3D sutil en la base del visor
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.16)';
    ctx.lineWidth = 1;
    for (let gx = 40; gx <= 330; gx += 28) {
        ctx.beginPath();
        ctx.moveTo(gx, 72);
        ctx.lineTo(gx, 392);
        ctx.stroke();
    }
    for (let gy = 88; gy <= 388; gy += 28) {
        ctx.beginPath();
        ctx.moveTo(26, gy);
        ctx.lineTo(348, gy);
        ctx.stroke();
    }

    const renderImg = await fetchImageSafe(exportInfo.renderPngBuffer || exportInfo.preview2dUrl);
    if (renderImg) {
        ctx.drawImage(renderImg, 37, 83, 300, 300);
    }

    // Panel Derecho: Especificaciones del paquete 3D exportado
    ctx.fillStyle = HUD_CARD_BG;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    drawRoundedRect(ctx, 372, 68, 366, 330, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#23a55a';
    ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText('✓ RENDER HD + ARCHIVO .ZIP LISTOS PARA DESCARGAR', 390, 96);

    const specs = [
        { label: 'ARCHIVO ADJUNTO', val: `avatar_3d_export.zip (${exportInfo.sizeKB} KB)` },
        { label: 'GEOMETRÍA 3D (.OBJ)', val: `${exportInfo.vertexCount.toLocaleString('es-AR')} vértices • ${exportInfo.faceCount.toLocaleString('es-AR')} caras` },
        { label: 'MALLAS INCLUIDAS', val: `${exportInfo.meshesExtracted} malla(s) 3D reales convertidas` },
        { label: 'TEXTURAS PNG (.MTL)', val: `${exportInfo.texturesCount} textura(s) PNG + Render 720×720 HD` },
        { label: 'COMPATIBILIDAD', val: 'Blender • Blockbench • Cinema4D • Maya' }
    ];

    specs.forEach((sp, i) => {
        const sy = 114 + i * 54;
        ctx.fillStyle = '#1e1f22';
        drawRoundedRect(ctx, 390, sy, 330, 44, 7);
        ctx.fill();

        ctx.fillStyle = '#949ba4';
        ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(sp.label, 402, sy + 16);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 12px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(String(sp.val).substring(0, 42), 402, sy + 35);
    });

    return canvas.toBuffer('image/png');
}

/**
 * 7. Herramienta 2.5: Extracción de Colores Dominantes (ctx.getImageData) y Grilla Color-Match UGC
 */
function parseHexColor(input) {
    if (!input) return null;
    const match = String(input).trim().match(/^#?([0-9a-fA-F]{6})$/);
    if (!match) return null;
    const hexClean = match[1].toUpperCase();
    const r = parseInt(hexClean.substring(0, 2), 16);
    const g = parseInt(hexClean.substring(2, 4), 16);
    const b = parseInt(hexClean.substring(4, 6), 16);
    return { hex: `#${hexClean}`, r, g, b };
}

/**
 * Traduce un color RGB a un término cromático en inglés para buscar accesorios de ese color real en el catálogo de Roblox
 */
function getClosestColorSearchTerm({ r, g, b }) {
    const namedColors = [
        { term: 'Black',   r: 22,  g: 22,  b: 22  },
        { term: 'White',   r: 242, g: 242, b: 242 },
        { term: 'Gray',    r: 120, g: 124, b: 130 },
        { term: 'Silver',  r: 175, g: 180, b: 190 },
        { term: 'Red',     r: 220, g: 38,  b: 38  },
        { term: 'Crimson', r: 145, g: 20,  b: 35  },
        { term: 'Blue',    r: 45,  g: 100, b: 230 },
        { term: 'Navy',    r: 22,  g: 38,  b: 105 },
        { term: 'Cyan',    r: 0,   g: 190, b: 225 },
        { term: 'Green',   r: 38,  g: 175, b: 72  },
        { term: 'Green',   r: 75,  g: 110, b: 35  }, // Olive / Dark Green mapeado a Green en catálogo
        { term: 'Gold',    r: 185, g: 170, b: 60  }, // Tonos dorados/mostaza como #A8A848
        { term: 'Gold',    r: 235, g: 190, b: 40  },
        { term: 'Yellow',  r: 245, g: 225, b: 50  },
        { term: 'Orange',  r: 240, g: 120, b: 30  },
        { term: 'Brown',   r: 135, g: 75,  b: 20  }, // Tonos bronce/marrón como #904800
        { term: 'Brown',   r: 105, g: 65,  b: 40  },
        { term: 'Purple',  r: 140, g: 60,  b: 220 },
        { term: 'Pink',    r: 235, g: 105, b: 180 }
    ];

    let bestTerm = 'Black';
    let bestDist = Infinity;
    for (const nc of namedColors) {
        const d = Math.sqrt(Math.pow(r - nc.r, 2) + Math.pow(g - nc.g, 2) + Math.pow(b - nc.b, 2));
        if (d < bestDist) {
            bestDist = d;
            bestTerm = nc.term;
        }
    }
    return bestTerm;
}

async function extractDominantColorsFromImage(imageUrlOrBuffer) {
    const img = await fetchImageSafe(imageUrlOrBuffer);
    if (!img) {
        return [
            { hex: '#5865F2', r: 88, g: 101, b: 242 },
            { hex: '#00B8D9', r: 0, g: 184, b: 217 },
            { hex: '#23A55A', r: 35, g: 165, b: 90 }
        ];
    }

    const size = 120;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);

    const imgData = ctx.getImageData(8, 8, 104, 104).data;
    const buckets = new Map();

    for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const a = imgData[i + 3];
        if (a < 120) continue; // Ignorar píxeles transparentes

        // Cuantizar en bloques de 24 para separar claramente los 3 tonos principales de la prenda/avatar
        const qr = Math.min(255, Math.round(r / 24) * 24);
        const qg = Math.min(255, Math.round(g / 24) * 24);
        const qb = Math.min(255, Math.round(b / 24) * 24);
        const key = `${qr},${qg},${qb}`;

        // Dar peso extra a colores con saturación cromática para priorizar ropa/accesorios sobre grises de sombra
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const satWeight = (maxC - minC) > 35 ? 1.6 : 1.0;

        buckets.set(key, (buckets.get(key) || 0) + satWeight);
    }

    const candidates = [...buckets.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => {
            const [r, g, b] = k.split(',').map(Number);
            const toHex = n => n.toString(16).padStart(2, '0').toUpperCase();
            return { hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`, r, g, b };
        });

    // Elegir los 3 tonos más representativos que sean visualmente distintos entre sí (ΔRGB > 38)
    const distinct = [];
    for (const c of candidates) {
        if (distinct.length === 0) {
            distinct.push(c);
        } else {
            const isFarEnough = distinct.every(existing => {
                const dist = Math.sqrt(
                    Math.pow(existing.r - c.r, 2) +
                    Math.pow(existing.g - c.g, 2) +
                    Math.pow(existing.b - c.b, 2)
                );
                return dist >= 38;
            });
            if (isFarEnough) distinct.push(c);
        }
        if (distinct.length >= 3) break;
    }

    for (const c of candidates) {
        if (distinct.length >= 3) break;
        if (!distinct.some(d => d.hex === c.hex)) distinct.push(c);
    }

    while (distinct.length < 3) {
        const base = distinct[0] || { hex: '#5865F2', r: 88, g: 101, b: 242 };
        distinct.push(base);
    }
    return distinct;
}

/**
 * Calcula la coincidencia cromática (0..100%) mediante distancia euclidiana ΔRGB contra los 3 tonos principales del ítem
 */
async function calculateImageColorMatch(imageUrl, targetColor) {
    const dom = await extractDominantColorsFromImage(imageUrl);
    let minDist = Infinity;
    let bestTone = dom[0];

    for (const candidateTone of dom) {
        const dist = Math.sqrt(
            Math.pow(candidateTone.r - targetColor.r, 2) +
            Math.pow(candidateTone.g - targetColor.g, 2) +
            Math.pow(candidateTone.b - targetColor.b, 2)
        );
        if (dist < minDist) {
            minDist = dist;
            bestTone = candidateTone;
        }
    }

    const maxDist = 441.67; // sqrt(255^2 * 3)
    const matchPct = Math.max(20, Math.min(99, Math.round((1 - minDist / maxDist) * 100)));
    return { matchPct, detectedHex: bestTone.hex };
}

async function generateColorMatchCanvas(palette, matchedItems, baseTitle = 'Prenda Base', activeToneIdx = 0, categoryLabel = 'Todos los Cosméticos') {
    const width = 760;
    const height = 408;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = DISCORD_DARK_BG;
    ctx.fillRect(0, 0, width, height);

    // Encabezado izquierdo acotado a x <= 445 para no superponerse jamás con las muestras #1, #2 y #3
    ctx.fillStyle = '#949ba4';
    ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText('COLOR-MATCH ROBLOX  •  AFINIDAD CROMÁTICA (ΔRGB)', 22, 23);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 17px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(`${String(baseTitle).substring(0, 32)}`, 22, 45);

    ctx.fillStyle = '#a78bfa';
    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(`Filtro activo: ${String(categoryLabel).substring(0, 38)}`, 22, 63);

    // Muestras de los 3 colores hexadecimales dominantes arriba a la derecha (resaltando el tono activo)
    palette.slice(0, 3).forEach((col, i) => {
        const isCurrentTone = i === Number(activeToneIdx || 0);
        const bx = 460 + i * 95;
        ctx.fillStyle = col.hex;
        ctx.strokeStyle = isCurrentTone ? '#23a55a' : 'rgba(255,255,255,0.45)';
        ctx.lineWidth = isCurrentTone ? 3 : 1.2;
        drawRoundedRect(ctx, bx, 18, 86, 38, 6);
        ctx.fill();
        ctx.stroke();

        const lum = (0.299 * col.r + 0.587 * col.g + 0.114 * col.b);
        ctx.fillStyle = lum > 155 ? '#111520' : '#ffffff';
        ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(`#${i + 1} ${col.hex}`, bx + 7, 41);
    });

    const itemsToDraw = Array.isArray(matchedItems) ? matchedItems.slice(0, 4) : [];
    const thumbs = await Promise.all(itemsToDraw.map(m => fetchImageSafe(m.imageUrl)));

    if (itemsToDraw.length === 0) {
        ctx.fillStyle = HUD_CARD_BG;
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.35)';
        ctx.lineWidth = 1.2;
        drawRoundedRect(ctx, 22, 82, 716, 290, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 15px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText('No se encontraron cosméticos en venta para esta combinación exacta.', 140, 215);

        ctx.fillStyle = '#949ba4';
        ctx.font = `12px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText('Probá seleccionando otro Tono (#1, #2, #3) o cambiando el filtro de cosmético abajo.', 150, 242);
        return canvas.toBuffer('image/png');
    }

    itemsToDraw.forEach((item, idx) => {
        const colIdx = idx % 2;
        const rowIdx = Math.floor(idx / 2);
        const x = 22 + colIdx * 362;
        const y = 80 + rowIdx * 154;

        ctx.fillStyle = HUD_CARD_BG;
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.35)';
        ctx.lineWidth = 1.2;
        drawRoundedRect(ctx, x, y, 350, 140, 10);
        ctx.fill();
        ctx.stroke();

        if (thumbs[idx]) {
            ctx.drawImage(thumbs[idx], x + 12, y + 15, 110, 110);
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(String(item.name).substring(0, 24), x + 134, y + 34);

        ctx.fillStyle = '#23a55a';
        ctx.font = `bold 15px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(`${item.matchPct}% Match Cromático`, x + 134, y + 62);

        ctx.fillStyle = '#dbdee1';
        ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(`Precio: ${fmtMoneda(item.price)}`, x + 134, y + 88);

        ctx.fillStyle = item.detectedHex || palette[0].hex;
        drawRoundedRect(ctx, x + 134, y + 100, 18, 18, 4);
        ctx.fill();

        ctx.fillStyle = '#949ba4';
        ctx.font = `11px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(`Tono: ${item.detectedHex || palette[0].hex} • ID ${item.id}`, x + 158, y + 113);
    });

    return canvas.toBuffer('image/png');
}

module.exports = {
    generatePriceChart,
    generatePriceFloorsChart,
    generateOutfitSandboxCard,
    resolveAnatomicalSlot,
    generateClonesComparisonCanvas,
    generateMannequinTemplateCanvas,
    generate3DShowcaseCard,
    parseHexColor,
    getClosestColorSearchTerm,
    extractDominantColorsFromImage,
    calculateImageColorMatch,
    generateColorMatchCanvas,
    chartCache
};
