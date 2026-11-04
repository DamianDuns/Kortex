// ==========================================
// ARCHIVO: src/utils/chartGenerator.js
// Renderizador local en RAM de gráficas financieras y tarjetas de estudio 3D/2D (#2b2d31)
// ==========================================

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const Chart = require('chart.js/auto');
const echarts = require('echarts');
const { Resvg } = require('@resvg/resvg-js');
const axios = require('axios');

// Registrar fuentes TTF locales incluidas en el repositorio
const FONT_REGULAR_PATH = path.join(__dirname, '../../assets/fonts/LiberationSans-Regular.ttf');
const FONT_BOLD_PATH = path.join(__dirname, '../../assets/fonts/LiberationSans-Bold.ttf');
const FONT_FAMILY = 'KortexSans';
const FONT_REGULAR_BUFFER = fs.existsSync(FONT_REGULAR_PATH) ? fs.readFileSync(FONT_REGULAR_PATH) : null;
const FONT_BOLD_BUFFER = fs.existsSync(FONT_BOLD_PATH) ? fs.readFileSync(FONT_BOLD_PATH) : null;

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

const RANGO_TEXTO_EN = {
    '24h': '24 HOURS',
    '7d': '7 DAYS',
    '30d': '30 DAYS',
    'all': 'ALL-TIME HISTORY'
};

function getCurrentLang(explicitLang) {
    if (explicitLang === 'en' || explicitLang === 'es') return explicitLang;
    try {
        const { obtenerIdiomaActual } = require('./i18n');
        return obtenerIdiomaActual();
    } catch {
        return 'es';
    }
}

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

