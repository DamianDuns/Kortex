// ==========================================
// ARCHIVO: utils/tycoonRenderer.js
// Renderizador Gráfico en 3ra Persona / Vista Cenital-Isométrica de Roblox Tycoon
// Genera tycoon_snapshot.png con @napi-rs/canvas en Español ('es') e Inglés ('en')
// ==========================================

const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { STUDIO_PADS } = require('../services/tycoonEngine');

try {
    GlobalFonts.registerFromPath(path.join(__dirname, '../assets/fonts/LiberationSans-Regular.ttf'), 'KortexSans');
    GlobalFonts.registerFromPath(path.join(__dirname, '../assets/fonts/LiberationSans-Bold.ttf'), 'KortexSans');
} catch {
    // Fuentes ya registradas
}

function drawRoundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

function drawClassicNoobAvatar(ctx, cx, cy, scale = 1) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // Sombra en el piso
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 46, 28, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pierna izquierda y derecha (Verde clásico Roblox)
    ctx.fillStyle = '#4B974B';
    drawRoundedRect(ctx, -16, 14, 14, 30, 3);
    ctx.fill();
    drawRoundedRect(ctx, 2, 14, 14, 30, 3);
    ctx.fill();

    // Torso (Azul brillante clásico Roblox)
    ctx.fillStyle = '#0D69AC';
    drawRoundedRect(ctx, -18, -18, 36, 34, 4);
    ctx.fill();

    // Brazos (Amarillo clásico Roblox)
    ctx.fillStyle = '#F5CD30';
    drawRoundedRect(ctx, -31, -16, 12, 30, 4);
    ctx.fill();
    drawRoundedRect(ctx, 19, -16, 12, 30, 4);
    ctx.fill();

    // Cabeza cilíndrica amarilla
    ctx.fillStyle = '#F5CD30';
    drawRoundedRect(ctx, -14, -44, 28, 25, 7);
    ctx.fill();
    ctx.strokeStyle = '#D9B11C';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Ojos y sonrisa clásica de Roblox
    ctx.fillStyle = '#1E1E1E';
    ctx.beginPath();
    ctx.arc(-5, -33, 2.2, 0, Math.PI * 2);
    ctx.arc(5, -33, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#1E1E1E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -29, 6.5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    ctx.restore();
}

function drawPurchasePadFloor(ctx, x, y, labelTop, costText, isNextTarget = false) {
    ctx.save();

    // Sombra exterior
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    drawRoundedRect(ctx, x - 56, y - 24, 112, 52, 10);
    ctx.fill();

    // Borde exterior brillante (Amarillo si es el siguiente, Azul si es futuro)
    ctx.fillStyle = isNextTarget ? '#FACC15' : '#38BDF8';
    drawRoundedRect(ctx, x - 54, y - 26, 108, 48, 9);
    ctx.fill();

    // Interior oscuro
    ctx.fillStyle = '#0F172A';
    drawRoundedRect(ctx, x - 50, y - 22, 100, 40, 7);
    ctx.fill();

    // Círculo central de botón de piso Roblox
    ctx.fillStyle = isNextTarget ? 'rgba(250, 204, 21, 0.22)' : 'rgba(56, 189, 248, 0.16)';
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 38, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 11px KortexSans';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(labelTop, x, y - 5);

    ctx.font = 'bold 12px KortexSans';
    ctx.fillStyle = isNextTarget ? '#FDE047' : '#7DD3FC';
    ctx.fillText(costText, x, y + 11);

    ctx.restore();
}

/**
 * Renderiza el snapshot visual del Estudio Tycoon en un Buffer PNG.
 * @param {object} params
 * @param {object} params.state Resultado de getOrCreatePlayerState(userId)
 * @param {string} params.username Nombre del jugador en Discord/Roblox
 * @param {string|null} params.avatarUrl URL del avatar de Roblox si está vinculado
 * @param {string} params.lang 'es' | 'en'
 */
