// ==========================================
// ARCHIVO: src/utils/performanceManager.js
// Gestor Ligero de Concurrencia, Anti-Spam por Usuario y Purga de Caché RAM
// ==========================================
// Diseño técnico sin sobrecarga:
// 1. Sin pantallas de carga artificiales por filas (evita 3-4 llamadas extra a Discord API y asignaciones innecesarias en V8 Heap).
// 2. Semáforo real de concurrencia para renders nativos (@napi-rs/canvas / .ZIP 3D) y llamadas HTTP.
// 3. Escudo Anti-Spam por usuario (bloquea clics repetidos en vuelo del mismo usuario para no duplicar renders en RAM).
// 4. Purga selectiva de cachés temporales por TTL y umbral real de memoria cgroup/host.

const os = require('os');
const fs = require('fs');
const path = require('path');
const v8 = require('v8');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const { COLORES, footer, separador, boton } = require('../../utils/ui');
const { getHttpCacheStats, purgeHttpCache } = require('../../utils/http');

const STORE_DIR = path.join(process.cwd(), '.data');
const OWNER_CONFIG_FILE = path.join(STORE_DIR, 'owner_bot_config.json');

const MODOS_MOTOR = {
    auto: {
        id: 'auto',
        nombreModo: '🤖 Automático (Adaptativo)',
        maxGeneral: 6,
        maxGpu: 2
    },
    ahorro: {
        id: 'ahorro',
        nombreModo: '🔋 Ahorro de Recursos (Eco)',
        maxGeneral: 3,
        maxGpu: 1
    },
    maximo: {
        id: 'maximo',
        nombreModo: '🚀 Alto Rendimiento (Turbo)',
        maxGeneral: 10,
        maxGpu: 3
    }
};

const DEFAULT_OWNER_CONFIG = {
    engineMode: 'auto', // 'auto' | 'ahorro' | 'maximo'
    maintenanceMode: false,
    requireDiscordOAuth: true,
    dynamicLoadingEnabled: false, // Desactivado por defecto: respuesta directa en 1 paso (ahorra RAM y llamadas a Discord API)
    alertsEnabled: true,
    categoryEconomyEnabled: true,
    categoryAvatarEnabled: true,
    categoryGamesEnabled: true,
    categoryStatusEnabled: true,
    tycoonEnabled: true,
    botPresenceStatus: 'online', // 'online' | 'idle' | 'dnd'
    botActivityText: '/roblox • /tycoon • /help • /config',
    maxWishlistItems: 5,
    maxSandboxItems: 5,
    maxGameSubs: 3,
    priceCheckIntervalMinutes: Math.max(1, parseInt(process.env.PRICE_CHECK_INTERVAL_MINUTES || '5', 10) || 5),
    workersIntervalMinutes: 15
};

let botOwnerConfig = {
    ownerId: (process.env.BOT_OWNER_ID || '').trim() || null,
    ...DEFAULT_OWNER_CONFIG,
    updatedAt: null
};

const BACKUP_DATA_DIR = path.join(__dirname, '../../data');
const OWNER_CONFIG_BACKUP_FILE = path.join(BACKUP_DATA_DIR, 'owner_bot_config.json');
let lastOwnerConfigMtime = 0;

function cargarConfigPropietarioDesdeDisco() {
    try {
        if (!fs.existsSync(STORE_DIR)) {
            fs.mkdirSync(STORE_DIR, { recursive: true });
        }
        if (!fs.existsSync(BACKUP_DATA_DIR)) {
            fs.mkdirSync(BACKUP_DATA_DIR, { recursive: true });
        }
        let newestConfig = null;
        let newestTimestamp = 0;
        for (const candidateFile of [OWNER_CONFIG_FILE, OWNER_CONFIG_BACKUP_FILE]) {
            if (!fs.existsSync(candidateFile)) continue;
            try {
                const stat = fs.statSync(candidateFile);
                if (stat.mtimeMs > lastOwnerConfigMtime) {
                    lastOwnerConfigMtime = stat.mtimeMs;
                }
                const raw = fs.readFileSync(candidateFile, 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    const ts = parsed.updatedAt ? Date.parse(parsed.updatedAt) : stat.mtimeMs;
                    if (!newestConfig || ts >= newestTimestamp) {
                        newestConfig = parsed;
                        newestTimestamp = ts;
                    }
                }
            } catch {
                // Ignorar archivo corrupto individual
            }
        }
        if (newestConfig) {
            botOwnerConfig = {
                ...botOwnerConfig,
                ...newestConfig,
                ownerId: (process.env.BOT_OWNER_ID || newestConfig.ownerId || '').trim() || null
            };
            if (typeof botOwnerConfig.botActivityText === 'string' && botOwnerConfig.botActivityText.includes('/status')) {
                botOwnerConfig.botActivityText = DEFAULT_OWNER_CONFIG.botActivityText;
                guardarConfigPropietarioEnDisco();
            }
        }
    } catch {
        // Silencioso
    }
}