function fmtMonedaCompacta(val, esUSD = false) {
    const n = Number(val || 0);
    if (esUSD) return `$${n.toFixed(2)}`;
    if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1).replace('.0', '')}M R$`;
    if (Math.abs(n) >= 10000) return `${(n / 1000).toFixed(0)}k R$`;
    return `${Math.round(n).toLocaleString('es-AR')} R$`;
}

function fitText(ctx, text, maxWidth) {
    const raw = String(text ?? '');
    if (!maxWidth || maxWidth <= 0) return raw;
    if (ctx.measureText(raw).width <= maxWidth) return raw;
    let clipped = raw;
    while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
        clipped = clipped.slice(0, -1);
    }
    return `${clipped}…`;
}

function computeNiceYAxis(minVal, maxVal, esUSD = false) {
    let lo = Number.isFinite(minVal) ? minVal : 0;
    let hi = Number.isFinite(maxVal) ? maxVal : 10;
    if (lo > hi) {
        const tmp = lo;
        lo = hi;
        hi = tmp;
    }

    if (esUSD) {
        const span = Math.max(1, hi - lo);
        const pad = span * 0.2;
        const yMin = Math.max(0, Number((lo - pad).toFixed(2)));
        const yMax = Number((hi + pad).toFixed(2));
        const interval = Number(((yMax - yMin) / 4).toFixed(2)) || 0.5;
        return { yMin, yMax, interval };
    }

    const rawSpan = hi - lo;
    const pad = rawSpan === 0
        ? Math.max(4, Math.ceil((lo || 10) * 0.2))
        : Math.max(2, Math.ceil(rawSpan * 0.18));

    const targetMin = Math.max(0, lo - pad);
    const targetMax = Math.max(targetMin + 4, hi + pad);
    const neededRange = Math.max(4, targetMax - targetMin);

    const niceSteps = [
        1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500,
        1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000,
        100000, 250000, 500000, 1000000, 2500000, 5000000
    ];
    const roughStep = neededRange / 4.5;
    let step = niceSteps.find(s => s >= roughStep) || Math.ceil(roughStep / 1000) * 1000;

    let yMin = Math.max(0, Math.floor(targetMin / step) * step);
    let yMax = Math.ceil(targetMax / step) * step;
    if (yMax <= hi) yMax += step;
    if (yMin > 0 && lo - yMin < step * 0.25) {
        yMin = Math.max(0, yMin - step);
    }
    if (yMax === yMin) {
        yMax = yMin + step * 4;
    }

    return { yMin, yMax, interval: step };
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
 * Helper reutilizable para renderizar cualquier gráfico de Apache ECharts en el servidor (SSR SVG -> PNG vía @resvg/resvg-js)
 * sin abrir navegador y liberando la instancia de memoria inmediatamente.
 */
async function renderEChartsToImage(option, width = 700, height = 300) {
    const ssrChart = echarts.init(null, null, {
        renderer: 'svg',
        ssr: true,
        width,
        height
    });
    let svgStr = '';
    try {
        ssrChart.setOption({
            animation: false,
            ...option
        });
        svgStr = ssrChart.renderToSVGString();
    } finally {
        ssrChart.dispose();
    }

    const resvg = new Resvg(svgStr, {
        background: 'rgba(0, 0, 0, 0)',
        font: {
            fontFiles: [FONT_REGULAR_PATH, FONT_BOLD_PATH],
            loadSystemFonts: false,
            defaultFontFamily: 'Liberation Sans'
        }
    });
    const pngBuffer = resvg.render().asPng();
    const image = await loadImage(pngBuffer);
    return { pngBuffer, image };
}

/**
 * 1. Gráfica Histórica de Precios (Price Sniper v2.0) con Apache ECharts SSR + Satori/Resvg + Skia Canvas (@napi-rs/canvas)
 */
async function generatePriceChart(historyData, itemName, options = {}) {
    const {
        itemId = itemName || 'item',
        daysRange = '7d',
        esUSD = false,
        targetPrice = null,
        imageUrl = null,
        lang: explicitLang = null
    } = options;
    const lang = getCurrentLang(explicitLang);
    const isEn = lang === 'en';

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

    const metaCumplida = tieneMeta && lastPrice <= metaNum;
    const bajoDelOriginal = firstPrice > 0 && lastPrice < firstPrice;
    const ahorroOriginal = bajoDelOriginal ? (firstPrice - lastPrice) : 0;
    const ahorroBajoMeta = metaCumplida ? Math.max(0, metaNum - lastPrice) : 0;

    const cacheKey = `${itemId}_${daysRange}_${historyLength}_${lang}`;
    const signature = `v8_meta_checkin_echarts_${lang}_${firstPrice}_${lastPrice}_${metaNum ?? 'none'}`;
    const cachedEntry = chartCache.get(cacheKey);
    if (cachedEntry && cachedEntry.signature === signature) {
        return cachedEntry.buffer;
    }

    const values = puntos.map(p => Number(p.price));
    const minPrice = Math.min(...values);
    const maxPrice = Math.max(...values);
    const avgPrice = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
    const diff = lastPrice - firstPrice;
    const pctChange = firstPrice > 0 ? ((diff / firstPrice) * 100) : 0;

    const subioOMantuvo = lastPrice >= firstPrice;
    // Si la meta fue alcanzada o el precio bajó del original, usar verde esmeralda brillante para destacar el ahorro/logro
    const esPositivoComprador = metaCumplida || bajoDelOriginal;
    const lineColor = metaCumplida
        ? '#10B981'
        : (bajoDelOriginal ? '#22C55E' : (subioOMantuvo ? '#38BDF8' : '#F43F5E'));
    const areaTopColor = metaCumplida
        ? 'rgba(16, 185, 129, 0.38)'
        : (bajoDelOriginal ? 'rgba(34, 197, 94, 0.34)' : 'rgba(56, 189, 248, 0.28)');
    const areaBottomColor = metaCumplida
        ? 'rgba(16, 185, 129, 0.02)'
        : (bajoDelOriginal ? 'rgba(34, 197, 94, 0.01)' : 'rgba(56, 189, 248, 0.01)');

    const firstTime = new Date(puntos[0].timestamp).getTime();
    const lastTime = new Date(puntos[historyLength - 1].timestamp).getTime();
    const spanMs = Math.max(0, lastTime - firstTime);

    const labels = puntos.map(p => formatearEtiquetaFecha(p.timestamp, spanMs));

    const todosLosValores = tieneMeta ? [...values, metaNum] : values;
    const minEscala = Math.min(...todosLosValores);
    const maxEscala = Math.max(...todosLosValores);
    const { yMin, yMax, interval: yInterval } = computeNiceYAxis(minEscala, maxEscala, esUSD);

    const width = 820;
    const height = 430;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Fondo financiero oscuro continuo sin costuras ni recortes
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0E121B');
    bgGrad.addColorStop(0.5, metaCumplida ? '#0F221D' : '#151B28');
    bgGrad.addColorStop(1, '#0F131D');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const glowGrad = ctx.createRadialGradient(160, 42, 12, 160, 42, 340);
    glowGrad.addColorStop(0, esPositivoComprador ? 'rgba(16, 185, 129, 0.18)' : 'rgba(56, 189, 248, 0.13)');
    glowGrad.addColorStop(1, 'rgba(15, 19, 29, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, width, height);

    const rangoLabel = isEn
        ? (RANGO_TEXTO_EN[daysRange] || String(daysRange).toUpperCase())
        : (RANGO_TEXTO[daysRange] || String(daysRange).toUpperCase());

    // Tarjetas KPI superiores a la derecha (dimensionadas para dejar amplio margen a la izquierda)
    const cards = [
        {
            label: isEn ? 'ORIGINAL' : 'ORIGINAL',
            value: fmtMonedaCompacta(firstPrice, esUSD),
            color: bajoDelOriginal ? '#94A3B8' : '#CBD5E1'
        },
        { label: isEn ? 'LOWEST' : 'MÍNIMO', value: fmtMonedaCompacta(minPrice, esUSD), color: '#4ADE80' },
        { label: isEn ? 'HIGHEST' : 'MÁXIMO', value: fmtMonedaCompacta(maxPrice, esUSD), color: '#FB7185' },
        tieneMeta
            ? {
                label: metaCumplida
                    ? (isEn ? '✅ GOAL MET!' : '✅ ¡META LOGRADA!')
                    : (isEn ? 'TARGET META' : 'META SNIPER'),
                value: metaCumplida
                    ? `${fmtMonedaCompacta(metaNum, esUSD)} ✓`
                    : fmtMonedaCompacta(metaNum, esUSD),
                color: metaCumplida ? '#4ADE80' : '#FBBF24',
                highlightSuccess: metaCumplida
            }
            : { label: isEn ? 'AVERAGE' : 'PROMEDIO', value: fmtMonedaCompacta(avgPrice, esUSD), color: '#38BDF8' }
    ];

    const cardW = 96;
    const cardH = 54;
    const gap = 7;
    const startX = width - 18 - (cards.length * cardW + (cards.length - 1) * gap); // x = 397
    const cardY = 16;

    const thumbImg = imageUrl ? await fetchImageSafe(imageUrl) : null;
    const leftOffset = thumbImg ? 78 : 22;
    const maxLeftHeaderWidth = startX - leftOffset - 14;

    if (thumbImg) {
        ctx.save();
        ctx.fillStyle = '#1B2130';
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, 18, 16, 50, 50, 10);
        ctx.fill();
        ctx.stroke();
        ctx.drawImage(thumbImg, 21, 19, 44, 44);
        ctx.restore();
    }

    ctx.fillStyle = metaCumplida ? '#4ADE80' : (bajoDelOriginal ? '#34D399' : '#38BDF8');
    ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
    const kickerRaw = metaCumplida
        ? (isEn
            ? `🎯 GOAL COMPLETED! • ${rangoLabel} (${historyLength} SAMPLES)`
            : `🎯 ¡META COMPLETADA! • ${rangoLabel} (${historyLength} MUESTRAS)`)
        : (bajoDelOriginal
            ? (isEn
                ? `📉 BELOW ORIGINAL PRICE • ${rangoLabel}`
                : `📉 MÁS BAJO QUE EL ORIGINAL • ${rangoLabel}`)
            : (isEn
                ? `PRICE HISTORY • ${rangoLabel} (${historyLength} SAMPLES)`
                : `HISTORIAL DE PRECIOS • ${rangoLabel} (${historyLength} MUESTRAS)`));
    ctx.fillText(fitText(ctx, kickerRaw, maxLeftHeaderWidth), leftOffset, 24);

    const textoActual = fmtMoneda(lastPrice, esUSD);
    ctx.fillStyle = '#F8FAFC';
    ctx.font = `bold 21px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(textoActual, leftOffset, 52);
    const anchoPrecio = ctx.measureText(textoActual).width;

    const signo = diff > 0 ? '+' : '';
    const pctStr = `${signo}${pctChange.toFixed(1).replace('.0', '')}%`;
    const varTextoRaw = diff === 0
        ? (metaCumplida
            ? (isEn ? '✓ Target Reached' : '✓ Meta Cumplida')
            : (isEn ? '0% vs Original' : '0% vs Original'))
        : (bajoDelOriginal
            ? `${signo}${fmtMonedaCompacta(diff, esUSD)} (${pctStr} ${isEn ? 'vs Orig.' : 'vs Orig.'})`
            : `${signo}${fmtMonedaCompacta(diff, esUSD)} (${pctStr})`);

    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    const varX = leftOffset + anchoPrecio + 10;
    const availableVarW = Math.max(64, startX - 14 - varX);
    const varTexto = fitText(ctx, varTextoRaw, availableVarW - 16);
    const textVarW = ctx.measureText(varTexto).width;
    const varWidth = textVarW + 16;
    const varY = 33;
    const varH = 23;

    const badgeBg = (metaCumplida || bajoDelOriginal)
        ? 'rgba(16, 185, 129, 0.24)'
        : (diff === 0 ? 'rgba(148, 163, 184, 0.16)' : 'rgba(244, 63, 94, 0.22)');
    const badgeColor = (metaCumplida || bajoDelOriginal)
        ? '#4ADE80'
        : (diff === 0 ? '#E2E8F0' : '#FB7185');

    if (varX + varWidth <= startX - 6) {
        ctx.fillStyle = badgeBg;
        ctx.strokeStyle = badgeColor;
        ctx.lineWidth = 1.3;
        drawRoundedRect(ctx, varX, varY, varWidth, varH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = badgeColor;
        ctx.textBaseline = 'middle';
        ctx.fillText(varTexto, varX + 8, varY + varH / 2);
        ctx.textBaseline = 'alphabetic';
    }

    ctx.fillStyle = metaCumplida ? '#A7F3D0' : '#94A3B8';
    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    let subTitleLine = `${String(itemName || 'Objeto')} • ID ${itemId}`;
    if (metaCumplida && bajoDelOriginal) {
        subTitleLine = isEn
            ? `✓ Saved ${fmtMonedaCompacta(ahorroOriginal, esUSD)} vs Original (${fmtMonedaCompacta(firstPrice, esUSD)}) • ${String(itemName || 'Item')}`
            : `✓ Ahorro: -${fmtMonedaCompacta(ahorroOriginal, esUSD)} vs Original (${fmtMonedaCompacta(firstPrice, esUSD)}) • ${String(itemName || 'Objeto')}`;
    } else if (metaCumplida) {
        subTitleLine = isEn
            ? `✓ Target ${fmtMonedaCompacta(metaNum, esUSD)} reached! • ${String(itemName || 'Item')}`
            : `✓ ¡Meta de ${fmtMonedaCompacta(metaNum, esUSD)} alcanzada! • ${String(itemName || 'Objeto')}`;
    } else if (bajoDelOriginal) {
        subTitleLine = isEn
            ? `📉 -${fmtMonedaCompacta(ahorroOriginal, esUSD)} below Original (${fmtMonedaCompacta(firstPrice, esUSD)}) • ${String(itemName || 'Item')}`
            : `📉 -${fmtMonedaCompacta(ahorroOriginal, esUSD)} más bajo que el Original (${fmtMonedaCompacta(firstPrice, esUSD)}) • ${String(itemName || 'Objeto')}`;
    }
    ctx.fillText(fitText(ctx, subTitleLine, maxLeftHeaderWidth), leftOffset, 70);

    cards.forEach((card, idx) => {
        const cx = startX + idx * (cardW + gap);
        ctx.save();
        ctx.shadowColor = card.highlightSuccess ? 'rgba(16, 185, 129, 0.35)' : 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = card.highlightSuccess ? 12 : 8;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = card.highlightSuccess ? 'rgba(6, 78, 59, 0.85)' : '#1B2030';
        drawRoundedRect(ctx, cx, cardY, cardW, cardH, 8);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = card.highlightSuccess ? '#10B981' : 'rgba(255, 255, 255, 0.10)';
        ctx.lineWidth = card.highlightSuccess ? 1.8 : 1;
        drawRoundedRect(ctx, cx, cardY, cardW, cardH, 8);
        ctx.stroke();

        ctx.fillStyle = card.highlightSuccess ? '#A7F3D0' : '#94A3B8';
        ctx.font = `bold 9px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(fitText(ctx, card.label, cardW - 14), cx + 8, cardY + 19);

        ctx.fillStyle = card.color;
        ctx.font = `bold 12px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(fitText(ctx, card.value, cardW - 16), cx + 8, cardY + 41);
    });

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(18, 82);
    ctx.lineTo(width - 18, 82);
    ctx.stroke();

    // 2. Serie financiera con Apache ECharts SSR ocupando el 100% del ancho útil del recuadro
    let idxMin = 0;
    let idxMax = 0;
    values.forEach((v, i) => {
        if (v < values[idxMin]) idxMin = i;
        if (v > values[idxMax]) idxMax = i;
    });
    const highlightIndices = new Set([0, values.length - 1, idxMin, idxMax]);

    const seriesData = values.map((val, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === values.length - 1;
        const isHighlighted = highlightIndices.has(idx) || values.length <= 6;
        // Evitar que la etiqueta del primer o último punto se salga de los bordes laterales
        const labelOffset = isFirst ? [18, 0] : (isLast ? [-18, 0] : [0, 0]);
        return {
            value: val,
            symbolSize: isLast ? 11 : (isHighlighted ? 7 : 4),
            itemStyle: {
                color: isLast ? '#FFFFFF' : lineColor,
                borderColor: lineColor,
                borderWidth: isLast ? 3 : 1.5
            },
            label: isHighlighted
                ? {
                    show: true,
                    position: 'top',
                    distance: 7,
                    offset: labelOffset,
                    color: '#F8FAFC',
                    backgroundColor: isLast ? lineColor : 'rgba(15, 23, 42, 0.92)',
                    borderColor: lineColor,
                    borderWidth: 1,
                    borderRadius: 4,
                    padding: [3, 6],
                    fontFamily: 'Liberation Sans',
                    fontWeight: 'bold',
                    fontSize: 9.5,
                    formatter: () => fmtMoneda(val, esUSD)
                }
                : { show: false }
        };
    });

    const echartsSeries = [
        {
            name: itemName || 'Price',
            type: 'line',
            smooth: 0.3,
            data: seriesData,
            symbol: 'circle',
            z: 3,
            lineStyle: {
                width: 3.2,
                color: lineColor
            },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: areaTopColor },
                    { offset: 1, color: areaBottomColor }
                ])
            }
        }
    ];

    const targetLineColor = metaCumplida ? '#10B981' : TARGET_COLOR;
    if (tieneMeta) {
        // Línea horizontal punteada de punta a punta sin puntos sueltos que descoloquen la gráfica
        echartsSeries.push({
            name: isEn ? 'Target' : 'Meta',
            type: 'line',
            data: labels.map(() => metaNum),
            symbol: 'none',
            z: 2,
            lineStyle: {
                width: metaCumplida ? 2.6 : 2.2,
                type: 'dashed',
                color: targetLineColor
            }
        });
    }

    const echartsW = width - 16;
    const echartsH = height - 88;
    const labelStep = Math.max(1, Math.ceil(labels.length / 6));

    const { image: echartsImg } = await renderEChartsToImage(
        {
            grid: {
                left: 78,
                right: 36,
                top: 30,
                bottom: 34
            },
            xAxis: {
                type: 'category',
                data: labels,
                boundaryGap: false,
                axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.28)' } },
                axisTick: { show: true, lineStyle: { color: 'rgba(148, 163, 184, 0.25)' } },
                splitLine: {
                    show: true,
                    lineStyle: { color: 'rgba(255, 255, 255, 0.04)' }
                },
                axisLabel: {
                    interval: (index) => index === 0 || index === labels.length - 1 || index % labelStep === 0,
                    color: '#94A3B8',
                    fontFamily: 'Liberation Sans',
                    fontSize: 10,
                    alignMinLabel: 'left',
                    alignMaxLabel: 'right'
                }
            },
            yAxis: {
                type: 'value',
                min: yMin,
                max: yMax,
                interval: yInterval,
                splitLine: {
                    lineStyle: { color: 'rgba(148, 163, 184, 0.11)', type: 'dashed' }
                },
                axisLabel: {
                    color: '#E2E8F0',
                    fontFamily: 'Liberation Sans',
                    fontSize: 10,
                    formatter: (val) => fmtMoneda(val, esUSD)
                }
            },
            series: echartsSeries
        },
        echartsW,
        echartsH
    );

    ctx.drawImage(echartsImg, 8, 84, echartsW, echartsH);

    // Etiqueta de Meta dibujada en posición inteligente sobre la línea punteada (en el centro horizontal para no chocar con el punto inicial ni el final)
    if (tieneMeta && yMax > yMin) {
        const plotTopY = 84 + 30;
        const plotBottomY = 84 + echartsH - 34;
        const plotH = plotBottomY - plotTopY;
        const ratio = Math.max(0, Math.min(1, (yMax - metaNum) / (yMax - yMin)));
        const metaY = plotTopY + ratio * plotH;

        let metaText = `${isEn ? 'Target' : 'Meta'}: ${fmtMoneda(metaNum, esUSD)}`;
        if (metaCumplida) {
            metaText = ahorroBajoMeta > 0
                ? (isEn
                    ? `✓ GOAL MET: ${fmtMoneda(metaNum, esUSD)} (-${fmtMonedaCompacta(ahorroBajoMeta, esUSD)} below target)`
                    : `✓ ¡META LOGRADA!: ${fmtMoneda(metaNum, esUSD)} (-${fmtMonedaCompacta(ahorroBajoMeta, esUSD)} bajo meta)`)
                : (isEn
                    ? `✓ GOAL MET: ${fmtMoneda(metaNum, esUSD)} (Reached!)`
                    : `✓ ¡META LOGRADA!: ${fmtMoneda(metaNum, esUSD)} (¡Alcanzada!)`);
        } else if (lastPrice > metaNum) {
            const falta = lastPrice - metaNum;
            metaText = isEn
                ? `Target: ${fmtMoneda(metaNum, esUSD)} (${fmtMonedaCompacta(falta, esUSD)} to go)`
                : `Meta: ${fmtMoneda(metaNum, esUSD)} (Faltan ${fmtMonedaCompacta(falta, esUSD)})`;
        }

        ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
        const metaTextW = ctx.measureText(metaText).width;
        const pillW = metaTextW + 18;
        const pillH = 21;
        // Ubicar la píldora en el tercio central-izquierdo (x ≈ 190) lejos del borde izquierdo (x=86) y del borde derecho (x=776)
        const pillX = 190;
        // Si la meta está en el borde superior del gráfico, colocar la píldora justo debajo de la línea; si no, justo encima
        const pillY = metaY < plotTopY + 26 ? metaY + 5 : metaY - pillH - 4;

        ctx.fillStyle = metaCumplida ? 'rgba(6, 78, 59, 0.96)' : 'rgba(20, 24, 36, 0.95)';
        ctx.strokeStyle = targetLineColor;
        ctx.lineWidth = metaCumplida ? 1.6 : 1.3;
        drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = metaCumplida ? '#4ADE80' : '#FBBF24';
        ctx.textBaseline = 'middle';
        ctx.fillText(metaText, pillX + 9, pillY + pillH / 2);
        ctx.textBaseline = 'alphabetic';
    }

    const buffer = canvas.toBuffer('image/png');

    if (chartCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = chartCache.keys().next().value;
        if (oldestKey) chartCache.delete(oldestKey);
    }
    chartCache.set(cacheKey, { buffer, signature });

    return buffer;
}