async function renderTycoonSnapshot({ state, username = 'Player', avatarUrl = null, lang = 'es' }) {
    const isEn = lang === 'en';
    const { profile, equippedItem, totalRap, metrics } = state;
    const unlockedSet = new Set(metrics.unlockedPads);

    const width = 940;
    const height = 540;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. FONDO BASEPLATE DE ROBLOX CON CUADRÍCULA DE STUDS
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0B132B');
    bgGrad.addColorStop(0.5, '#111C38');
    bgGrad.addColorStop(1, '#091024');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Dibujar textura de studs clásicos de Roblox en el Baseplate
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
    ctx.lineWidth = 1;
    const gridSize = 34;
    for (let gx = 0; gx < width; gx += gridSize) {
        ctx.beginPath();
        ctx.moveTo(gx, 68);
        ctx.lineTo(gx, height);
        ctx.stroke();
    }
    for (let gy = 68; gy < height; gy += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(width, gy);
        ctx.stroke();
    }

    for (let gx = 17; gx < width; gx += gridSize) {
        for (let gy = 85; gy < height; gy += gridSize) {
            ctx.fillStyle = 'rgba(148, 163, 184, 0.05)';
            ctx.beginPath();
            ctx.arc(gx, gy, 3.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // 2. PLATAFORMA CENTRAL DEL ESTUDIO TYCOON
    const plotX = 48;
    const plotY = 86;
    const plotW = width - 96;
    const plotH = height - 116;

    // Sombra de la plataforma
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    drawRoundedRect(ctx, plotX + 6, plotY + 8, plotW, plotH, 18);
    ctx.fill();

    // Piso del estudio (evoluciona según nivel y paredes desbloqueadas)
    const hasWalls = unlockedSet.has('pad_walls');
    const studioGrad = ctx.createLinearGradient(plotX, plotY, plotX + plotW, plotY + plotH);
    if (unlockedSet.has('pad_tower')) {
        studioGrad.addColorStop(0, '#1E1B4B');
        studioGrad.addColorStop(0.5, '#1E293B');
        studioGrad.addColorStop(1, '#172554');
    } else if (hasWalls) {
        studioGrad.addColorStop(0, '#132238');
        studioGrad.addColorStop(1, '#1E293B');
    } else {
        studioGrad.addColorStop(0, '#1E293B');
        studioGrad.addColorStop(1, '#0F172A');
    }

    ctx.fillStyle = studioGrad;
    drawRoundedRect(ctx, plotX, plotY, plotW, plotH, 16);
    ctx.fill();

    // Muros perimetrales Neón (si pad_walls está desbloqueado) o borde punteado básico
    ctx.lineWidth = hasWalls ? 5 : 2;
    ctx.strokeStyle = unlockedSet.has('pad_tower')
        ? '#F59E0B'
        : (hasWalls ? '#38BDF8' : '#475569');
    drawRoundedRect(ctx, plotX, plotY, plotW, plotH, 16);
    ctx.stroke();

    // Líneas decorativas del piso del estudio
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let sx = plotX + 40; sx < plotX + plotW; sx += 40) {
        ctx.beginPath();
        ctx.moveTo(sx, plotY + 4);
        ctx.lineTo(sx, plotY + plotH - 4);
        ctx.stroke();
    }
    for (let sy = plotY + 40; sy < plotY + plotH; sy += 40) {
        ctx.beginPath();
        ctx.moveTo(plotX + 4, sy);
        ctx.lineTo(plotX + plotW - 4, sy);
        ctx.stroke();
    }

    // Si pad_walls no está comprado, mostrar su Purchase Pad arriba a la izquierda
    if (!hasWalls) {
        drawPurchasePadFloor(
            ctx,
            190,
            135,
            isEn ? '🧱 NEON WALLS' : '🧱 MUROS NEÓN',
            '350 Tix',
            metrics.nextPad?.id === 'pad_walls'
        );
    } else {
        // Etiqueta de Muros Neón activos
        ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
        drawRoundedRect(ctx, 74, 102, 180, 28, 8);
        ctx.fill();
        ctx.font = 'bold 12px KortexSans';
        ctx.fillStyle = '#38BDF8';
        ctx.textAlign = 'left';
        ctx.fillText(isEn ? '🧱 NEON PERIMETER ACTIVE' : '🧱 PERÍMETRO NEÓN ACTIVO', 86, 120);
    }

    // 3. CINTA TRANSPORTADORA (CONVEYOR BELT) EN LA PARTE INFERIOR DEL ESTUDIO
    const beltX = 92;
    const beltY = 365;
    const beltW = 550;
    const beltH = 56;

    ctx.fillStyle = '#090D16';
    drawRoundedRect(ctx, beltX - 4, beltY - 4, beltW + 8, beltH + 8, 10);
    ctx.fill();

    ctx.fillStyle = '#1E293B';
    drawRoundedRect(ctx, beltX, beltY, beltW, beltH, 8);
    ctx.fill();
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Flechas de movimiento en la cinta transportadora
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 3;
    for (let ax = beltX + 30; ax < beltX + beltW - 25; ax += 48) {
        ctx.beginPath();
        ctx.moveTo(ax - 8, beltY + 14);
        ctx.lineTo(ax + 6, beltY + beltH / 2);
        ctx.lineTo(ax - 8, beltY + beltH - 14);
        ctx.stroke();
    }

    // Bloques de Tix viajando por la cinta transportadora
    const hasLaser = unlockedSet.has('pad_laser');
    const hasDropper2 = unlockedSet.has('pad_dropper2');
    const tixBlocks = [
        { x: beltX + 55, upgraded: false, gold: false },
        { x: beltX + 150, upgraded: false, gold: hasDropper2 },
        { x: beltX + 245, upgraded: false, gold: false },
        { x: beltX + 355, upgraded: hasLaser, gold: hasDropper2 },
        { x: beltX + 460, upgraded: hasLaser, gold: true }
    ];

    for (const blk of tixBlocks) {
        ctx.save();
        ctx.fillStyle = blk.upgraded
            ? '#A855F7'
            : (blk.gold ? '#FACC15' : '#22C55E');
        drawRoundedRect(ctx, blk.x - 16, beltY + 13, 32, 30, 5);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.font = 'bold 10px KortexSans';
        ctx.fillStyle = blk.gold && !blk.upgraded ? '#0F172A' : '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText('TIX', blk.x, beltY + 32);
        ctx.restore();
    }

    // 4. MÁQUINA 1: DROPPER BÁSICO LV.1 (Siempre desbloqueado)
    ctx.save();
    ctx.fillStyle = '#334155';
    drawRoundedRect(ctx, 88, 260, 96, 96, 10);
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Cañón del Dropper 1 hacia la cinta
    ctx.fillStyle = '#0284C7';
    drawRoundedRect(ctx, 120, 340, 32, 30, 4);
    ctx.fill();

    ctx.font = 'bold 12px KortexSans';
    ctx.fillStyle = '#F8FAFC';
    ctx.textAlign = 'center';
    ctx.fillText(isEn ? '⚙️ DROPPER 1' : '⚙️ DROPPER 1', 136, 295);
    ctx.font = 'bold 11px KortexSans';
    ctx.fillStyle = '#38BDF8';
    ctx.fillText('+15 Tix/m', 136, 316);
    ctx.restore();

    // 5. MÁQUINA 2: DROPPER DOBLE DE ORO (pad_dropper2)
    if (hasDropper2) {
        ctx.save();
        ctx.fillStyle = '#422006';
        drawRoundedRect(ctx, 212, 260, 106, 96, 10);
        ctx.fill();
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#EAB308';
        drawRoundedRect(ctx, 236, 340, 22, 30, 4);
        ctx.fill();
        drawRoundedRect(ctx, 272, 340, 22, 30, 4);
        ctx.fill();

        ctx.font = 'bold 12px KortexSans';
        ctx.fillStyle = '#FEF08A';
        ctx.textAlign = 'center';
        ctx.fillText(isEn ? '🪙 GOLD DROPPER' : '🪙 DROPPER ORO', 265, 295);
        ctx.font = 'bold 11px KortexSans';
        ctx.fillStyle = '#FACC15';
        ctx.fillText('+45 Tix/m', 265, 316);
        ctx.restore();
    } else {
        drawPurchasePadFloor(
            ctx,
            265,
            308,
            isEn ? '🪙 GOLD DROPPER' : '🪙 DROPPER ORO',
            '900 Tix',
            metrics.nextPad?.id === 'pad_dropper2'
        );
    }

    // 6. MÁQUINA 3: UPGRADER LÁSER DE PARTÍCULAS (pad_laser) SOBRE LA CINTA
    if (hasLaser) {
        ctx.save();
        // Arco sobre la cinta
        ctx.fillStyle = '#3B0764';
        drawRoundedRect(ctx, 358, 282, 84, 72, 10);
        ctx.fill();
        ctx.strokeStyle = '#C084FC';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Rayo láser atravesando la cinta transportadora
        ctx.fillStyle = 'rgba(192, 132, 252, 0.38)';
        ctx.fillRect(390, 354, 20, 68);
        ctx.fillStyle = '#E879F9';
        ctx.fillRect(397, 354, 6, 68);

        ctx.font = 'bold 11px KortexSans';
        ctx.fillStyle = '#F3E8FF';
        ctx.textAlign = 'center';
        ctx.fillText(isEn ? '⚡ LASER ARCH' : '⚡ LÁSER ARCH', 400, 310);
        ctx.fillStyle = '#D8B4FE';
        ctx.fillText('+75 Tix/m', 400, 329);
        ctx.restore();
    } else {
        drawPurchasePadFloor(
            ctx,
            400,
            308,
            isEn ? '⚡ LASER UPGRADER' : '⚡ UPGRADER LÁSER',
            '2,200 Tix',
            metrics.nextPad?.id === 'pad_laser'
        );
    }

    // 7. MÁQUINA 4: RACKS DE SERVIDORES ROBLOX (pad_servers) ARRIBA AL CENTRO
    if (unlockedSet.has('pad_servers')) {
        ctx.save();
        ctx.fillStyle = '#0F172A';
        drawRoundedRect(ctx, 335, 104, 210, 82, 10);
        ctx.fill();
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Luces LED de racks de servidores
        for (let rx = 352; rx <= 492; rx += 46) {
            ctx.fillStyle = '#1E293B';
            drawRoundedRect(ctx, rx, 114, 36, 42, 4);
            ctx.fill();
            ctx.fillStyle = '#10B981';
            ctx.beginPath();
            ctx.arc(rx + 10, 125, 3, 0, Math.PI * 2);
            ctx.arc(rx + 22, 125, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#38BDF8';
            ctx.fillRect(rx + 6, 136, 24, 4);
            ctx.fillRect(rx + 6, 144, 18, 4);
        }

        ctx.font = 'bold 11px KortexSans';
        ctx.fillStyle = '#6EE7B7';
        ctx.textAlign = 'center';
        ctx.fillText(
            isEn ? '🖥️ QUANTUM SERVERS (+120 Tix/m)' : '🖥️ SERVIDORES ROBLOX (+120 Tix/m)',
            440,
            175
        );
        ctx.restore();
    } else {
        drawPurchasePadFloor(
            ctx,
            440,
            142,
            isEn ? '🖥️ SERVER RACKS' : '🖥️ SERVIDORES',
            '5,000 Tix',
            metrics.nextPad?.id === 'pad_servers'
        );
    }

    // 8. MÁQUINA 5: TORRE CENTRAL DE DESARROLLADORES (pad_tower) ARRIBA A LA DERECHA
    if (unlockedSet.has('pad_tower')) {
        ctx.save();
        const tx = 620;
        const ty = 104;
        const tw = 235;
        const th = 128;

        const towerGrad = ctx.createLinearGradient(tx, ty, tx + tw, ty + th);
        towerGrad.addColorStop(0, '#451A03');
        towerGrad.addColorStop(1, '#78350F');
        ctx.fillStyle = towerGrad;
        drawRoundedRect(ctx, tx, ty, tw, th, 14);
        ctx.fill();
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.font = 'bold 15px KortexSans';
        ctx.fillStyle = '#FDE047';
        ctx.textAlign = 'center';
        ctx.fillText(isEn ? '🏰 DEVELOPER TOWER' : '🏰 TORRE CENTRAL DEV', tx + tw / 2, ty + 36);

        ctx.font = 'bold 13px KortexSans';
        ctx.fillStyle = '#FEF08A';
        ctx.fillText('+200 Tix/min • MAX STAGE 6', tx + tw / 2, ty + 62);

        // Indicador de Rebirth Listo
        ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
        drawRoundedRect(ctx, tx + 24, ty + 78, tw - 48, 34, 8);
        ctx.fill();
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = 'bold 12px KortexSans';
        ctx.fillStyle = '#6EE7B7';
        ctx.fillText(
            isEn ? '✨ REBIRTH UNLOCKED!' : '✨ ¡REBIRTH DISPONIBLE!',
            tx + tw / 2,
            ty + 100
        );
        ctx.restore();
    } else {
        drawPurchasePadFloor(
            ctx,
            736,
            165,
            isEn ? '🏰 DEV TOWER (LV.6)' : '🏰 TORRE DEV (NV.6)',
            '11,000 Tix',
            metrics.nextPad?.id === 'pad_tower'
        );
    }

    // 9. GREEN COLLECTOR PAD (PLACA VERDE DE RECOLECCIÓN A LA DERECHA DE LA CINTA)
    ctx.save();
    const colX = 664;
    const colY = 278;
    const colW = 200;
    const colH = 152;

    const collectorTix = Number(profile.collector_tix || 0);
    const collectorCap = Number(profile.collector_cap || 500);
    const fillRatio = Math.min(1, Math.max(0, collectorTix / Math.max(1, collectorCap)));

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    drawRoundedRect(ctx, colX + 4, colY + 5, colW, colH, 16);
    ctx.fill();

    ctx.fillStyle = '#064E3B';
    drawRoundedRect(ctx, colX, colY, colW, colH, 14);
    ctx.fill();
    ctx.strokeStyle = fillRatio >= 1 ? '#FACC15' : '#22C55E';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Placa circular verde brillante estilo Roblox Tycoon
    ctx.fillStyle = 'rgba(34, 197, 94, 0.28)';
    ctx.beginPath();
    ctx.ellipse(colX + colW / 2, colY + 52, 66, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4ADE80';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 13px KortexSans';
    ctx.fillStyle = '#DCFCE7';
    ctx.textAlign = 'center';
    ctx.fillText(isEn ? '🟢 COLLECTOR PAD' : '🟢 COLECTOR DE TIX', colX + colW / 2, colY + 32);

    ctx.font = 'bold 18px KortexSans';
    ctx.fillStyle = fillRatio >= 1 ? '#FDE047' : '#4ADE80';
    ctx.fillText(`${collectorTix.toLocaleString()} / ${collectorCap.toLocaleString()}`, colX + colW / 2, colY + 58);

    // Barra de capacidad de la bóveda colectora
    const barX = colX + 18;
    const barY = colY + 90;
    const barW = colW - 36;
    const barH = 16;
    ctx.fillStyle = '#022C22';
    drawRoundedRect(ctx, barX, barY, barW, barH, 8);
    ctx.fill();

    if (fillRatio > 0) {
        ctx.fillStyle = fillRatio >= 1 ? '#FACC15' : '#22C55E';
        drawRoundedRect(ctx, barX, barY, Math.max(12, Math.round(barW * fillRatio)), barH, 8);
        ctx.fill();
    }

    ctx.font = 'bold 11px KortexSans';
    ctx.fillStyle = '#A7F3D0';
    ctx.fillText(
        fillRatio >= 1
            ? (isEn ? '⚠️ VAULT FULL — COLLECT NOW!' : '⚠️ ¡LLENO! RECOLECTÁ AHORA')
            : (isEn ? '🎟️ READY TO COLLECT' : '🎟️ LISTO PARA RECOLECTAR'),
        colX + colW / 2,
        colY + 130
    );
    ctx.restore();

    // 10. PERSONAJE DEL JUGADOR EN EL CENTRO DEL ESTUDIO
    const playerX = 528;
    const playerY = 262;

    // Aura de Poción Activa o VIP alrededor del personaje
    if (metrics.potionActive) {
        ctx.save();
        ctx.strokeStyle = '#EC4899';
        ctx.lineWidth = 3.5;
        ctx.fillStyle = 'rgba(236, 72, 153, 0.16)';
        ctx.beginPath();
        ctx.ellipse(playerX, playerY + 28, 46, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    } else if (profile.vip_nitro_boost || profile.vip_yt_sub) {
        ctx.save();
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2.5;
        ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
        ctx.beginPath();
        ctx.ellipse(playerX, playerY + 28, 42, 17, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    let drewAvatarImg = false;
    if (avatarUrl && /^https?:\/\//i.test(String(avatarUrl))) {
        try {
            const img = await loadImage(String(avatarUrl));
            ctx.save();
            // Sombra bajo el avatar
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.beginPath();
            ctx.ellipse(playerX, playerY + 42, 32, 12, 0, 0, Math.PI * 2);
            ctx.fill();

            // Marco circular/redondeado del avatar de Roblox
            drawRoundedRect(ctx, playerX - 42, playerY - 46, 84, 84, 18);
            ctx.clip();
            ctx.drawImage(img, playerX - 42, playerY - 46, 84, 84);
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = '#38BDF8';
            ctx.lineWidth = 2.5;
            drawRoundedRect(ctx, playerX - 42, playerY - 46, 84, 84, 18);
            ctx.stroke();
            ctx.restore();
            drewAvatarImg = true;
        } catch {
            drewAvatarImg = false;
        }
    }

    if (!drewAvatarImg) {
        drawClassicNoobAvatar(ctx, playerX, playerY, 1.0);
    }

    // Etiqueta flotante sobre la cabeza del jugador (@Username + Ítem Equipado)
    ctx.save();
    const cleanUser = `@${String(username || 'Player').slice(0, 18)}`;
    ctx.font = 'bold 13px KortexSans';
    const nameWidth = Math.max(110, ctx.measureText(cleanUser).width + 26);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    drawRoundedRect(ctx, playerX - nameWidth / 2, playerY - 82, nameWidth, 26, 8);
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#F8FAFC';
    ctx.textAlign = 'center';
    ctx.fillText(cleanUser, playerX, playerY - 64);

    if (equippedItem) {
        const eqName = isEn ? (equippedItem.name_en || equippedItem.name) : equippedItem.name;
        const shortEq = `${equippedItem.icon_emoji || '🎩'} ${eqName.slice(0, 22)} (+${equippedItem.boost_pct}%)`;
        ctx.font = 'bold 11px KortexSans';
        const eqW = Math.max(130, ctx.measureText(shortEq).width + 20);
        ctx.fillStyle = 'rgba(88, 28, 135, 0.9)';
        drawRoundedRect(ctx, playerX - eqW / 2, playerY - 108, eqW, 22, 6);
        ctx.fill();
        ctx.fillStyle = '#F3E8FF';
        ctx.fillText(shortEq, playerX, playerY - 93);
    }
    ctx.restore();

    // 11. BARRA SUPERIOR HUD (ESTADÍSTICAS DEL TYCOON EN TIEMPO REAL)
    ctx.save();
    ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
    ctx.fillRect(0, 0, width, 68);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 68);
    ctx.lineTo(width, 68);
    ctx.stroke();

    // Píldoras de indicadores en el HUD superior
    const hudBadges = [
        {
            x: 24,
            w: 185,
            bg: '#1E293B',
            border: '#38BDF8',
            label: isEn ? 'STUDIO STAGE' : 'NIVEL DE ESTUDIO',
            val: `${profile.studio_stage || 1} / 6  (✨ RB x${profile.rebirth_count || 0})`,
            valColor: '#38BDF8'
        },
        {
            x: 222,
            w: 220,
            bg: '#1E293B',
            border: '#FACC15',
            label: isEn ? 'TIX WALLET' : 'BILLETERA DE TIX',
            val: `🎟️ ${Number(profile.tix_balance || 0).toLocaleString()} Tix`,
            valColor: '#FDE047'
        },
        {
            x: 455,
            w: 235,
            bg: '#1E293B',
            border: '#22C55E',
            label: isEn ? 'PRODUCTION SPEED' : 'VELOCIDAD DE PRODUCCIÓN',
            val: `⚡ +${metrics.effectiveTixPerMin}/min (x${metrics.multiplier})`,
            valColor: '#4ADE80'
        },
        {
            x: 703,
            w: 213,
            bg: '#1E293B',
            border: '#A855F7',
            label: isEn ? 'LIMITED VAULT RAP' : 'VALOR RAP LIMITED',
            val: `💎 ${Number(totalRap || 0).toLocaleString()} RAP`,
            valColor: '#D8B4FE'
        }
    ];

    for (const b of hudBadges) {
        ctx.fillStyle = b.bg;
        drawRoundedRect(ctx, b.x, 10, b.w, 48, 10);
        ctx.fill();
        ctx.strokeStyle = b.border;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = 'bold 10px KortexSans';
        ctx.fillStyle = '#94A3B8';
        ctx.textAlign = 'left';
        ctx.fillText(b.label, b.x + 12, 26);

        ctx.font = 'bold 14px KortexSans';
        ctx.fillStyle = b.valColor;
        ctx.fillText(b.val, b.x + 12, 47);
    }
    ctx.restore();

    // 12. PIE INFERIOR DEL LIENZO CON ESTADO DE POCIONES Y PERKS VIP
    ctx.save();
    ctx.font = 'bold 12px KortexSans';
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'left';

    const statusParts = [];
    if (metrics.potionActive) {
        statusParts.push(
            isEn
                ? `🧪 Active Potion: +${metrics.potionBonusPct}% (${metrics.potionRemainingMin}m left)`
                : `🧪 Poción Activa: +${metrics.potionBonusPct}% (${metrics.potionRemainingMin}m restantes)`
        );
    }
    if (profile.vip_nitro_boost) {
        statusParts.push('💎 Nitro Boost (+50%)');
    }
    if (profile.vip_yt_sub) {
        statusParts.push('▶️ YouTube VIP (+35%)');
    }
    if (statusParts.length === 0) {
        statusParts.push(
            isEn
                ? '💡 Tip: Step on the green Collector Pad or buy yellow Purchase Pads to expand your Studio!'
                : '💡 Tip: ¡Recolectá tus Tix del Colector Verde y comprá Pads amarillos para expandir tu Estudio!'
        );
    }

    ctx.fillText(statusParts.join('   •   '), 54, height - 10);
    ctx.restore();

    return canvas.toBuffer('image/png');
}

module.exports = {
    renderTycoonSnapshot
};
