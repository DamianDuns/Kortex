// ==========================================
// ARCHIVO: src/utils/performanceManager.js
// Motor Calibrado de Optimización de RAM / GPU (Canvas/3D),
// Arranque Inteligente, Diagnóstico Transparente de Subsistemas,
// Control Exclusivo del Propietario y Sistema Dinámico de Procedimientos
// por Filas (Fila 1 a Fila 4) + Panel de Carga Lateral + Terminal en Vivo
// ==========================================

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const { COLORES, footer, separador } = require('../../utils/ui');
const {
    purgeHttpCache,
    getHttpCacheStats,
    setHttpEngineFlags
} = require('../../utils/http');

const DATA_DIR = path.join(__dirname, '../../data');
const OWNER_CONFIG_FILE = path.join(DATA_DIR, 'bot_owner_config.json');

// Configuración persistente controlada exclusivamente por el propietario del bot desde /config
// (Sin interruptores innecesarios de desactivar categorías principales; enfocado 100% en mecánicas reales del motor)
const defaultOwnerConfig = {
    engineMode: 'auto', // 'auto' | 'ahorro' | 'maximo'
    dynamicLoadingEnabled: true,
    backgroundMonitorsEnabled: true,
    heavyCanvas3DEnabled: true,
    smartApiCacheEnabled: true,
    autoFailoverShieldEnabled: true,
    maintenanceMode: false,
    registeredOwnerId: null,
    bootTimestamp: new Date().toISOString(),
    updatedAt: null
};

let botOwnerConfig = { ...defaultOwnerConfig };

function sincronizarFlagsMotorHttp() {
    setHttpEngineFlags({
        smartCache: Boolean(botOwnerConfig.smartApiCacheEnabled),
        failoverShield: Boolean(botOwnerConfig.autoFailoverShieldEnabled)
    });
}

function cargarConfigPropietario() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (fs.existsSync(OWNER_CONFIG_FILE)) {
            const raw = fs.readFileSync(OWNER_CONFIG_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                botOwnerConfig = {
                    ...defaultOwnerConfig,
                    ...parsed,
                    bootTimestamp: defaultOwnerConfig.bootTimestamp
                };
            }
        }
    } catch {
        // Silencioso
    }
    sincronizarFlagsMotorHttp();
}

function guardarConfigPropietario(partial = {}) {
    try {
        botOwnerConfig = {
            ...botOwnerConfig,
            ...partial,
            updatedAt: new Date().toISOString()
        };
        sincronizarFlagsMotorHttp();
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(OWNER_CONFIG_FILE, JSON.stringify(botOwnerConfig, null, 2), 'utf8');
    } catch {
        // Silencioso
    }
    return botOwnerConfig;
}

cargarConfigPropietario();

function obtenerConfigPropietario() {
    return { ...botOwnerConfig };
}

// Caché en memoria de los IDs de propietario de la aplicación de Discord
const cachedAppOwnerIds = new Set();
let appOwnerFetched = false;

/**
 * Verifica si un usuario de Discord es el propietario del bot.
 */
async function esPropietarioDelBot(userId, client = null) {
    if (!userId) return false;
    const uid = String(userId).trim();

    // 1. Revisar variables de entorno si están definidas
    const envRaw = [process.env.BOT_OWNER_ID, process.env.OWNER_ID]
        .filter(Boolean)
        .join(',');

    if (envRaw.trim()) {
        const envIds = envRaw
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        return envIds.includes(uid);
    }

    // 2. Revisar caché de propietarios de la aplicación de Discord
    if (cachedAppOwnerIds.has(uid)) return true;

    // 3. Consultar el propietario oficial de la aplicación en Discord API
    if (client && client.application) {
        try {
            if (!appOwnerFetched || !client.application.owner) {
                await client.application.fetch();
                appOwnerFetched = true;
            }
            const owner = client.application.owner;
            if (owner) {
                if (owner.id) {
                    cachedAppOwnerIds.add(String(owner.id));
                }
                if (owner.members && typeof owner.members.forEach === 'function') {
                    owner.members.forEach((member) => {
                        const memberId = member.id || member.user?.id;
                        if (memberId) cachedAppOwnerIds.add(String(memberId));
                    });
                }
            }
            if (cachedAppOwnerIds.size > 0) {
                return cachedAppOwnerIds.has(uid);
            }
        } catch {
            // Ignorar error de red puntual
        }
    }

    // 4. Respaldo persistente si no se pudo consultar client.application.owner
    if (botOwnerConfig.registeredOwnerId) {
        return String(botOwnerConfig.registeredOwnerId) === uid;
    }

    guardarConfigPropietario({ registeredOwnerId: uid });
    return true;
}

/**
 * Obtiene los límites de concurrencia actuales según el modo del motor elegido por el propietario.
 */
function obtenerLimitesMotor() {
    const modo = botOwnerConfig.engineMode || 'auto';
    if (modo === 'ahorro') {
        return {
            maxGpu: 1,
            maxApi: 3,
            nombreModo: '🍃 Ahorro Estricto de RAM/GPU',
            descripcionModo: '1 render gráfico a la vez y liberación inmediata de buffers tras cada imagen'
        };
    }
    if (modo === 'maximo') {
        return {
            maxGpu: 4,
            maxApi: 10,
            nombreModo: '🚀 Alto Rendimiento',
            descripcionModo: 'Hasta 4 renders gráficos y 10 consultas simultáneas con caché extendida'
        };
    }
    return {
        maxGpu: 2,
        maxApi: 6,
        nombreModo: '🤖 Automático Calibrado',
        descripcionModo: 'En reposo durante uso individual; solo interviene si falta RAM real o hay saturación'
    };
}

let activeGpuTasks = 0;
let activeApiTasks = 0;
const gpuQueue = [];
const apiQueue = [];

// Registro de tareas activas por usuario
const activeUserOperations = new Map();

// Subsistemas de caché en RAM registrados para diagnóstico transparente y limpieza selectiva
const cachePurgers = [];

// Estadísticas operativas del motor de optimización y arranque
const stats = {
    bootTimeMs: Date.now(),
    bootCalibrated: true,
    totalProcessed: 0,
    totalQueued: 0,
    autoPurgesTriggered: 0,
    lastPurgeAt: null,
    lastFreedNote: 'En reposo (sin purgas necesarias aún)',
    lastPurgeBreakdown: [],
    lastTerminalLogs: [
        '[ARRANQUE] > Motor Kortex iniciado y calibrado (Fuentes TTF, Caché HTTP y Sesiones listas)',
        '[MOTOR]    > Calibración activa: Uso individual detectado (sin sobrecarga)',
        '[MEMORIA]  > Vigilante en espera pasiva (solo actúa ante falta real de RAM o petición manual)'
    ]
};