function guardarConfigPropietarioEnDisco() {
    try {
        if (!fs.existsSync(STORE_DIR)) {
            fs.mkdirSync(STORE_DIR, { recursive: true });
        }
        if (!fs.existsSync(BACKUP_DATA_DIR)) {
            fs.mkdirSync(BACKUP_DATA_DIR, { recursive: true });
        }
        const serialized = JSON.stringify(botOwnerConfig, null, 2);
        fs.writeFileSync(OWNER_CONFIG_FILE, serialized, 'utf8');
        fs.writeFileSync(OWNER_CONFIG_BACKUP_FILE, serialized, 'utf8');
        try {
            lastOwnerConfigMtime = fs.statSync(OWNER_CONFIG_FILE).mtimeMs;
        } catch {
            // Silencioso
        }
    } catch {
        // Silencioso
    }
}

cargarConfigPropietarioDesdeDisco();

function obtenerConfigPropietario() {
    try {
        if (fs.existsSync(OWNER_CONFIG_FILE)) {
            const mtime = fs.statSync(OWNER_CONFIG_FILE).mtimeMs;
            if (mtime > lastOwnerConfigMtime) {
                cargarConfigPropietarioDesdeDisco();
            }
        }
    } catch {
        // Silencioso
    }
    return { ...botOwnerConfig };
}

function guardarConfigPropietario(patch = {}) {
    const nextWish = patch.maxWishlistItems !== undefined ? Number(patch.maxWishlistItems) : botOwnerConfig.maxWishlistItems;
    const nextSand = patch.maxSandboxItems !== undefined ? Number(patch.maxSandboxItems) : botOwnerConfig.maxSandboxItems;
    const nextSubs = patch.maxGameSubs !== undefined ? Number(patch.maxGameSubs) : botOwnerConfig.maxGameSubs;
    const nextPriceInt = patch.priceCheckIntervalMinutes !== undefined ? Number(patch.priceCheckIntervalMinutes) : botOwnerConfig.priceCheckIntervalMinutes;
    const nextWorkerInt = patch.workersIntervalMinutes !== undefined ? Number(patch.workersIntervalMinutes) : botOwnerConfig.workersIntervalMinutes;
    const validStatuses = ['online', 'idle', 'dnd'];
    const nextPresence = patch.botPresenceStatus && validStatuses.includes(patch.botPresenceStatus)
        ? patch.botPresenceStatus
        : (validStatuses.includes(botOwnerConfig.botPresenceStatus) ? botOwnerConfig.botPresenceStatus : 'online');
    const nextActivityText = patch.botActivityText !== undefined
        ? String(patch.botActivityText || '').trim().slice(0, 80) || DEFAULT_OWNER_CONFIG.botActivityText
        : (botOwnerConfig.botActivityText || DEFAULT_OWNER_CONFIG.botActivityText);

    botOwnerConfig = {
        ...botOwnerConfig,
        ...patch,
        botPresenceStatus: nextPresence,
        botActivityText: nextActivityText,
        maxWishlistItems: Math.min(25, Math.max(1, Number.isFinite(nextWish) ? Math.round(nextWish) : 5)),
        maxSandboxItems: Math.min(15, Math.max(1, Number.isFinite(nextSand) ? Math.round(nextSand) : 5)),
        maxGameSubs: Math.min(15, Math.max(1, Number.isFinite(nextSubs) ? Math.round(nextSubs) : 3)),
        priceCheckIntervalMinutes: Math.min(60, Math.max(1, Number.isFinite(nextPriceInt) ? Math.round(nextPriceInt) : 5)),
        workersIntervalMinutes: Math.min(120, Math.max(2, Number.isFinite(nextWorkerInt) ? Math.round(nextWorkerInt) : 15)),
        updatedAt: new Date().toISOString()
    };
    guardarConfigPropietarioEnDisco();
    return obtenerConfigPropietario();
}

