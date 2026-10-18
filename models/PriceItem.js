// ==========================================
// ARCHIVO: models/PriceItem.js
// Modelo de Historial de Precios en Supabase (price_history jsonb) con Delta Logging
// ==========================================

const fs = require('node:fs');
const path = require('node:path');
const supabase = require('../db');

const MAX_HISTORY_LENGTH = 500;
const DATA_DIR = path.join(__dirname, '..', 'data');
const LOCAL_STORE_PATH = path.join(DATA_DIR, 'price_history.json');

// Caché en memoria sincronizada con Supabase
const memoryStore = new Map();

function cargarStoreLocal() {
    try {
        if (fs.existsSync(LOCAL_STORE_PATH)) {
            const raw = fs.readFileSync(LOCAL_STORE_PATH, 'utf8');
            const parsed = JSON.parse(raw);
            for (const [key, val] of Object.entries(parsed)) {
                if (Array.isArray(val.history)) {
                    memoryStore.set(String(key), val);
                }
            }
        }
    } catch {
        // Ignorar si no existe
    }
}

function guardarStoreLocal() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const obj = {};
        for (const [key, val] of memoryStore.entries()) {
            obj[key] = val;
        }
        fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(obj, null, 2), 'utf8');
    } catch {
        // Ignorar errores en disco de solo lectura
    }
}

cargarStoreLocal();

class PriceItem {
    /**
     * Registra un precio en Supabase (`roblox_wishlist.price_history`) aplicando Delta Logging:
     * - Si el historial está vacío y se recibe `previousPrice` distinto de `newPrice`,
     *   inserta primero `previousPrice` (unos minutos antes) y luego `newPrice` para asegurar mínimo 2 puntos.
     * - Si el historial está vacío y no hay variación previa, crea un punto base de referencia + el punto actual.
     * - Si ya existe historial, compara `newPrice` con el último elemento y solo inserta si el precio varió.
     * - Limita el array a un máximo de 500 registros usando `shift()`.
     *
     * @param {string|number} itemId ID del objeto de Roblox (id_objet)
     * @param {string} name Nombre del objeto
     * @param {number} newPrice Precio actual
     * @param {object} [options] Opciones adicionales: { previousPrice, existingHistory, createdAt }
     */
    static async recordPrice(itemId, name, newPrice, options = {}) {
        const idStr = String(itemId);
        const precioNum = Number(newPrice);

        if (isNaN(precioNum) || precioNum < 0) {
            return null;
        }

        const {
            previousPrice = null,
            existingHistory = null,
            createdAt = null
        } = options;

        let record = memoryStore.get(idStr);
        let dbHistory = Array.isArray(existingHistory) ? existingHistory : null;

        // Consultar historial actual en Supabase si no fue provisto
        if (!dbHistory) {
            try {
                const { data, error } = await supabase
                    .from('roblox_wishlist')
                    .select('item_name, last_price, price_history')
                    .eq('id_objet', idStr)
                    .limit(1)
                    .maybeSingle();

                if (!error && data && Array.isArray(data.price_history)) {
                    dbHistory = data.price_history;
                }
            } catch {
                // Continuar con caché en memoria si falla la red
            }
        }

        if (Array.isArray(dbHistory) && dbHistory.length > 0) {
            if (!record || dbHistory.length >= (record.history?.length || 0)) {
                record = {
                    itemId: idStr,
                    name: name || record?.name || `Objeto ${idStr}`,
                    currentPrice: precioNum,
                    history: dbHistory.map(h => ({
                        price: Number(h.price),
                        timestamp: new Date(h.timestamp).toISOString()
                    }))
                };
            }
        }

        const ahoraMs = Date.now();
        const ahoraIso = new Date(ahoraMs).toISOString();
        const prevTimeIso = createdAt
            ? new Date(createdAt).toISOString()
            : new Date(ahoraMs - 5 * 60 * 1000).toISOString();

        const tienePrevValido = previousPrice !== null && previousPrice !== undefined && !isNaN(Number(previousPrice));
        const prevNum = tienePrevValido ? Number(previousPrice) : precioNum;

        let changed = false;

        if (!record || !Array.isArray(record.history) || record.history.length === 0) {
            // Historial vacío: si hubo cambio desde previousPrice, insertamos previousPrice + newPrice
            if (tienePrevValido && prevNum !== precioNum) {
                record = {
                    itemId: idStr,
                    name: name || `Objeto ${idStr}`,
                    currentPrice: precioNum,
                    history: [
                        { price: prevNum, timestamp: prevTimeIso },
                        { price: precioNum, timestamp: ahoraIso }
                    ]
                };
            } else {
                record = {
                    itemId: idStr,
                    name: name || `Objeto ${idStr}`,
                    currentPrice: precioNum,
                    history: [
                        { price: precioNum, timestamp: ahoraIso }
                    ]
                };
            }
            changed = true;
        } else {
            record.name = name || record.name;
            record.currentPrice = precioNum;

            // Si solo había 1 punto con el precio nuevo pero el Sniper acaba de detectar un cambio desde previousPrice,
            // aseguramos que el punto con previousPrice esté al inicio antes del nuevo precio
            if (record.history.length === 1 && tienePrevValido && prevNum !== precioNum && Number(record.history[0].price) === precioNum) {
                record.history.unshift({
                    price: prevNum,
                    timestamp: prevTimeIso
                });
                changed = true;
            }

            const ultimoRegistro = record.history[record.history.length - 1];
            const ultimoPrecio = Number(ultimoRegistro?.price);

            // Delta Logging: solo agregamos un nuevo punto si el precio cambió respecto al último guardado
            if (ultimoPrecio !== precioNum) {
                record.history.push({
                    price: precioNum,
                    timestamp: ahoraIso
                });
                changed = true;
            }

            while (record.history.length > MAX_HISTORY_LENGTH) {
                record.history.shift();
                changed = true;
            }
        }

        memoryStore.set(idStr, record);

        if (changed) {
            guardarStoreLocal();
            try {
                await supabase
                    .from('roblox_wishlist')
                    .update({ price_history: record.history })
                    .eq('id_objet', idStr);
            } catch {
                // Ignorar si falla la conexión puntual
            }
        }

        return {
            itemId: record.itemId,
            name: record.name,
            currentPrice: record.currentPrice,
            history: record.history.map(h => ({
                price: Number(h.price),
                timestamp: new Date(h.timestamp)
            })),
            changed
        };
    }

