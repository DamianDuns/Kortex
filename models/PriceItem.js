// ==========================================
// ARCHIVO: models/PriceItem.js
// Modelo de Historial de Precios con Delta Logging (Supabase + Persistencia Local)
// ==========================================

const fs = require('node:fs');
const path = require('node:path');
const supabase = require('../db');

const MAX_HISTORY_LENGTH = 500;
const DATA_DIR = path.join(__dirname, '..', 'data');
const LOCAL_STORE_PATH = path.join(DATA_DIR, 'price_history.json');

// Caché en memoria: Map<string, Array<{ price: number, timestamp: string }>>
const memoryStore = new Map();
let supabaseSupportsColumn = null; // null = desconocido, true = soporta columna price_history, false = usar store local

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
        // Si no existe o está corrupto, iniciamos limpio
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
        // Ignorar errores de escritura en entornos de solo lectura
    }
}

cargarStoreLocal();

class PriceItem {
    /**
     * Registra un precio aplicando Delta Logging:
     * - Si el objeto no tiene historial, crea el primer punto.
     * - Si ya existe, solo inserta un nuevo registro si `newPrice` cambió respecto al último guardado.
     * - Limita el historial a un máximo de 500 variaciones (eliminando el más antiguo con shift()).
     *
     * @param {string|number} itemId ID del objeto de Roblox (id_objet)
     * @param {string} name Nombre del objeto
     * @param {number} newPrice Precio actual detectado
     * @returns {Promise<{ itemId: string, name: string, currentPrice: number, history: Array<{ price: number, timestamp: Date }>, changed: boolean }>}
     */
    static async recordPrice(itemId, name, newPrice) {
        const idStr = String(itemId);
        const precioNum = Number(newPrice);

        if (isNaN(precioNum) || precioNum < 0) {
            return null;
        }

        let record = memoryStore.get(idStr);

        // Intentar hidratar desde Supabase si aún no está en memoria
        if (!record && supabaseSupportsColumn !== false) {
            try {
                const { data, error } = await supabase
                    .from('roblox_wishlist')
                    .select('item_name, last_price, price_history')
                    .eq('id_objet', idStr)
                    .limit(1)
                    .maybeSingle();

                if (!error) {
                    supabaseSupportsColumn = true;
                    if (data && Array.isArray(data.price_history) && data.price_history.length > 0) {
                        record = {
                            itemId: idStr,
                            name: name || data.item_name || `Objeto ${idStr}`,
                            currentPrice: precioNum,
                            history: data.price_history
                        };
                    }
                } else if (error.message && error.message.includes('price_history')) {
                    supabaseSupportsColumn = false;
                }
            } catch {
                // Continuar con store en memoria/local
            }
        }

        const ahoraIso = new Date().toISOString();
        let changed = false;

        if (!record || !Array.isArray(record.history) || record.history.length === 0) {
            record = {
                itemId: idStr,
                name: name || `Objeto ${idStr}`,
                currentPrice: precioNum,
                history: [{ price: precioNum, timestamp: ahoraIso }]
            };
            changed = true;
        } else {
            record.name = name || record.name;
            record.currentPrice = precioNum;

            const ultimoRegistro = record.history[record.history.length - 1];
            const ultimoPrecio = Number(ultimoRegistro?.price);

            // Delta Logging: solo agregamos si cambió el precio respecto al último punto guardado
            if (ultimoPrecio !== precioNum) {
                record.history.push({
                    price: precioNum,
                    timestamp: ahoraIso
                });

                while (record.history.length > MAX_HISTORY_LENGTH) {
                    record.history.shift();
                }
                changed = true;
            }
        }

        memoryStore.set(idStr, record);

        if (changed) {
            guardarStoreLocal();

            // Si la tabla de Supabase tiene la columna price_history (JSONB), la sincronizamos
            if (supabaseSupportsColumn !== false) {
                try {
                    const { error } = await supabase
                        .from('roblox_wishlist')
                        .update({ price_history: record.history })
                        .eq('id_objet', idStr);

                    if (error && error.message && error.message.includes('price_history')) {
                        supabaseSupportsColumn = false;
                    } else if (!error) {
                        supabaseSupportsColumn = true;
                    }
                } catch {
                    // Ignorar si la columna no existe en Supabase
                }
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
     * Obtiene el historial completo de un objeto, inicializándolo con el precio actual de Supabase si aún no tenía puntos.
     */
    static async getOrInitItem(wishlistItem) {
        const idStr = String(wishlistItem.id_objet);
        const nombre = wishlistItem.item_name || `Objeto ${idStr}`;
        const precioActual = Number(wishlistItem.last_price || 0);

        // Si el registro de Supabase ya trae price_history en la fila, sincronizarlo
        if (Array.isArray(wishlistItem.price_history) && wishlistItem.price_history.length > 0) {
            const actual = memoryStore.get(idStr);
            if (!actual || actual.history.length < wishlistItem.price_history.length) {
                memoryStore.set(idStr, {
                    itemId: idStr,
                    name: nombre,
                    currentPrice: precioActual,
                    history: wishlistItem.price_history.slice(-MAX_HISTORY_LENGTH)
                });
            }
        }

        return await PriceItem.recordPrice(idStr, nombre, precioActual);
    }

    /**
     * Filtra el historial según el rango ('24h', '7d', '30d', 'all') y calcula métricas financieras.
     */
    static filterHistoryAndStats(history, rangeKey = '7d') {
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
            ? normalizados
            : normalizados.filter(h => h.timestamp.getTime() >= limite);

        // Si en la ventana temporal elegida hay menos de 2 puntos pero existen registros previos,
        // incluimos el último precio vigente antes de la ventana como punto de partida del período.
        if (filtrados.length < 2 && normalizados.length >= 2 && ventanaMs !== Infinity) {
            const previos = normalizados.filter(h => h.timestamp.getTime() < limite);
            if (previos.length > 0) {
                const puntoBase = previos[previos.length - 1];
                filtrados = [puntoBase, ...filtrados];
            }
        }

        if (filtrados.length === 0 && normalizados.length > 0) {
            filtrados = [normalizados[normalizados.length - 1]];
        }

        const precios = filtrados.map(h => h.price);
        const firstPrice = precios.length > 0 ? precios[0] : 0;
        const lastPrice = precios.length > 0 ? precios[precios.length - 1] : 0;
        const minPrice = precios.length > 0 ? Math.min(...precios) : 0;
        const maxPrice = precios.length > 0 ? Math.max(...precios) : 0;
        const diff = lastPrice - firstPrice;
        const pctChange = firstPrice > 0 ? ((diff / firstPrice) * 100) : 0;

        return {
            filtered: filtrados,
            totalRecords: normalizados.length,
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