function restaurarConfigPropietarioPorDefecto() {
    return guardarConfigPropietario({
        ...DEFAULT_OWNER_CONFIG
    });
}

function aplicarPresenciaBotDiscord(client) {
    try {
        if (!client || !client.user || typeof client.user.setPresence !== 'function') return false;
        const { ActivityType } = require('discord.js');
        const status = botOwnerConfig.maintenanceMode
            ? 'dnd'
            : (['online', 'idle', 'dnd'].includes(botOwnerConfig.botPresenceStatus) ? botOwnerConfig.botPresenceStatus : 'online');
        const activityName = botOwnerConfig.maintenanceMode
            ? '🛠️ En Mantenimiento Temporal'
            : (botOwnerConfig.botActivityText || '/roblox • /tycoon • /help • /config');

        client.user.setPresence({
            status,
            activities: [{
                name: activityName,
                type: ActivityType ? ActivityType.Playing : 0
            }]
        });
        return true;
    } catch {
        return false;
    }
}

async function esPropietarioDelBot(userId, client = null) {
    if (!userId) return false;
    const uid = String(userId).trim();

    if (process.env.BOT_OWNER_ID && String(process.env.BOT_OWNER_ID).trim() === uid) {
        if (botOwnerConfig.ownerId !== uid) {
            guardarConfigPropietario({ ownerId: uid });
        }
        return true;
    }

    if (botOwnerConfig.ownerId && String(botOwnerConfig.ownerId).trim() === uid) {
        return true;
    }

    if (client && client.application) {
        try {
            if (!client.application.owner) {
                await client.application.fetch();
            }
            const appOwner = client.application.owner;
            if (appOwner) {
                if (appOwner.id && String(appOwner.id) === uid) {
                    guardarConfigPropietario({ ownerId: uid });
                    return true;
                }
                if (appOwner.members && typeof appOwner.members.has === 'function' && appOwner.members.has(uid)) {
                    guardarConfigPropietario({ ownerId: uid });
                    return true;
                }
            }
        } catch {
            // Silencioso
        }
    }

    if (!botOwnerConfig.ownerId) {
        guardarConfigPropietario({ ownerId: uid });
        return true;
    }

    return false;
}

const cachePurgers = [];
let activeGeneralOps = 0;
let activeGpuOps = 0;
const generalQueue = [];
const gpuQueue = [];

// Control real de operaciones activas por usuario para evitar spam de renders simultáneos
const activeUserOperations = new Map();

let lastAutoCleanupAt = 0;
let stats = {
    totalProcessed: 0,
    totalQueued: 0,
    totalSpamBlocked: 0,
    ramCleanups: 0,
    autoCleanups: 0,
    manualCleanups: 0,
    lastCleanupAt: null,
    lastFreedMB: 0,
    lastPurgedItems: 0,
    lastTriggerReason: 'En reposo (sin limpiezas necesarias)'
};

function registerCachePurger(name, fn) {
    if (typeof fn === 'function') {
        cachePurgers.push({ name, fn });
    }
}

function leerCgroupMemoryStat(statFilePath) {
    try {
        if (!fs.existsSync(statFilePath)) return 0;
        const content = fs.readFileSync(statFilePath, 'utf8');
        const matchInactive = content.match(/^inactive_file\s+(\d+)/m);
        if (matchInactive) return Number(matchInactive[1]);
        const matchTotalCache = content.match(/^total_inactive_file\s+(\d+)/m);
        if (matchTotalCache) return Number(matchTotalCache[1]);
    } catch {
        // Silencioso
    }
    return 0;
}