/**
 * 1C. Tarjeta Visual ECharts + Skia para 1.2 Calculadora de Economía
 */
async function generateCalculatorBreakdownCard(calcInfo, explicitLang = null) {
    const isEn = getCurrentLang(explicitLang) === 'en';
    const info = calcInfo || {};
    const basePrice = Number(info.basePrice ?? 1000);
    const precioAjustadoRobux = Number(info.regionalPrice ?? info.precioAjustadoRobux ?? basePrice);
    const cashbackGrupoMonto = Number(info.cashback ?? info.cashbackGrupoMonto ?? 0);
    const descPlus = Number(info.plusDiscount ?? info.descPlus ?? 0);
    const precioFinalEfectivo = Number(info.finalPrice ?? info.precioFinalEfectivo ?? 600);
    const ahorroTotalVsBase = Number(info.totalSaved ?? info.ahorroTotalVsBase ?? (basePrice - precioFinalEfectivo));
    const porcentaje = Number(info.pctSaved ?? info.porcentaje ?? (basePrice > 0 ? Math.round((ahorroTotalVsBase / basePrice) * 100) : 0));

    const width = 760;
    const height = 340;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0F131D');
    bgGrad.addColorStop(0.55, '#191F2E');
    bgGrad.addColorStop(1, '#111520');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#38BDF8';
    ctx.font = `bold 10.5px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        isEn
            ? 'ROBLOX ECONOMY & CASHBACK CALCULATOR (1.2)'
            : 'CALCULADORA DE ECONOMÍA Y AHORRO ROBLOX (1.2)',
        22,
        24
    );

    ctx.fillStyle = '#F8FAFC';
    ctx.font = `bold 19px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        fitText(
            ctx,
            isEn
                ? `Effective Cost: ${fmtMoneda(precioFinalEfectivo)}  •  Saved: ${fmtMoneda(ahorroTotalVsBase)} (${porcentaje}%)`
                : `Costo Final Efectivo: ${fmtMoneda(precioFinalEfectivo)}  •  Ahorro: ${fmtMoneda(ahorroTotalVsBase)} (${porcentaje}%)`,
            width - 44
        ),
        22,
        50
    );

    const kpiRows = [
        { label: isEn ? 'Base Catalog Price' : 'Precio Base de Lista', val: fmtMoneda(basePrice), col: '#CBD5E1' },
        { label: isEn ? 'Regional Adjusted' : 'Precio Regional Ajustado', val: fmtMoneda(precioAjustadoRobux), col: '#38BDF8' },
        { label: isEn ? 'Group Cashback (40%)' : 'Cashback de Grupo (40%)', val: `+${fmtMoneda(cashbackGrupoMonto)}`, col: '#4ADE80' },
        { label: isEn ? 'Final Effective Cost' : 'Precio Final Efectivo', val: fmtMoneda(precioFinalEfectivo), col: '#22C55E' }
    ];

    kpiRows.forEach((r, idx) => {
        const y = 72 + idx * 62;
        ctx.fillStyle = '#1B202E';
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        drawRoundedRect(ctx, 22, y, 320, 52, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#94A3B8';
        ctx.font = `bold 10.5px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(r.label, 36, y + 20);

        ctx.fillStyle = r.col;
        ctx.font = `bold 15px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(fitText(ctx, r.val, 290), 36, y + 41);
    });

    const maxBarVal = Math.max(10, basePrice, precioAjustadoRobux, ahorroTotalVsBase + descPlus, precioFinalEfectivo);

    const { image: echartsCalcImg } = await renderEChartsToImage(
        {
            grid: { left: 56, right: 18, top: 30, bottom: 32 },
            xAxis: {
                type: 'category',
                data: isEn
                    ? ['Base Price', 'Regional', 'Total Saved', 'Final Cost']
                    : ['Precio Base', 'Regional', 'Ahorro Total', 'Costo Final'],
                axisLine: { lineStyle: { color: 'rgba(148,163,184,0.3)' } },
                axisTick: { show: false },
                axisLabel: { interval: 0, color: '#CBD5E1', fontFamily: 'Liberation Sans', fontSize: 9.5, fontWeight: 'bold' }
            },
            yAxis: {
                type: 'value',
                max: Math.ceil(maxBarVal * 1.2),
                splitNumber: 4,
                splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)', type: 'dashed' } },
                axisLabel: {
                    color: '#94A3B8',
                    fontFamily: 'Liberation Sans',
                    fontSize: 9.5,
                    formatter: (v) => fmtMonedaCompacta(v, false).replace(' R$', '')
                }
            },
            series: [
                {
                    type: 'bar',
                    barMaxWidth: 36,
                    data: [
                        { value: basePrice, itemStyle: { color: '#64748B', borderRadius: [6, 6, 0, 0] } },
                        { value: precioAjustadoRobux, itemStyle: { color: '#38BDF8', borderRadius: [6, 6, 0, 0] } },
                        { value: ahorroTotalVsBase + descPlus, itemStyle: { color: '#F59E0B', borderRadius: [6, 6, 0, 0] } },
                        { value: precioFinalEfectivo, itemStyle: { color: '#22C55E', borderRadius: [6, 6, 0, 0] } }
                    ],
                    label: {
                        show: true,
                        position: 'top',
                        color: '#F8FAFC',
                        fontFamily: 'Liberation Sans',
                        fontWeight: 'bold',
                        fontSize: 9.5,
                        formatter: (p) => fmtMonedaCompacta(p.value, false)
                    }
                }
            ]
        },
        370,
        240
    );

    ctx.fillStyle = '#181C29';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    drawRoundedRect(ctx, 360, 72, 378, 246, 10);
    ctx.fill();
    ctx.stroke();
    ctx.drawImage(echartsCalcImg, 364, 75);

    return canvas.toBuffer('image/png');
}

/**
 * 1D. Tarjeta Visual ECharts + Skia para 1.4 Agenda de Robux Pendientes
 */
async function generatePendingRobuxCard(registros, explicitLang = null) {
    const isEn = getCurrentLang(explicitLang) === 'en';
    const list = Array.isArray(registros) ? registros.slice(0, 6) : [];
    const total = list.reduce((a, r) => a + Number(r.amount_robux || 0), 0);

    const width = 760;
    const height = 340;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0F131D');
    bgGrad.addColorStop(0.55, '#191E2D');
    bgGrad.addColorStop(1, '#111520');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FBBF24';
    ctx.font = `bold 10.5px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        isEn
            ? 'PENDING ROBUX ESCROW TRACKER (1.4)'
            : 'MONITOR DE ROBUX PENDIENTES EN RETENCIÓN (1.4)',
        22,
        24
    );

    ctx.fillStyle = '#F8FAFC';
    ctx.font = `bold 19px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        fitText(
            ctx,
            isEn
                ? `Total Escrow Balance: ${fmtMoneda(total)} (${list.length} Batches)`
                : `Saldo Total en Retención: ${fmtMoneda(total)} (${list.length} Lotes)`,
            width - 44
        ),
        22,
        50
    );

    const labels = list.map((_r, i) => `#${i + 1}`);
    const amounts = list.map(r => Number(r.amount_robux || 0));
    const maxBatch = Math.max(10, ...amounts);

    const { image: echartsPendImg } = await renderEChartsToImage(
        {
            grid: { left: 60, right: 20, top: 32, bottom: 30 },
            xAxis: {
                type: 'category',
                data: labels,
                axisLine: { lineStyle: { color: 'rgba(148,163,184,0.3)' } },
                axisTick: { show: false },
                axisLabel: { color: '#CBD5E1', fontFamily: 'Liberation Sans', fontSize: 10, fontWeight: 'bold' }
            },
            yAxis: {
                type: 'value',
                max: Math.ceil(maxBatch * 1.22),
                splitNumber: 4,
                splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)', type: 'dashed' } },
                axisLabel: {
                    color: '#94A3B8',
                    fontFamily: 'Liberation Sans',
                    fontSize: 10,
                    formatter: (v) => fmtMonedaCompacta(v, false).replace(' R$', '')
                }
            },
            series: [
                {
                    type: 'bar',
                    barMaxWidth: 36,
                    data: amounts,
                    itemStyle: {
                        borderRadius: [6, 6, 0, 0],
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#FBBF24' },
                            { offset: 1, color: '#D97706' }
                        ])
                    },
                    label: {
                        show: true,
                        position: 'top',
                        color: '#F8FAFC',
                        fontFamily: 'Liberation Sans',
                        fontWeight: 'bold',
                        fontSize: 10,
                        formatter: (p) => fmtMonedaCompacta(p.value, false)
                    }
                }
            ]
        },
        716,
        245
    );

    ctx.fillStyle = '#181C29';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    drawRoundedRect(ctx, 22, 70, 716, 250, 10);
    ctx.fill();
    ctx.stroke();
    ctx.drawImage(echartsPendImg, 22, 72);

    return canvas.toBuffer('image/png');
}

/**
 * 1E. Tarjeta Visual ECharts + Skia para 3.1 Buscador de Servidores Vacíos (Latencia Ping / FPS / Ocupación)
 */
