// ==========================================
// ARCHIVO: services/tycoonLoot.js
// Lógica PURA (sin base de datos, sin Discord) del sistema de Fragmentos de Llave,
// Llaves Maestras, Cofres de Cerraduras, Multiplicador de Riesgo y eventos aleatorios.
// Todas las funciones aceptan un `rng` inyectable (por defecto Math.random) para poder
// probar las probabilidades de forma determinista.
// ==========================================

const crypto = require('node:crypto');

// ---------- Constantes de balance (ajustables en un solo lugar) ----------

const KEY_FRAGMENTS_PER_MASTER_KEY = 4;
const SESSION_TTL_MS = 10 * 60 * 1000;

const DROP_RATES = Object.freeze({
    criticalVent: 0.15,        // Recolectar con el Colector al 100%
    foundation: 0.25,          // Construir / subir de nivel una estación
    laserCalibration: 0.20,    // Calibrar el Upgrader Láser
    forgePressureEvent: 0.25,  // Evento "Presión Crítica" al forjar
    laserMiscalibration: 0.05  // Descalibración al cargar la Categoría 1
});

const PROSPECTOR_DROP_MULTIPLIER = 2;

const PROSPECTOR_TONIC = Object.freeze({
    id: 'prospector_tonic',
    kind: 'prospector',
    cost: 600,
    durationMinutes: 30,
    emoji: '🧪',
    name_es: 'Tónico del Prospector',
    name_en: 'Prospector Tonic',
    desc_es: 'Duplica la probabilidad de drop de Fragmentos de Llave al recolectar o construir durante 30 minutos.',
    desc_en: 'Doubles Key Fragment drop chance when collecting or building for 30 minutes.'
});

const LASER_EVENT = Object.freeze({
    rollCooldownMs: 5 * 60 * 1000, // Evita farmear la probabilidad refrescando el panel
    productionPenaltyPct: 50,      // Penalización a la producción del Láser mientras está descalibrado
    rewardMinutes: 8,              // Tix instantáneos = minutos de producción actual
    minRewardTix: 300
});

const PERMANENT_BONUS_CAP_PCT = 40;
const VOXEL_CHEST_LIMITED_CHANCE = 0.12;

// ---------- Cofres de Cerraduras ----------

const CHESTS = Object.freeze({
    standard: Object.freeze({
        id: 'standard',
        keysRequired: 1,
        emoji: '📦',
        name_es: 'Cofre Estándar',
        name_en: 'Standard Chest',
        loot_es: 'Paquete mediano de Tix + consumible temporal',
        loot_en: 'Medium Tix pack + temporary consumable'
    }),
    reinforced: Object.freeze({
        id: 'reinforced',
        keysRequired: 2,
        emoji: '🛡️',
        name_es: 'Cofre Reforzado',
        name_en: 'Reinforced Chest',
        loot_es: 'Gran suma de Tix + pequeña probabilidad de Vóxeles',
        loot_en: 'Large Tix sum + small chance of Voxels'
    }),
    voxel: Object.freeze({
        id: 'voxel',
        keysRequired: 3,
        emoji: '💠',
        name_es: 'Cofre Vóxel',
        name_en: 'Voxel Chest',
        loot_es: 'Lote alto de Vóxeles garantizado + bono permanente de Tix/min',
        loot_en: 'Guaranteed high Voxel lot + permanent Tix/min bonus'
    })
});

const CHEST_LOOT = Object.freeze({
    standard: Object.freeze({
        tix: [900, 1600],
        consumables: [
            { kind: 'speed_potion', weight: 65, minutes: 15 },
            { kind: 'prospector_tonic', weight: 35, minutes: 15 }
        ]
    }),
    reinforced: Object.freeze({
        tix: [3200, 5200],
        voxelChance: 0.30,
        voxeles: [6, 14]
    }),
    voxel: Object.freeze({
        voxeles: [45, 75],
        permanentBonusPct: 2,
        limitedChance: VOXEL_CHEST_LIMITED_CHANCE
    })
});

// Factor de riesgo del "Multiplicador del Tycoon"
const RISK_TIERS = Object.freeze({
    safe: Object.freeze({ id: 'safe', winChance: 1, winMult: 1, loseMult: 1, emoji: '🔒' }),
    overcharge: Object.freeze({ id: 'overcharge', winChance: 0.70, winMult: 1.5, loseMult: 0.8, emoji: '⚡' }),
    jackpot: Object.freeze({ id: 'jackpot', winChance: 0.35, winMult: 2.5, loseMult: 0.5, emoji: '🔥' })
});

