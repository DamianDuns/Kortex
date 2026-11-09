// ==========================================
// ARCHIVO: utils/tycoonRenderer.js
// Motor Gráfico 3D-Isométrico Estilo Roblox Studio (Cartoon / Low-Poly) para /tycoon
// - Escenario 3D isométrico colorido con césped, árboles low-poly, rocas y plataforma de concreto
// - Cinta transportadora en L con bloques 3D de TIX, Dropper con chimenea y Bóveda Colectora
// - Botones circulares 3D de presión estilo Roblox Tycoon que se transforman en máquinas 3D al comprarlos
// - Carga en vivo del Personaje 3D Cuerpo Completo de Roblox + Assets / Ítems equipados
// ==========================================

const path = require('path');
const axios = require('axios');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

try {
    GlobalFonts.registerFromPath(path.join(__dirname, '../assets/fonts/LiberationSans-Regular.ttf'), 'KortexSans');
    GlobalFonts.registerFromPath(path.join(__dirname, '../assets/fonts/LiberationSans-Bold.ttf'), 'KortexSans');
} catch {
    // Fuentes ya registradas
}

// Caché en memoria para avatares 3D cuerpo completo y accesorios de Roblox
const player3DAvatarCache = new Map();
const MAX_AVATAR_CACHE = 40;
const AVATAR_CACHE_TTL_MS = 10 * 60 * 1000;

try {
    const { registerCachePurger } = require('../src/utils/performanceManager');
    registerCachePurger(
        'tycoon3DAvatarCache',
        () => {
            const count = player3DAvatarCache.size;
            player3DAvatarCache.clear();
            return count;
        },
        {
            label: '🧍 Caché de Personajes 3D Tycoon',
            whatItCleans: 'Renders 3D de cuerpo completo de avatares para /tycoon'
        }
    );
} catch {
    // Silencioso
}

function drawRoundedRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