async function generateEmptyServersRadarCard(game, servers, explicitLang = null) {
    const isEn = getCurrentLang(explicitLang) === 'en';
    const safeServers = Array.isArray(servers) ? servers.slice(0, 4) : [];
    const width = 760;
    const height = 340;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0E1716');
    bgGrad.addColorStop(0.55, '#132220');
    bgGrad.addColorStop(1, '#0D1514');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#10B981';
    ctx.font = `bold 10.5px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        isEn
            ? 'LOW-POPULATION SERVER TELEMETRY (3.1)'
            : 'TELEMETRÍA DE SERVIDORES VACÍOS EN TIEMPO REAL (3.1)',
        22,
        24
    );

    ctx.fillStyle = '#F8FAFC';
    ctx.font = `bold 19px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        fitText(
            ctx,
            `${String(game?.name || 'Roblox Experience')}  •  ${Number(game?.playing || 0).toLocaleString('es-AR')} Online`,
            width - 44
        ),
        22,
        50
    );

    const srvLabels = safeServers.length > 0
        ? safeServers.map((_s, i) => `Srv #${i + 1}`)
        : ['Srv #1', 'Srv #2'];
    const srvPlayers = safeServers.length > 0
        ? safeServers.map(s => Number(s.playing || 1))
        : [1, 2];
    const srvPing = safeServers.length > 0
        ? safeServers.map(s => Math.round(Number(s.ping || 65)))
        : [55, 70];

    const { image: echartsSrvImg } = await renderEChartsToImage(
        {
            grid: { left: 56, right: 56, top: 36, bottom: 30 },
            legend: {
                top: 2,
                right: 12,
                textStyle: { color: '#CBD5E1', fontFamily: 'Liberation Sans', fontSize: 10 }
            },
            xAxis: {
                type: 'category',
                data: srvLabels,
                axisLine: { lineStyle: { color: 'rgba(148,163,184,0.3)' } },
                axisTick: { show: false },
                axisLabel: { color: '#CBD5E1', fontFamily: 'Liberation Sans', fontSize: 10.5, fontWeight: 'bold' }
            },
            yAxis: [
                {
                    type: 'value',
                    name: isEn ? 'Players' : 'Jugadores',
                    minInterval: 1,
                    nameTextStyle: { color: '#10B981', fontSize: 10 },
                    splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)', type: 'dashed' } },
                    axisLabel: { color: '#10B981', fontFamily: 'Liberation Sans', fontSize: 10 }
                },
                {
                    type: 'value',
                    name: 'Ping (ms)',
                    nameTextStyle: { color: '#38BDF8', fontSize: 10 },
                    splitLine: { show: false },
                    axisLabel: { color: '#38BDF8', fontFamily: 'Liberation Sans', fontSize: 10 }
                }
            ],
            series: [
                {
                    name: isEn ? 'Players' : 'Jugadores',
                    type: 'bar',
                    barMaxWidth: 34,
                    data: srvPlayers,
                    itemStyle: {
                        borderRadius: [6, 6, 0, 0],
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#34D399' },
                            { offset: 1, color: '#059669' }
                        ])
                    }
                },
                {
                    name: 'Ping (ms)',
                    type: 'line',
                    yAxisIndex: 1,
                    smooth: 0.3,
                    data: srvPing,
                    lineStyle: { width: 3, color: '#38BDF8' },
                    itemStyle: { color: '#38BDF8' }
                }
            ]
        },
        716,
        245
    );

    ctx.fillStyle = '#14201E';
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
    drawRoundedRect(ctx, 22, 70, 716, 250, 10);
    ctx.fill();
    ctx.stroke();
    ctx.drawImage(echartsSrvImg, 22, 72);

    return canvas.toBuffer('image/png');
}

/**
 * 2. Herramienta 1.3: Monitor de Pisos de Precios Dinámicos UGC con Apache ECharts SSR + @resvg/resvg-js + Skia Canvas
 * Reemplaza las barras planas por gráficos financieros modernos (barras con degradado, curva suave de área y medidor circular).
 */
async function generatePriceFloorsChart(floorsList, explicitLang = null) {
    const isEn = getCurrentLang(explicitLang) === 'en';
    const width = CHART_WIDTH;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const safeFloors = Array.isArray(floorsList) && floorsList.length > 0
        ? floorsList
        : [
            { subcategory_name: 'Sombreros', floor_price: 95, previous_floor_price: 105 },
            { subcategory_name: 'Cabello', floor_price: 95, previous_floor_price: 95 },
            { subcategory_name: 'Rostro', floor_price: 55, previous_floor_price: 65 },
            { subcategory_name: 'Cuello', floor_price: 55, previous_floor_price: 60 },
            { subcategory_name: 'Hombros', floor_price: 55, previous_floor_price: 55 },
            { subcategory_name: 'Frente', floor_price: 55, previous_floor_price: 55 },
            { subcategory_name: 'Espalda', floor_price: 140, previous_floor_price: 160 },
            { subcategory_name: 'Cintura', floor_price: 95, previous_floor_price: 95 }
        ];

    const EN_SHORT_FLOOR_NAMES = {
        'Sombreros': 'Hats',
        'Cabello': 'Hair',
        'Rostro': 'Face',
        'Cuello': 'Neck',
        'Hombros': 'Shoulder',
        'Frente': 'Front',
        'Espalda': 'Back',
        'Cintura': 'Waist',
        'Camisas': 'Shirts',
        'Pantalones': 'Pants'
    };

    const labels = safeFloors.map(f => {
        const rawLabel = f.shortName || String(f.subcategory_name || 'Item').split(' ')[0];
        return isEn ? (EN_SHORT_FLOOR_NAMES[rawLabel] || rawLabel) : rawLabel;
    });
    const currentPrices = safeFloors.map(f => Number(f.floor_price || 0));
    const prevPrices = safeFloors.map(f => Number(f.previous_floor_price || 0));
    const avgFloor = Math.round(
        currentPrices.reduce((acc, v) => acc + v, 0) / Math.max(1, currentPrices.length)
    );

    // 1. Fondo financiero oscuro con acabado Skia y encabezado HUD
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#181A20');
    bgGrad.addColorStop(0.55, '#232631');
    bgGrad.addColorStop(1, '#16181F');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#38BDF8';
    ctx.font = `bold 10.5px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        isEn
            ? 'UGC PRICE FLOORS MONITOR (1.3)'
            : 'MONITOR DE PISOS DINÁMICOS UGC (1.3)',
        22,
        24
    );

    ctx.fillStyle = '#F8FAFC';
    ctx.font = `bold 18.5px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        fitText(
            ctx,
            isEn
                ? 'Official Roblox UGC Price Floors & Trend Curve (R$)'
                : 'Evolución de Pisos Oficiales UGC y Curva de Tendencia (R$)',
            width - 44
        ),
        22,
        50
    );

    // Leyenda superior con degradados perfectamente alineada a la derecha
    const legendItems = [
        { col: '#22C55E', text: isEn ? 'Current Floor (R$)' : 'Piso Actual (R$)', x: width - 332 },
        { col: '#6366F1', text: isEn ? 'Last Week' : 'Semana Ant.', x: width - 202 },
        { col: '#38BDF8', text: isEn ? 'Smooth Trend' : 'Curva Suave', x: width - 104 }
    ];
    for (const lg of legendItems) {
        ctx.fillStyle = lg.col;
        drawRoundedRect(ctx, lg.x, 14, 11, 11, 3);
        ctx.fill();
        ctx.fillStyle = '#E2E8F0';
        ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(lg.text, lg.x + 15, 23);
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, 66);
    ctx.lineTo(width - 20, 66);
    ctx.stroke();

    // Contenedor visual dedicado para el velocímetro de promedio a la derecha
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, width - 196, 78, 176, 304, 12);
    ctx.fill();
    ctx.stroke();

    // 2. Renderizar gráfico combinado en el servidor con Apache ECharts SSR
    const echartsW = width - 20;
    const echartsH = height - 74;
    const maxFloorVal = Math.max(160, ...currentPrices, ...prevPrices);

    const { image: echartsImg } = await renderEChartsToImage(
        {
            grid: {
                left: 56,
                right: 204,
                top: 28,
                bottom: 36
            },
            xAxis: {
                type: 'category',
                data: labels,
                axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.25)' } },
                axisTick: { show: false },
                axisLabel: {
                    interval: 0,
                    color: '#E2E8F0',
                    fontFamily: 'Liberation Sans',
                    fontWeight: 'bold',
                    fontSize: 9.5
                }
            },
            yAxis: {
                type: 'value',
                min: 0,
                max: Math.ceil((maxFloorVal * 1.18) / 20) * 20,
                splitNumber: 4,
                splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.10)', type: 'dashed' } },
                axisLabel: {
                    color: '#94A3B8',
                    fontFamily: 'Liberation Sans',
                    fontSize: 10,
                    formatter: '{value} R$'
                }
            },
            series: [
                {
                    name: isEn ? 'Current Floor' : 'Piso Actual',
                    type: 'bar',
                    barWidth: '28%',
                    data: currentPrices.map((val, i) => ({
                        value: val,
                        itemStyle: {
                            borderRadius: [5, 5, 0, 0],
                            color: val <= prevPrices[i]
                                ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                    { offset: 0, color: '#4ADE80' },
                                    { offset: 1, color: '#15803D' }
                                ])
                                : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                    { offset: 0, color: '#FB7185' },
                                    { offset: 1, color: '#BE123C' }
                                ])
                        }
                    })),
                    label: {
                        show: true,
                        position: 'top',
                        color: '#F8FAFC',
                        fontFamily: 'Liberation Sans',
                        fontWeight: 'bold',
                        fontSize: 9.5,
                        formatter: '{c}'
                    }
                },
                {
                    name: isEn ? 'Last Week' : 'Semana Anterior',
                    type: 'bar',
                    barWidth: '24%',
                    data: prevPrices,
                    itemStyle: {
                        borderRadius: [5, 5, 0, 0],
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(129, 140, 248, 0.85)' },
                            { offset: 1, color: 'rgba(67, 56, 202, 0.35)' }
                        ])
                    }
                },
                {
                    name: isEn ? 'Trend Curve' : 'Curva Suave',
                    type: 'line',
                    smooth: 0.42,
                    data: currentPrices,
                    symbol: 'circle',
                    symbolSize: 6,
                    lineStyle: {
                        width: 2.5,
                        color: '#38BDF8'
                    },
                    itemStyle: {
                        color: '#38BDF8',
                        borderColor: '#FFFFFF',
                        borderWidth: 1.5
                    },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(56, 189, 248, 0.24)' },
                            { offset: 1, color: 'rgba(56, 189, 248, 0.01)' }
                        ])
                    }
                },
                {
                    name: isEn ? 'Avg Floor Gauge' : 'Medidor Piso Promedio',
                    type: 'gauge',
                    center: ['88%', '52%'],
                    radius: '48%',
                    min: 0,
                    max: 200,
                    startAngle: 215,
                    endAngle: -35,
                    splitNumber: 4,
                    progress: {
                        show: true,
                        width: 10,
                        roundCap: true,
                        itemStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                                { offset: 0, color: '#38BDF8' },
                                { offset: 1, color: '#22C55E' }
                            ])
                        }
                    },
                    axisLine: {
                        roundCap: true,
                        lineStyle: {
                            width: 10,
                            color: [[1, 'rgba(148, 163, 184, 0.18)']]
                        }
                    },
                    axisTick: { show: false },
                    splitLine: { show: false },
                    axisLabel: { show: false },
                    pointer: {
                        show: true,
                        length: '50%',
                        width: 3,
                        itemStyle: { color: '#FACC15' }
                    },
                    anchor: {
                        show: true,
                        size: 7,
                        itemStyle: { color: '#FACC15', borderColor: '#0F172A', borderWidth: 2 }
                    },
                    title: {
                        show: true,
                        offsetCenter: [0, '74%'],
                        color: '#94A3B8',
                        fontFamily: 'Liberation Sans',
                        fontWeight: 'bold',
                        fontSize: 9.5
                    },
                    detail: {
                        valueAnimation: false,
                        offsetCenter: [0, '38%'],
                        color: '#4ADE80',
                        fontFamily: 'Liberation Sans',
                        fontWeight: 'bold',
                        fontSize: 13.5,
                        formatter: '{value} R$'
                    },
                    data: [
                        {
                            value: avgFloor,
                            name: isEn ? 'AVG FLOOR' : 'PROMEDIO UGC'
                        }
                    ]
                }
            ]
        },
        echartsW,
        echartsH
    );

    ctx.drawImage(echartsImg, 10, 72, echartsW, echartsH);

    return canvas.toBuffer('image/png');
}

