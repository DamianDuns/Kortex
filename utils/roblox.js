// ==========================================
// ARCHIVO: utils/roblox.js
// ==========================================

const { fetchWithRetry } = require('./http');

const EMOJI_ROBUX = '<:Robux:1547677277590913114>';

function extractIdFromInput(input) {
    if (!input) return null;
    const match = String(input).match(/\d+/);
    return match ? match[0] : null;
}

/**
 * Detecta la categoría automáticamente si el usuario pegó un enlace de Roblox.
 */
function detectarTipoDesdeInput(input, fallbackType = 'catalog') {
    if (!input) return fallbackType;
    const lower = String(input).toLowerCase();
    if (lower.includes('/game-pass/') || lower.includes('/gamepass/')) return 'gamepass';
    if (lower.includes('create.roblox.com') || lower.includes('/plugins/')) return 'plugin';
    if (lower.includes('/games/')) return 'paid_access';
    if (lower.includes('/catalog/') || lower.includes('/bundles/')) return 'catalog';
    return fallbackType;
}

/**
 * Devuelve la URL pública de Roblox según el tipo de objeto.
 */
function obtenerUrlRoblox(idObjet, itemType = 'catalog') {
    const type = String(itemType || 'catalog').toLowerCase();
    if (type === 'gamepass') return `https://www.roblox.com/game-pass/${idObjet}`;
    if (type === 'plugin') return `https://create.roblox.com/store/asset/${idObjet}`;
    if (type === 'paid_access') return `https://www.roblox.com/games/${idObjet}`;
    return `https://www.roblox.com/catalog/${idObjet}`;
}

async function consultarPorTipo(idObjet, itemType) {
    let nombre = 'Objeto Desconocido';
    let precio = 0;
    let esUSD = false;
    let precioTexto = `0 ${EMOJI_ROBUX}`;
    let imagenUrl = null;
    let exito = false;
    let sinVendedores = false;

    try {
        // 1. MINIATURA (Petición GET vía RoProxy)
        try {
            if (itemType === 'gamepass') {
                const thumbRes = await fetchWithRetry(
                    `https://thumbnails.roproxy.com/v1/game-passes?gamePassIds=${idObjet}&size=150x150&format=Png`
                );
                imagenUrl = thumbRes.data?.data?.[0]?.imageUrl || null;
            } else {
                const thumbRes = await fetchWithRetry(
                    `https://thumbnails.roproxy.com/v1/assets?assetIds=${idObjet}&size=420x420&format=Png`
                );
                imagenUrl = thumbRes.data?.data?.[0]?.imageUrl || null;
            }
        } catch {
            // Silencioso
        }

        // 2. DETALLES Y PRECIOS SEGÚN CATEGORÍA
        if (itemType === 'plugin') {
            try {
                const mpRes = await fetchWithRetry(
                    `https://apis.roproxy.com/toolbox-service/v1/items/details?assetIds=${idObjet}`
                );

                const item = mpRes.data?.data?.[0];

                if (item && item.asset) {
                    nombre = item.asset.name || nombre;
                    const fiat = item.fiatProduct;

                    if (fiat && !fiat.isFree && fiat.purchasePrice) {
                        const q = fiat.purchasePrice.quantity;
                        if (q && typeof q.significand === 'number' && typeof q.exponent === 'number') {
                            const amount = q.significand * Math.pow(10, q.exponent);
                            if (amount > 0) {
                                esUSD = true;
                                precio = parseFloat(amount.toFixed(2));
                                precioTexto = `$${precio.toFixed(2)} USD`;
                                exito = true;
                            }
                        }
                    }
                }
            } catch (e) {
                console.error(`[PLUGIN TOOLBOX ERROR - ID ${idObjet}]:`, e.message);
            }

        } else if (itemType === 'paid_access') {
            try {
                const universeRes = await fetchWithRetry(
                    `https://apis.roproxy.com/universes/v1/places/${idObjet}/universe`
                );

                const universeId = universeRes.data?.universeId;

                if (universeId) {
                    const gameRes = await fetchWithRetry(
                        `https://games.roproxy.com/v1/games?universeIds=${universeId}`
                    );

                    const gameData = gameRes.data?.data?.[0];
                    if (gameData) {
                        nombre = gameData.name || nombre;
                        precio = gameData.price ?? 0;
                        precioTexto = precio > 0 ? `${precio.toLocaleString()} ${EMOJI_ROBUX}` : 'Gratis';
                        exito = true;
                    }
                }
            } catch (e) {
                console.error(`[PAID_ACCESS ERROR - ID ${idObjet}]:`, e.message);
            }

        } else if (itemType === 'catalog') {
            try {
                const assetRes = await fetchWithRetry(
                    `https://economy.roproxy.com/v2/assets/${idObjet}/details`
                );

                if (assetRes.data && assetRes.data.Name) {
                    nombre = assetRes.data.Name;
                    const d = assetRes.data;
                    const esLimited = Boolean(d.IsLimited || d.IsLimitedUnique || d.CollectibleItemId);

                    if (esLimited) {
                        let detectedPrice = 0;

                        if (typeof d.LowestResellPrice === 'number' && d.LowestResellPrice > 0) {
                            detectedPrice = d.LowestResellPrice;
                        }

                        if (detectedPrice === 0) {
                            try {
                                const resellerRes = await fetchWithRetry(
                                    `https://economy.roproxy.com/v1/assets/${idObjet}/resellers?limit=1`
                                );
                                const primerVendedor = resellerRes.data?.data?.[0];
                                if (primerVendedor && typeof primerVendedor.price === 'number' && primerVendedor.price > 0) {
                                    detectedPrice = primerVendedor.price;
                                }
                            } catch {
                                // Silencioso
                            }
                        }

                        if (detectedPrice === 0 && d.CollectibleItemId) {
                            try {
                                const collectibleRes = await fetchWithRetry(
                                    `https://apis.roproxy.com/marketplace-sales/v1/item/${d.CollectibleItemId}/resellers?limit=1`
                                );
                                const primerVendedor = collectibleRes.data?.data?.[0];
                                if (primerVendedor && typeof primerVendedor.price === 'number' && primerVendedor.price > 0) {
                                    detectedPrice = primerVendedor.price;
                                }
                            } catch {
                                // Silencioso
                            }
                        }

                        if (detectedPrice > 0) {
                            precio = detectedPrice;
                            sinVendedores = false;
                        } else {
                            precio = 0;
                            sinVendedores = true;
                        }
                    } else {
                        precio = Number(d.PriceInRobux || d.priceInRobux || 0);
                        sinVendedores = false;
                    }

                    precioTexto = sinVendedores
                        ? 'Sin vendedores'
                        : (precio > 0 ? `${precio.toLocaleString()} ${EMOJI_ROBUX}` : 'Gratis');
                    exito = true;
                }
            } catch (e) {
                console.error(`[CATALOG ERROR - ID ${idObjet}]:`, e.message);
            }

        } else if (itemType === 'gamepass') {
            try {
                const gpRes = await fetchWithRetry(
                    `https://apis.roproxy.com/game-passes/v1/game-passes/${idObjet}/product-info`
                );
                if (gpRes.data && (gpRes.data.Name || gpRes.data.name)) {
                    nombre = gpRes.data.Name || gpRes.data.name;
                    precio = gpRes.data.PriceInRobux ?? gpRes.data.priceInRobux ?? gpRes.data.price ?? 0;
                    precioTexto = `${precio.toLocaleString()} ${EMOJI_ROBUX}`;
                    exito = true;
                }
            } catch (e) {
                console.error(`[GAMEPASS ERROR - ID ${idObjet}]:`, e.message);
            }
        }

    } catch (error) {
        console.error('[ERROR GENERAL ROBLOX API]:', error.message);
    }

    if (nombre === 'Objeto Desconocido') {
        exito = false;
    }

    return {
        nombre,
        precio,
        precioTexto,
        esUSD,
        imagenUrl,
        exito,
        sinVendedores,
        tipoDetectado: itemType
    };
}