function stripEmojis(str) {
    return String(str || '')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatCleanCardItemName(rawName, maxLen = 22) {
    const stripped = stripEmojis(rawName || '')
        .replace(/\s*\(BC\)/gi, ' BC')
        .replace(/\s*\(.*?\)/g, '')
        .trim();
    return stripped.length > maxLen ? `${stripped.slice(0, maxLen - 1).trim()}…` : stripped;
}

// ============================================================================
// PROYECCIÓN 3D ISOMÉTRICA Y PRIMITIVAS LOW-POLY / ROBLOX STUDIO
// ============================================================================
const ISO_ORIGIN_X = 480;
const ISO_ORIGIN_Y = 122;
const ISO_SCALE_X = 0.88;
const ISO_SCALE_Y = 0.46;

/**
 * Convierte coordenadas del mundo 3D (u, v, z) a coordenadas de pantalla 2D (x, y).
 * u: eje frontal-izquierdo a frontal-derecho (0..400)
 * v: eje frontal-derecho a frontal-izquierdo (0..400)
 * z: altura vertical hacia arriba
 */
function isoPoint(u, v, z = 0) {
    return {
        x: ISO_ORIGIN_X + (u - v) * ISO_SCALE_X,
        y: ISO_ORIGIN_Y + (u + v) * ISO_SCALE_Y - z
    };
}

function fillPolygon(ctx, points, fillStyle, strokeStyle = null, lineWidth = 1) {
    if (!points || points.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
    if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round';
        ctx.stroke();
    }
}

/**
 * Dibuja un prisma rectangular 3D isométrico con iluminación solar Roblox (cara superior, izquierda y derecha).
 */
function drawIsoPrism(ctx, u, v, z, du, dv, dz, colors = {}) {
    const {
        top = '#E2E8F0',
        left = '#94A3B8',
        right = '#64748B',
        stroke = null,
        lineWidth = 1,
        shadow = false
    } = colors;

    if (shadow && z <= 4) {
        const sPad = Math.min(14, Math.max(4, dz * 0.18));
        const sp0 = isoPoint(u + 3, v + 3, 0);
        const sp1 = isoPoint(u + du + sPad, v + 3, 0);
        const sp2 = isoPoint(u + du + sPad, v + dv + sPad, 0);
        const sp3 = isoPoint(u + 3, v + dv + sPad, 0);
        fillPolygon(ctx, [sp0, sp1, sp2, sp3], 'rgba(15, 23, 42, 0.22)');
    }

    // Vértices inferiores (z) y superiores (z + dz)
    const b00 = isoPoint(u, v, z);
    const b10 = isoPoint(u + du, v, z);
    const b11 = isoPoint(u + du, v + dv, z);
    const b01 = isoPoint(u, v + dv, z);

    const t00 = isoPoint(u, v, z + dz);
    const t10 = isoPoint(u + du, v, z + dz);
    const t11 = isoPoint(u + du, v + dv, z + dz);
    const t01 = isoPoint(u, v + dv, z + dz);

    // Cara frontal-izquierda (mirando hacia +v)
    fillPolygon(ctx, [t01, t11, b11, b01], left, stroke, lineWidth);
    // Cara frontal-derecha (mirando hacia +u)
    fillPolygon(ctx, [t10, t11, b11, b10], right, stroke, lineWidth);
    // Cara superior (mirando hacia +z)
    fillPolygon(ctx, [t00, t10, t11, t01], top, stroke, lineWidth);
}

/**
 * Dibuja un cilindro / botón circular 3D en perspectiva isométrica.
 */
function drawIsoCylinder(ctx, u, v, z, radiusX, radiusY, height, colors = {}) {
    const centerBottom = isoPoint(u, v, z);
    const centerTop = isoPoint(u, v, z + height);
    const {
        top = '#38BDF8',
        side = '#0284C7',
        rim = '#BAE6FD',
        shadow = true
    } = colors;

    ctx.save();
    if (shadow) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
        ctx.beginPath();
        ctx.ellipse(centerBottom.x + 2, centerBottom.y + 4, radiusX * 1.06, radiusY * 1.06, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Cuerpo lateral extruido del cilindro
    ctx.fillStyle = side;
    ctx.beginPath();
    ctx.ellipse(centerBottom.x, centerBottom.y, radiusX, radiusY, 0, 0, Math.PI);
    ctx.lineTo(centerTop.x - radiusX, centerTop.y);
    ctx.ellipse(centerTop.x, centerTop.y, radiusX, radiusY, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();

    // Tapa superior iluminada
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.ellipse(centerTop.x, centerTop.y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();

    if (rim) {
        ctx.strokeStyle = rim;
        ctx.lineWidth = 1.6;
        ctx.stroke();
    }

    // Brillo especular cartoon en la tapa
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.ellipse(centerTop.x - radiusX * 0.2, centerTop.y - radiusY * 0.22, radiusX * 0.45, radiusY * 0.38, -0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

/**
 * Dibuja un árbol 3D Low-Poly estilo Roblox (tronco prismático + copas cúbicas verdes escalonadas).
 */
function drawLowPolyRobloxTree(ctx, screenX, screenY, scale = 1) {
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.scale(scale, scale);

    // Sombra en el césped
    ctx.fillStyle = 'rgba(15, 45, 10, 0.32)';
    ctx.beginPath();
    ctx.ellipse(4, 6, 36, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawLocalBox = (x, y, w, d, h, topC, leftC, rightC) => {
        const p00 = { x: x, y: y - h };
        const p10 = { x: x + w, y: y + w * 0.48 - h };
        const p11 = { x: x + w - d, y: y + (w + d) * 0.48 - h };
        const p01 = { x: x - d, y: y + d * 0.48 - h };

        const b10 = { x: p10.x, y: p10.y + h };
        const b11 = { x: p11.x, y: p11.y + h };
        const b01 = { x: p01.x, y: p01.y + h };

        fillPolygon(ctx, [p01, p11, b11, b01], leftC);
        fillPolygon(ctx, [p10, p11, b11, b10], rightC);
        fillPolygon(ctx, [p00, p10, p11, p01], topC);
    };

    // Tronco de madera 3D
    drawLocalBox(0, -14, 14, 14, 34, '#8B5A2B', '#6E4720', '#4A2F13');
    // Copa inferior ancha
    drawLocalBox(0, -38, 42, 42, 34, '#4CC936', '#369B24', '#257018');
    // Copa media
    drawLocalBox(0, -68, 32, 32, 28, '#5CE044', '#40B02C', '#2D821E');
    // Copa superior
    drawLocalBox(0, -90, 20, 20, 18, '#74EC5B', '#4CC936', '#369B24');

    ctx.restore();
}

/**
 * Dibuja una roca 3D Low-Poly estilo Roblox sobre el césped.
 */
function drawLowPolyRock(ctx, screenX, screenY, scale = 1) {
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.scale(scale, scale);

    ctx.fillStyle = 'rgba(15, 45, 10, 0.28)';
    ctx.beginPath();
    ctx.ellipse(2, 5, 28, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Base de roca facetada
    fillPolygon(ctx, [{ x: -24, y: 2 }, { x: 0, y: 12 }, { x: 0, y: -12 }, { x: -20, y: -14 }], '#64748B');
    fillPolygon(ctx, [{ x: 0, y: 12 }, { x: 24, y: 1 }, { x: 18, y: -15 }, { x: 0, y: -12 }], '#475569');
    fillPolygon(ctx, [{ x: -20, y: -14 }, { x: 0, y: -12 }, { x: 18, y: -15 }, { x: 2, y: -24 }], '#94A3B8');

    ctx.restore();
}

/**
 * Dibuja matas de pasto cartoon 3D sobre el terreno.
 */
function drawGrassTuft(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#256F17';
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-12, -11);
    ctx.lineTo(-3, -2);
    ctx.lineTo(0, -14);
    ctx.lineTo(4, -2);
    ctx.lineTo(11, -10);
    ctx.lineTo(7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

/**
 * Dibuja iconos vectoriales limpios para el HUD y las tarjetas.
 */
function drawVectorIcon(ctx, type, cx, cy, size = 14, color = '#38BDF8') {
    ctx.save();
    ctx.translate(cx, cy);
    const s = size / 2;

    if (type === 'tix') {
        ctx.fillStyle = '#FACC15';
        ctx.strokeStyle = '#FEF08A';
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, -s * 1.25, -s * 0.85, s * 2.5, s * 1.7, 3.5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#713F12';
        ctx.font = `bold ${Math.max(8, Math.round(size * 0.65))}px KortexSans`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('T', 0, 0.5);
    } else if (type === 'crystal' || type === 'gem') {
        ctx.fillStyle = color || '#EC4899';
        ctx.strokeStyle = '#FCE7F3';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.15);
        ctx.lineTo(s * 0.95, -s * 0.2);
        ctx.lineTo(0, s * 1.15);
        ctx.lineTo(-s * 0.95, -s * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.95);
        ctx.lineTo(s * 0.45, -s * 0.2);
        ctx.lineTo(0, s * 0.35);
        ctx.closePath();
        ctx.fill();
    } else if (type === 'bolt') {
        ctx.fillStyle = color || '#4ADE80';
        ctx.beginPath();
        ctx.moveTo(s * 0.2, -s * 1.15);
        ctx.lineTo(-s * 0.85, s * 0.1);
        ctx.lineTo(-s * 0.05, s * 0.1);
        ctx.lineTo(-s * 0.3, s * 1.15);
        ctx.lineTo(s * 0.85, -s * 0.15);
        ctx.lineTo(s * 0.05, -s * 0.15);
        ctx.closePath();
        ctx.fill();
    } else if (type === 'gear') {
        ctx.fillStyle = color || '#38BDF8';
        for (let i = 0; i < 6; i++) {
            ctx.save();
            ctx.rotate((i * Math.PI) / 3);
            ctx.fillRect(-s * 0.24, -s * 1.1, s * 0.48, s * 2.2);
            ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2);
        ctx.fill();
    } else if (type === 'crown') {
        ctx.fillStyle = color || '#FDE047';
        ctx.beginPath();
        ctx.moveTo(-s * 1.05, s * 0.75);
        ctx.lineTo(-s * 0.85, -s * 0.65);
        ctx.lineTo(-s * 0.3, s * 0.05);
        ctx.lineTo(0, -s * 0.9);
        ctx.lineTo(s * 0.3, s * 0.05);
        ctx.lineTo(s * 0.85, -s * 0.65);
        ctx.lineTo(s * 1.05, s * 0.75);
        ctx.closePath();
        ctx.fill();
    } else if (type === 'server') {
        ctx.fillStyle = color || '#10B981';
        drawRoundedRect(ctx, -s, -s * 0.85, s * 2, s * 0.75, 2);
        ctx.fill();
        drawRoundedRect(ctx, -s, s * 0.1, s * 2, s * 0.75, 2);
        ctx.fill();
    } else if (type === 'shield') {
        ctx.fillStyle = color || '#38BDF8';
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.9, -s * 0.55);
        ctx.lineTo(s * 0.75, s * 0.35);
        ctx.lineTo(0, s * 1.05);
        ctx.lineTo(-s * 0.75, s * 0.35);
        ctx.lineTo(-s * 0.9, -s * 0.55);
        ctx.closePath();
        ctx.fill();
    } else if (type === 'check') {
        ctx.strokeStyle = color || '#4ADE80';
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-s * 0.75, 0);
        ctx.lineTo(-s * 0.2, s * 0.6);
        ctx.lineTo(s * 0.85, -s * 0.6);
        ctx.stroke();
    }

    ctx.restore();
}

function draw3DBox(ctx, x, y, w, h, depth, topColor, frontColor, borderColor, radius = 10) {
    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.42)';
    drawRoundedRect(ctx, x + 2, y + depth + 4, w, h, radius);
    ctx.fill();

    ctx.fillStyle = frontColor;
    drawRoundedRect(ctx, x, y + depth, w, h, radius);
    ctx.fill();
    if (borderColor) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1.4;
        ctx.stroke();
    }

    ctx.fillStyle = topColor;
    drawRoundedRect(ctx, x, y, w, h, radius);
    ctx.fill();
    if (borderColor) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1.8;
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x + 2, y + 2, w - 4, h - 4, Math.max(2, radius - 2));
    ctx.stroke();
    ctx.restore();
}

/**
 * Calcula los límites exactos de píxeles no transparentes de una imagen (para recortar márgenes vacíos del avatar 3D).
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
            if (d[(y * img.width + x) * 4 + 3] > 24) {
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
 * Resuelve y descarga el Render 3D de Cuerpo Completo del personaje de Roblox junto con sus assets equipados.
 */
async function resolvePlayer3DAvatarData({ avatarUrl, username, robloxUserId }) {
    const cacheKey = String(robloxUserId || avatarUrl || username || '').toLowerCase().trim();
    if (!cacheKey || cacheKey === 'player') return null;

    const cached = player3DAvatarCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts < AVATAR_CACHE_TTL_MS)) {
        return cached;
    }

    let resolvedImg = null;
    let wornAssetsCount = 0;

    try {
        let targetFullUrl = avatarUrl;

        // Si no se pasó URL o era un headshot circular/chico, resolver el render 3D Cuerpo Completo 420x420 de Roblox
        if ((!targetFullUrl || targetFullUrl.includes('avatar-headshot')) && (robloxUserId || (username && !username.startsWith('test_')))) {
            let rId = robloxUserId;
            if (!rId && username) {
                const cleanU = String(username).replace(/^@/, '').trim();
                if (cleanU.length >= 3 && cleanU.toLowerCase() !== 'player') {
                    const uRes = await axios.post(
                        'https://users.roblox.com/v1/usernames/users',
                        { usernames: [cleanU], excludeBannedUsers: false },
                        { timeout: 1800 }
                    ).catch(() => null);
                    rId = uRes?.data?.data?.[0]?.id || null;
                }
            }

            if (rId) {
                const [fullThumbRes, wearingRes] = await Promise.all([
                    axios.get(
                        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${rId}&size=420x420&format=Png&isCircular=false`,
                        { timeout: 2200 }
                    ).catch(() => null),
                    axios.get(
                        `https://avatar.roblox.com/v1/users/${rId}/currently-wearing`,
                        { timeout: 1800 }
                    ).catch(() => null)
                ]);
                const fullCandidate = fullThumbRes?.data?.data?.[0]?.imageUrl;
                if (fullCandidate) {
                    targetFullUrl = fullCandidate;
                }
                if (Array.isArray(wearingRes?.data?.assetIds)) {
                    wornAssetsCount = wearingRes.data.assetIds.length;
                }
            }
        }

        if (targetFullUrl && /^https?:\/\//i.test(String(targetFullUrl))) {
            const imgRes = await axios.get(String(targetFullUrl), {
                responseType: 'arraybuffer',
                timeout: 2600,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            }).catch(() => null);

            if (imgRes?.data) {
                const buf = Buffer.from(imgRes.data);
                if (buf.length > 100) {
                    resolvedImg = await loadImage(buf);
                }
            }
        }
    } catch {
        resolvedImg = null;
    }

    if (!resolvedImg) return null;

    const bounds = getOpaqueBounds(resolvedImg);
    const entry = { img: resolvedImg, bounds, wornAssetsCount, ts: Date.now() };
    if (player3DAvatarCache.size >= MAX_AVATAR_CACHE) {
        const firstKey = player3DAvatarCache.keys().next().value;
        if (firstKey) player3DAvatarCache.delete(firstKey);
    }
    player3DAvatarCache.set(cacheKey, entry);
    return entry;
}

/**
 * Dibuja un Personaje 3D Isométrico estilo Roblox (Cuerpo Bloque R6 en 3D + Ítems/Accesorios Equipados en 3D).
 * Se usa cuando el jugador aún no cargó textura externa o en modo local, e incluye soporte para renderizar
 * el accesorio equipado del Tycoon directamente sobre la cabeza, espalda o mano del personaje.
 */
function drawIsometric3DRobloxCharacter(ctx, screenX, screenY, equippedItem = null, scale = 1) {
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.scale(scale, scale);

    // Sombra elíptica suave bajo los pies del personaje
    ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 30, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Helper local para bloques 3D del cuerpo del avatar
    const drawLimb3D = (cx, cy, w, d, h, topCol, leftCol, rightCol) => {
        const t00 = { x: cx, y: cy - h - (w + d) * 0.25 };
        const t10 = { x: cx + w, y: cy - h + (w - d) * 0.25 };
        const t11 = { x: cx + w - d, y: cy - h + (w + d) * 0.25 };
        const t01 = { x: cx - d, y: cy - h - (w - d) * 0.25 };

        const b10 = { x: t10.x, y: t10.y + h };
        const b11 = { x: t11.x, y: t11.y + h };
        const b01 = { x: t01.x, y: t01.y + h };

        fillPolygon(ctx, [t01, t11, b11, b01], leftCol, 'rgba(0,0,0,0.22)', 0.8);
        fillPolygon(ctx, [t10, t11, b11, b10], rightCol, 'rgba(0,0,0,0.22)', 0.8);
        fillPolygon(ctx, [t00, t10, t11, t01], topCol, 'rgba(0,0,0,0.22)', 0.8);
    };

    const eqId = String(equippedItem?.item_id || '').toLowerCase();

    // Si tiene Alas equipadas, dibujarlas detrás del torso en 3D
    if (eqId.includes('wings')) {
        ctx.fillStyle = '#06B6D4';
        ctx.strokeStyle = '#CFFAFE';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-6, -42);
        ctx.lineTo(-42, -68);
        ctx.lineTo(-34, -44);
        ctx.lineTo(-44, -26);
        ctx.lineTo(-10, -28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(6, -42);
        ctx.lineTo(42, -68);
        ctx.lineTo(34, -44);
        ctx.lineTo(44, -26);
        ctx.lineTo(10, -28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // Pierna derecha (atrás) y pierna izquierda (adelante) — Pantalón negro/oscuro 3D
    drawLimb3D(9, -2, 11, 11, 24, '#334155', '#1E293B', '#0F172A');
    drawLimb3D(-5, 2, 11, 11, 24, '#334155', '#1E293B', '#0F172A');

    // Brazo derecho (atrás)
    drawLimb3D(20, -24, 10, 10, 26, '#DC2626', '#B91C1C', '#7F1D1D');

    // Torso 3D (Rojo carmesí estilo Roblox como en la referencia)
    drawLimb3D(2, -24, 22, 14, 28, '#EF4444', '#B91C1C', '#881337');

    // Brazo izquierdo (adelante)
    drawLimb3D(-14, -20, 10, 10, 26, '#EF4444', '#B91C1C', '#7F1D1D');

    // Cabeza 3D (Calabaza tallada 3D / Avatar emblemático de la referencia)
    ctx.save();
    ctx.translate(0, -64);

    // Volumen 3D de la cabeza
    const headGrad = ctx.createRadialGradient(-5, -6, 3, 0, 0, 20);
    headGrad.addColorStop(0, '#EF4444');
    headGrad.addColorStop(0.55, '#DC2626');
    headGrad.addColorStop(1, '#7F1D1D');
    ctx.fillStyle = headGrad;
    drawRoundedRect(ctx, -17, -16, 34, 30, 11);
    ctx.fill();
    ctx.strokeStyle = '#450A0A';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Tallo superior
    ctx.fillStyle = '#1E293B';
    drawRoundedRect(ctx, -3, -22, 7, 7, 2);
    ctx.fill();

    // Ojos y boca iluminados en amarillo cálido
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.moveTo(-10, -4);
    ctx.lineTo(-4, -9);
    ctx.lineTo(-2, -2);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(10, -4);
    ctx.lineTo(4, -9);
    ctx.lineTo(2, -2);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-10, 4);
    ctx.lineTo(-4, 9);
    ctx.lineTo(0, 6);
    ctx.lineTo(4, 9);
    ctx.lineTo(10, 4);
    ctx.lineTo(6, 11);
    ctx.lineTo(-6, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Renderizar Accesorio / Ítem Equipado del usuario directamente sobre el personaje 3D
    if (equippedItem) {
        if (eqId.includes('helmet')) {
            ctx.fillStyle = '#FACC15';
            ctx.beginPath();
            ctx.arc(0, -75, 19, Math.PI, 0);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#CA8A04';
            drawRoundedRect(ctx, -22, -77, 44, 6, 3);
            ctx.fill();
        } else if (eqId.includes('valkyrie') || eqId.includes('crown') || eqId.includes('fedora')) {
            ctx.fillStyle = '#FACC15';
            ctx.strokeStyle = '#FEF08A';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-16, -76);
            ctx.lineTo(-12, -92);
            ctx.lineTo(-4, -82);
            ctx.lineTo(0, -95);
            ctx.lineTo(4, -82);
            ctx.lineTo(12, -92);
            ctx.lineTo(16, -76);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (eqId.includes('halo')) {
            ctx.strokeStyle = '#FDE047';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.ellipse(0, -90, 18, 6, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (eqId.includes('sword') || eqId.includes('katana')) {
            ctx.save();
            ctx.translate(-22, -30);
            ctx.rotate(-0.55);
            ctx.fillStyle = eqId.includes('katana') ? '#F43F5E' : '#38BDF8';
            drawRoundedRect(ctx, -3, -34, 6, 34, 2);
            ctx.fill();
            ctx.fillStyle = '#FACC15';
            ctx.fillRect(-8, -2, 16, 4);
            ctx.restore();
        }
    }

    ctx.restore();
}

/**
 * Dibuja un Botón Circular 3D de Compra estilo Roblox Tycoon sobre el piso isométrico,
 * con su cartel flotante oscuro encima (ej: "DROPPER ORO / - 900 Tix").
 */
function drawIsoTycoonButtonPad(ctx, u, v, titleText, costText, buttonTheme = 'blue') {
    const palettes = {
        yellow: {
            baseTop: '#94A3B8',
            baseSide: '#475569',
            btnTop: '#FACC15',
            btnSide: '#CA8A04',
            btnRim: '#FEF08A',
            priceCol: '#FDE047'
        },
        cyan: {
            baseTop: '#94A3B8',
            baseSide: '#475569',
            btnTop: '#38BDF8',
            btnSide: '#0284C7',
            btnRim: '#BAE6FD',
            priceCol: '#7DD3FC'
        },
        royal: {
            baseTop: '#94A3B8',
            baseSide: '#475569',
            btnTop: '#3B82F6',
            btnSide: '#1D4ED8',
            btnRim: '#93C5FD',
            priceCol: '#93C5FD'
        }
    };
    const pal = palettes[buttonTheme] || palettes.cyan;

    // Anillo metálico inferior del botón
    drawIsoCylinder(ctx, u, v, 0, 34, 18, 5, {
        top: pal.baseTop,
        side: pal.baseSide,
        rim: '#CBD5E1',
        shadow: true
    });

    // Botón circular 3D presionable encima
    drawIsoCylinder(ctx, u, v, 5, 27, 14, 7, {
        top: pal.btnTop,
        side: pal.btnSide,
        rim: pal.btnRim,
        shadow: false
    });

    // Cartel flotante estilo Roblox Billboard encima del botón
    const topPt = isoPoint(u, v, 34);
    ctx.save();
    ctx.font = 'bold 11.5px KortexSans';
    const w1 = ctx.measureText(titleText).width;
    ctx.font = 'bold 11px KortexSans';
    const w2 = ctx.measureText(costText).width;
    const boxW = Math.max(92, Math.max(w1, w2) + 22);
    const boxH = 38;
    const bx = topPt.x - boxW / 2;
    const by = topPt.y - boxH;

    // Sombra suave del cartel
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    drawRoundedRect(ctx, bx, by, boxW, boxH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = 'bold 11px KortexSans';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(titleText, topPt.x, by + 15);

    ctx.font = 'bold 11px KortexSans';
    ctx.fillStyle = pal.priceCol;
    ctx.fillText(costText, topPt.x, by + 31);
    ctx.restore();
}

/**
 * Dibuja un bloque 3D de TIX sobre la cinta transportadora isométrica.
 */
function drawIsoTixBlockOnBelt(ctx, u, v, z, variant = 'green') {
    const styles = {
        green: {
            top: '#4ADE80',
            left: '#22C55E',
            right: '#15803D',
            stroke: '#BBF7D0',
            text: '#052E16'
        },
        gold: {
            top: '#FACC15',
            left: '#EAB308',
            right: '#A16207',
            stroke: '#FEF08A',
            text: '#422006'
        },
        upgraded: {
            top: '#C084FC',
            left: '#9333EA',
            right: '#6B21A8',
            stroke: '#F3E8FF',
            text: '#FFFFFF'
        }
    };
    const st = styles[variant] || styles.green;
    const du = 26;
    const dv = 26;
    const dz = 13;

    drawIsoPrism(ctx, u, v, z, du, dv, dz, {
        top: st.top,
        left: st.left,
        right: st.right,
        stroke: st.stroke,
        lineWidth: 1,
        shadow: false
    });

    const centerTop = isoPoint(u + du / 2, v + dv / 2, z + dz);
    ctx.save();
    ctx.translate(centerTop.x, centerTop.y);
    ctx.scale(1, 0.58);
    ctx.rotate(-0.42);
    ctx.font = 'bold 9.5px KortexSans';
    ctx.fillStyle = st.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TIX', 0, 0);
    ctx.restore();
}

/**
 * Renderiza el Estudio Tycoon 3D Isométrico estilo Roblox Cartoon / Low-Poly (Sin neón cibernético excesivo).
 */
async function renderTycoonSnapshot({ state, username = 'Player', avatarUrl = null, lang = 'es' }) {
    const isEn = lang === 'en';
    const { profile, equippedItem, metrics } = state;
    const unlockedSet = new Set(metrics.unlockedPads);

    const width = 960;
    const height = 550;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // =========================================================================
    // 1. TERRENO DE CÉSPED CARTOON ROBLOX COLORIDO Y SOLEADO
    // =========================================================================
    const grassGrad = ctx.createRadialGradient(width / 2, height / 2 + 30, 50, width / 2, height / 2 + 30, 560);
    grassGrad.addColorStop(0, '#5BD740');
    grassGrad.addColorStop(0.55, '#42B32B');
    grassGrad.addColorStop(1, '#2D851B');
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, 0, width, height);

    // Textura sutil de cuadrícula isométrica en el césped
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let i = -500; i <= 900; i += 60) {
        const p1 = isoPoint(i, -200, 0);
        const p2 = isoPoint(i, 700, 0);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const q1 = isoPoint(-200, i, 0);
        const q2 = isoPoint(700, i, 0);
        ctx.beginPath();
        ctx.moveTo(q1.x, q1.y);
        ctx.lineTo(q2.x, q2.y);
        ctx.stroke();
    }

    // Rocas y matas de pasto traseras (detrás de la plataforma)
    drawLowPolyRock(ctx, 275, 146, 1.05);
    drawLowPolyRock(ctx, 712, 148, 0.95);
    drawGrassTuft(ctx, 355, 118, 0.9);
    drawGrassTuft(ctx, 635, 122, 0.9);
    drawGrassTuft(ctx, 795, 178, 1.0);
    drawGrassTuft(ctx, 185, 185, 1.0);

    // Árboles Low-Poly traseros
    drawLowPolyRobloxTree(ctx, 142, 168, 1.05);
    drawLowPolyRobloxTree(ctx, 835, 162, 1.0);
    drawLowPolyRobloxTree(ctx, 42, 235, 1.25);
    drawLowPolyRobloxTree(ctx, 922, 232, 1.2);

    // =========================================================================
    // 2. PLATAFORMA BASEPLATE ISOMÉTRICA EN DIAMANTE (ESTILO ROBLOX STUDIO LIMPIO)
    // =========================================================================
    const hasWalls = unlockedSet.has('pad_walls');
    const hasDropper2 = unlockedSet.has('pad_dropper2');
    const hasLaser = unlockedSet.has('pad_laser');
    const hasServers = unlockedSet.has('pad_servers');
    const hasTower = unlockedSet.has('pad_tower');

    // Losa exterior biselada de concreto (0..380 en u y v)
    drawIsoPrism(ctx, -14, -14, -14, 408, 408, 14, {
        top: hasWalls ? '#CBD5E1' : '#D8E0EA',
        left: '#94A3B8',
        right: '#64748B',
        stroke: '#475569',
        lineWidth: 1.2,
        shadow: true
    });

    // Borde decorativo limpio estilo Roblox Studio (sin tubos de neón cibernético)
    drawIsoPrism(ctx, -4, -4, 0, 388, 388, 3, {
        top: '#F1F5F9',
        left: '#CBD5E1',
        right: '#94A3B8',
        stroke: '#94A3B8',
        lineWidth: 1
    });

    // Piso interior con baldosas claras de estudio Roblox
    const tileStep = 76;
    for (let tu = 0; tu < 380; tu += tileStep) {
        for (let tv = 0; tv < 380; tv += tileStep) {
            const isAlt = ((tu / tileStep) + (tv / tileStep)) % 2 === 0;
            const c00 = isoPoint(tu, tv, 3);
            const c10 = isoPoint(tu + tileStep, tv, 3);
            const c11 = isoPoint(tu + tileStep, tv + tileStep, 3);
            const c01 = isoPoint(tu, tv + tileStep, 3);
            fillPolygon(
                ctx,
                [c00, c10, c11, c01],
                isAlt ? '#E8EEF5' : '#DDE6F0',
                'rgba(148, 163, 184, 0.35)',
                0.8
            );
        }
    }

    // Si desbloqueó Muros del Estudio (pad_walls), construir muros low-poly limpios en los bordes traseros
    if (hasWalls) {
        drawIsoPrism(ctx, 0, 0, 3, 380, 14, 24, {
            top: '#F8FAFC',
            left: '#CBD5E1',
            right: '#94A3B8',
            stroke: '#64748B',
            lineWidth: 1
        });
        drawIsoPrism(ctx, 0, 0, 3, 14, 380, 24, {
            top: '#F8FAFC',
            left: '#CBD5E1',
            right: '#94A3B8',
            stroke: '#64748B',
            lineWidth: 1
        });
    }

    // =========================================================================
    // 3. OBJETOS DEL FONDO DEL DIAMANTE: TORRE DEV NV.6, ARCO Y DROPPER ORO
    // =========================================================================

    // 3A. TORRE DEV NV.6 (Esquina superior del diamante: u=58, v=58)
    if (hasTower) {
        drawIsoPrism(ctx, 28, 28, 3, 86, 86, 52, {
            top: '#F59E0B',
            left: '#D97706',
            right: '#B45309',
            stroke: '#78350F',
            lineWidth: 1.2,
            shadow: true
        });
        drawIsoPrism(ctx, 42, 42, 55, 58, 58, 36, {
            top: '#FEF08A',
            left: '#FACC15',
            right: '#CA8A04',
            stroke: '#854D0E',
            lineWidth: 1
        });
        const towerTop = isoPoint(71, 71, 104);
        drawVectorIcon(ctx, 'crown', towerTop.x, towerTop.y - 6, 18, '#FDE047');
    } else {
        drawIsoTycoonButtonPad(
            ctx,
            58,
            58,
            isEn ? 'DEV TOWER LV.6' : 'TORRE DEV NV.6',
            '- 11,000 Tix',
            metrics.nextPad?.id === 'pad_tower' ? 'yellow' : 'royal'
        );
    }

    // 3B. ARCO UPGRADER (Centro-arriba: u=58, v=146)
    if (!hasLaser) {
        drawIsoTycoonButtonPad(
            ctx,
            58,
            146,
            isEn ? 'LASER ARCH' : 'ARCO LÁSER',
            '- 2,200 Tix',
            metrics.nextPad?.id === 'pad_laser' ? 'yellow' : 'cyan'
        );
    }

    // 3C. DROPPER DE ORO (Izquierda-centro: u=78, v=232, separado de Dropper 1)
    if (hasDropper2) {
        drawIsoPrism(ctx, 42, 198, 3, 66, 66, 56, {
            top: '#FACC15',
            left: '#EAB308',
            right: '#CA8A04',
            stroke: '#854D0E',
            lineWidth: 1.2,
            shadow: true
        });
        drawIsoCylinder(ctx, 75, 231, 59, 14, 8, 18, {
            top: '#FEF08A',
            side: '#A16207',
            rim: '#FDE047',
            shadow: false
        });
    } else {
        drawIsoTycoonButtonPad(
            ctx,
            78,
            232,
            isEn ? 'GOLD DROPPER' : 'DROPPER ORO',
            '- 900 Tix',
            (metrics.nextPad?.id === 'pad_dropper2' || metrics.nextPad?.id === 'pad_walls') ? 'yellow' : 'cyan'
        );
    }

    // 3D. SERVIDORES ROBLOX (Centro del piso: u=178, v=236)
    if (hasServers) {
        drawIsoPrism(ctx, 142, 202, 3, 68, 68, 48, {
            top: '#34D399',
            left: '#10B981',
            right: '#047857',
            stroke: '#064E3B',
            lineWidth: 1.2,
            shadow: true
        });
    } else {
        drawIsoTycoonButtonPad(
            ctx,
            178,
            236,
            isEn ? 'SERVERS' : 'SERVIDORES',
            '- 5,000 Tix',
            metrics.nextPad?.id === 'pad_servers' ? 'yellow' : 'cyan'
        );
    }

    // =========================================================================
    // 4. PERSONAJE 3D DEL JUGADOR EN EL ESTUDIO (CARGA 3D REAL + ASSETS)
    // =========================================================================
    const playerPos = isoPoint(225, 145, 3);
    const avatar3DData = await resolvePlayer3DAvatarData({
        avatarUrl,
        username,
        robloxUserId: profile.roblox_user_id || null
    });

    if (avatar3DData && avatar3DData.img) {
        const { img, bounds } = avatar3DData;
        const targetH = 112;
        const scale = targetH / Math.max(40, bounds.bh);
        const targetW = Math.min(110, bounds.bw * scale);

        // Sombra realista bajo los pies del avatar 3D
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
        ctx.beginPath();
        ctx.ellipse(playerPos.x, playerPos.y + 4, 28, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.filter = 'drop-shadow(0px 6px 6px rgba(0, 0, 0, 0.35))';
        ctx.drawImage(
            img,
            bounds.minX,
            bounds.minY,
            bounds.bw,
            bounds.bh,
            playerPos.x - targetW / 2,
            playerPos.y - targetH + 8,
            targetW,
            targetH
        );
        ctx.restore();
    } else {
        drawIsometric3DRobloxCharacter(ctx, playerPos.x, playerPos.y, equippedItem, 1.02);
    }

    // Etiqueta flotante del nombre del jugador (@username) + ítem equipado
    ctx.save();
    const cleanUser = `@${String(username || 'Player').slice(0, 18)}`;
    ctx.font = 'bold 13px KortexSans';
    const userTagW = Math.max(114, ctx.measureText(cleanUser).width + 26);
    const tagX = playerPos.x - userTagW / 2;
    const tagY = playerPos.y - 122;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    drawRoundedRect(ctx, tagX, tagY, userTagW, 28, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(cleanUser, playerPos.x, tagY + 19);

    if (equippedItem) {
        const rawEq = isEn ? (equippedItem.name_en || equippedItem.name) : equippedItem.name;
        const eqLabel = `${formatCleanCardItemName(rawEq, 18)} (+${equippedItem.boost_pct}%)`;
        ctx.font = 'bold 10.5px KortexSans';
        const eqW = Math.max(122, ctx.measureText(eqLabel).width + 22);
        ctx.fillStyle = 'rgba(88, 28, 135, 0.92)';
        drawRoundedRect(ctx, playerPos.x - eqW / 2, tagY - 26, eqW, 22, 6);
        ctx.fill();
        ctx.strokeStyle = '#D8B4FE';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = '#FAF5FF';
        ctx.fillText(eqLabel, playerPos.x, tagY - 11);
    }
    ctx.restore();

    // =========================================================================
    // 5. CINTA TRANSPORTADORA 3D EN FORMA DE "L" Y BLOQUES 3D DE TIX
    // =========================================================================
    // Soportes metálicos bajo la cinta
    const pillarCoords = [
        [95, 345],
        [205, 345],
        [335, 345],
        [345, 235],
        [345, 135]
    ];
    for (const [pu, pv] of pillarCoords) {
        drawIsoPrism(ctx, pu, pv, 3, 18, 18, 14, {
            top: '#64748B',
            left: '#475569',
            right: '#334155'
        });
    }

    // Tramo 1 de la Cinta (Corre de Izquierda a Abajo: u = 55..372, v = 324..372)
    drawIsoPrism(ctx, 52, 322, 16, 322, 52, 9, {
        top: '#94A3B8',
        left: '#64748B',
        right: '#475569',
        stroke: '#334155',
        lineWidth: 1,
        shadow: true
    });
    // Superficie negra rodante del Tramo 1
    drawIsoPrism(ctx, 56, 328, 25, 312, 40, 2, {
        top: '#1E293B',
        left: '#0F172A',
        right: '#0F172A'
    });

    // Tramo 2 de la Cinta (Gira 90° de Abajo hacia la Bóveda Derecha: u = 322..374, v = 90..328)
    drawIsoPrism(ctx, 322, 88, 16, 52, 240, 9, {
        top: '#94A3B8',
        left: '#64748B',
        right: '#475569',
        stroke: '#334155',
        lineWidth: 1,
        shadow: true
    });
    // Superficie negra rodante del Tramo 2
    drawIsoPrism(ctx, 328, 92, 25, 40, 240, 2, {
        top: '#1E293B',
        left: '#0F172A',
        right: '#0F172A'
    });

    // Bloques 3D de TIX viajando por el Tramo 1 y el Tramo 2
    const leg1Blocks = [
        { u: 72, v: 334, type: 'green' },
        { u: 118, v: 334, type: 'green' },
        { u: 168, v: 334, type: 'gold' },
        { u: 218, v: 334, type: 'gold' },
        { u: 268, v: 334, type: hasLaser ? 'upgraded' : 'green' },
        { u: 318, v: 334, type: hasLaser ? 'upgraded' : 'green' }
    ];
    for (const b of leg1Blocks) {
        drawIsoTixBlockOnBelt(ctx, b.u, b.v, 27, b.type);
    }

    const leg2Blocks = [
        { u: 335, v: 278, type: 'green' },
        { u: 335, v: 228, type: 'gold' },
        { u: 335, v: 178, type: hasLaser ? 'upgraded' : 'gold' },
        { u: 335, v: 132, type: 'green' },
        { u: 335, v: 94, type: 'gold' }
    ];
    for (const b of leg2Blocks) {
        drawIsoTixBlockOnBelt(ctx, b.u, b.v, 27, b.type);
    }

    // Si desbloqueó el Arco Upgrader (pad_laser), dibujarlo cruzando sobre la cinta transportadora
    if (hasLaser) {
        drawIsoPrism(ctx, 248, 314, 25, 22, 66, 46, {
            top: '#A855F7',
            left: '#7E22CE',
            right: '#581C87',
            stroke: '#E9D5FF',
            lineWidth: 1.2
        });
    }

    // =========================================================================
    // 6. MÁQUINA PRINCIPAL IZQUIERDA: DROPPER 1 (+15 Tix/min) CON CHIMENEA 3D
    // =========================================================================
    // Base azul escalonada del Dropper 1 (esquina izquierda: u = -8..82, v = 296..382)
    drawIsoPrism(ctx, -6, 294, 3, 92, 88, 18, {
        top: '#3B82F6',
        left: '#2563EB',
        right: '#1D4ED8',
        stroke: '#1E3A8A',
        lineWidth: 1.2,
        shadow: true
    });

    // Torre principal del Dropper 1
    drawIsoPrism(ctx, 2, 302, 21, 76, 72, 74, {
        top: '#60A5FA',
        left: '#1D4ED8',
        right: '#1E3A8A',
        stroke: '#172554',
        lineWidth: 1.2
    });

    // Tapa superior metálica clara y Chimenea cilíndrica 3D
    drawIsoPrism(ctx, 6, 306, 95, 68, 64, 8, {
        top: '#CBD5E1',
        left: '#94A3B8',
        right: '#64748B'
    });
    drawIsoCylinder(ctx, 40, 338, 103, 15, 9, 32, {
        top: '#334155',
        side: '#64748B',
        rim: '#CBD5E1',
        shadow: false
    });

    // Cajas colectoras frontales gemelas en la cara izquierda del Dropper
    drawIsoPrism(ctx, 10, 368, 21, 22, 16, 24, {
        top: '#475569',
        left: '#1E293B',
        right: '#0F172A'
    });
    drawIsoPrism(ctx, 42, 368, 21, 22, 16, 24, {
        top: '#475569',
        left: '#1E293B',
        right: '#0F172A'
    });

    // Semáforo de 3 luces (Rojo, Amarillo, Verde) sobre la salida del Dropper
    const lightRed = isoPoint(79, 352, 78);
    const lightYel = isoPoint(79, 338, 78);
    const lightGrn = isoPoint(79, 324, 78);
    for (const [pt, col] of [[lightRed, '#EF4444'], [lightYel, '#FACC15'], [lightGrn, '#22C55E']]) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Texto en perspectiva centrado en la fachada frontal izquierda del Dropper 1 (u=40, v=374)
    const dropperLabelPt = isoPoint(40, 374, 73);
    ctx.save();
    ctx.translate(dropperLabelPt.x, dropperLabelPt.y);
    ctx.transform(1, 0.5, 0, 1, 0, 0);
    ctx.font = 'bold 11px KortexSans';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText('DROPPER 1', 0, 0);
    ctx.font = 'bold 9.5px KortexSans';
    ctx.fillStyle = '#BAE6FD';
    ctx.fillText('+15 Tix/min', 0, 12);
    ctx.restore();

    // =========================================================================
    // 7. BÓVEDA COLECTORA 3D (ESQUINA DERECHA DEL DIAMANTE)
    // =========================================================================
    const collectorTix = Number(profile.collector_tix || 0);
    const collectorCap = Number(profile.collector_cap || 500);
    const isFull = collectorTix >= collectorCap;

    // Estructura 3D de la Bóveda Colectora (u = 296..384, v = 6..94)
    drawIsoPrism(ctx, 296, 8, 3, 88, 88, 78, {
        top: '#475569',
        left: '#334155',
        right: '#1E293B',
        stroke: '#0F172A',
        lineWidth: 1.4,
        shadow: true
    });

    // Domo luminoso verde esmeralda en el techo de la bóveda
    drawIsoPrism(ctx, 308, 20, 81, 64, 64, 10, {
        top: '#86EFAC',
        left: '#4ADE80',
        right: '#22C55E',
        stroke: '#BBF7D0',
        lineWidth: 1.2
    });

    // Paneles laterales verdes de energía en las dos caras visibles de la bóveda
    const panelRight = [
        isoPoint(384, 20, 66),
        isoPoint(384, 82, 66),
        isoPoint(384, 82, 18),
        isoPoint(384, 20, 18)
    ];
    fillPolygon(ctx, panelRight, '#4ADE80', '#BBF7D0', 1.2);

    const panelLeft = [
        isoPoint(308, 96, 66),
        isoPoint(368, 96, 66),
        isoPoint(368, 96, 28),
        isoPoint(308, 96, 28)
    ];
    fillPolygon(ctx, panelLeft, '#22C55E', '#86EFAC', 1.2);

    // Árboles y rocas del primer plano (abajo a la izquierda y abajo a la derecha)
    drawLowPolyRock(ctx, 146, 442, 1.15);
    drawGrassTuft(ctx, 96, 355, 1.0);
    drawGrassTuft(ctx, 212, 466, 1.05);
    drawGrassTuft(ctx, 646, 488, 1.05);
    drawGrassTuft(ctx, 845, 355, 1.0);
    drawLowPolyRobloxTree(ctx, 28, 438, 1.35);
    drawLowPolyRobloxTree(ctx, 934, 425, 1.35);

    // Banner flotante de estado de la Bóveda Colectora (abajo a la derecha, igual a la referencia)
    ctx.save();
    const badgeX = 668;
    const badgeY = 398;
    const badgeW = 248;
    const badgeH = 44;

    ctx.fillStyle = 'rgba(20, 83, 45, 0.92)';
    drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 11);
    ctx.fill();
    ctx.strokeStyle = isFull ? '#FACC15' : '#4ADE80';
    ctx.lineWidth = 2;
    ctx.stroke();

    drawVectorIcon(ctx, 'check', badgeX + 22, badgeY + badgeH / 2, 13, '#4ADE80');
    ctx.textAlign = 'center';
    ctx.font = 'bold 12.5px KortexSans';
    ctx.fillStyle = '#FFFFFF';
    const vaultBannerText = isFull
        ? (isEn ? 'VAULT FULL - COLLECT!' : '¡BÓVEDA LLENA - RECOLECTÁ!')
        : (isEn
            ? `VAULT: ${collectorTix.toLocaleString()} / ${collectorCap.toLocaleString()} TIX`
            : `BÓVEDA: ${collectorTix.toLocaleString()} / ${collectorCap.toLocaleString()} TIX`);
    ctx.fillText(vaultBannerText, badgeX + badgeW / 2 + 10, badgeY + 27);
    ctx.restore();

    return canvas.toBuffer('image/png');
}

/**
 * Dibuja una ilustración vectorial personalizada para cada ítem del catálogo en tarjetas visuales.
 */
function drawItemIllustration(ctx, itemId, category, cx, cy, size = 44, accentColor = '#38BDF8') {
    ctx.save();
    ctx.translate(cx, cy);
    const id = String(itemId || '').toLowerCase();
    const r = size / 2;

    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, r * 1.15);
    glow.addColorStop(0, `${accentColor}44`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
    ctx.fill();

    if (id.includes('cola')) {
        ctx.fillStyle = '#D97706';
        drawRoundedRect(ctx, -13, -18, 26, 36, 6);
        ctx.fill();
        ctx.strokeStyle = '#FDE047';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#FEF08A';
        ctx.fillRect(-12, -5, 24, 10);
        ctx.fillStyle = '#92400E';
        ctx.font = 'bold 8px KortexSans';
        ctx.textAlign = 'center';
        ctx.fillText('COLA', 0, 3);
    } else if (id.includes('helmet')) {
        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.arc(0, 4, 18, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#FEF08A';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#CA8A04';
        drawRoundedRect(ctx, -22, 2, 44, 7, 3);
        ctx.fill();
        ctx.fillStyle = '#1E293B';
        ctx.font = 'bold 9px KortexSans';
        ctx.textAlign = 'center';
        ctx.fillText('BC', 0, -2);
    } else if (id.includes('hair') || id.includes('shaggy')) {
        ctx.fillStyle = '#92400E';
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(-18, 12);
        ctx.lineTo(-20, -6);
        ctx.lineTo(-8, -18);
        ctx.lineTo(8, -18);
        ctx.lineTo(20, -6);
        ctx.lineTo(18, 12);
        ctx.lineTo(8, 4);
        ctx.lineTo(0, 14);
        ctx.lineTo(-8, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else if (id.includes('boombox')) {
        ctx.fillStyle = '#EAB308';
        drawRoundedRect(ctx, -22, -10, 44, 26, 5);
        ctx.fill();
        ctx.strokeStyle = '#FEF08A';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = '#FDE047';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-12, -10);
        ctx.lineTo(-12, -17);
        ctx.lineTo(12, -17);
        ctx.lineTo(12, -10);
        ctx.stroke();
        ctx.fillStyle = '#1E293B';
        ctx.beginPath();
        ctx.arc(-11, 3, 7, 0, Math.PI * 2);
        ctx.arc(11, 3, 7, 0, Math.PI * 2);
        ctx.fill();
    } else if (id.includes('sword')) {
        ctx.save();
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#E2E8F0';
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, -26);
        ctx.lineTo(5, -14);
        ctx.lineTo(4, 6);
        ctx.lineTo(-4, 6);
        ctx.lineTo(-5, -14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#38BDF8';
        drawRoundedRect(ctx, -11, 5, 22, 4, 2);
        ctx.fill();
        ctx.fillStyle = '#475569';
        ctx.fillRect(-3, 9, 6, 11);
        ctx.restore();
    } else if (id.includes('katana')) {
        ctx.save();
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = '#F43F5E';
        ctx.strokeStyle = '#FECDD3';
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, -3, -24, 6, 32, 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#FACC15';
        ctx.fillRect(-9, 6, 18, 4);
        ctx.fillStyle = '#881337';
        ctx.fillRect(-3, 10, 6, 12);
        ctx.restore();
    } else if (id.includes('wings')) {
        ctx.fillStyle = '#06B6D4';
        ctx.strokeStyle = '#A5F3FC';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-3, 4);
        ctx.lineTo(-22, -14);
        ctx.lineTo(-18, 2);
        ctx.lineTo(-24, 12);
        ctx.lineTo(-6, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(3, 4);
        ctx.lineTo(22, -14);
        ctx.lineTo(18, 2);
        ctx.lineTo(24, 12);
        ctx.lineTo(6, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else if (id.includes('halo')) {
        ctx.strokeStyle = '#FDE047';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2);
        ctx.stroke();
    } else if (id.includes('valkyrie')) {
        ctx.fillStyle = '#FACC15';
        ctx.strokeStyle = '#FEF08A';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 4, 13, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.moveTo(-12, 0);
        ctx.lineTo(-26, -15);
        ctx.lineTo(-20, 5);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(26, -15);
        ctx.lineTo(20, 5);
        ctx.closePath();
        ctx.fill();
    } else if (id.includes('fedora') || id.includes('sparkle')) {
        ctx.fillStyle = '#A855F7';
        ctx.strokeStyle = '#FDE047';
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, -24, 4, 48, 7, 3);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-15, 4);
        ctx.lineTo(-11, -14);
        ctx.lineTo(0, -11);
        ctx.lineTo(11, -14);
        ctx.lineTo(15, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#FACC15';
        ctx.fillRect(-14, 0, 28, 4);
    } else if (id.includes('clockwork') || id.includes('shades')) {
        ctx.fillStyle = '#F59E0B';
        drawRoundedRect(ctx, -24, -8, 48, 5, 2);
        ctx.fill();
        ctx.fillStyle = '#0F172A';
        ctx.strokeStyle = '#FDE047';
        ctx.lineWidth = 2.2;
        drawRoundedRect(ctx, -21, -6, 18, 14, 3);
        ctx.fill();
        ctx.stroke();
        drawRoundedRect(ctx, 3, -6, 18, 14, 3);
        ctx.fill();
        ctx.stroke();
    } else if (id.includes('dominus')) {
        ctx.fillStyle = '#991B1B';
        ctx.strokeStyle = '#F43F5E';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(19, -4);
        ctx.lineTo(15, 16);
        ctx.lineTo(-15, 16);
        ctx.lineTo(-19, -4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#090D16';
        ctx.beginPath();
        ctx.arc(0, 1, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FDE047';
        ctx.fillRect(-6, -2, 4, 3);
        ctx.fillRect(2, -2, 4, 3);
    } else if (id === 'ascension_chest') {
        ctx.fillStyle = '#78350F';
        drawRoundedRect(ctx, -24, -6, 48, 26, 5);
        ctx.fill();
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#92400E';
        drawRoundedRect(ctx, -26, -18, 52, 16, 6);
        ctx.fill();
        ctx.strokeStyle = '#FBBF24';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#FDE047';
        drawRoundedRect(ctx, -6, -8, 12, 14, 3);
        ctx.fill();
    } else if (id === 'p2p_trade_card') {
        drawVectorIcon(ctx, 'crystal', -10, -2, size * 0.65, '#38BDF8');
        drawVectorIcon(ctx, 'crown', 10, 4, size * 0.65, '#FACC15');
    } else if (category === 'LIMITED' || category === 'LIMITED_U') {
        drawVectorIcon(ctx, 'crown', 0, -2, size * 0.9, accentColor || '#FACC15');
        drawVectorIcon(ctx, 'crystal', 0, 4, size * 0.42, '#38BDF8');
    } else {
        drawVectorIcon(ctx, 'crystal', 0, 0, size * 0.85, accentColor || '#A855F7');
    }

    ctx.restore();
}

/**
 * Renderiza la Vitrina Gráfica de Tarjetas para la Categoría 2 (Perfil del Usuario, Inventario y Objetos UGC).
 */
async function renderTycoonShopShowcase({ state, lang = 'es' }) {
    const isEn = lang === 'en';
    const { profile, inventory, catalogMap } = state;
    const width = 960;
    const height = 550;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0F172A');
    bgGrad.addColorStop(0.5, '#1E293B');
    bgGrad.addColorStop(1, '#0F172A');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    draw3DBox(ctx, 20, 14, width - 40, 74, 4, '#1E293B', '#0F172A', '#38BDF8', 12);

    ctx.font = 'bold 11px KortexSans';
    ctx.fillStyle = '#38BDF8';
    ctx.textAlign = 'left';
    ctx.fillText(
        isEn ? 'CATEGORY 2 • PLAYER PROFILE, INVENTORY & UGC ITEMS' : 'CATEGORÍA 2 • PERFIL DEL USUARIO, INVENTARIO Y OBJETOS UGC',
        40,
        36
    );

    ctx.font = 'bold 19px KortexSans';
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(
        isEn
            ? `Studio Level ${profile.studio_stage || 1}/6  •  Rebirth x${profile.rebirth_count || 0}  •  Owned Items: ${inventory.length}`
            : `Nivel de Estudio ${profile.studio_stage || 1}/6  •  Rebirth x${profile.rebirth_count || 0}  •  Ítems en tu Inventario: ${inventory.length}`,
        40,
        66
    );

    const allCatalog = [...catalogMap.values()];
    const displayCards = [];
    const seenCardIds = new Set();

    for (const inv of inventory) {
        if (inv.catalog && !seenCardIds.has(String(inv.item_id)) && displayCards.length < 8) {
            seenCardIds.add(String(inv.item_id));
            displayCards.push(inv.catalog);
        }
    }

    const ugcItems = allCatalog.filter(it => it.category === 'UGC');
    for (const u of ugcItems) {
        if (!seenCardIds.has(String(u.item_id)) && displayCards.length < 8) {
            seenCardIds.add(String(u.item_id));
            displayCards.push(u);
        }
    }

    while (displayCards.length < 8) {
        displayCards.push({
            item_id: 'ugc_creator_slot',
            category: 'UGC',
            name: 'Ranura de Objeto UGC',
            name_en: 'Custom UGC Item Slot',
            boost_pct: 10,
            base_price: 0
        });
    }

    const ownedIds = new Set(inventory.map(i => String(i.item_id)));
    const cardW = 216;
    const cardH = 194;
    const startX = 20;
    const startY = 108;
    const gapX = 18;
    const gapY = 20;

    displayCards.slice(0, 8).forEach((item, idx) => {
        const col = idx % 4;
        const row = Math.floor(idx / 4);
        const x = startX + col * (cardW + gapX);
        const y = startY + row * (cardH + gapY);

        const isCrystal = item.currency_type === 'CRYSTAL' || String(item.item_id).startsWith('crys_');
        const isLimited = item.category === 'LIMITED' || item.category === 'LIMITED_U';
        const isUgc = item.category === 'UGC';
        const isOwned = ownedIds.has(String(item.item_id));

        const borderColor = isOwned
            ? '#22C55E'
            : (isLimited ? '#FACC15' : (isCrystal ? '#EC4899' : (isUgc ? '#A855F7' : '#38BDF8')));
        const topBg = isOwned
            ? '#064E3B'
            : (isLimited ? '#271202' : (isCrystal ? '#2E1065' : (isUgc ? '#1E1B4B' : '#131C31')));
        const frontBg = '#090D16';

        draw3DBox(ctx, x, y, cardW, cardH, 6, topBg, frontBg, borderColor, 12);

        const tierLabel = isLimited
            ? (isEn ? 'LIMITED ITEM' : 'ÍTEM LIMITED')
            : (isCrystal
                ? (isEn ? 'CRYSTAL ARTIFACT' : 'ARTEFACTO CRISTAL')
                : (isUgc ? (isEn ? 'UGC OBJECT' : 'OBJETO UGC') : (isEn ? 'PROFILE ITEM' : 'ÍTEM DE PERFIL')));
        ctx.font = 'bold 10px KortexSans';
        ctx.fillStyle = isLimited ? '#FDE047' : (isCrystal ? '#F472B6' : (isUgc ? '#C084FC' : '#7DD3FC'));
        ctx.textAlign = 'center';
        ctx.fillText(tierLabel, x + cardW / 2, y + 22);

        drawItemIllustration(ctx, item.item_id, item.category, x + cardW / 2, y + 66, 48, borderColor);

        const cleanName = formatCleanCardItemName(isEn ? (item.name_en || item.name) : item.name, 22);
        ctx.font = 'bold 13px KortexSans';
        ctx.fillStyle = '#F8FAFC';
        ctx.fillText(cleanName, x + cardW / 2, y + 114);

        ctx.fillStyle = 'rgba(34, 197, 94, 0.18)';
        drawRoundedRect(ctx, x + 38, y + 124, cardW - 76, 24, 7);
        ctx.fill();
        ctx.strokeStyle = '#4ADE80';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = 'bold 12px KortexSans';
        ctx.fillStyle = '#4ADE80';
        ctx.fillText(`+${item.boost_pct}% Tix/min`, x + cardW / 2, y + 140);

        let footerBadgeText = '';
        let footerColor = '#4ADE80';
        if (isOwned) {
            footerBadgeText = isEn ? 'IN YOUR INVENTORY' : 'EN TU INVENTARIO';
            footerColor = '#4ADE80';
        } else if (item.item_id === 'ugc_creator_slot') {
            footerBadgeText = isEn ? 'UGC WORKSHOP SLOT' : 'TALLER DE OBJETOS UGC';
            footerColor = '#C084FC';
        } else {
            footerBadgeText = isEn ? 'COMMUNITY UGC' : 'UGC DE COMUNIDAD';
            footerColor = '#38BDF8';
        }

        ctx.font = 'bold 12px KortexSans';
        ctx.fillStyle = footerColor;
        ctx.fillText(footerBadgeText, x + cardW / 2, y + 174);
    });

    return canvas.toBuffer('image/png');
}

/**
 * Renderiza la Vitrina Gráfica de Tienda Unificada, Cofres de Ascensión e Intercambios (Categoría 3).
 */
async function renderTycoonVaultShowcase({ state, tradesCount = 0, lang = 'es' }) {
    const isEn = lang === 'en';
    const { profile, inventory, catalogMap } = state;
    const width = 960;
    const height = 550;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0F172A');
    bgGrad.addColorStop(0.55, '#1E1B4B');
    bgGrad.addColorStop(1, '#0F172A');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    draw3DBox(ctx, 20, 14, width - 40, 72, 4, '#1E293B', '#0F172A', '#F59E0B', 12);
    ctx.font = 'bold 11px KortexSans';
    ctx.fillStyle = '#FBBF24';
    ctx.textAlign = 'left';
    ctx.fillText(
        isEn ? 'CATEGORY 3 • UNIFIED SHOP, ASCENSION CHESTS & P2P TRADING' : 'CATEGORÍA 3 • TIENDA UNIFICADA, COFRES DE ASCENSIÓN E INTERCAMBIOS',
        40,
        36
    );

    ctx.font = 'bold 19px KortexSans';
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(
        isEn
            ? `Classic Shop, Limiteds & Crystal Artifacts  •  Ascension Chests  •  Active Trades: ${tradesCount}`
            : `Tienda de Ítems, Limiteds y Artefactos  •  Cofres de Ascensión  •  Ofertas P2P: ${tradesCount}`,
        40,
        64
    );

    const keys = Number(profile.ascension_tokens || 0);

    const chestX = 20;
    const chestY = 104;
    const chestW = 286;
    const chestH = 420;
    draw3DBox(ctx, chestX, chestY, chestW, chestH, 8, '#271202', '#120801', '#F59E0B', 14);

    ctx.font = 'bold 14px KortexSans';
    ctx.fillStyle = '#FDE047';
    ctx.textAlign = 'center';
    ctx.fillText(
        isEn ? 'ASCENSION CHEST' : 'COFRE DE ASCENSIÓN',
        chestX + chestW / 2,
        chestY + 34
    );

    drawItemIllustration(ctx, 'ascension_chest', 'LIMITED', chestX + chestW / 2, chestY + 118, 86, '#FACC15');

    ctx.font = 'bold 13px KortexSans';
    ctx.fillStyle = '#FEF08A';
    ctx.fillText(
        isEn ? 'Guaranteed Limited Item!' : '¡Otorga 1 Ítem Limited Garantizado!',
        chestX + chestW / 2,
        chestY + 194
    );

    const odds = isEn
        ? [
            '• Classic Limited (+16% to +20%)',
            '• Epic Valkyrie / Crown (+24%)',
            '• Mythic Dominus (+30% Tix/min)',
            '• Duplicate protection (+1,200 Tix)'
        ]
        : [
            '• Limited Clásico (+16% a +20%)',
            '• Valkyrie / Corona Épica (+24%)',
            '• Dominus Mítico (+30% Tix/min)',
            '• Duplicados dan +1,200 Tix bono'
        ];

    ctx.font = '12px KortexSans';
    ctx.fillStyle = '#E2E8F0';
    ctx.textAlign = 'left';
    odds.forEach((line, idx) => {
        ctx.fillText(line, chestX + 22, chestY + 234 + idx * 26);
    });

    ctx.fillStyle = 'rgba(34, 197, 94, 0.22)';
    drawRoundedRect(ctx, chestX + 22, chestY + 352, chestW - 44, 44, 10);
    ctx.fill();
    ctx.strokeStyle = '#4ADE80';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.font = 'bold 13px KortexSans';
    ctx.fillStyle = '#4ADE80';
    ctx.textAlign = 'center';
    ctx.fillText(
        keys > 0
            ? (isEn ? 'COST: 1 ASCENSION KEY' : 'COSTO: 1 LLAVE DE REBIRTH')
            : (isEn ? 'COST: 3,500 TIX' : 'COSTO: 3,500 TIX'),
        chestX + chestW / 2,
        chestY + 379
    );

    const allCatalog = [...catalogMap.values()];
    const normalTix = allCatalog.filter(it => it.category === 'NORMAL' && it.currency_type !== 'CRYSTAL' && Number(it.base_price) > 0);
    const crystalItems = allCatalog.filter(it => it.category === 'NORMAL' && it.currency_type === 'CRYSTAL');
    const limitedUDrops = allCatalog.filter(it => it.category === 'LIMITED_U');
    const chestLimiteds = allCatalog.filter(it => it.category === 'LIMITED');

    const storeShowcase = [
        ...normalTix.slice(0, 2),
        ...limitedUDrops.slice(0, 2),
        ...crystalItems.slice(0, 1),
        ...chestLimiteds.slice(0, 1)
    ];
    while (storeShowcase.length < 6) {
        storeShowcase.push({
            item_id: 'p2p_trade_card',
            category: 'P2P_BOARD',
            name: 'Tablero de Intercambio P2P',
            name_en: 'P2P Direct Trade Board',
            boost_pct: 0
        });
    }

    const ownedByItemId = new Map();
    for (const inv of inventory) {
        ownedByItemId.set(String(inv.item_id), inv);
    }

    const gridStartX = 324;
    const gridStartY = 104;
    const gCardW = 194;
    const gCardH = 200;
    const gGapX = 16;
    const gGapY = 20;

    storeShowcase.slice(0, 6).forEach((item, idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const x = gridStartX + col * (gCardW + gGapX);
        const y = gridStartY + row * (gCardH + gGapY);

        const isP2P = item.category === 'P2P_BOARD';
        const isLimU = item.category === 'LIMITED_U';
        const isChestLim = item.category === 'LIMITED';
        const isCrystal = item.currency_type === 'CRYSTAL' || String(item.item_id).startsWith('crys_');
        const ownedInst = ownedByItemId.get(String(item.item_id));
        const isOwned = Boolean(ownedInst);

        const borderCol = isOwned
            ? '#22C55E'
            : (isP2P ? '#38BDF8' : (isLimU ? '#F43F5E' : (isCrystal ? '#EC4899' : (isChestLim ? '#FACC15' : '#38BDF8'))));
        const topCol = isOwned
            ? '#064E3B'
            : (isP2P ? '#0F172A' : (isLimU ? '#3B0764' : (isCrystal ? '#2E1065' : (isChestLim ? '#1E1B4B' : '#131C31'))));

        draw3DBox(ctx, x, y, gCardW, gCardH, 6, topCol, '#090D16', borderCol, 12);

        ctx.font = 'bold 10px KortexSans';
        ctx.fillStyle = isP2P
            ? '#7DD3FC'
            : (isLimU ? '#FDA4AF' : (isCrystal ? '#F472B6' : (isChestLim ? '#FDE047' : '#7DD3FC')));
        ctx.textAlign = 'center';
        ctx.fillText(
            isP2P
                ? (isEn ? 'P2P MARKETPLACE' : 'COMERCIO ENTRE JUGADORES')
                : (isLimU
                    ? `LIMITED U (#${item.minted_count || 0}/${item.max_supply || 15})`
                    : (isCrystal
                        ? (isEn ? 'CRYSTAL SHOP' : 'TIENDA CRISTALES')
                        : (isChestLim
                            ? (isEn ? 'CHEST LIMITED' : 'COFRE LIMITED')
                            : (isEn ? 'CLASSIC SHOP' : 'TIENDA TIX')))),
            x + gCardW / 2,
            y + 22
        );

        drawItemIllustration(ctx, item.item_id, item.category, x + gCardW / 2, y + 68, 46, borderCol);

        const cleanName = formatCleanCardItemName(isEn ? (item.name_en || item.name) : item.name, 20);
        ctx.font = 'bold 12px KortexSans';
        ctx.fillStyle = '#F8FAFC';
        ctx.fillText(cleanName, x + gCardW / 2, y + 116);

        ctx.fillStyle = isP2P ? 'rgba(56, 189, 248, 0.18)' : 'rgba(34, 197, 94, 0.18)';
        drawRoundedRect(ctx, x + 24, y + 126, gCardW - 48, 24, 7);
        ctx.fill();
        ctx.font = 'bold 11.5px KortexSans';
        ctx.fillStyle = isP2P ? '#7DD3FC' : '#4ADE80';
        ctx.fillText(
            isP2P
                ? (isEn ? `${tradesCount} Active Offer(s)` : `${tradesCount} Oferta(s) Activa(s)`)
                : `+${item.boost_pct}% Tix/min`,
            x + gCardW / 2,
            y + 142
        );

        let statusLine = '';
        let statusCol = '#CBD5E1';
        if (isP2P) {
            statusLine = isEn ? 'Trade Limiteds & Tix' : 'Intercambiá Limiteds y Tix';
            statusCol = '#38BDF8';
        } else if (isOwned) {
            const serialStr = ownedInst.serial_number ? ` #${String(ownedInst.serial_number).padStart(2, '0')}` : '';
            statusLine = isEn ? `OWNED${serialStr}` : `ADQUIRIDO${serialStr}`;
            statusCol = '#4ADE80';
        } else if (isLimU) {
            const rem = Math.max(0, Number(item.max_supply || 15) - Number(item.minted_count || 0));
            statusLine = rem > 0 ? `${Number(item.base_price).toLocaleString()} Tix (${rem} disp.)` : 'AGOTADO';
            statusCol = rem > 0 ? '#FDA4AF' : '#EF4444';
        } else if (isCrystal) {
            statusLine = `${Number(item.base_price).toLocaleString()} ${isEn ? 'Crystals' : 'Cristales'}`;
            statusCol = '#F472B6';
        } else if (isChestLim) {
            statusLine = isEn ? 'Drop in Ascension Chest' : 'Sale en Cofre Ascensión';
            statusCol = '#FDE047';
        } else {
            statusLine = `${Number(item.base_price).toLocaleString()} Tix`;
            statusCol = '#FDE047';
        }

        ctx.font = 'bold 11px KortexSans';
        ctx.fillStyle = statusCol;
        ctx.fillText(statusLine, x + gCardW / 2, y + 178);
    });

    return canvas.toBuffer('image/png');
}

/**
 * Renderiza el Tablero Visual de Misiones Semanales, Pociones y Ranking (Categoría 4).
 */
async function renderTycoonQuestsShowcase({ state, leaderboard = [], lang = 'es' }) {
    const isEn = lang === 'en';
    const { profile, metrics, weeklyQuests } = state;
    const width = 960;
    const height = 550;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0F172A');
    bgGrad.addColorStop(0.55, '#1E293B');
    bgGrad.addColorStop(1, '#0F172A');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const wq = weeklyQuests || { weekKey: '2026-W01', resetDays: 4, resetHours: 12, quests: [], bonusCrystals: 30 };

    draw3DBox(ctx, 20, 14, width - 40, 72, 4, '#1E1B4B', '#0F172A', '#EC4899', 12);
    ctx.font = 'bold 11px KortexSans';
    ctx.fillStyle = '#F472B6';
    ctx.textAlign = 'left';
    ctx.fillText(
        isEn
            ? `CATEGORY 4 • WEEKLY QUESTS (${wq.weekKey}) & TOP LEADERBOARD`
            : `CATEGORÍA 4 • MISIONES SEMANALES (${wq.weekKey}) Y RANKING TOP`,
        40,
        36
    );

    ctx.font = 'bold 19px KortexSans';
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(
        isEn
            ? `Complete Weekly Quests for Free Kortex Crystals (+${wq.bonusCrystals} Bonus for All 4!)`
            : `Completá Misiones Semanales para Ganar Cristales Gratis (+${wq.bonusCrystals} Bono por las 4)`,
        40,
        64
    );

    const qStartX = 20;
    let qY = 104;
    const qW = 550;
    const qH = 96;

    (wq.quests || []).slice(0, 4).forEach((q) => {
        const borderCol = q.claimed ? '#22C55E' : (q.completed ? '#FACC15' : '#38BDF8');
        const topCol = q.claimed ? '#064E3B' : '#131C31';
        draw3DBox(ctx, qStartX, qY, qW, qH, 5, topCol, '#090D16', borderCol, 11);

        drawVectorIcon(ctx, 'crystal', qStartX + 26, qY + 28, 15, '#EC4899');
        ctx.font = 'bold 15px KortexSans';
        ctx.fillStyle = '#F8FAFC';
        ctx.textAlign = 'left';
        ctx.fillText(stripEmojis(isEn ? q.title_en : q.title_es), qStartX + 46, qY + 33);

        ctx.font = '12px KortexSans';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(stripEmojis(isEn ? q.desc_en : q.desc_es).slice(0, 62), qStartX + 46, qY + 54);

        const barX = qStartX + 46;
        const barY = qY + 66;
        const barW = 310;
        const barH = 14;
        ctx.fillStyle = '#090D16';
        drawRoundedRect(ctx, barX, barY, barW, barH, 7);
        ctx.fill();

        const ratio = Math.min(1, Math.max(0, Number(q.current || 0) / Math.max(1, Number(q.target || 1))));
        if (ratio > 0) {
            ctx.fillStyle = q.completed ? '#4ADE80' : '#38BDF8';
            drawRoundedRect(ctx, barX, barY, Math.max(12, Math.round(barW * ratio)), barH, 7);
            ctx.fill();
        }

        ctx.textAlign = 'right';
        ctx.font = 'bold 13px KortexSans';
        ctx.fillStyle = '#F472B6';
        ctx.fillText(`+${q.rewardCrystals} ${isEn ? 'Crystals' : 'Cristales'}`, qStartX + qW - 18, qY + 34);
        ctx.font = 'bold 12px KortexSans';
        ctx.fillStyle = '#FDE047';
        ctx.fillText(`+${q.rewardTix} Tix`, qStartX + qW - 18, qY + 54);

        ctx.font = 'bold 11px KortexSans';
        ctx.fillStyle = q.claimed ? '#4ADE80' : (q.completed ? '#FDE047' : '#7DD3FC');
        ctx.fillText(
            q.claimed
                ? (isEn ? 'CLAIMED' : 'RECLAMADA')
                : (q.completed ? (isEn ? 'READY!' : '¡LISTA!') : `${q.current}/${q.target}`),
            qStartX + qW - 18,
            qY + 78
        );

        qY += qH + 12;
    });

    const lbX = 590;
    const lbY = 104;
    const lbW = 350;
    const lbH = 420;
    draw3DBox(ctx, lbX, lbY, lbW, lbH, 7, '#131C31', '#090D16', '#A855F7', 13);

    drawVectorIcon(ctx, 'crown', lbX + 30, lbY + 30, 16, '#FACC15');
    ctx.font = 'bold 15px KortexSans';
    ctx.fillStyle = '#F8FAFC';
    ctx.textAlign = 'left';
    ctx.fillText(
        isEn ? 'TOP TYCOON STUDIOS' : 'RANKING TOP ESTUDIOS',
        lbX + 52,
        lbY + 35
    );

    const rows = Array.isArray(leaderboard) && leaderboard.length > 0
        ? leaderboard.slice(0, 5)
        : [
            {
                displayName: `@${stripEmojis(profile.user_id).slice(-6)}`,
                tixPerMin: metrics.effectiveTixPerMin,
                rebirths: Number(profile.rebirth_count || 0),
                stage: Number(profile.studio_stage || 1)
            }
        ];

    let rY = lbY + 62;
    rows.forEach((r, idx) => {
        ctx.fillStyle = idx === 0 ? 'rgba(250, 204, 21, 0.14)' : 'rgba(15, 23, 42, 0.75)';
        drawRoundedRect(ctx, lbX + 16, rY, lbW - 32, 54, 9);
        ctx.fill();
        ctx.strokeStyle = idx === 0 ? '#FACC15' : 'rgba(148, 163, 184, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = 'bold 14px KortexSans';
        ctx.fillStyle = idx === 0 ? '#FDE047' : '#38BDF8';
        ctx.textAlign = 'left';
        ctx.fillText(`#${idx + 1}  ${stripEmojis(r.displayName).slice(0, 18)}`, lbX + 28, rY + 23);

        ctx.font = '12px KortexSans';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(`Stage ${r.stage}/6  •  Rebirth x${r.rebirths}`, lbX + 28, rY + 43);

        ctx.textAlign = 'right';
        ctx.font = 'bold 14px KortexSans';
        ctx.fillStyle = '#4ADE80';
        ctx.fillText(`+${r.tixPerMin}/m`, lbX + lbW - 28, rY + 34);

        rY += 64;
    });

    ctx.textAlign = 'center';
    ctx.font = 'bold 12px KortexSans';
    ctx.fillStyle = metrics.potionActive ? '#4ADE80' : '#CBD5E1';
    ctx.fillText(
        metrics.potionActive
            ? (isEn ? `Active Lab Potion: +${metrics.potionBonusPct}% (${metrics.potionRemainingMin}m)` : `Poción Activa: +${metrics.potionBonusPct}% (${metrics.potionRemainingMin}m)`)
            : (isEn ? 'Tip: Activate a 30m Lab Potion below!' : 'Tip: ¡Activá una Poción de 30m abajo!'),
        lbX + lbW / 2,
        lbY + lbH - 18
    );

    return canvas.toBuffer('image/png');
}

/**
 * Despacha el lienzo visual correspondiente a cada una de las 4 categorías simétricas de /tycoon.
 */
async function renderTycoonSectionCanvas(arg1 = {}, arg2 = {}) {
    const opts = typeof arg1 === 'string'
        ? { ...arg2, activeSection: arg1 }
        : (arg1 || {});
    const {
        state,
        username = 'Player',
        avatarUrl = null,
        lang = 'es',
        activeSection = 'sec_studio',
        tradesCount = 0,
        leaderboard = []
    } = opts;
    if (activeSection === 'sec_shop' || activeSection === 'sec_ugc') {
        return await renderTycoonShopShowcase({ state, lang });
    }
    if (activeSection === 'sec_vault') {
        return await renderTycoonVaultShowcase({ state, tradesCount, lang });
    }
    if (activeSection === 'sec_perks') {
        return await renderTycoonQuestsShowcase({ state, leaderboard, lang });
    }
    return await renderTycoonSnapshot({ state, username, avatarUrl, lang });
}

module.exports = {
    renderTycoonSnapshot,
    renderTycoonShopShowcase,
    renderTycoonVaultShowcase,
    renderTycoonQuestsShowcase,
    renderTycoonSectionCanvas
};