function leerMemoriaContenedorReal() {
    try {
        if (fs.existsSync('/sys/fs/cgroup/memory.current') && fs.existsSync('/sys/fs/cgroup/memory.max')) {
            const rawUsed = fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim();
            const rawMax = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
            const usedBytes = Number(rawUsed);
            const maxBytes = rawMax === 'max' ? os.totalmem() : Number(rawMax);
            const reclaimableCache = leerCgroupMemoryStat('/sys/fs/cgroup/memory.stat');
            const workingSetBytes = Math.max(0, usedBytes - reclaimableCache);

            if (Number.isFinite(workingSetBytes) && Number.isFinite(maxBytes) && maxBytes > 0 && maxBytes < 1e15) {
                return {
                    usadaMB: workingSetBytes / 1024 / 1024,
                    limiteMB: maxBytes / 1024 / 1024
                };
            }
        }
        if (
            fs.existsSync('/sys/fs/cgroup/memory/memory.usage_in_bytes') &&
            fs.existsSync('/sys/fs/cgroup/memory/memory.limit_in_bytes')
        ) {
            const usedBytes = Number(fs.readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8').trim());
            const rawLimit = Number(fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim());
            const maxBytes = rawLimit > os.totalmem() ? os.totalmem() : rawLimit;
            const reclaimableCache = leerCgroupMemoryStat('/sys/fs/cgroup/memory/memory.stat');
            const workingSetBytes = Math.max(0, usedBytes - reclaimableCache);

            if (Number.isFinite(workingSetBytes) && Number.isFinite(maxBytes) && maxBytes > 0) {
                return {
                    usadaMB: workingSetBytes / 1024 / 1024,
                    limiteMB: maxBytes / 1024 / 1024
                };
            }
        }
    } catch {
        // Fallback a os.totalmem()
    }

    const total = os.totalmem();
    const libre = os.freemem();
    return {
        usadaMB: Math.max(0, total - libre) / 1024 / 1024,
        limiteMB: total / 1024 / 1024
    };
}

function leerEstadoRecursos() {
    const mem = process.memoryUsage();
    const rssMB = mem.rss / 1024 / 1024;
    const heapUsadoMB = mem.heapUsed / 1024 / 1024;
    const heapTotalMB = mem.heapTotal / 1024 / 1024;
    const externoMB = (mem.external || 0) / 1024 / 1024;
    const arrayBuffersMB = (mem.arrayBuffers || 0) / 1024 / 1024;
    const nativoCanvasMB = Math.max(0, externoMB + arrayBuffersMB);

    const heapStats = v8.getHeapStatistics();
    const heapLimitMB = (heapStats.heap_size_limit || 0) / 1024 / 1024;

    const host = leerMemoriaContenedorReal();
    const pctHost = host.limiteMB > 0 ? (host.usadaMB / host.limiteMB) * 100 : 0;
    const hostLibreMB = Math.max(0, host.limiteMB - host.usadaMB);

    const faltaMemoriaReal =
        (host.limiteMB > 0 && (pctHost >= 86 || hostLibreMB < 90)) ||
        rssMB >= 480;

    let nivel = 'optimo';
    let etiquetaModo = '🟢 Estable (En Reposo)';

    if (
        (host.limiteMB > 0 && (pctHost >= 92 || hostLibreMB < 55)) ||
        rssMB >= 600
    ) {
        nivel = 'critico';
        etiquetaModo = '🔴 Memoria Ajustada (Auto-Purga Activa)';
    } else if (
        faltaMemoriaReal ||
        activeGpuOps >= 2 ||
        activeGeneralOps >= 5
    ) {
        nivel = 'ocupado';
        etiquetaModo = faltaMemoriaReal
            ? '🟡 Memoria Moderada'
            : '🟡 Procesando Tareas Concurrentes';
    }

    const modoConfig = botOwnerConfig.engineMode || 'auto';
    let limites = MODOS_MOTOR[modoConfig] || MODOS_MOTOR.auto;

    if (modoConfig === 'auto') {
        if (nivel === 'critico') {
            limites = { ...MODOS_MOTOR.ahorro, nombreModo: '🤖 Automático (Ajuste Eco por Memoria)' };
        } else {
            limites = MODOS_MOTOR.auto;
        }
    }

    const httpPool = getHttpCacheStats();

    return {
        rssMB,
        heapUsadoMB,
        heapTotalMB,
        heapLimitMB,
        nativoCanvasMB,
        hostUsadaMB: host.usadaMB,
        hostLimiteMB: host.limiteMB,
        hostLibreMB,
        pctHost,
        faltaMemoriaReal,
        nivel,
        etiquetaModo,
        modoConfig,
        limites,
        activeGeneralOps,
        activeGpuOps,
        queuedGeneral: generalQueue.length,
        queuedGpu: gpuQueue.length,
        activeUsersCount: activeUserOperations.size,
        httpPool,
        stats
    };
}

function inspeccionarSubsistemasMemoria() {
    let totalEntries = 0;
    let totalEstimatedBytes = 0;
    const modulos = [];

    for (const p of cachePurgers) {
        try {
            const res = p.fn(false, true);
            if (res && typeof res === 'object') {
                const count = Number(res.count || 0);
                const bytes = Number(res.bytes || count * 1536);
                totalEntries += count;
                totalEstimatedBytes += bytes;
                modulos.push({
                    name: p.name,
                    label: res.label || p.name,
                    count,
                    kb: Math.max(0, bytes / 1024).toFixed(1)
                });
            }
        } catch {
            // Silencioso
        }
    }

    const httpStats = getHttpCacheStats();
    const activeHttpEntries = Number(httpStats.entries ?? httpStats.activeCacheEntries ?? 0);
    const httpBytes = (Number(httpStats.approxKB || 0) * 1024) || (activeHttpEntries * 2048);
    totalEntries += activeHttpEntries;
    totalEstimatedBytes += httpBytes;
    modulos.push({
        name: 'httpPoolCache',
        label: 'Caché HTTP Anti-429',
        count: activeHttpEntries,
        kb: (httpBytes / 1024).toFixed(1)
    });

    return {
        totalEntries,
        totalKB: (totalEstimatedBytes / 1024).toFixed(1),
        totalMB: (totalEstimatedBytes / 1024 / 1024).toFixed(2),
        modulos
    };
}

function optimizarMemoriaRam(forzar = false, motivo = 'manual') {
    const ahora = Date.now();
    if (!forzar && ahora - lastAutoCleanupAt < 45_000) {
        return {
            ejecutado: false,
            entradasLiberadas: 0,
            mbLiberados: 0,
            kbCachesLiberados: 0,
            desglosePorSubsistema: [],
            estadoActual: leerEstadoRecursos()
        };
    }

    const antes = process.memoryUsage();
    const antesRss = antes.rss / 1024 / 1024;
    const antesHeap = antes.heapUsed / 1024 / 1024;
    const antesNativo = ((antes.external || 0) + (antes.arrayBuffers || 0)) / 1024 / 1024;

    let entradasLiberadas = 0;
    let bytesEstimadosLiberados = 0;
    const desglosePorSubsistema = [];

    for (const p of cachePurgers) {
        try {
            const res = p.fn(forzar, false);
            if (typeof res === 'number' && res > 0) {
                entradasLiberadas += res;
                bytesEstimadosLiberados += res * 1536;
                desglosePorSubsistema.push({ label: p.name, count: res });
            } else if (res && typeof res === 'object') {
                const count = Number(res.purged ?? res.count ?? 0);
                const bytes = Number(res.bytes || count * 1536);
                if (count > 0) {
                    entradasLiberadas += count;
                    bytesEstimadosLiberados += bytes;
                    desglosePorSubsistema.push({ label: res.label || p.name, count });
                }
            }
        } catch {
            // Silencioso
        }
    }

    const purgedHttp = purgeHttpCache(forzar);
    if (purgedHttp > 0) {
        entradasLiberadas += purgedHttp;
        bytesEstimadosLiberados += purgedHttp * 2048;
        desglosePorSubsistema.push({ label: 'Caché HTTP Anti-429', count: purgedHttp });
    }

    if (typeof global.gc === 'function') {
        try {
            global.gc();
        } catch {
            // Ignorar si Node no se inició con --expose-gc
        }
    }

    const despues = process.memoryUsage();
    const despuesRss = despues.rss / 1024 / 1024;
    const despuesHeap = despues.heapUsed / 1024 / 1024;
    const despuesNativo = ((despues.external || 0) + (despues.arrayBuffers || 0)) / 1024 / 1024;

    const deltaRss = Math.max(0, antesRss - despuesRss);
    const deltaHeap = Math.max(0, antesHeap - despuesHeap);
    const deltaNativo = Math.max(0, antesNativo - despuesNativo);
    const kbCachesLiberados = Number((bytesEstimadosLiberados / 1024).toFixed(1));
    const mbLiberados = Number(
        Math.max(deltaRss, deltaHeap + deltaNativo, bytesEstimadosLiberados / 1024 / 1024).toFixed(2)
    );

    if (!forzar) {
        lastAutoCleanupAt = ahora;
        stats.autoCleanups++;
    } else {
        stats.manualCleanups++;
    }

    stats.ramCleanups++;
    stats.lastCleanupAt = new Date().toISOString();
    stats.lastFreedMB = mbLiberados;
    stats.lastPurgedItems = entradasLiberadas;
    stats.lastTriggerReason = motivo === 'arranque'
        ? 'Diagnóstico de arranque'
        : motivo === 'manual_propietario'
            ? 'Purga directa ejecutada por el Propietario en /config'
            : 'Auto-purga preventiva por presión real de memoria';

    return {
        ejecutado: true,
        entradasLiberadas,
        mbLiberados,
        kbCachesLiberados,
        deltaHeapMB: Number(deltaHeap.toFixed(2)),
        deltaNativoMB: Number(deltaNativo.toFixed(2)),
        desglosePorSubsistema,
        antesRss: Number(antesRss.toFixed(1)),
        despuesRss: Number(despuesRss.toFixed(1)),
        antesHeap: Number(antesHeap.toFixed(1)),
        despuesHeap: Number(despuesHeap.toFixed(1)),
        estadoActual: leerEstadoRecursos()
    };
}

function ejecutarDiagnosticoArranqueYCalibracion() {
    const estadoInicial = leerEstadoRecursos();
    let limpiezaRealizada = false;

    if (estadoInicial.faltaMemoriaReal) {
        optimizarMemoriaRam(false, 'arranque');
        limpiezaRealizada = true;
    }

    const estadoFinal = leerEstadoRecursos();
    const subsistemas = inspeccionarSubsistemasMemoria();

    return {
        limpiezaRealizada,
        rssMB: estadoFinal.rssMB.toFixed(1),
        heapUsadoMB: estadoFinal.heapUsadoMB.toFixed(1),
        nativoCanvasMB: estadoFinal.nativoCanvasMB.toFixed(1),
        hostUsadaMB: estadoFinal.hostUsadaMB.toFixed(1),
        hostLimiteMB: estadoFinal.hostLimiteMB.toFixed(1),
        pctHost: estadoFinal.pctHost.toFixed(1),
        etiquetaModo: estadoFinal.etiquetaModo,
        modoMotor: estadoFinal.limites.nombreModo,
        subsistemasActivos: subsistemas.modulos.length
    };
}

function adquirirSlotRecurso(esPesadoGpu = false) {
    const estado = leerEstadoRecursos();

    if (estado.faltaMemoriaReal && estado.nivel === 'critico') {
        optimizarMemoriaRam(false, 'falta_memoria');
    }

    const maxPermitido = esPesadoGpu ? estado.limites.maxGpu : estado.limites.maxGeneral;
    const activosActuales = esPesadoGpu ? activeGpuOps : activeGeneralOps;
    const cola = esPesadoGpu ? gpuQueue : generalQueue;

    if (activosActuales < maxPermitido) {
        if (esPesadoGpu) activeGpuOps++;
        else activeGeneralOps++;
        return Promise.resolve({ queued: false, position: 0 });
    }

    stats.totalQueued++;
    const position = cola.length + 1;

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            const idx = cola.findIndex(item => item.resolve === resolve);
            if (idx !== -1) cola.splice(idx, 1);
            if (esPesadoGpu) activeGpuOps++;
            else activeGeneralOps++;
            resolve({ queued: true, position, timedOutWait: true });
        }, 12_000);

        cola.push({
            resolve: (info) => {
                clearTimeout(timer);
                resolve(info);
            }
        });
    });
}