async function obtenerDetallesCompletos(idObjet, itemType, permitirFallback = false) {
    const res = await consultarPorTipo(idObjet, itemType);
    if (res.exito || !permitirFallback) return res;

    // Si el usuario eligió una categoría equivocada pero puso un ID válido, probamos las demás
    const alternativas = ['catalog', 'gamepass', 'plugin', 'paid_access'].filter(t => t !== itemType);
    for (const alt of alternativas) {
        const intento = await consultarPorTipo(idObjet, alt);
        if (intento.exito) return intento;
    }
    return res;
}

async function obtenerMiniaturasBatch(items) {
    const resultado = new Map();

    const gamepassIds = items.filter(i => i.item_type === 'gamepass').map(i => i.id_objet);
    const assetIds = items.filter(i => i.item_type !== 'gamepass').map(i => i.id_objet);

    try {
        if (gamepassIds.length > 0) {
            const res = await fetchWithRetry(
                `https://thumbnails.roproxy.com/v1/game-passes?gamePassIds=${gamepassIds.join(',')}&size=150x150&format=Png`
            );
            (res.data?.data || []).forEach(entry => {
                resultado.set(String(entry.targetId), entry.imageUrl || null);
            });
        }
    } catch (e) {
        console.error('[MINIATURAS BATCH GAMEPASS ERROR]:', e.message);
    }

    try {
        if (assetIds.length > 0) {
            const res = await fetchWithRetry(
                `https://thumbnails.roproxy.com/v1/assets?assetIds=${assetIds.join(',')}&size=150x150&format=Png`
            );
            (res.data?.data || []).forEach(entry => {
                resultado.set(String(entry.targetId), entry.imageUrl || null);
            });
        }
    } catch (e) {
        console.error('[MINIATURAS BATCH ASSETS ERROR]:', e.message);
    }

    return resultado;
}

module.exports = {
    extractIdFromInput,
    detectarTipoDesdeInput,
    obtenerUrlRoblox,
    obtenerDetallesCompletos,
    obtenerMiniaturasBatch
};