// ---------- Utilidades de azar ----------

function rollChance(probability, rng = Math.random) {
    const p = Math.max(0, Math.min(1, Number(probability) || 0));
    if (p >= 1) return true;
    if (p <= 0) return false;
    return rng() < p;
}

function randInt(min, max, rng = Math.random) {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return lo + Math.floor(rng() * (hi - lo + 1));
}

function pickWeighted(entries, rng = Math.random) {
    const total = entries.reduce((acc, e) => acc + Number(e.weight || 0), 0);
    let roll = rng() * total;
    for (const entry of entries) {
        roll -= Number(entry.weight || 0);
        if (roll < 0) return entry;
    }
    return entries[entries.length - 1];
}

function newSessionId() {
    return crypto.randomBytes(3).toString('hex');
}

/**
 * Probabilidad efectiva de drop de un Fragmento de Llave (el Tónico del Prospector la duplica).
 */
function fragmentDropChance(baseChance, prospectorActive = false) {
    const mult = prospectorActive ? PROSPECTOR_DROP_MULTIPLIER : 1;
    return Math.min(1, Number(baseChance) * mult);
}

function rollFragmentDrop(baseChance, prospectorActive = false, rng = Math.random) {
    return rollChance(fragmentDropChance(baseChance, prospectorActive), rng);
}

// ---------- Estado del perfil ----------