/**
 * Renderiza plantillas HTML/CSS (Flexbox, bordes redondeados, degradados y sombras) en un Buffer PNG
 * ultrarrápido (~20–45ms) usando Vercel Satori + @resvg/resvg-js sin abrir ningún navegador.
 */
async function renderHtmlCardWithSatori(htmlTemplate, widthOrOpts = 760, maybeHeight = 380) {
    const width = typeof widthOrOpts === 'object' && widthOrOpts !== null ? (widthOrOpts.width || 760) : (Number(widthOrOpts) || 760);
    const height = typeof widthOrOpts === 'object' && widthOrOpts !== null ? (widthOrOpts.height || 380) : (Number(maybeHeight) || 380);
    const satoriMod = await import('satori');
    const satoriHtmlMod = await import('satori-html');
    const satoriFn = satoriMod.default || satoriMod;
    const htmlFn = satoriHtmlMod.html || satoriHtmlMod.default?.html;

    const vnode = htmlFn(htmlTemplate);
    const fonts = [];
    if (FONT_REGULAR_BUFFER) {
        fonts.push({ name: 'KortexSans', data: FONT_REGULAR_BUFFER, weight: 400, style: 'normal' });
    }
    if (FONT_BOLD_BUFFER) {
        fonts.push({ name: 'KortexSans', data: FONT_BOLD_BUFFER, weight: 700, style: 'normal' });
    }

    const svg = await satoriFn(vnode, { width, height, fonts });
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: width },
        font: {
            fontFiles: [FONT_REGULAR_PATH, FONT_BOLD_PATH],
            loadSystemFonts: false,
            defaultFontFamily: 'KortexSans'
        }
    });
    return resvg.render().asPng();
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
function resolveAnatomicalSlot(item, isEn = false) {
    const typeId = Number(item.assetTypeId || 0);
    const urlStr = String(item.highResUrl || item.imageUrl || '').toLowerCase();
    const nameStr = String(item.name || '').toLowerCase();
    const typeNameStr = String(item.assetTypeName || '').toLowerCase();

    if (typeId === 43 || urlStr.includes('/neckaccessory/') || typeNameStr.includes('neck') || typeNameStr.includes('cuello') || /\b(neck|scarf|collar|chain|choker|tie|bufanda|collar)\b/i.test(nameStr)) {
        return { key: 'neck', label: isEn ? 'Neck' : 'Cuello', layer: 'front' };
    }
    if (typeId === 42 || typeId === 18 || urlStr.includes('/faceaccessory/') || typeNameStr.includes('face') || typeNameStr.includes('cara') || /\b(glasses|shades|mask|goggles|visor|monocle|blush|lentes|mascara)\b/i.test(nameStr)) {
        return { key: 'face', label: isEn ? 'Face' : 'Cara / Rostro', layer: 'front' };
    }
    if (typeId === 41 || urlStr.includes('/hairaccessory/') || typeNameStr.includes('hair') || typeNameStr.includes('pelo') || /\b(hair|pelo|cabello|ponytail|braids|mullet|bangs|messy|wolfcut)\b/i.test(nameStr)) {
        return { key: 'hair', label: isEn ? 'Hair' : 'Pelo / Cabello', layer: 'front' };
    }
    if (typeId === 46 || urlStr.includes('/backaccessory/') || typeNameStr.includes('back') || typeNameStr.includes('espalda') || /\b(wings|cape|back|backpack|katana|sword|greatsword|halo|scythe|guitar|alas|capa|mochila)\b/i.test(nameStr)) {
        return { key: 'back', label: isEn ? 'Back' : 'Espalda', layer: 'back' };
    }
    if (typeId === 44 || urlStr.includes('/shoulderaccessory/') || typeNameStr.includes('shoulder') || typeNameStr.includes('hombro') || /\b(shoulder|pauldron|epaulette|hombro|pet)\b/i.test(nameStr)) {
        return { key: 'shoulder', label: isEn ? 'Shoulders' : 'Hombros', layer: 'front' };
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
        return { key: 'front', label: isEn ? 'Torso / Shirt' : 'Torso / Camisa', layer: 'front', isClassicShirt: typeId === 11 };
    }
    if (
        [47, 12, 66, 69, 72].includes(typeId) ||
        urlStr.includes('/waistaccessory/') ||
        urlStr.includes('/pants/') ||
        typeNameStr.includes('waist') ||
        typeNameStr.includes('pants') ||
        /\b(waist|belt|tail|skirt|pants|jeans|shorts|trousers|cargo|cintura|pantalon)\b/i.test(nameStr)
    ) {
        return { key: 'waist', label: isEn ? 'Waist / Pants' : 'Cintura / Pantalón', layer: 'front', isClassicPants: typeId === 12 };
    }
    if (typeId === 19 || urlStr.includes('/gear/') || typeNameStr.includes('gear')) {
        return { key: 'gear', label: isEn ? 'Hand / Gear' : 'Mano / Equipamiento', layer: 'front' };
    }
    return { key: 'hat', label: isEn ? 'Head / Hat' : 'Cabeza / Sombrero', layer: 'front' };
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
 * Muestra el visor 3D del avatar con conectores anatómicos HUD limpios (sin deformar el personaje) + desglose ECharts.
 */
async function generateOutfitSandboxCard(avatarInfo, addedItems, totalNormal, totalCashback, explicitLang = null) {
    const isEn = getCurrentLang(explicitLang) === 'en';
    const width = 820;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f131f';
    ctx.fillRect(0, 0, width, height);

    const isZoomed = Boolean(avatarInfo.zoomHead);

    // Resplandor radial Skia de estudio en todo el lienzo
    const bgGlow = ctx.createRadialGradient(width * 0.25, height * 0.45, 20, width * 0.35, height * 0.5, width * 0.65);
    bgGlow.addColorStop(0, addedItems.length > 0 ? 'rgba(35, 165, 90, 0.14)' : 'rgba(139, 92, 246, 0.14)');
    bgGlow.addColorStop(1, 'rgba(15, 19, 31, 0)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, width, height);

    const maxHeaderW = width - 285;

    // Header
    ctx.fillStyle = '#a78bfa';
    ctx.font = `bold 10.5px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        fitText(
            ctx,
            isEn
                ? `OUTFIT SANDBOX (2.1)  •  LIVE TRY-ON (${isZoomed ? 'HEAD & NECK ZOOM' : 'FULL BODY'})`
                : `PROBADOR DE ROPA EN VIVO (2.1)  •  VISTA (${isZoomed ? 'ZOOM CABEZA Y CUELLO' : 'CUERPO COMPLETO'})`,
            maxHeaderW
        ),
        22,
        24
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 19px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        fitText(
            ctx,
            isEn
                ? `Character: @${avatarInfo.username || 'Builderman'} (ID ${avatarInfo.userId || 156})`
                : `Personaje: @${avatarInfo.username || 'Builderman'} (ID ${avatarInfo.userId || 156})`,
            maxHeaderW
        ),
        22,
        48
    );

    // Badge de Costo Total arriba a la derecha
    ctx.fillStyle = 'rgba(35, 165, 90, 0.18)';
    ctx.strokeStyle = 'rgba(35, 165, 90, 0.60)';
    ctx.lineWidth = 1.4;
    drawRoundedRect(ctx, width - 252, 14, 230, 38, 9);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#4ade80';
    ctx.font = `bold 12.5px "${FONT_FAMILY}", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(
        fitText(ctx, `${isEn ? 'OUTFIT VALUE' : 'VALOR CONJUNTO'}: ${fmtMoneda(totalNormal)}`, 212),
        width - 252 + 115,
        38
    );
    ctx.textAlign = 'left';

    // Panel Izquierdo: Visor en Vivo del Avatar con Pedestal 3D y Conectores Anatómicos HUD
    const vpX = 22;
    const vpY = 62;
    const vpW = 266;
    const vpH = 368;

    ctx.fillStyle = 'rgba(24, 30, 46, 0.94)';
    ctx.strokeStyle = addedItems.length > 0 ? '#23a55a' : 'rgba(139, 92, 246, 0.60)';
    ctx.lineWidth = 1.8;
    drawRoundedRect(ctx, vpX, vpY, vpW, vpH, 12);
    ctx.fill();
    ctx.stroke();

    // Grilla de estudio 3D
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.11)';
    ctx.lineWidth = 1;
    for (let gx = vpX + 20; gx < vpX + vpW - 10; gx += 26) {
        ctx.beginPath();
        ctx.moveTo(gx, vpY + 34);
        ctx.lineTo(gx, vpY + vpH - 68);
        ctx.stroke();
    }
    for (let gy = vpY + 46; gy < vpY + vpH - 68; gy += 26) {
        ctx.beginPath();
        ctx.moveTo(vpX + 10, gy);
        ctx.lineTo(vpX + vpW - 10, gy);
        ctx.stroke();
    }

    // Pedestal circular luminoso debajo del avatar
    ctx.save();
    const pedGrad = ctx.createRadialGradient(vpX + vpW / 2, vpY + 254, 6, vpX + vpW / 2, vpY + 254, 86);
    pedGrad.addColorStop(0, addedItems.length > 0 ? 'rgba(35, 165, 90, 0.42)' : 'rgba(139, 92, 246, 0.38)');
    pedGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = pedGrad;
    ctx.beginPath();
    ctx.ellipse(vpX + vpW / 2, vpY + 254, 84, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = addedItems.length > 0 ? 'rgba(74, 222, 128, 0.55)' : 'rgba(167, 139, 250, 0.50)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(vpX + vpW / 2, vpY + 254, 68, 13, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#c4b5fd';
    ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        isZoomed
            ? (isEn ? 'CAMERA: HEAD / FACE / NECK' : 'CÁMARA: CABEZA / CARA / CUELLO')
            : (isEn ? 'CAMERA: FULL BODY 3D' : 'CÁMARA: CUERPO COMPLETO 3D'),
        vpX + 14,
        vpY + 22
    );

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
        slot: resolveAnatomicalSlot(it, isEn),
        isCustomTryOn: !it.isWorn
    }));

    const drawAvSize = 216;
    const drawAvX = vpX + Math.round((vpW - drawAvSize) / 2);
    const drawAvY = vpY + 34;

    ctx.save();
    drawRoundedRect(ctx, vpX + 4, vpY + 28, vpW - 8, vpH - 92, 8);
    ctx.clip();

    if (avatarImg) {
        ctx.drawImage(avatarImg, drawAvX, drawAvY, drawAvSize, drawAvSize);
    } else {
        ctx.fillStyle = '#949ba4';
        ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(isEn ? 'Loading Avatar...' : 'Cargando Avatar...', vpX + 68, vpY + 150);
    }

    // Conectores Anatómicos HUD en las 4 esquinas del visor para mostrar las piezas en prueba sin tapar ni deformar el avatar 3D
    const hudNodes = [
        { boxX: vpX + 10, boxY: vpY + 36, anchorX: vpX + vpW / 2 - 8, anchorY: vpY + 86 },
        { boxX: vpX + vpW - 56, boxY: vpY + 36, anchorX: vpX + vpW / 2 + 8, anchorY: vpY + 104 },
        { boxX: vpX + 10, boxY: vpY + 194, anchorX: vpX + vpW / 2 - 12, anchorY: vpY + 152 },
        { boxX: vpX + vpW - 56, boxY: vpY + 194, anchorX: vpX + vpW / 2 + 12, anchorY: vpY + 152 }
    ];

    const anchorBySlotKey = {
        hat: { x: vpX + vpW / 2, y: isZoomed ? vpY + 95 : vpY + 76 },
        hair: { x: vpX + vpW / 2, y: isZoomed ? vpY + 108 : vpY + 84 },
        face: { x: vpX + vpW / 2, y: isZoomed ? vpY + 126 : vpY + 94 },
        neck: { x: vpX + vpW / 2, y: isZoomed ? vpY + 168 : vpY + 114 },
        shoulder: { x: vpX + vpW / 2 - 22, y: vpY + 122 },
        front: { x: vpX + vpW / 2, y: vpY + 148 },
        back: { x: vpX + vpW / 2 + 18, y: vpY + 136 },
        waist: { x: vpX + vpW / 2, y: vpY + 186 },
        gear: { x: vpX + vpW / 2 - 34, y: vpY + 156 }
    };

    equippedList.slice(0, 4).forEach((eq, idx) => {
        if (!eq.img) return;
        const node = hudNodes[idx];
        const targetPt = anchorBySlotKey[eq.slot.key] || { x: node.anchorX, y: node.anchorY };
        const boxCenterX = node.boxX + 23;
        const boxCenterY = node.boxY + 23;
        const strokeCol = eq.isCustomTryOn ? '#4ADE80' : '#818CF8';

        // Línea conectora hacia el punto anatómico del avatar
        ctx.save();
        ctx.strokeStyle = eq.isCustomTryOn ? 'rgba(74, 222, 128, 0.55)' : 'rgba(129, 140, 248, 0.50)';
        ctx.lineWidth = 1.3;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(boxCenterX, boxCenterY);
        ctx.lineTo(targetPt.x, targetPt.y);
        ctx.stroke();
        ctx.restore();

        // Punto luminoso sobre la articulación/zona anatómica
        ctx.beginPath();
        ctx.arc(targetPt.x, targetPt.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = strokeCol;
        ctx.fill();

        // Mini-tarjeta HUD de 46x46 px en la esquina
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, node.boxX, node.boxY, 46, 46, 8);
        ctx.fill();
        ctx.stroke();

        ctx.drawImage(eq.img, node.boxX + 4, node.boxY + 4, 38, 38);

        // Etiqueta de número (#1..#4)
        ctx.fillStyle = strokeCol;
        drawRoundedRect(ctx, node.boxX, node.boxY, 16, 13, 4);
        ctx.fill();
        ctx.fillStyle = '#090D16';
        ctx.font = `bold 8.5px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(`#${idx + 1}`, node.boxX + 3, node.boxY + 10);
    });

    ctx.restore();

    const customTryOnCount = equippedList.filter(e => e.isCustomTryOn).length;
    const wornCount = equippedList.filter(e => !e.isCustomTryOn).length;
    ctx.fillStyle = equippedList.length > 0 ? 'rgba(35, 165, 90, 0.22)' : 'rgba(139, 92, 246, 0.18)';
    drawRoundedRect(ctx, vpX + 12, vpY + vpH - 80, vpW - 24, 24, 6);
    ctx.fill();

    ctx.fillStyle = equippedList.length > 0 ? '#4ade80' : '#dbdee1';
    ctx.font = `bold 10.5px "${FONT_FAMILY}", sans-serif`;
    const statusText = isEn
        ? (customTryOnCount > 0
            ? `[OK] ${customTryOnCount} trying on${wornCount > 0 ? ` + ${wornCount} worn` : ''}`
            : (wornCount > 0 ? `[OK] ${wornCount} item(s) equipped` : 'Try on an outfit or accessory below'))
        : (customTryOnCount > 0
            ? `[OK] ${customTryOnCount} en prueba${wornCount > 0 ? ` + ${wornCount} puesto(s)` : ''}`
            : (wornCount > 0 ? `[OK] ${wornCount} prenda(s) equipada(s)` : 'Probá un conjunto o accesorio abajo'));
    ctx.fillText(fitText(ctx, statusText, vpW - 36), vpX + 18, vpY + vpH - 64);

    ctx.fillStyle = '#4ade80';
    ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        fitText(ctx, `${isEn ? 'Total Outfit' : 'Total Conjunto'}: ${fmtMoneda(totalNormal)}`, vpW - 28),
        vpX + 14,
        vpY + vpH - 32
    );

    ctx.fillStyle = '#949ba4';
    ctx.font = `11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        fitText(
            ctx,
            isEn
                ? `${addedItems.length}/5 slots  •  40% Method: ${fmtMoneda(totalCashback)}`
                : `${addedItems.length}/5 espacios  •  Con Método 40%: ${fmtMoneda(totalCashback)}`,
            vpW - 28
        ),
        vpX + 14,
        vpY + vpH - 13
    );

    // Panel Derecho: Lista de Ítems Equipados + Gráfica Apache ECharts de Costo por Prenda
    const rightX = 304;
    ctx.fillStyle = '#dbdee1';
    ctx.font = `bold 11.5px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        isEn ? `EQUIPPED SLOTS (${addedItems.length}/5) & COST BREAKDOWN` : `RANURAS EQUIPADAS (${addedItems.length}/5) Y DESGLOSE DE COSTO`,
        rightX,
        76
    );

    if (addedItems.length === 0) {
        ctx.fillStyle = 'rgba(30, 35, 52, 0.90)';
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.35)';
        ctx.lineWidth = 1.4;
        drawRoundedRect(ctx, rightX, 86, 494, 344, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 15px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(
            isEn ? 'Try on any accessory or clothing on the avatar' : 'Probate cualquier accesorio o ropa sobre el avatar',
            rightX + 28,
            165
        );
        ctx.fillStyle = '#949ba4';
        ctx.font = `12px "${FONT_FAMILY}", sans-serif`;
        if (isEn) {
            ctx.fillText('1. Click "+ Try Accessory / Clothing" or "⚡ Demo Outfit" below.', rightX + 28, 198);
            ctx.fillText('2. Click "👕 Worn Clothing" to inspect and quote what this avatar wears.', rightX + 28, 224);
            ctx.fillText('3. Click "🧑 Change Avatar" to test outfits on any Roblox @username.', rightX + 28, 250);
            ctx.fillText('4. Kortex maps each anatomical slot and charts the cost breakdown.', rightX + 28, 276);
        } else {
            ctx.fillText('1. Tocá "+ Probar Accesorio / Ropa" o "⚡ Conjunto Demo" abajo.', rightX + 28, 198);
            ctx.fillText('2. Tocá "👕 Ropa Puesta" para cargar y cotizar lo que viste este avatar.', rightX + 28, 224);
            ctx.fillText('3. Tocá "🧑 Cambiar Avatar" para probar ropa sobre cualquier @usuario.', rightX + 28, 250);
            ctx.fillText('4. Kortex detecta la zona anatómica y grafica el costo del conjunto.', rightX + 28, 276);
        }
    } else {
        equippedList.forEach((eq, idx) => {
            const it = eq.item;
            const rowY = 86 + idx * 45;
            ctx.fillStyle = 'rgba(30, 35, 52, 0.92)';
            ctx.strokeStyle = eq.isCustomTryOn ? 'rgba(35, 165, 90, 0.60)' : 'rgba(88, 101, 242, 0.50)';
            ctx.lineWidth = 1.2;
            drawRoundedRect(ctx, rightX, rowY, 494, 40, 8);
            ctx.fill();
            ctx.stroke();

            if (eq.img) {
                ctx.drawImage(eq.img, rightX + 6, rowY + 3, 34, 34);
            }

            const tagStr = eq.isCustomTryOn
                ? (isEn ? '[TRY-ON]' : '[PRUEBA]')
                : (isEn ? '[WORN]' : '[PUESTO]');
            ctx.fillStyle = eq.isCustomTryOn ? '#4ade80' : '#818cf8';
            ctx.font = `bold 9.5px "${FONT_FAMILY}", sans-serif`;
            ctx.fillText(tagStr, rightX + 48, rowY + 16);

            ctx.fillStyle = '#ffffff';
            ctx.font = `bold 11.5px "${FONT_FAMILY}", sans-serif`;
            const cleanName = `#${idx + 1} ${String(it.name || `ID ${it.id}`)}`;
            ctx.fillText(fitText(ctx, cleanName, 248), rightX + 104, rowY + 16);

            ctx.fillStyle = '#a78bfa';
            ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
            ctx.fillText(
                fitText(ctx, `${isEn ? 'Slot' : 'Zona'}: ${eq.slot.label}  •  ID ${it.id}`, 300),
                rightX + 48,
                rowY + 33
            );

            const itemPrice = Number(it.price || 0);
            ctx.fillStyle = itemPrice > 0 ? '#4ade80' : '#949ba4';
            ctx.font = `bold 12px "${FONT_FAMILY}", sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText(
                itemPrice > 0
                    ? fmtMoneda(itemPrice)
                    : (isEn ? 'Free / Off-sale' : 'Gratis / No en venta'),
                rightX + 480,
                rowY + 25
            );
            ctx.textAlign = 'left';
        });

        // Sub-panel inferior derecho: Apache ECharts Cost Breakdown entre Normal vs Método 40%
        const chartBoxY = 316;
        const chartBoxH = 114;
        ctx.fillStyle = 'rgba(22, 27, 42, 0.95)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, rightX, chartBoxY, 494, chartBoxH, 10);
        ctx.fill();
        ctx.stroke();

        const rawPrices = equippedList.map(e => Math.max(0, Number(e.item.price || 0)));
        const posPrices = rawPrices.filter(v => v > 0);
        const maxP = posPrices.length ? Math.max(...posPrices) : 100;
        const minP = posPrices.length ? Math.min(...posPrices) : 1;
        const usePower = maxP / Math.max(1, minP) > 10;
        const scaleVal = (v) => (usePower ? Math.round(Math.pow(Math.max(1, v), 0.35) * 10) : v);

        const catData = rawPrices.map(v => ({ value: scaleVal(v), rawVal: v }));
        const methodData = rawPrices.map(v => {
            const m = Math.round(v * 0.6);
            return { value: scaleVal(m), rawVal: m };
        });
        const maxVisBar = Math.max(10, ...catData.map(d => d.value));

        const chartOption = {
            animation: false,
            backgroundColor: 'transparent',
            grid: { left: usePower ? 18 : 50, right: 18, top: 28, bottom: 22 },
            legend: {
                top: 2,
                right: 12,
                textStyle: { color: '#dbdee1', fontFamily: 'Liberation Sans', fontSize: 9.5, fontWeight: 'bold' },
                itemWidth: 10,
                itemHeight: 7
            },
            xAxis: {
                type: 'category',
                data: equippedList.map((e, i) => `#${i + 1} ${String(e.item.name || '').substring(0, 10)}`),
                axisLine: { lineStyle: { color: '#334155' } },
                axisTick: { show: false },
                axisLabel: { interval: 0, color: '#cbd5e1', fontFamily: 'Liberation Sans', fontSize: 9, fontWeight: 'bold' }
            },
            yAxis: {
                type: 'value',
                show: !usePower,
                max: Math.ceil(maxVisBar * 1.28),
                splitNumber: 2,
                splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)', type: 'dashed' } },
                axisLabel: {
                    color: '#94a3b8',
                    fontFamily: 'Liberation Sans',
                    fontSize: 8.5,
                    formatter: (v) => fmtMonedaCompacta(v, false).replace(' R$', '')
                }
            },
            series: [
                {
                    name: isEn ? 'Catalog R$' : 'Catálogo R$',
                    type: 'bar',
                    barMaxWidth: 20,
                    data: catData,
                    itemStyle: {
                        borderRadius: [4, 4, 0, 0],
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#a78bfa' },
                            { offset: 1, color: '#6366f1' }
                        ])
                    },
                    label: {
                        show: true,
                        position: 'top',
                        color: '#E2E8F0',
                        fontFamily: 'Liberation Sans',
                        fontSize: 8.5,
                        fontWeight: 'bold',
                        formatter: (p) => fmtMonedaCompacta(p.data?.rawVal ?? p.value, false).replace(' R$', '')
                    }
                },
                {
                    name: isEn ? '40% Method' : 'Método 40%',
                    type: 'bar',
                    barMaxWidth: 20,
                    data: methodData,
                    itemStyle: {
                        borderRadius: [4, 4, 0, 0],
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#4ade80' },
                            { offset: 1, color: '#16a34a' }
                        ])
                    }
                }
            ]
        };

        const { image: chartImg } = await renderEChartsToImage(chartOption, 486, 108);
        if (chartImg) {
            ctx.drawImage(chartImg, rightX + 4, chartBoxY + 3, 486, 108);
        }
    }

    return canvas.toBuffer('image/png');
}