/**
 * Permite a cualquier módulo registrar su caché temporal en RAM junto con un inspector transparente.
 * @param {string} name Identificador del módulo
 * @param {(aggressive: boolean) => number} purgeFn Función que limpia la caché temporal y devuelve la cantidad de elementos liberados
 * @param {object} meta Metadatos opcionales: { label, whatItCleans, inspectFn: () => ({ entries, approxKB, detail }) }
 */
function registerCachePurger(name, purgeFn, meta = {}) {
    if (typeof purgeFn !== 'function') return;
    const existingIdx = cachePurgers.findIndex(p => p.name === name);
    const record = {
        name,
        label: meta.label || name,
        whatItCleans: meta.whatItCleans || 'Caché temporal de consultas en memoria',
        purgeFn,
        inspectFn: typeof meta.inspectFn === 'function' ? meta.inspectFn : null
    };
    if (existingIdx >= 0) {
        cachePurgers[existingIdx] = record;
    } else {
        cachePurgers.push(record);
    }
}

// Registrar de base la Caché HTTP Anti-429 de Roblox API
registerCachePurger(
    'httpClient',
    (aggressive) => purgeHttpCache(aggressive),
    {
        label: '🌐 Caché HTTP de Roblox API',
        whatItCleans: 'Respuestas GET temporales de catálogo, miniaturas y metadatos de Roblox',
        inspectFn: () => {
            const st = getHttpCacheStats();
            return {
                entries: st.entries,
                approxKB: st.approxKB,
                detail: `${st.entries}/${st.maxEntries} respuestas en caché (~${st.approxKB} KB) • ${st.cacheHits} aciertos rápidos`
            };
        }
    }
);

/**
 * Inspecciona en tiempo real qué hay almacenado en cada caché temporal del bot
 * para que el propietario vea exactamente qué limpiaría el botón de Purgar Memoria.
 */
function inspeccionarSubsistemasMemoria() {
    const subsistemas = [];
    let totalEntries = 0;
    let totalApproxKB = 0;

    for (const item of cachePurgers) {
        let info = { entries: 0, approxKB: 0, detail: '0 elementos temporales' };
        if (item.inspectFn) {
            try {
                const res = item.inspectFn() || {};
                info = {
                    entries: Number(res.entries || 0),
                    approxKB: Number(res.approxKB || 0),
                    detail: res.detail || `${Number(res.entries || 0)} elemento(s)`
                };
            } catch {
                // Silencioso
            }
        }
        totalEntries += info.entries;
        totalApproxKB += info.approxKB;
        subsistemas.push({
            name: item.name,
            label: item.label,
            whatItCleans: item.whatItCleans,
            entries: info.entries,
            approxKB: info.approxKB,
            detail: info.detail
        });
    }

    const httpSt = getHttpCacheStats();

    return {
        subsistemas,
        totalEntries,
        totalApproxKB,
        httpStats: httpSt
    };
}

/**
 * Lee la memoria real disponible en Linux (/proc/meminfo o cgroup v1/v2 descontando caché de disco)
 * para no confundir la caché de archivos del sistema operativo con falta de memoria del bot.
 */