function liberarSlotRecurso(esPesadoGpu = false) {
    const cola = esPesadoGpu ? gpuQueue : generalQueue;
    if (cola.length > 0) {
        const siguiente = cola.shift();
        siguiente.resolve({ queued: true, position: 0 });
        return;
    }

    if (esPesadoGpu) {
        activeGpuOps = Math.max(0, activeGpuOps - 1);
    } else {
        activeGeneralOps = Math.max(0, activeGeneralOps - 1);
    }
}

function construirPanelAvisoModeracion({ titulo, descripcion, backButtonId = null, includeBackButton = false }) {
    const container = new ContainerBuilder()
        .setAccentColor(COLORES.alerta)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# ${titulo}\n${descripcion}`
        ));

    if (includeBackButton && backButtonId) {
        container
            .addSeparatorComponents(separador(true))
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    boton(backButtonId, 'Volver', '↩️', ButtonStyle.Secondary)
                )
            );
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Kortex')
    ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

/**
 * Determina si una interacción genera un renderizado gráfico nativo (@napi-rs/canvas) o paquete .ZIP 3D
 * para regularlo con el semáforo de concurrencia GPU/Canvas (máx 2 renders simultáneos en modo Auto).
 */
function esOperacionPesadaCanvas(customId = '') {
    return (
        customId.startsWith('tycoon_') ||
        customId.startsWith('btn_status_') ||
        customId.startsWith('modal_status_') ||
        customId.startsWith('btn_ava_sandbox') ||
        customId.startsWith('modal_ava_sandbox') ||
        customId.startsWith('btn_ava_mannequin') ||
        customId.startsWith('modal_ava_mannequin') ||
        customId.startsWith('btn_ava_export3d') ||
        customId.startsWith('modal_ava_export3d') ||
        customId.startsWith('btn_econ_floors') ||
        customId.startsWith('btn_chart_')
    );
}