/**
 * 4. Herramienta 2.2: Lienzo Comparativo de Clones UGC e Ítems Oficiales de Roblox Similares (Apache ECharts + Skia v2.0)
 */
async function generateClonesComparisonCanvas(originalItem, alternatives, explicitLang = null) {
    const isEn = getCurrentLang(explicitLang) === 'en';
    const width = 820;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f131f';
    ctx.fillRect(0, 0, width, height);

    // Resplandor radial Skia
    const glow = ctx.createRadialGradient(width * 0.72, height * 0.35, 20, width * 0.6, height * 0.5, width * 0.65);
    glow.addColorStop(0, 'rgba(35, 165, 90, 0.15)');
    glow.addColorStop(1, 'rgba(15, 19, 31, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#38bdf8';
    ctx.font = `bold 10.5px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        isEn
            ? 'SIMILAR ITEMS & UGC CLONES FINDER (2.2)  •  SAVINGS COMPARISON'
            : 'BUSCADOR DE CLONES Y SIMILARES (2.2)  •  COMPARATIVA DE AHORRO',
        22,
        24
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 19px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        fitText(
            ctx,
            `${isEn ? 'Reference' : 'Referencia'}: ${String(originalItem.name || (isEn ? 'Accessory' : 'Accesorio'))}`,
            width - 44
        ),
        22,
        48
    );

    // Izquierda: Tarjeta del Ítem de Referencia
    const leftX = 22;
    const leftY = 62;
    const leftW = 228;
    const leftH = 368;

    ctx.fillStyle = 'rgba(24, 30, 46, 0.95)';
    ctx.strokeStyle = '#5865F2';
    ctx.lineWidth = 1.8;
    drawRoundedRect(ctx, leftX, leftY, leftW, leftH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#818cf8';
    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(isEn ? 'REFERENCE ITEM' : 'ÍTEM DE REFERENCIA', leftX + 14, leftY + 22);

    const itemsToShow = alternatives.slice(0, 4);
    const [origImg, ...altThumbs] = await Promise.all([
        fetchImageSafe(originalItem.imageUrl),
        ...itemsToShow.map(a => fetchImageSafe(a.imageUrl))
    ]);

    // Marco para la miniatura original
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    drawRoundedRect(ctx, leftX + 22, leftY + 34, 184, 184, 10);
    ctx.fill();

    if (origImg) {
        ctx.drawImage(origImg, leftX + 27, leftY + 39, 174, 174);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(fitText(ctx, String(originalItem.name || 'Original'), leftW - 28), leftX + 14, leftY + 242);

    ctx.fillStyle = '#fbbf24';
    ctx.font = `bold 16px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        fitText(
            ctx,
            originalItem.price > 0
                ? fmtMoneda(originalItem.price)
                : (isEn ? 'Off-sale / Limited' : 'Fuera de venta / Lim.'),
            leftW - 28
        ),
        leftX + 14,
        leftY + 268
    );

    ctx.fillStyle = '#949ba4';
    ctx.font = `11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(`ID: ${originalItem.id}`, leftX + 14, leftY + 292);
    ctx.fillText(
        fitText(ctx, `${isEn ? 'By' : 'Por'}: ${String(originalItem.creatorName || 'Roblox')}`, leftW - 28),
        leftX + 14,
        leftY + 310
    );

    // Calcular ahorro máximo para destacarlo en la tarjeta izquierda
    const bestAlt = itemsToShow[0];
    if (bestAlt && originalItem.price > 0 && bestAlt.price > 0 && bestAlt.price < originalItem.price) {
        const bestSavePct = Math.min(99, Math.max(1, Math.round(((originalItem.price - bestAlt.price) / originalItem.price) * 100)));
        ctx.fillStyle = 'rgba(35, 165, 90, 0.20)';
        ctx.strokeStyle = 'rgba(35, 165, 90, 0.55)';
        ctx.lineWidth = 1.2;
        drawRoundedRect(ctx, leftX + 14, leftY + 324, leftW - 28, 32, 7);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#4ade80';
        ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(
            isEn ? `MAX SAVINGS: -${bestSavePct}%` : `AHORRO MÁXIMO: -${bestSavePct}%`,
            leftX + leftW / 2,
            leftY + 344
        );
        ctx.textAlign = 'left';
    }

    // Derecha Arriba: Tarjetas de las 4 Alternativas (en grilla 2x2 compacta y simétrica)
    const rightX = 266;
    const cardW = 260;
    const cardH = 104;

    itemsToShow.forEach((alt, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const cx = rightX + col * (cardW + 12);
        const cy = 62 + row * (cardH + 10);
        const isOfficial = Boolean(alt.isOfficialRoblox);

        ctx.fillStyle = 'rgba(28, 33, 48, 0.94)';
        ctx.strokeStyle = isOfficial ? '#00B8D9' : '#23a55a';
        ctx.lineWidth = idx === 0 ? 1.8 : 1.2;
        drawRoundedRect(ctx, cx, cy, cardW, cardH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        drawRoundedRect(ctx, cx + 8, cy + 10, 68, 68, 8);
        ctx.fill();
        if (altThumbs[idx]) {
            ctx.drawImage(altThumbs[idx], cx + 10, cy + 12, 64, 64);
        }

        const tagText = isOfficial
            ? (isEn ? '[OFFICIAL ROBLOX]' : '[ROBLOX OFICIAL]')
            : (isEn ? '[UGC CLONE]' : '[CLON UGC]');
        ctx.fillStyle = isOfficial ? '#38bdf8' : '#4ade80';
        ctx.font = `bold 9.5px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(tagText, cx + 84, cy + 22);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 11.5px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(fitText(ctx, `#${idx + 1} ${String(alt.name)}`, cardW - 92), cx + 84, cy + 40);

        ctx.fillStyle = '#fbbf24';
        ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(
            fitText(ctx, alt.price > 0 ? fmtMoneda(alt.price) : (isEn ? 'Off-sale' : 'Fuera de venta'), cardW - 92),
            cx + 84,
            cy + 60
        );

        if (originalItem.price > 0 && alt.price > 0 && alt.price < originalItem.price) {
            const ahorroPct = Math.min(99, Math.max(1, Math.round(((originalItem.price - alt.price) / originalItem.price) * 100)));
            ctx.fillStyle = 'rgba(35, 165, 90, 0.24)';
            drawRoundedRect(ctx, cx + 84, cy + 68, 114, 20, 5);
            ctx.fill();
            ctx.fillStyle = '#4ade80';
            ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
            ctx.fillText(isEn ? `-${ahorroPct}% SAVED` : `-${ahorroPct}% AHORRO`, cx + 92, cy + 82);
        } else {
            ctx.fillStyle = '#949ba4';
            ctx.font = `10px "${FONT_FAMILY}", sans-serif`;
            ctx.fillText(`ID: ${alt.id}`, cx + 84, cy + 82);
        }

        ctx.fillStyle = '#949ba4';
        ctx.font = `9px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(fitText(ctx, `ID ${alt.id}`, 70), cx + 10, cy + 94);
    });

    // Derecha Abajo: Gráfica Comparativa Apache ECharts de Precios (con escala amortiguada cuando hay Limiteds caros)
    const chartY = 292;
    const chartW = 532;
    const chartH = 138;

    ctx.fillStyle = 'rgba(22, 27, 42, 0.95)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.2;
    drawRoundedRect(ctx, rightX, chartY, chartW, chartH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#949ba4';
    ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        isEn
            ? 'ALTERNATIVE PRICE COMPARISON (R$)'
            : 'COMPARATIVA DE PRECIOS ENTRE ALTERNATIVAS (R$)',
        rightX + 14,
        chartY + 18
    );

    const altPrices = itemsToShow.map(a => Math.max(0, Number(a.price || 0)));
    const posAlt = altPrices.filter(v => v > 0);
    const maxAlt = posAlt.length ? Math.max(...posAlt) : 100;
    const minAlt = posAlt.length ? Math.min(...posAlt) : 1;
    const useDampedScale = maxAlt / Math.max(1, minAlt) > 8;

    const toBarVal = (v) => (useDampedScale ? Math.round(Math.pow(Math.max(1, v), 0.34) * 10) : v);
    const barSeriesData = itemsToShow.map((a) => {
        const rawP = Math.max(0, Number(a.price || 0));
        return {
            value: toBarVal(rawP),
            rawVal: rawP,
            itemStyle: {
                borderRadius: [5, 5, 0, 0],
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, a.isOfficialRoblox
                    ? [{ offset: 0, color: '#38bdf8' }, { offset: 1, color: '#0284c7' }]
                    : [{ offset: 0, color: '#4ade80' }, { offset: 1, color: '#16a34a' }]
                )
            }
        };
    });
    const maxBarVis = Math.max(10, ...barSeriesData.map(d => d.value));

    const chartOption = {
        animation: false,
        backgroundColor: 'transparent',
        grid: { left: useDampedScale ? 24 : 56, right: 24, top: 28, bottom: 24 },
        xAxis: {
            type: 'category',
            data: itemsToShow.map((a, i) => `#${i + 1} ${String(a.name).substring(0, 12)}`),
            axisLine: { lineStyle: { color: '#334155' } },
            axisTick: { show: false },
            axisLabel: { interval: 0, color: '#e2e8f0', fontFamily: 'Liberation Sans', fontSize: 9.5, fontWeight: 'bold' }
        },
        yAxis: {
            type: 'value',
            show: !useDampedScale,
            max: Math.ceil(maxBarVis * 1.32),
            splitNumber: 3,
            splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)', type: 'dashed' } },
            axisLabel: {
                color: '#94a3b8',
                fontFamily: 'Liberation Sans',
                fontSize: 9,
                formatter: (v) => fmtMonedaCompacta(v, false).replace(' R$', '')
            }
        },
        series: [
            {
                type: 'bar',
                barMaxWidth: 36,
                data: barSeriesData,
                label: {
                    show: true,
                    position: 'top',
                    color: '#f8fafc',
                    fontFamily: 'Liberation Sans',
                    fontSize: 9.5,
                    fontWeight: 'bold',
                    formatter: (p) => fmtMonedaCompacta(p.data?.rawVal ?? p.value, false)
                }
            }
        ]
    };

    const { image: chartImg } = await renderEChartsToImage(chartOption, chartW - 12, chartH - 22);
    if (chartImg) {
        ctx.drawImage(chartImg, rightX + 6, chartY + 18, chartW - 12, chartH - 22);
    }

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
    const isEn = getCurrentLang(options.lang) === 'en';
    const width = 780;
    const height = 445;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = DISCORD_DARK_BG;
    ctx.fillRect(0, 0, width, height);

    const img = await fetchImageSafe(templateImageOrUrl);
    const garmentMode = detectGarmentModeFromImage(img, { ...options, title });

    const modeLabels = isEn
        ? {
            shirt: 'SHIRT MODE (R6 SHIRT)',
            pants: 'PANTS MODE (R6 PANTS)',
            full: 'FULL SUIT MODE (SHIRT + PANTS)',
            tshirt: 'T-SHIRT MODE (FRONT CHEST)'
        }
        : {
            shirt: 'MODO CAMISA (R6)',
            pants: 'MODO PANTALÓN (R6)',
            full: 'MODO TRAJE COMPLETO (CAMISA + PANTALÓN)',
            tshirt: 'MODO CAMISETA (PECHO FRONTAL)'
        };

    // Encabezado
    ctx.fillStyle = '#a78bfa';
    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        isEn
            ? `KORTEX 2D STUDIO  •  R6 MANNEQUIN UV SEAM TESTER  •  ${modeLabels[garmentMode] || modeLabels.shirt}`
            : `ESTUDIO 2D KORTEX  •  PROBADOR DE COSTURAS UV EN MANIQUÍ R6  •  ${modeLabels[garmentMode] || modeLabels.shirt}`,
        22,
        25
    );

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
    ctx.fillText(
        isEn ? 'RAW UV TEMPLATE (585×559)' : 'PLANTILLA UV EN BRUTO (585×559)',
        leftX + 14,
        leftY + 22
    );

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

            drawUvGuide(231, 74, 128, 128, '#38bdf8', isEn ? 'FRONT' : 'FRENTE');
            drawUvGuide(427, 74, 128, 128, '#a78bfa', isEn ? 'BACK' : 'ESPALDA');
            drawUvGuide(217, 355, 64, 128, '#34d399', isEn ? 'RIGHT' : 'DER');
            drawUvGuide(308, 355, 64, 128, '#fbbf24', isEn ? 'LEFT' : 'IZQ');
        }
    } else {
        ctx.fillStyle = '#949ba4';
        ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(
            isEn ? 'Could not load PNG image' : 'No se pudo cargar la imagen PNG',
            tplBoxX + 42,
            tplBoxY + 138
        );
    }

    // Leyenda inferior del panel izquierdo
    ctx.fillStyle = '#949ba4';
    ctx.font = `11px "${FONT_FAMILY}", sans-serif`;
    const resTxt = img
        ? (isEn ? `Source resolution: ${img.width}×${img.height} px` : `Resolución fuente: ${img.width}×${img.height} px`)
        : (isEn ? 'No texture' : 'Sin textura');
    ctx.fillText(
        `${resTxt}  •  ${isEn ? 'Auto UV scale' : 'Escala UV automática'}`,
        leftX + 14,
        leftY + 326
    );

    ctx.fillStyle = '#38bdf8';
    ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(isEn ? '■ Front' : '■ Frente', leftX + 14, leftY + 346);
    ctx.fillStyle = '#a78bfa';
    ctx.fillText(isEn ? '■ Back' : '■ Espalda', leftX + 74, leftY + 346);
    ctx.fillStyle = '#34d399';
    ctx.fillText(isEn ? '■ Right Limb' : '■ Brazo/Pierna Der.', leftX + 142, leftY + 346);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(isEn ? '■ Left' : '■ Izq.', leftX + 258, leftY + 346);

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
    ctx.fillText(
        isEn ? 'R6 MANNEQUIN PREVIEW (FRONT & BACK)' : 'PREVISUALIZACIÓN EN MANIQUÍ R6 (FRENTE Y ESPALDA)',
        rightX + 16,
        rightY + 22
    );

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
        const leftBoxX = torsoX - gap - limbW;
        const rightBoxX = torsoX + torsoW + gap;
        const legsY = torsoY + torsoH + 3;
        const leftLegX = torsoX;
        const rightLegX = torsoX + limbW + 4;

        // Etiqueta superior (VISTA FRONTAL / VISTA TRASERA)
        ctx.fillStyle = isFront ? '#38bdf8' : '#a78bfa';
        ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
        const viewLabel = isFront
            ? (isEn ? 'FRONT VIEW' : 'VISTA FRONTAL (FRENTE)')
            : (isEn ? 'BACK VIEW' : 'VISTA TRASERA (ESPALDA)');
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

    // Pie de confirmación de costuras UV
    ctx.fillStyle = 'rgba(35, 165, 90, 0.18)';
    drawRoundedRect(ctx, rightX + 14, rightY + 330, rightW - 28, 22, 6);
    ctx.fill();

    ctx.fillStyle = '#23a55a';
    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        isEn
            ? '[OK] R6 UV seams aligned (Front + Back) — Toggle Shirt / Pants below'
            : '[OK] Costuras UV R6 alineadas (Frente + Espalda) — Podés alternar Camisa / Pantalón abajo',
        rightX + 22,
        rightY + 345
    );

    return canvas.toBuffer('image/png');
}