function leerMemoriaHostCalibrada(osTotalBytes, fallbackRssBytes) {
    let hostUsadaBytes = null;
    let hostLimiteBytes = null;

    try {
        if (fs.existsSync('/sys/fs/cgroup/memory.current')) {
            const rawUsed = Number(fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim());
            let inactiveFileBytes = 0;
            if (fs.existsSync('/sys/fs/cgroup/memory.stat')) {
                const statContent = fs.readFileSync('/sys/fs/cgroup/memory.stat', 'utf8');
                const matchInactive = statContent.match(/^inactive_file\s+(\d+)/m);
                if (matchInactive) inactiveFileBytes = Number(matchInactive[1]) || 0;
            }
            if (Number.isFinite(rawUsed) && rawUsed > 0) {
                hostUsadaBytes = Math.max(fallbackRssBytes, rawUsed - inactiveFileBytes);
            }

            if (fs.existsSync('/sys/fs/cgroup/memory.max')) {
                const rawMax = Number(fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim());
                if (Number.isFinite(rawMax) && rawMax > 0 && rawMax <= osTotalBytes) {
                    hostLimiteBytes = rawMax;
                }
            }
        } else if (fs.existsSync('/sys/fs/cgroup/memory/memory.usage_in_bytes')) {
            const rawUsed = Number(fs.readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8').trim());
            let totalCacheBytes = 0;
            if (fs.existsSync('/sys/fs/cgroup/memory/memory.stat')) {
                const statContent = fs.readFileSync('/sys/fs/cgroup/memory/memory.stat', 'utf8');
                const matchCache = statContent.match(/^total_inactive_file\s+(\d+)/m) || statContent.match(/^cache\s+(\d+)/m);
                if (matchCache) totalCacheBytes = Number(matchCache[1]) || 0;
            }
            if (Number.isFinite(rawUsed) && rawUsed > 0) {
                hostUsadaBytes = Math.max(fallbackRssBytes, rawUsed - totalCacheBytes);
            }

            if (fs.existsSync('/sys/fs/cgroup/memory/memory.limit_in_bytes')) {
                const rawLimit = Number(fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim());
                if (Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= osTotalBytes) {
                    hostLimiteBytes = rawLimit;
                }
            }
        }
    } catch {
        // Ignorar si no hay cgroups accesibles
    }

    if (!hostLimiteBytes && osTotalBytes > 0) {
        hostLimiteBytes = osTotalBytes;
        try {
            if (fs.existsSync('/proc/meminfo')) {
                const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
                const mTotal = meminfo.match(/^MemTotal:\s+(\d+)\s+kB/m);
                const mAvail = meminfo.match(/^MemAvailable:\s+(\d+)\s+kB/m);
                if (mTotal && mAvail) {
                    const totalBytes = Number(mTotal[1]) * 1024;
                    const availBytes = Number(mAvail[1]) * 1024;
                    if (totalBytes > 0 && availBytes >= 0 && availBytes <= totalBytes) {
                        hostLimiteBytes = totalBytes;
                        hostUsadaBytes = Math.max(fallbackRssBytes, totalBytes - availBytes);
                    }
                }
            }
        } catch {
            // Fallback
        }
    }

    if (!hostUsadaBytes) {
        const osUsedBytes = Math.max(0, osTotalBytes - os.freemem());
        hostUsadaBytes = osUsedBytes > 0 ? osUsedBytes : fallbackRssBytes;
    }

    if (!hostLimiteBytes) {
        hostLimiteBytes = osTotalBytes > 0 ? osTotalBytes : 2048 * 1024 * 1024;
    }

    return { hostUsadaBytes, hostLimiteBytes };
}

/**
 * Lee el estado actual de RAM del proceso Node.js, buffers nativos (Canvas/GPU), cachés por subsistema y contenedor/host.
 */
function leerEstadoRecursos() {
    const mem = process.memoryUsage();
    const aMB = (bytes) => Number((bytes / 1024 / 1024).toFixed(1));

    const rssMB = aMB(mem.rss);
    const heapUsadoMB = aMB(mem.heapUsed);
    const heapTotalMB = aMB(mem.heapTotal);
    const nativoCanvasMB = aMB((mem.external || 0) + (mem.arrayBuffers || 0));

    const osTotalBytes = os.totalmem();
    const { hostUsadaBytes, hostLimiteBytes } = leerMemoriaHostCalibrada(osTotalBytes, mem.rss);

    const hostUsadaMB = aMB(hostUsadaBytes);
    const hostLimiteMB = hostLimiteBytes ? aMB(hostLimiteBytes) : 2048;
    const hostLibreMB = Math.max(0, Number((hostLimiteMB - hostUsadaMB).toFixed(1)));
    const pctHost = hostLimiteBytes
        ? Number(Math.min(100, (hostUsadaBytes / hostLimiteBytes) * 100).toFixed(1))
        : 0;

    const limites = obtenerLimitesMotor();
    const usuariosActivos = activeUserOperations.size;
    const esUsoIndividual = usuariosActivos <= 1 && gpuQueue.length === 0 && apiQueue.length === 0;

    const faltaMemoriaCritica =
        rssMB >= 850 ||
        nativoCanvasMB >= 260 ||
        (pctHost >= 92 && hostLibreMB <= 140);

    const faltaMemoriaModerada =
        rssMB >= 620 ||
        nativoCanvasMB >= 175 ||
        (pctHost >= 86 && hostLibreMB <= 240);

    const saturacionCola =
        gpuQueue.length >= 2 ||
        apiQueue.length >= 4 ||
        usuariosActivos >= 4;

    let nivel = 'optimo'; // 'optimo' | 'moderado' | 'critico'
    let etiquetaModo = esUsoIndividual
        ? '🟢 Estable (Uso Individual Calibrado — En Reposo)'
        : '🟢 Rendimiento Óptimo';

    if (faltaMemoriaCritica || gpuQueue.length >= 4) {
        nivel = 'critico';
        etiquetaModo = faltaMemoriaCritica
            ? '🔴 Falta Real de RAM Detectada (Auto-Limpieza Activa)'
            : '🔴 Alta Demanda Simultánea (Cola Anti-Saturación Activa)';
    } else if (faltaMemoriaModerada || saturacionCola) {
        nivel = 'moderado';
        etiquetaModo = faltaMemoriaModerada
            ? '🟡 Memoria Elevada en Proceso (Optimización Preventiva)'
            : '🟡 Tráfico Multiusuario Activo (Balanceando Carga)';
    }

    const inspeccion = inspeccionarSubsistemasMemoria();
    const uptimeSeconds = Math.max(1, Math.floor((Date.now() - stats.bootTimeMs) / 1000));

    return {
        rssMB,
        heapUsadoMB,
        heapTotalMB,
        nativoCanvasMB,
        hostUsadaMB,
        hostLimiteMB,
        hostLibreMB,
        pctHost,
        nivel,
        etiquetaModo,
        esUsoIndividual,
        faltaMemoriaReal: faltaMemoriaCritica || faltaMemoriaModerada,
        saturacionCola,
        limites,
        activeGpuTasks,
        queuedGpuTasks: gpuQueue.length,
        activeApiTasks,
        queuedApiTasks: apiQueue.length,
        activeUsers: usuariosActivos,
        uptimeSeconds,
        inspeccion,
        stats
    };
}

/**
 * Ejecuta una limpieza transparente y real de cachés temporales en RAM y buffers nativos (Canvas/ArrayBuffers),
 * informando exactamente qué subsistemas tenían datos temporales y cuánto se liberó.
 * NUNCA toca cuentas vinculadas, sesiones OAuth2 ni listas de monitoreo de los usuarios.
 */
function optimizarMemoriaRam(aggressive = false, reason = 'manual') {
    const antes = leerEstadoRecursos();
    const inspeccionAntes = antes.inspeccion;

    let entradasLiberadas = 0;
    const desglosePorSubsistema = [];

    for (const item of cachePurgers) {
        try {
            let kbAntes = 0;
            if (item.inspectFn) {
                try {
                    kbAntes = Number(item.inspectFn()?.approxKB || 0);
                } catch {
                    kbAntes = 0;
                }
            }
            const count = Number(item.purgeFn(aggressive)) || 0;
            entradasLiberadas += count;
            if (count > 0) {
                desglosePorSubsistema.push({
                    label: item.label,
                    count,
                    kbFreed: kbAntes
                });
            }
        } catch {
            // Silencioso
        }
    }

    if (typeof global.gc === 'function') {
        try {
            global.gc();
        } catch {
            // Silencioso
        }
    }

    const despues = leerEstadoRecursos();
    const diffMB = Math.max(0, Number((antes.rssMB - despues.rssMB).toFixed(1)));
    const diffCanvasMB = Math.max(0, Number((antes.nativoCanvasMB - despues.nativoCanvasMB).toFixed(1)));
    const kbCachesLiberados = Math.max(0, (inspeccionAntes?.totalApproxKB || 0) - (despues.inspeccion?.totalApproxKB || 0));

    const resumenModulos = desglosePorSubsistema.length > 0
        ? desglosePorSubsistema.map(d => `${d.label.replace(/^[^\wÁÉÍÓÚÑáéíóúñ]+\s*/, '')}: ${d.count}`).join(' • ')
        : 'Cachés ya estaban limpias (0 residuos acumulados)';

    stats.autoPurgesTriggered += 1;
    stats.lastPurgeAt = Math.floor(Date.now() / 1000);
    stats.lastPurgeBreakdown = desglosePorSubsistema;
    stats.lastFreedNote = entradasLiberadas > 0
        ? `${entradasLiberadas} temporales eliminados (~${kbCachesLiberados} KB en cachés${diffMB > 0 ? ` / -${diffMB} MB RSS` : ''})`
        : `Memoria limpia verificada (${despues.rssMB} MB RSS)`;

    stats.lastTerminalLogs = [
        `[FILA-01] > Escaneo RAM: RSS ${antes.rssMB} MB | Heap JS ${antes.heapUsadoMB} MB | Buffers Canvas ${antes.nativoCanvasMB} MB`,
        `[FILA-02] > Purga (${reason}): ${entradasLiberadas} objeto(s) temporales descartados (${resumenModulos})`,
        `[FILA-03] > Buffers gráficos: -${diffCanvasMB} MB en ArrayBuffers | Sesiones y cuentas: 100% PROTEGIDAS`,
        `[FILA-04] > Finalizado: Proceso estable en ${despues.rssMB} MB (${despues.etiquetaModo})`
    ];

    return {
        antes,
        despues,
        entradasLiberadas,
        kbCachesLiberados,
        desglosePorSubsistema,
        diffMB,
        diffCanvasMB,
        logs: stats.lastTerminalLogs
    };
}

/**
 * Ejecuta una calibración y diagnóstico integral del sistema (usado al arrancar el bot y desde el botón del Propietario).
 */
function ejecutarDiagnosticoArranqueYCalibracion() {
    sincronizarFlagsMotorHttp();
    // Limpieza no agresiva: solo purga tokens vencidos y respuestas HTTP caducadas sin borrar cachés útiles en uso
    const resultadoLimpiezaSuave = optimizarMemoriaRam(false, 'calibracion_sistema');
    const estado = leerEstadoRecursos();

    stats.bootCalibrated = true;
    stats.lastTerminalLogs = [
        `[ARRANQUE] > Flags HTTP sincronizados: Caché Anti-429=${botOwnerConfig.smartApiCacheEnabled ? 'ON' : 'OFF'} | Failover RoProxy=${botOwnerConfig.autoFailoverShieldEnabled ? 'ON' : 'OFF'}`,
        `[MEMORIA]  > Subsistemas registrados: ${cachePurgers.length} (${estado.inspeccion.totalEntries} objetos activos en RAM temporal)`,
        `[LIMPIEZA] > Barrido de residuos vencidos: ${resultadoLimpiezaSuave.entradasLiberadas} expirados eliminados`,
        `[ESTADO]   > Motor listo en modo ${botOwnerConfig.engineMode.toUpperCase()} (${estado.rssMB} MB RSS • Libre Host: ${estado.hostLibreMB} MB)`
    ];

    return {
        estado,
        purgadosExpirados: resultadoLimpiezaSuave.entradasLiberadas,
        subsistemasActivos: cachePurgers.length
    };
}

// Vigilante calibrado cada 90 segundos:
// NUNCA se dispara por sí solo cuando el usuario está usando el bot normalmente sin falta de memoria.
// Únicamente actúa si se detecta falta real de memoria (nivel === 'critico' o faltaMemoriaReal === true).
setInterval(() => {
    const estado = leerEstadoRecursos();
    if (estado.faltaMemoriaReal) {
        optimizarMemoriaRam(estado.nivel === 'critico', 'falta_memoria');
    } else if (botOwnerConfig.engineMode === 'ahorro' && (estado.nativoCanvasMB >= 120 || estado.rssMB >= 500)) {
        optimizarMemoriaRam(false, 'ahorro');
    }
}, 90000).unref?.();

/**
 * Cola con semáforo para controlar tareas pesadas de GPU/Canvas o APIs y evitar caídas por sobrecarga.
 */
function adquirirSlotRecurso(esPesadoGpu = false) {
    const { maxGpu, maxApi } = obtenerLimitesMotor();
    return new Promise((resolve) => {
        if (esPesadoGpu) {
            if (activeGpuTasks < maxGpu) {
                activeGpuTasks++;
                return resolve({ queued: false, position: 0 });
            }
            stats.totalQueued++;
            const position = gpuQueue.length + 1;
            gpuQueue.push(() => {
                activeGpuTasks++;
                resolve({ queued: true, position });
            });
        } else {
            if (activeApiTasks < maxApi) {
                activeApiTasks++;
                return resolve({ queued: false, position: 0 });
            }
            stats.totalQueued++;
            const position = apiQueue.length + 1;
            apiQueue.push(() => {
                activeApiTasks++;
                resolve({ queued: true, position });
            });
        }
    });
}

function liberarSlotRecurso(esPesadoGpu = false) {
    if (esPesadoGpu) {
        activeGpuTasks = Math.max(0, activeGpuTasks - 1);
        if (botOwnerConfig.engineMode === 'ahorro') {
            const est = leerEstadoRecursos();
            if (est.nativoCanvasMB >= 110 || est.faltaMemoriaReal) {
                optimizarMemoriaRam(false, 'ahorro');
            }
        }
        if (gpuQueue.length > 0) {
            const next = gpuQueue.shift();
            if (next) next();
        }
    } else {
        activeApiTasks = Math.max(0, activeApiTasks - 1);
        if (apiQueue.length > 0) {
            const next = apiQueue.shift();
            if (next) next();
        }
    }
}

/**
 * Construye un aviso limpio (Components v2) cuando el propietario activó el Modo Mantenimiento
 * o pausó temporalmente un subsistema técnico del bot.
 */
function construirPanelAvisoModeracion({ titulo, descripcion, pie = 'Configuración general administrada por el propietario del bot' }) {
    const container = new ContainerBuilder()
        .setAccentColor(COLORES.alerta)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ${titulo}\n${descripcion}`
        ))
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(pie)));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

/**
 * Determina si una interacción es simplemente un cambio de menú/navegación rápida
 * que NO debe mostrar el panel de procedimientos salvo que exista espera real en cola.
 */
function esInteraccionNavegacionRapida(customId = '') {
    const cid = String(customId);
    if (!cid) return true;
    const prefijosRapidos = [
        'roblox_category_select',
        'help_category_select',
        'help_roblox_subcat_select',
        'config_category_select',
        'select_owner_mechanic',
        'btn_owner_cycle_engine',
        'btn_owner_toggle_maintenance',
        'btn_owner_boot_diag',
        'btn_owner_refresh',
        'btn_ping_refresh',
        'btn_config_refresh',
        'btn_fastlink_modal',
        'btn_fastlink_refresh',
        'btn_nav_main_menu',
        'btn_quick_calc',
        'btn_nav_calc',
        'btn_ava_textures',
        'btn_ava_clones'
    ];
    return prefijosRapidos.includes(cid);
}

/**
 * Catálogo de planes de 4 filas (Fila 1, Fila 2, Fila 3, Fila 4) + comandos de terminal
 * para el Sistema de Optimización y Ejecución de Procedimientos.
 */
function resolverPlanDeCarga(customId = '') {
    const cid = String(customId);

    if (cid === 'btn_owner_optimize_ram') {
        return {
            titulo: '🧹 Purga de Caché Temporal y Buffers Gráficos',
            esPesadoGpu: false,
            filas: [
                {
                    titulo: 'Auditoría de Subsistemas en Memoria RAM',
                    detalle: 'Inspeccionando buffers PNG de Canvas, caché HTTP de Roblox y sesiones de estudio',
                    cmd: 'mem.inspect --subsystems=canvas,http,avatar,economy,tokens'
                },
                {
                    titulo: 'Descarga de Cachés Temporales y Códigos Expirados',
                    detalle: 'Eliminando respuestas caducadas y sesiones inactivas (protegiendo cuentas vinculadas)',
                    cmd: 'cache.purge --expired --temp-sessions --preserve-accounts'
                },
                {
                    titulo: 'Liberación de ArrayBuffers Gráficos (Canvas 2D / 3D .ZIP)',
                    detalle: 'Vaciando lienzos PNG ya enviados a Discord para recuperar memoria nativa',
                    cmd: 'gpu.release_buffers --canvas-cache --zip-streams'
                },
                {
                    titulo: 'Compactación Final y Reporte de Memoria Liberada',
                    detalle: 'Sincronizando recolector de memoria y generando desglose por subsistema',
                    cmd: 'engine.finalize --report-freed-kb --status=OK'
                }
            ]
        };
    }

    if (
        cid === 'btn_quick_sniper' ||
        cid === 'btn_nav_sniper' ||
        cid.startsWith('btn_sniper_') ||
        cid.startsWith('modal_sniper_') ||
        cid.startsWith('select_sniper_') ||
        cid.startsWith('chart_')
    ) {
        return {
            titulo: '🎯 Seguimiento de Precios y Renderizado de Gráfica',
            esPesadoGpu: true,
            filas: [
                {
                    titulo: 'Conexión con el Catálogo y Mercado de Roblox',
                    detalle: 'Validando identificador del activo y consultando endpoints oficiales',
                    cmd: 'roblox.catalog.fetch --asset-info --economy-data'
                },
                {
                    titulo: 'Lectura de Precio Actual y Estado de Venta',
                    detalle: 'Verificando mejor precio disponible, creador y disponibilidad Limited/UGC',
                    cmd: 'market.analyze --lowest-price --reseller-check'
                },
                {
                    titulo: 'Renderizado de Gráfica Histórica en Alta Definición',
                    detalle: 'Dibujando curva de evolución de precios y línea de meta en el motor Canvas',
                    cmd: 'canvas.render_chart --resolution=HD --history-points'
                },
                {
                    titulo: 'Construcción de Controles y Finalización del Panel',
                    detalle: 'Empaquetando imagen generada y botones de seguimiento en Discord',
                    cmd: 'ui.commit_container --components-v2 --ready'
                }
            ]
        };
    }

    if (cid === 'btn_econ_floors' || cid === 'btn_econ_floors_refresh') {
        return {
            titulo: '📉 Monitor de Pisos de Precio Dinámicos',
            esPesadoGpu: true,
            filas: [
                {
                    titulo: 'Escaneo de las 8 Subcategorías de Accesorios',
                    detalle: 'Consultando pisos actuales en Sombreros, Pelo, Cara, Cuello, Hombros y más',
                    cmd: 'economy.scan_floors --subcategories=8 --live'
                },
                {
                    titulo: 'Cálculo de Variación frente al Promedio Semanal',
                    detalle: 'Comparando precios mínimos de hoy contra la referencia de 7 días',
                    cmd: 'economy.compute_deltas --window=7d --sort-savings'
                },
                {
                    titulo: 'Renderizado de Tabla Visual en Motor Gráfico',
                    detalle: 'Generando tarjeta comparativa HD en el lienzo de servidor',
                    cmd: 'canvas.render_floors --hd-card --anti-aliasing'
                },
                {
                    titulo: 'Publicación del Reporte de Mercado',
                    detalle: 'Entregando gráfico actualizado y resumen por tipo de accesorio',
                    cmd: 'ui.commit_container --attach-canvas --done'
                }
            ]
        };
    }

    if (cid.startsWith('btn_econ_pending') || cid === 'modal_econ_pending_submit') {
        return {
            titulo: '⏳ Agenda y Verificador de Robux Pendientes',
            esPesadoGpu: false,
            filas: [
                {
                    titulo: 'Consulta de Lotes de Robux en Retención',
                    detalle: 'Leyendo registros pendientes asociados a tu perfil',
                    cmd: 'robux.pending.read --user-vault'
                },
                {
                    titulo: 'Cálculo de Cuenta Regresiva de Liberación',
                    detalle: 'Determinando marca de tiempo exacta de acreditación en cuenta',
                    cmd: 'robux.timer.calc --escrow-window'
                },
                {
                    titulo: 'Sincronización de Alertas Automáticas',
                    detalle: 'Actualizando estado de notificación por mensaje directo',
                    cmd: 'notifier.sync --dm-trigger=ready'
                },
                {
                    titulo: 'Actualización del Panel de Agenda',
                    detalle: 'Mostrando resumen total de Robux en espera y liberados',
                    cmd: 'ui.commit_container --status=OK'
                }
            ]
        };
    }

    if (cid.startsWith('btn_econ_group') || cid === 'modal_econ_group_submit' || cid === 'select_econ_group_inspect') {
        return {
            titulo: '🏛️ Auditor y Catálogo de Grupos de Roblox',
            esPesadoGpu: false,
            filas: [
                {
                    titulo: 'Verificación de Identidad y Propietario del Grupo',
                    detalle: 'Consultando datos oficiales de la comunidad y número de miembros',
                    cmd: 'roblox.groups.lookup --metadata --owner'
                },
                {
                    titulo: 'Escaneo del Catálogo de Prendas y Favoritos',
                    detalle: 'Indexando camisas, pantalones y accesorios publicados por el grupo',
                    cmd: 'catalog.group_store.scan --sort=popular'
                },
                {
                    titulo: 'Cálculo de Presupuesto con 40% de Ahorro en Grupo',
                    detalle: 'Determinando retorno de Robux y costo real por prenda',
                    cmd: 'finance.calc_cashback --rate=0.40'
                },
                {
                    titulo: 'Armado del Explorador Interactivo de Prendas',
                    detalle: 'Preparando selector de prendas y ficha técnica para finalizar',
                    cmd: 'ui.commit_container --group-auditor --done'
                }
            ]
        };
    }

    if (cid.startsWith('btn_ava_sandbox') || cid.startsWith('modal_ava_sandbox') || cid.startsWith('select_ava_sandbox')) {
        return {
            titulo: '🧪 Probador de Combinaciones en Vivo (Outfit Sandbox)',
            esPesadoGpu: true,
            filas: [
                {
                    titulo: 'Resolución del Personaje y Prendas Equipadas',
                    detalle: 'Obteniendo anatomía del avatar y accesorios activos desde Roblox API',
                    cmd: 'avatar.sandbox.load_rig --fetch-wearing'
                },
                {
                    titulo: 'Validación de Accesorios y Cotización Real',
                    detalle: 'Verificando miniaturas HD y precios de catálogo/reventa de hasta 5 ítems',
                    cmd: 'avatar.items.validate --max-slots=5 --pricing'
                },
                {
                    titulo: 'Composición Gráfica HD sobre el Personaje',
                    detalle: 'Renderizando vista previa combinada y encuadre en el motor Canvas',
                    cmd: 'canvas.render_sandbox --composite-layers --hd'
                },
                {
                    titulo: 'Entrega de Vista Previa y Presupuesto Total',
                    detalle: 'Finalizando tarjeta visual con desglose de ahorro del conjunto',
                    cmd: 'ui.commit_container --sandbox-ready'
                }
            ]
        };
    }

    if (cid.startsWith('btn_ava_clones') || cid === 'modal_ava_clones_submit' || cid === 'select_ava_clones_pick') {
        return {
            titulo: '🔍 Buscador de Clones y Alternativas Económicas',
            esPesadoGpu: true,
            filas: [
                {
                    titulo: 'Análisis del Accesorio o Prenda de Referencia',
                    detalle: 'Extrayendo categoría anatómica, palabras clave y precio real del artículo',
                    cmd: 'clones.reference.inspect --asset-type --market-price'
                },
                {
                    titulo: 'Búsqueda Filtrada en Catálogo Oficial y UGC Comprable',
                    detalle: 'Localizando alternativas del mismo tipo en venta con menor costo en Robux',
                    cmd: 'catalog.search_alternatives --on-sale --same-slot'
                },
                {
                    titulo: 'Cálculo de Porcentaje de Ahorro y Comparativa HD',
                    detalle: 'Renderizando tarjeta comparativa lado a lado en el motor gráfico',
                    cmd: 'canvas.render_clones --compare-cards'
                },
                {
                    titulo: 'Construcción del Listado de Alternativas',
                    detalle: 'Ordenando resultados por afinidad visual y mayor ahorro para finalizar',
                    cmd: 'ui.commit_container --clones-ready'
                }
            ]
        };
    }

    if (cid.startsWith('btn_ava_tex') || cid.startsWith('modal_ava_tex')) {
        return {
            titulo: '🧬 Extractor de Texturas + Maniquí 2D',
            esPesadoGpu: true,
            filas: [
                {
                    titulo: 'Localización de la Prenda y Plantilla UV (.PNG)',
                    detalle: 'Resolviendo el identificador interno ShirtTemplate/PantsTemplate en Roblox',
                    cmd: 'asset.delivery.resolve_texture --uv-template'
                },
                {
                    titulo: 'Descarga del Lienzo Original 585×559 desde Roblox CDN',
                    detalle: 'Obteniendo plantilla sin compresión lista para diseño o edición',
                    cmd: 'cdn.download_png --lossless-template'
                },
                {
                    titulo: 'Proyección de Costuras sobre Maniquí R6 (Frente y Espalda)',
                    detalle: 'Mapeando torso, brazos y piernas en el motor gráfico del servidor',
                    cmd: 'canvas.map_mannequin_2d --front --back'
                },
                {
                    titulo: 'Empaquetado de Plantilla Descargable y Vista Previa',
                    detalle: 'Adjuntando lienzo original y vista del maniquí para finalizar',
                    cmd: 'ui.commit_container --mannequin-ready'
                }
            ]
        };
    }

    if (cid.startsWith('btn_ava_export3d') || cid.startsWith('modal_ava_export3d')) {
        return {
            titulo: '📦 Exportador 3D (Render PNG HD + Archivo .ZIP)',
            esPesadoGpu: true,
            filas: [
                {
                    titulo: 'Consulta de Metadatos 3D en Roblox API',
                    detalle: 'Resolviendo manifiesto tridimensional del avatar o accesorio solicitado',
                    cmd: 'roblox.3d_manifest.resolve --target-mesh'
                },
                {
                    titulo: 'Descarga de Geometría (.OBJ / .MTL) y Texturas',
                    detalle: 'Obteniendo malla 3D, materiales y mapas de textura desde Roblox CDN',
                    cmd: 'cdn.fetch_3d_assets --obj --mtl --textures'
                },
                {
                    titulo: 'Renderizado de Tarjeta PNG en Alta Definición',
                    detalle: 'Procesando imagen transparente HD del modelo tridimensional',
                    cmd: 'canvas.render_3d_showcase --transparent-png'
                },
                {
                    titulo: 'Compresión del Paquete .ZIP en Memoria',
                    detalle: 'Generando archivo .ZIP descargable y finalizando entrega en Discord',
                    cmd: 'zip.pack_memory_stream --attach-all --done'
                }
            ]
        };
    }

    if (cid.startsWith('btn_ava_colormatch') || cid === 'modal_ava_colormatch_submit' || cid === 'select_ava_colormatch_tone') {
        return {
            titulo: '🎨 Emparejador de Accesorios por Color (Color-Match)',
            esPesadoGpu: true,
            filas: [
                {
                    titulo: 'Extracción de Paleta de 3 Tonos Dominantes',
                    detalle: 'Analizando píxeles de tu avatar, prenda o código hexadecimal (#HEX)',
                    cmd: 'color.quantize_palette --dominant-tones=3'
                },
                {
                    titulo: 'Búsqueda de Accesorios Comprables por Afinidad Cromática',
                    detalle: 'Consultando sombreros, pelo, lentes, collares y mochilas en venta',
                    cmd: 'catalog.match_color --on-sale --delta-rgb'
                },
                {
                    titulo: 'Renderizado de Galería de Combinación Cromática',
                    detalle: 'Componiendo muestra visual con paleta HEX y accesorios sugeridos',
                    cmd: 'canvas.render_colormatch --palette-preview'
                },
                {
                    titulo: 'Presentación de Accesorios Recomendados',
                    detalle: 'Ordenando opciones por coincidencia de tono para finalizar',
                    cmd: 'ui.commit_container --colormatch-ready'
                }
            ]
        };
    }

    if (cid.startsWith('btn_games_servers') || cid === 'modal_games_servers_submit') {
        return {
            titulo: '👻 Buscador de Servidores Vacíos',
            esPesadoGpu: false,
            filas: [
                {
                    titulo: 'Resolución de Place ID y Universo del Juego',
                    detalle: 'Verificando experiencia principal e identificadores en Roblox',
                    cmd: 'games.universe.resolve --place-id'
                },
                {
                    titulo: 'Escaneo de Instancias Públicas Activas',
                    detalle: 'Consultando servidores abiertos ordenados por menor ocupación',
                    cmd: 'games.servers.scan --sort=Asc --limit=100'
                },
                {
                    titulo: 'Filtrado de Servidores Tranquilos (1 a 2 Jugadores)',
                    detalle: 'Seleccionando instancias con menor cantidad de jugadores y mejor ping',
                    cmd: 'servers.filter --players=1..2 --best-ping'
                },
                {
                    titulo: 'Generación de Enlaces Directos de Unión Rápida',
                    detalle: 'Preparando botones de acceso directo a cada servidor encontrado',
                    cmd: 'ui.commit_container --servers-ready'
                }
            ]
        };
    }

    if (cid.startsWith('btn_games_passes') || cid.startsWith('modal_games_passes') || cid === 'select_games_passes_pick') {
        return {
            titulo: '🎟️ Extractor Completo de Pases de Juego',
            esPesadoGpu: false,
            filas: [
                {
                    titulo: 'Identificación del Universo y Experiencia Principal',
                    detalle: 'Consultando ficha técnica e ícono oficial del juego en Roblox',
                    cmd: 'games.details.fetch --universe-info'
                },
                {
                    titulo: 'Extracción de Gamepasses Web y Tienda Interna',
                    detalle: 'Recopilando todos los pases oficiales y paquetes del juego',
                    cmd: 'games.passes.extract_all --web --in-game'
                },
                {
                    titulo: 'Resolución de Miniaturas y Precios en Robux',
                    detalle: 'Obteniendo imágenes oficiales de cada pase y calculando comisiones',
                    cmd: 'thumbnails.passes.resolve --size=150x150'
                },
                {
                    titulo: 'Construcción del Catálogo Interactivo de Pases',
                    detalle: 'Habilitando selector y buscador de pases para finalizar',
                    cmd: 'ui.commit_container --passes-ready'
                }
            ]
        };
    }

    return {
        titulo: '⚡ Ejecutando Procedimiento en Kortex',
        esPesadoGpu: false,
        filas: [
            {
                titulo: 'Validación de Parámetros de Entrada',
                detalle: 'Comprobando datos solicitados y estado de sesión',
                cmd: 'request.validate --params --session'
            },
            {
                titulo: 'Consulta de Datos en Tiempo Real',
                detalle: 'Comunicando con los servicios externos de Roblox API',
                cmd: 'api.fetch_live_data --timeout=8000'
            },
            {
                titulo: 'Procesamiento y Formato de Resultados',
                detalle: 'Estructurando información y componentes visuales',
                cmd: 'data.transform --format-v2'
            },
            {
                titulo: 'Finalización y Entrega del Panel',
                detalle: 'Enviando respuesta interactiva al canal de Discord',
                cmd: 'ui.commit_container --done'
            }
        ]
    };
}

const FRAMES_CARGA = ['◐', '◓', '◑', '◒'];

/**
 * Construye el Panel Grande de Procedimientos por Filas (Fila 1, Fila 2, Fila 3, Fila 4)
 * con Indicador Dinámico de Carga lateral y Sub-Panel de Terminal abajo.
 */
function construirPanelCargaPasoAPaso({
    titulo,
    filas = [],
    pasoActualIndex = 0,
    enCola = false,
    posicionCola = 0,
    elapsedMs = 0,
    finalizado = false
}) {
    const listaFilas = filas.length >= 4 ? filas.slice(0, 4) : resolverPlanDeCarga('').filas;
    const totalFilas = listaFilas.length;
    const idxActivo = finalizado
        ? totalFilas
        : Math.min(Math.max(0, pasoActualIndex), totalFilas - 1);

    const segs = (elapsedMs / 1000).toFixed(1);
    const estadoRecursos = leerEstadoRecursos();
    const spinner = finalizado ? '✅' : FRAMES_CARGA[idxActivo % FRAMES_CARGA.length];

    const estadoCargaLateral = enCola
        ? `⏳ **EN COLA (#${posicionCola})**\nEsperando slot GPU/RAM`
        : finalizado
            ? `✅ **FINALIZADO**\n4 / 4 filas completadas (${segs}s)`
            : `${spinner} **CARGANDO FILA ${idxActivo + 1} / ${totalFilas}**\nTiempo activo: \`${segs}s\``;

    const btnIndicadorDinamico = new ButtonBuilder()
        .setCustomId('btn_loader_live_indicator')
        .setLabel(
            enCola
                ? `En Cola #${posicionCola}`
                : finalizado
                    ? `Completado (4/4)`
                    : `Cargando Fila ${idxActivo + 1} de ${totalFilas}`
        )
        .setEmoji(enCola ? '⏳' : finalizado ? '✅' : '🔄')
        .setStyle(finalizado ? ButtonStyle.Success : (enCola ? ButtonStyle.Secondary : ButtonStyle.Primary))
        .setDisabled(true);

    const headerSection = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ${titulo}\n` +
            `⚡ **Sistema Dinámico de Ejecución:** ${estadoCargaLateral}\n` +
            `-# ${estadoRecursos.etiquetaModo} • RAM Bot: \`${estadoRecursos.rssMB} MB\``
        ))
        .setButtonAccessory(btnIndicadorDinamico);

    const bloquesFilas = listaFilas.map((fila, i) => {
        const numFila = i + 1;
        if (enCola) {
            return (
                `> ⏳ **Fila ${numFila} — ${fila.titulo}**  ·  \`[ EN ESPERA DE TURNO ]\`\n` +
                `> -# ${fila.detalle}`
            );
        }
        if (finalizado || i < idxActivo) {
            return (
                `> ✅ **Fila ${numFila} — ${fila.titulo}**  ·  \`[ COMPLETADO ]\`\n` +
                `> -# ${fila.detalle}`
            );
        }
        if (i === idxActivo) {
            return (
                `> 🔄 **Fila ${numFila} — ${fila.titulo}**  ·  \`[ ${spinner} EJECUTANDO AHORA... ]\`\n` +
                `> -# ⚡ **En proceso:** ${fila.detalle}`
            );
        }
        return (
            `> ⚪ **Fila ${numFila} — ${fila.titulo}**  ·  \`[ PENDIENTE ]\`\n` +
            `> -# ${fila.detalle}`
        );
    }).join('\n\n');

    const lineasTerminal = [];
    lineasTerminal.push(`kortex@engine:~$ exec --procedure "${titulo.replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ/.-]/g, '').trim()}"`);

    for (let i = 0; i < totalFilas; i++) {
        const f = listaFilas[i];
        const tag = `[FILA-0${i + 1}]`;
        if (enCola) {
            if (i === 0) {
                lineasTerminal.push(`${tag} \u001b[0;33mWAIT\u001b[0m > En cola preventiva (Puesto #${posicionCola})...`);
            }
            break;
        }
        if (finalizado || i < idxActivo) {
            lineasTerminal.push(`${tag} \u001b[0;32mOK\u001b[0m   > ${f.cmd} -> Completado`);
        } else if (i === idxActivo) {
            lineasTerminal.push(`${tag} \u001b[0;36mRUN\u001b[0m  > ${f.cmd} ...`);
            lineasTerminal.push(`         \u001b[0;33m↳ ${f.detalle} (procediendo a finalizar...)\u001b[0m`);
        }
    }

    if (finalizado) {
        lineasTerminal.push(`[SISTEMA] \u001b[0;32mDONE\u001b[0m > Todos los procedimientos (Filas 1 a 4) finalizaron correctamente en ${segs}s.`);
    }

    const bloqueTerminal =
        `### 🖥️ Terminal de Ejecución en Vivo\n` +
        '```ansi\n' +
        lineasTerminal.join('\n') +
        '\n```';

    const container = new ContainerBuilder()
        .setAccentColor(finalizado ? COLORES.exito : (enCola ? COLORES.alerta : COLORES.primario))
        .addSectionComponents(headerSection)
        .addSeparatorComponents(separador(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 📋 Estado de los Procedimientos por Filas\n\n` +
            bloquesFilas
        ))
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(bloqueTerminal))
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer('Sistema de Ejecución por Filas y Terminal en Vivo • Reemplaza automáticamente al finalizar')
        ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

/**
 * Ejecuta en vivo la secuencia de 4 filas + Terminal cuando el propietario pulsa "🧹 Purgar Caché y Buffers"
 * en /config, mostrando el avance de las Filas 1 a 4 antes de entregar el reporte detallado.
 */
async function ejecutarSecuenciaOptimizacionEnVivo(interaction) {
    const plan = resolverPlanDeCarga('btn_owner_optimize_ram');
    const startTime = Date.now();

    for (const stepIdx of [1, 3]) {
        const panel = construirPanelCargaPasoAPaso({
            titulo: plan.titulo,
            filas: plan.filas,
            pasoActualIndex: stepIdx,
            enCola: false,
            posicionCola: 0,
            elapsedMs: Date.now() - startTime,
            finalizado: false
        });
        try {
            await interaction.editReply(panel);
        } catch {
            // Ignorar si hubo cierre prematuro
        }
        await new Promise(r => setTimeout(r, 380));
    }

    return optimizarMemoriaRam(true, 'manual_propietario');
}

/**
 * Envuelve una interacción de Discord con calibración inteligente:
 * - No se activa en cambios simples de menú ni cuando el único usuario hace acciones rápidas.
 * - Solo muestra el panel grande de 4 Filas + Cargador Lateral + Terminal cuando una operación
 *   realmente demora (> 650ms) o si hay cola real de recursos.
 * - Solo ejecuta autolimpieza de memoria si realmente falta memoria en el proceso/contenedor.
 */
async function ejecutarInteraccionConOptimizacionYProgreso(interaction, handlerFn) {
    const cid = interaction.customId || '';
    const userId = interaction.user?.id || 'anon';

    const abreModalDirecto =
        (interaction.isButton?.() &&
            cid.endsWith('_modal') &&
            cid !== 'btn_fastlink_modal') ||
        (cid === 'select_owner_mechanic' && interaction.values?.[0] === 'owner_config_roblox_bot');

    if (abreModalDirecto) {
        return await handlerFn();
    }

    if (esInteraccionNavegacionRapida(cid)) {
        return await handlerFn();
    }

    const plan = resolverPlanDeCarga(cid);
    const startTime = Date.now();

    const estadoInicial = leerEstadoRecursos();
    if (plan.esPesadoGpu && estadoInicial.faltaMemoriaReal) {
        optimizarMemoriaRam(estadoInicial.nivel === 'critico', 'falta_memoria');
    }

    let finished = false;
    let progressTimer = null;
    let currentStepIndex = 0;
    let inFlightProgressEdit = null;
    let slotAcquired = false;
    let queueInfo = { queued: false, position: 0 };

    const originalDeferUpdate = interaction.deferUpdate.bind(interaction);
    const originalEditReply = interaction.editReply.bind(interaction);
    const originalReply = interaction.reply.bind(interaction);

    const detenerProgreso = () => {
        finished = true;
        if (progressTimer) {
            clearTimeout(progressTimer);
            progressTimer = null;
        }
    };

    const programarActualizacionProgreso = (delayMs = 700) => {
        if (finished || !botOwnerConfig.dynamicLoadingEnabled) return;
        progressTimer = setTimeout(async () => {
            if (finished || !botOwnerConfig.dynamicLoadingEnabled) return;
            const elapsed = Date.now() - startTime;

            const panelCarga = construirPanelCargaPasoAPaso({
                titulo: plan.titulo,
                filas: plan.filas,
                pasoActualIndex: currentStepIndex,
                enCola: !slotAcquired && queueInfo.queued,
                posicionCola: queueInfo.position || 1,
                elapsedMs: elapsed,
                finalizado: false
            });

            try {
                inFlightProgressEdit = originalEditReply(panelCarga).catch(() => null);
                await inFlightProgressEdit;
            } catch {
                // Ignorar si la interacción ya cerró
            } finally {
                inFlightProgressEdit = null;
            }

            if (!finished) {
                if (slotAcquired && currentStepIndex < plan.filas.length - 1) {
                    currentStepIndex++;
                }
                programarActualizacionProgreso(850);
            }
        }, delayMs);
    };

    interaction.deferUpdate = async (...args) => {
        const res = await originalDeferUpdate(...args);

        if (botOwnerConfig.dynamicLoadingEnabled && cid !== 'btn_owner_optimize_ram') {
            programarActualizacionProgreso(650);
        }

        queueInfo = await adquirirSlotRecurso(plan.esPesadoGpu);
        slotAcquired = true;

        return res;
    };

    interaction.editReply = async (payload) => {
        detenerProgreso();
        if (inFlightProgressEdit) {
            await inFlightProgressEdit.catch(() => null);
        }
        return await originalEditReply(payload);
    };

    interaction.reply = async (payload) => {
        detenerProgreso();
        return await originalReply(payload);
    };

    activeUserOperations.set(userId, { cid, startedAt: startTime });

    try {
        await handlerFn();
        stats.totalProcessed++;
    } finally {
        detenerProgreso();
        activeUserOperations.delete(userId);
        if (slotAcquired) {
            liberarSlotRecurso(plan.esPesadoGpu);
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
    esPropietarioDelBot,
    construirPanelAvisoModeracion,
    construirPanelCargaPasoAPaso,
    ejecutarInteraccionConOptimizacionYProgreso
};
