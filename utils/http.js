// ==========================================
// ARCHIVO: utils/http.js
// Cliente HTTP calibrado con Caché Inteligente Anti-429 y Failover Automático (*.roblox.com <-> *.roproxy.com)
// ==========================================

const axios = require('axios');

const robloxClient = axios.create({
    timeout: 5500,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
    }
});

// Caché en memoria de respuestas GET de Roblox API para acelerar herramientas y evitar errores 429 (Rate Limit)
const httpResponseCache = new Map();
const inFlightRequests = new Map();
const MAX_HTTP_CACHE_ENTRIES = 320;
const DEFAULT_HTTP_CACHE_TTL_MS = 45 * 1000;

let smartCacheActive = true;
let failoverShieldActive = true;

const httpStats = {
    totalRequests: 0,
    cacheHits: 0,
    coalescedHits: 0,
    failoverSuccesses: 0,
    rateLimitsAvoided: 0,
    lastLatencyMs: 38,
    avgLatencyMs: 42
};

function setHttpEngineFlags({ smartCache, failoverShield } = {}) {
    if (typeof smartCache === 'boolean') smartCacheActive = smartCache;
    if (typeof failoverShield === 'boolean') failoverShieldActive = failoverShield;
}

function toDirectRobloxUrl(url) {
    if (!url) return url;
    return String(url).replace(/\.roproxy\.com/gi, '.roblox.com');
}

function toRoProxyUrl(url) {
    if (!url) return url;
    return String(url).replace(/\.roblox\.com/gi, '.roproxy.com');
}

function getAdaptiveCacheTtl(url, customTtl) {
    if (customTtl && Number(customTtl) > 0) return Number(customTtl);
    const u = String(url || '').toLowerCase();
    if (u.includes('thumbnails.roblox.com')) return 120 * 1000; // 2 min para miniaturas
    if (u.includes('users.roblox.com/v1/users/')) return 60 * 1000;
    if (u.includes('groups.roblox.com') || u.includes('games.roblox.com/v1/games')) return 55 * 1000;
    if (u.includes('catalog.roblox.com') || u.includes('economy.roblox.com')) return 45 * 1000;
    return DEFAULT_HTTP_CACHE_TTL_MS;
}

function isCacheableGetRequest(url, options = {}) {
    if (!smartCacheActive) return false;
    if (options.bypassCache) return false;
    const method = String(options.method || 'get').toLowerCase();
    if (method !== 'get') return false;
    if (options.headers && (options.headers.Cookie || options.headers.Authorization || options.headers['Cache-Control'] === 'no-cache')) return false;

    const u = String(url || '').toLowerCase();
    // No cachear endpoints de autenticación, amigos en vivo ni servidores activos que cambian segundo a segundo
    if (
        u.includes('/users/authenticated') ||
        u.includes('friends.roblox.com') ||
        u.includes('privatemessages.') ||
        u.includes('chat.roblox.com') ||
        u.includes('/servers/public')
    ) {
        return false;
    }
    return true;
}

function purgeHttpCache(aggressive = false) {
    const now = Date.now();
    let removed = 0;

    if (aggressive) {
        removed = httpResponseCache.size;
        httpResponseCache.clear();
        return removed;
    }

    for (const [key, entry] of httpResponseCache.entries()) {
        if (now - entry.timestamp > entry.ttlMs) {
            httpResponseCache.delete(key);
            removed++;
        }
    }

    // Si sigue por encima del 75% de capacidad, liberar la mitad más antigua
    if (httpResponseCache.size > Math.floor(MAX_HTTP_CACHE_ENTRIES * 0.75)) {
        const toDelete = Math.ceil(httpResponseCache.size / 2);
        let i = 0;
        for (const k of httpResponseCache.keys()) {
            httpResponseCache.delete(k);
            removed++;
            i++;
            if (i >= toDelete) break;
        }
    }

    return removed;
}

function getHttpCacheStats() {
    let approxBytes = 0;
    for (const entry of httpResponseCache.values()) {
        approxBytes += entry.approxBytes || 512;
    }
    const hitRatePct = httpStats.totalRequests > 0
        ? Math.min(100, Math.round(((httpStats.cacheHits + httpStats.coalescedHits) / httpStats.totalRequests) * 100))
        : 0;
    return {
        entries: httpResponseCache.size,
        inFlight: inFlightRequests.size,
        maxEntries: MAX_HTTP_CACHE_ENTRIES,
        approxKB: Math.round(approxBytes / 1024),
        smartCacheActive,
        failoverShieldActive,
        hitRatePct,
        ...httpStats
    };
}