    /**
     * Obtiene el historial del objeto desde Supabase o lo inicializa.
     */
    static async getOrInitItem(wishlistItem) {
        const idStr = String(wishlistItem.id_objet);
        const nombre = wishlistItem.item_name || `Objeto ${idStr}`;
        const precioActual = Number(wishlistItem.last_price || 0);

        return await PriceItem.recordPrice(idStr, nombre, precioActual, {
            existingHistory: Array.isArray(wishlistItem.price_history) ? wishlistItem.price_history : null,
            createdAt: wishlistItem.created_at || null
        });
    }

    /**
     * Filtra el historial según el rango ('24h', '7d', '30d', 'all') y garantiza SIEMPRE
     * al menos 2 puntos (punto base de referencia + punto actual) para que la gráfica siempre se renderice.
     */
    static filterHistoryAndStats(history, rangeKey = '7d', fallbackPrice = 0) {
        const ahora = Date.now();
        const rangosMs = {
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
            'all': Infinity
        };

        const ventanaMs = rangosMs[rangeKey] ?? rangosMs['7d'];
        const limite = ventanaMs === Infinity ? 0 : ahora - ventanaMs;

        const normalizados = (history || [])
            .map(h => ({
                price: Number(h.price),
                timestamp: h.timestamp instanceof Date ? h.timestamp : new Date(h.timestamp)
            }))
            .filter(h => !isNaN(h.price) && !isNaN(h.timestamp.getTime()))
            .sort((a, b) => a.timestamp - b.timestamp);

        let filtrados = ventanaMs === Infinity
            ? [...normalizados]
            : normalizados.filter(h => h.timestamp.getTime() >= limite);

        // Si en el rango hay menos de 2 puntos pero existen puntos previos, tomar el último precio previo como base
        if (filtrados.length < 2 && normalizados.length >= 2 && ventanaMs !== Infinity) {
            const previos = normalizados.filter(h => h.timestamp.getTime() < limite);
            if (previos.length > 0) {
                filtrados = [previos[previos.length - 1], ...filtrados];
            } else {
                filtrados = normalizados.slice(-2);
            }
        }

        // Si aún no tuvo variaciones (0 o 1 punto en total), generamos el punto base de referencia + el punto actual
        // para que SIEMPRE se renderice y muestre la gráfica en lugar de omitirla.
        if (filtrados.length === 0) {
            const baseVal = normalizados.length > 0 ? normalizados[normalizados.length - 1].price : Number(fallbackPrice || 0);
            filtrados = [
                { price: baseVal, timestamp: new Date(ahora - 5 * 60 * 1000) },
                { price: baseVal, timestamp: new Date(ahora) }
            ];
        } else if (filtrados.length === 1) {
            const unico = filtrados[0];
            const tiempoUnico = unico.timestamp.getTime();
            const tiempoBase = Math.min(tiempoUnico - 5 * 60 * 1000, ahora - 60 * 1000);
            filtrados = [
                { price: unico.price, timestamp: new Date(tiempoBase) },
                { price: unico.price, timestamp: new Date(Math.max(tiempoUnico, ahora)) }
            ];
        }

        const precios = filtrados.map(h => h.price);
        const firstPrice = precios[0];
        const lastPrice = precios[precios.length - 1];
        const minPrice = Math.min(...precios);
        const maxPrice = Math.max(...precios);
        const diff = lastPrice - firstPrice;
        const pctChange = firstPrice > 0 ? ((diff / firstPrice) * 100) : 0;

        return {
            filtered: filtrados,
            totalRecords: Math.max(normalizados.length, 1),
            firstPrice,
            lastPrice,
            minPrice,
            maxPrice,
            diff,
            pctChange,
            isUpOrFlat: lastPrice >= firstPrice
        };
    }
}

module.exports = PriceItem;