/**
 * 6. Herramienta 2.4: Tarjeta de Alta Resolución del Exportador 3D (Render HD + Ficha Técnica .OBJ/.MTL)
 */
async function generate3DShowcaseCard(exportInfo, explicitLang = null) {
    const isEn = getCurrentLang(explicitLang || exportInfo?.lang) === 'en';
    const width = 760;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = DISCORD_DARK_BG;
    ctx.fillRect(0, 0, width, height);

    // Header
    ctx.fillStyle = '#949ba4';
    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        isEn
            ? 'KORTEX 3D STUDIO  •  HIGH-RES PNG RENDER + WAVEFRONT PACKAGE (.OBJ / .MTL)'
            : 'ESTUDIO 3D KORTEX  •  RENDER PNG DE ALTA RESOLUCIÓN + PAQUETE WAVEFRONT (.OBJ / .MTL)',
        22,
        26
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 20px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(String(exportInfo.displayTitle || (isEn ? 'Roblox 3D Model' : 'Modelo 3D Roblox')).substring(0, 44), 22, 52);

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
    ctx.fillText(
        isEn
            ? '✓ HD RENDER + .ZIP PACKAGE READY FOR DOWNLOAD'
            : '✓ RENDER HD + ARCHIVO .ZIP LISTOS PARA DESCARGAR',
        390,
        96
    );

    const specs = isEn
        ? [
            { label: 'ATTACHED FILE', val: `avatar_3d_export.zip (${exportInfo.sizeKB} KB)` },
            { label: '3D GEOMETRY (.OBJ)', val: `${exportInfo.vertexCount.toLocaleString('en-US')} vertices • ${exportInfo.faceCount.toLocaleString('en-US')} faces` },
            { label: 'INCLUDED MESHES', val: `${exportInfo.meshesExtracted} real 3D mesh(es) converted` },
            { label: 'PNG TEXTURES (.MTL)', val: `${exportInfo.texturesCount} PNG texture(s) + 720×720 HD Render` },
            { label: 'COMPATIBILITY', val: 'Blender • Blockbench • Cinema4D • Maya' }
        ]
        : [
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

async function generateColorMatchCanvas(palette, matchedItems, baseTitle = 'Prenda Base', activeToneIdx = 0, categoryLabel = 'Todos los Cosméticos', explicitLang = null) {
    const isEn = getCurrentLang(explicitLang) === 'en';
    const width = 760;
    const height = 408;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = DISCORD_DARK_BG;
    ctx.fillRect(0, 0, width, height);

    const EN_CATEGORY_LABELS = {
        'Todos los Cosméticos': 'All Cosmetics',
        'Sombreros': 'Hats',
        'Cabello / Pelo': 'Hair',
        'Rostro / Lentes': 'Face / Glasses',
        'Cuello': 'Neck',
        'Espalda': 'Back',
        'Ropa Clásica': 'Classic Clothing'
    };

    const translatedCat = isEn ? (EN_CATEGORY_LABELS[categoryLabel] || categoryLabel) : categoryLabel;
    const translatedTitle = isEn
        ? String(baseTitle).replace(/^Color Directo:/i, 'Direct Color:').replace(/^Avatar:/i, 'Avatar:').replace(/^Prenda Base$/i, 'Base Item')
        : String(baseTitle);

    // Encabezado izquierdo acotado a x <= 445 para no superponerse jamás con las muestras #1, #2 y #3
    ctx.fillStyle = '#949ba4';
    ctx.font = `bold 10px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        isEn
            ? 'ROBLOX COLOR-MATCH  •  CHROMATIC AFFINITY (ΔRGB)'
            : 'EMPAREJADOR DE COLOR ROBLOX  •  AFINIDAD CROMÁTICA (ΔRGB)',
        22,
        23
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 17px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(`${translatedTitle.substring(0, 32)}`, 22, 45);

    ctx.fillStyle = '#a78bfa';
    ctx.font = `bold 11px "${FONT_FAMILY}", sans-serif`;
    ctx.fillText(
        `${isEn ? 'Active filter' : 'Filtro activo'}: ${String(translatedCat).substring(0, 38)}`,
        22,
        63
    );

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
        ctx.fillText(
            isEn
                ? 'No on-sale cosmetics found for this exact combination.'
                : 'No se encontraron cosméticos en venta para esta combinación exacta.',
            140,
            215
        );

        ctx.fillStyle = '#949ba4';
        ctx.font = `12px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(
            isEn
                ? 'Try selecting another Tone (#1, #2, #3) or changing the cosmetic filter below.'
                : 'Probá seleccionando otro Tono (#1, #2, #3) o cambiando el filtro de cosmético abajo.',
            150,
            242
        );
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
        ctx.fillText(
            isEn ? `${item.matchPct}% Color Match` : `${item.matchPct}% Afinidad de Color`,
            x + 134,
            y + 62
        );

        ctx.fillStyle = '#dbdee1';
        ctx.font = `bold 13px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(
            `${isEn ? 'Price' : 'Precio'}: ${fmtMoneda(item.price)}`,
            x + 134,
            y + 88
        );

        ctx.fillStyle = item.detectedHex || palette[0].hex;
        drawRoundedRect(ctx, x + 134, y + 100, 18, 18, 4);
        ctx.fill();

        ctx.fillStyle = '#949ba4';
        ctx.font = `11px "${FONT_FAMILY}", sans-serif`;
        ctx.fillText(
            `${isEn ? 'Tone' : 'Tono'}: ${item.detectedHex || palette[0].hex} • ID ${item.id}`,
            x + 158,
            y + 113
        );
    });

    return canvas.toBuffer('image/png');
}

module.exports = {
    generatePriceChart,
    generatePriceFloorsChart,
    generateCalculatorBreakdownCard,
    generatePendingRobuxCard,
    generateEmptyServersRadarCard,
    renderEChartsToImage,
    renderHtmlCardWithSatori,
    fetchImageSafe,
    echarts,
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