async function fetchWithRetry(url, options = {}, retries = 2, backoff = 650) {
    const method = (options.method || 'get').toLowerCase();
    const primaryUrl = toDirectRobloxUrl(url);
    const fallbackUrl = toRoProxyUrl(url);
    const cacheable = isCacheableGetRequest(primaryUrl, options);
    const cacheKey = cacheable ? `${options.responseType || 'json'}:${primaryUrl}` : null;

    httpStats.totalRequests++;

    if (cacheKey && httpResponseCache.has(cacheKey)) {
        const cached = httpResponseCache.get(cacheKey);
        if (Date.now() - cached.timestamp <= cached.ttlMs) {
            httpStats.cacheHits++;
            httpStats.rateLimitsAvoided++;
            return { data: cached.data, status: 200, headers: cached.headers || {}, fromCache: true };
        }
        httpResponseCache.delete(cacheKey);
    }

    // Deduplicación de peticiones idénticas en vuelo (evita ráfagas 429)
    if (cacheKey && inFlightRequests.has(cacheKey)) {
        httpStats.coalescedHits++;
        httpStats.rateLimitsAvoided++;
        return inFlightRequests.get(cacheKey);
    }

    const storeInCacheIfEligible = (res) => {
        if (!cacheKey || !res || res.status !== 200 || !res.data) return;
        try {
            if (httpResponseCache.size >= MAX_HTTP_CACHE_ENTRIES) {
                const oldestKey = httpResponseCache.keys().next().value;
                if (oldestKey) httpResponseCache.delete(oldestKey);
            }
            let approxBytes = 640;
            if (Buffer.isBuffer(res.data)) {
                approxBytes = res.data.length;
            } else if (typeof res.data === 'string') {
                approxBytes = res.data.length;
            } else if (typeof res.data === 'object') {
                approxBytes = 1024;
            }
            // No guardar binarios gigantes (> 350 KB) en la micro-caché HTTP
            if (approxBytes > 350 * 1024) return;

            httpResponseCache.set(cacheKey, {
                data: res.data,
                headers: res.headers,
                timestamp: Date.now(),
                ttlMs: getAdaptiveCacheTtl(primaryUrl, options.cacheTtlMs),
                approxBytes
            });
        } catch {
            // Silencioso
        }
    };

    const executeNetworkCall = async () => {
        const t0 = Date.now();
        try {
            const res = await robloxClient({ url: primaryUrl, method, ...options });
            const elapsed = Math.max(5, Date.now() - t0);
            httpStats.lastLatencyMs = elapsed;
            httpStats.avgLatencyMs = Math.round(httpStats.avgLatencyMs * 0.75 + elapsed * 0.25);
            storeInCacheIfEligible(res);
            return res;
        } catch (primaryError) {
            const status = primaryError.response?.status;

            // Si el endpoint directo devolvió error de red, 403, 429 o 5xx y el escudo failover está activo, probar roproxy
            if (
                failoverShieldActive &&
                fallbackUrl !== primaryUrl &&
                (!status || status === 401 || status === 403 || status === 429 || status >= 500)
            ) {
                try {
                    const fallbackRes = await robloxClient({ url: fallbackUrl, method, timeout: 4800, ...options });
                    httpStats.failoverSuccesses++;
                    httpStats.rateLimitsAvoided++;
                    storeInCacheIfEligible(fallbackRes);
                    return fallbackRes;
                } catch {
                    // Continuar con reintento sobre primaryUrl
                }
            }

            if (retries > 0 && (!status || status === 429 || status >= 500)) {
                const waitMs = status === 429 ? Math.max(1150, backoff) : backoff;
                await new Promise(res => setTimeout(res, waitMs));
                return fetchWithRetry(primaryUrl, { ...options, bypassCache: true }, retries - 1, Math.min(2600, Math.round(waitMs * 1.75)));
            }

            throw primaryError;
        }
    };

    if (cacheKey) {
        const promise = executeNetworkCall().finally(() => {
            inFlightRequests.delete(cacheKey);
        });
        inFlightRequests.set(cacheKey, promise);
        return promise;
    }

    return executeNetworkCall();
}

module.exports = {
    robloxClient,
    fetchWithRetry,
    toDirectRobloxUrl,
    toRoProxyUrl,
    purgeHttpCache,
    getHttpCacheStats,
    setHttpEngineFlags
};