function toNonNegInt(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Normaliza los campos del sistema de llaves en un perfil (idempotente).
 * Migra el legado `ascension_tokens` a `key_fragments`. Devuelve true si mutó el perfil.
 */
function normalizeKeyState(profile) {
    let mutated = false;

    const keyFragments = toNonNegInt(profile.key_fragments);
    if (profile.key_fragments !== keyFragments) {
        profile.key_fragments = keyFragments;
        mutated = true;
    }

    const masterKeys = toNonNegInt(profile.master_keys);
    if (profile.master_keys !== masterKeys) {
        profile.master_keys = masterKeys;
        mutated = true;
    }

    const legacyTokens = toNonNegInt(profile.ascension_tokens);
    if (legacyTokens > 0) {
        profile.key_fragments += legacyTokens;
        profile.ascension_tokens = 0;
        mutated = true;
    } else if (profile.ascension_tokens === undefined || profile.ascension_tokens === null) {
        profile.ascension_tokens = 0;
        mutated = true;
    }

    const bonus = Math.max(0, Math.min(PERMANENT_BONUS_CAP_PCT, Number(profile.permanent_tix_bonus_pct) || 0));
    if (Number(profile.permanent_tix_bonus_pct) !== bonus) {
        profile.permanent_tix_bonus_pct = bonus;
        mutated = true;
    }

    if (!isPlainObject(profile.laser_state)) {
        profile.laser_state = {};
        mutated = true;
    }
    if (!isPlainObject(profile.active_sessions)) {
        profile.active_sessions = {};
        mutated = true;
    }
    if (profile.prospector_expires_at === undefined) {
        profile.prospector_expires_at = null;
        mutated = true;
    }

    return mutated;
}

/**
 * Resuelve las sesiones vencidas sin que el jugador pierda nada:
 *  - forja pendiente vencida  → se entrega 1 Llave Maestra (Enfriamiento Seguro automático)
 *  - cofre en curso vencido   → se descarta (las llaves nunca se descontaron)
 */
function settleExpiredSessions(profile, nowMs = Date.now()) {
    const sessions = profile.active_sessions;
    if (!isPlainObject(sessions)) return false;
    let mutated = false;

    for (const slot of ['chest', 'forge']) {
        const s = sessions[slot];
        if (!s) continue;
        const expiresAt = Number(s.expiresAt || 0);
        if (!Number.isFinite(expiresAt) || expiresAt > nowMs) continue;

        if (slot === 'forge') {
            profile.master_keys = toNonNegInt(profile.master_keys) + 1;
        }
        delete sessions[slot];
        mutated = true;
    }
    return mutated;
}

function isProspectorActive(profile, nowMs = Date.now()) {
    if (!profile || !profile.prospector_expires_at) return false;
    const exp = new Date(profile.prospector_expires_at).getTime();
    return Number.isFinite(exp) && exp > nowMs;
}

function prospectorRemainingMin(profile, nowMs = Date.now()) {
    if (!isProspectorActive(profile, nowMs)) return 0;
    const exp = new Date(profile.prospector_expires_at).getTime();
    return Math.max(1, Math.ceil((exp - nowMs) / 60000));
}

// ---------- Forja ----------

/**
 * Resultado del evento "Presión Crítica".
 *  safe     → 1 Llave Maestra garantizada
 *  overload → 50%: 2 Llaves Maestras · 50%: 1 Fragmento de consolación
 */
function resolveForgePressure(choice, rng = Math.random) {
    if (choice === 'overload') {
        return rollChance(0.5, rng)
            ? { choice, won: true, masterKeys: 2, fragmentsRefunded: 0 }
            : { choice, won: false, masterKeys: 0, fragmentsRefunded: 1 };
    }
    return { choice: 'safe', won: true, masterKeys: 1, fragmentsRefunded: 0 };
}

// ---------- Cofres ----------

/**
 * Tira el botín BASE de un cofre (antes del factor de riesgo).
 */
function rollChestBaseLoot(chestId, rng = Math.random) {
    const table = CHEST_LOOT[chestId];
    if (!table) throw new Error(`Cofre desconocido: ${chestId}`);

    const base = {
        chestId,
        tix: 0,
        voxeles: 0,
        consumable: null,
        permanentBonusPct: 0,
        limitedRoll: false
    };

    if (chestId === 'standard') {
        base.tix = randInt(table.tix[0], table.tix[1], rng);
        const picked = pickWeighted(table.consumables, rng);
        base.consumable = { kind: picked.kind, minutes: picked.minutes };
    } else if (chestId === 'reinforced') {
        base.tix = randInt(table.tix[0], table.tix[1], rng);
        if (rollChance(table.voxelChance, rng)) {
            base.voxeles = randInt(table.voxeles[0], table.voxeles[1], rng);
        }
    } else if (chestId === 'voxel') {
        base.voxeles = randInt(table.voxeles[0], table.voxeles[1], rng);
        base.permanentBonusPct = table.permanentBonusPct;
        base.limitedRoll = rollChance(table.limitedChance, rng);
    }
    return base;
}

/**
 * Aplica el factor de riesgo elegido. Solo escala Tix y Vóxeles; el bono permanente,
 * el consumible y el Limited no se escalan para no inflar la economía a largo plazo.
 */
function applyRiskTier(base, tierId, rng = Math.random) {
    const tier = RISK_TIERS[tierId];
    if (!tier) throw new Error(`Factor de riesgo desconocido: ${tierId}`);

    const won = rollChance(tier.winChance, rng);
    const multiplier = won ? tier.winMult : tier.loseMult;

    return {
        tierId: tier.id,
        won,
        multiplier,
        tix: Math.round(base.tix * multiplier),
        voxeles: Math.round(base.voxeles * multiplier)
    };
}

/**
 * Suma un bono permanente respetando el tope global.
 */
function addPermanentBonus(currentPct, addPct) {
    const next = Number(currentPct || 0) + Number(addPct || 0);
    const capped = Math.min(PERMANENT_BONUS_CAP_PCT, Math.max(0, next));
    return Number(capped.toFixed(2));
}

// ---------- Láser ----------

function isLaserRollDue(laserState, nowMs = Date.now()) {
    if (laserState && laserState.miscalibrated) return false;
    const next = Number(laserState?.next_roll_at || 0);
    return !Number.isFinite(next) || nowMs >= next;
}

module.exports = {
    KEY_FRAGMENTS_PER_MASTER_KEY,
    SESSION_TTL_MS,
    DROP_RATES,
    PROSPECTOR_DROP_MULTIPLIER,
    PROSPECTOR_TONIC,
    LASER_EVENT,
    PERMANENT_BONUS_CAP_PCT,
    VOXEL_CHEST_LIMITED_CHANCE,
    CHESTS,
    CHEST_LOOT,
    RISK_TIERS,
    rollChance,
    randInt,
    pickWeighted,
    newSessionId,
    fragmentDropChance,
    rollFragmentDrop,
    normalizeKeyState,
    settleExpiredSessions,
    isProspectorActive,
    prospectorRemainingMin,
    resolveForgePressure,
    rollChestBaseLoot,
    applyRiskTier,
    addPermanentBonus,
    isLaserRollDue
};