function esInteraccionNavegacionRapida(customId = '') {
    return (
        customId === 'roblox_category_select' ||
        customId === 'help_category_select' ||
        customId === 'help_roblox_subcat_select' ||
        customId === 'config_category_select' ||
        customId === 'welcome_tour_select' ||
        customId.startsWith('btn_welcome_open_') ||
        customId === 'btn_nav_main_menu' ||
        customId.startsWith('btn_owner_') ||
        customId === 'select_owner_mechanic'
    );
}

/**
 * Ejecuta la purga directa de caché y buffers sin esperas artificiales ni ediciones intermedias.
 */
async function ejecutarSecuenciaOptimizacionEnVivo() {
    return optimizarMemoriaRam(true, 'manual_propietario');
}

/**
 * Construye un aviso compacto únicamente cuando el bot tiene los slots de render llenos
 * y la petición espera turno real en el semáforo de concurrencia.
 */
function construirPanelColaConcurrencia({ posicionCola = 1, elapsedMs = 0 }) {
    const segs = (elapsedMs / 1000).toFixed(1);
    const estadoRecursos = leerEstadoRecursos();
    const container = new ContainerBuilder()
        .setAccentColor(COLORES.alerta)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ⏳ En Cola de Concurrencia (#${posicionCola})\n` +
            `El motor gráfico está procesando renders de otros usuarios. Tu solicitud se ejecutará en unos instantes (\`${segs}s\`).\n` +
            `-# ${estadoRecursos.etiquetaModo} • RAM Proceso: \`${estadoRecursos.rssMB.toFixed(1)} MB\``
        ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

/**
 * Envuelve una interacción de Discord con protección real de concurrencia y RAM:
 * 1. Sin pantallas de 4 filas ni múltiples editReply intermedios (0 sobrecarga de memoria y 1 sola llamada a Discord API).
 * 2. Escudo Anti-Spam por usuario: evita que un mismo usuario dispare múltiples renders pesados en paralelo.
 * 3. Semáforo de concurrencia GPU/Canvas y API para mantener la RAM estable bajo tráfico intenso.
 */
async function ejecutarInteraccionConOptimizacionYProgreso(interaction, handlerFn) {
    const cid = interaction.customId || '';
    const userId = interaction.user?.id || 'anon';

    const abreModalDirecto =
        (interaction.isButton?.() &&
            cid.endsWith('_modal') &&
            cid !== 'btn_fastlink_modal') ||
        (cid === 'select_owner_mechanic' && interaction.values?.[0] === 'owner_config_roblox_bot');

    if (abreModalDirecto || esInteraccionNavegacionRapida(cid)) {
        return await handlerFn();
    }

    const startTime = Date.now();
    const esPesadoGpu = esOperacionPesadaCanvas(cid);

    // 1. Escudo Anti-Spam por Usuario: si el mismo usuario ya tiene una operación activa hace menos de 6 segundos,
    // evitar que apile renders duplicados en RAM al hacer clic repetidamente.
    const prevOp = activeUserOperations.get(userId);
    if (prevOp && (startTime - prevOp.startedAt) < 6000 && prevOp.esPesadoGpu && esPesadoGpu) {
        stats.totalSpamBlocked++;
        if (typeof interaction.deferUpdate === 'function' && !interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => null);
        }
        return;
    }

    // 2. Auto-purga preventiva únicamente si el contenedor realmente supera el umbral de memoria (86%)
    const estadoInicial = leerEstadoRecursos();
    if (esPesadoGpu && estadoInicial.faltaMemoriaReal) {
        optimizarMemoriaRam(estadoInicial.nivel === 'critico', 'falta_memoria');
    }

    let slotAcquired = false;
    let queueNoticeTimer = null;

    const originalDeferUpdate = interaction.deferUpdate ? interaction.deferUpdate.bind(interaction) : null;

    if (originalDeferUpdate) {
        interaction.deferUpdate = async (...args) => {
            const res = await originalDeferUpdate(...args);

            // Solo si el semáforo de concurrencia demora > 1.2s por tráfico real simultáneo, avisar que está en cola
            if (botOwnerConfig.dynamicLoadingEnabled) {
                queueNoticeTimer = setTimeout(async () => {
                    if (!slotAcquired) {
                        const panelCola = construirPanelColaConcurrencia({
                            posicionCola: Math.max(1, esPesadoGpu ? gpuQueue.length : generalQueue.length),
                            elapsedMs: Date.now() - startTime
                        });
                        await interaction.editReply(panelCola).catch(() => null);
                    }
                }, 1200);
            }

            await adquirirSlotRecurso(esPesadoGpu);
            slotAcquired = true;
            if (queueNoticeTimer) {
                clearTimeout(queueNoticeTimer);
                queueNoticeTimer = null;
            }

            return res;
        };
    }

    activeUserOperations.set(userId, { cid, esPesadoGpu, startedAt: startTime });

    try {
        await handlerFn();
        stats.totalProcessed++;
    } finally {
        if (queueNoticeTimer) {
            clearTimeout(queueNoticeTimer);
            queueNoticeTimer = null;
        }
        activeUserOperations.delete(userId);
        if (slotAcquired) {
            liberarSlotRecurso(esPesadoGpu);
            slotAcquired = false;
        }
    }
}

module.exports = {
    leerEstadoRecursos,
    inspeccionarSubsistemasMemoria,
    optimizarMemoriaRam,
    ejecutarDiagnosticoArranqueYCalibracion,
    ejecutarSecuenciaOptimizacionEnVivo,
    registerCachePurger,
    obtenerConfigPropietario,
    guardarConfigPropietario,
    restaurarConfigPropietarioPorDefecto,
    aplicarPresenciaBotDiscord,
    esPropietarioDelBot,
    construirPanelAvisoModeracion,
    construirPanelCargaPasoAPaso: construirPanelColaConcurrencia,
    ejecutarInteraccionConOptimizacionYProgreso
};
