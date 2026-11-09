// ==========================================
// ARCHIVO: services/tycoonKeyEngine.js
// Flujos con base de datos del sistema de Fragmentos de Llave, Llaves Maestras,
// Forja, Cofres de Cerraduras (con Multiplicador de Riesgo) y Calibración del Láser.
//
// Reglas de integridad:
//  - Toda operación corre bajo el lock del usuario (services/tycoonLock.js).
//  - Las sesiones interactivas viven en `tycoon_profiles.active_sessions` (persisten a reinicios).
//  - Cada botón lleva el `sid` de su sesión y el paso que representa, así un clic repetido
//    o un botón viejo se rechaza sin duplicar ni consumir nada dos veces.
//  - Las Llaves Maestras de un cofre se descuentan recién al revelar el botín:
//    abandonar o cancelar la sesión nunca hace perder llaves.
// ==========================================

const supabase = require('../db');
const loot = require('./tycoonLoot');
const { withUserLock } = require('./tycoonLock');
const { getOrCreatePlayerState, incrementQuestProgress } = require('./tycoonEngine');

async function persistProfile(profile, extraWrites = []) {
    await Promise.all([
        supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' }),
        ...extraWrites
    ]);
}

function sessionExpiry(nowMs = Date.now()) {
    return nowMs + loot.SESSION_TTL_MS;
}

// =====================================================================
// CATEGORÍA 2 — FORJA DE LLAVE MAESTRA
// =====================================================================

/**
 * Consume 4 Fragmentos de Llave y forja 1 Llave Maestra.
 * Con 25% de probabilidad se dispara "Presión Crítica": la llave queda pendiente
 * hasta que el jugador elija Enfriamiento Seguro o Sobrecargar Prensa.
 */
function forgeMasterKey(userId, rng = Math.random) {
    return withUserLock(userId, async () => {
        const state = await getOrCreatePlayerState(userId);
        const { profile } = state;
        const need = loot.KEY_FRAGMENTS_PER_MASTER_KEY;

        if (profile.active_sessions.forge) {
            return { ok: false, reason: 'pressure_pending', state };
        }
        const have = Number(profile.key_fragments || 0);
        if (have < need) {
            return { ok: false, reason: 'not_enough_fragments', have, need, state };
        }

        profile.key_fragments = have - need;

        if (loot.rollChance(loot.DROP_RATES.forgePressureEvent, rng)) {
            const nowMs = Date.now();
            const sid = loot.newSessionId();
            profile.active_sessions.forge = { sid, createdAt: nowMs, expiresAt: sessionExpiry(nowMs) };
            await persistProfile(profile);
            return { ok: true, pending: true, sid, state: await getOrCreatePlayerState(userId) };
        }

        profile.master_keys = Number(profile.master_keys || 0) + 1;
        await persistProfile(profile);
        return { ok: true, pending: false, masterKeysGained: 1, state: await getOrCreatePlayerState(userId) };
    });
}

/**
 * Resuelve el evento "Presión Crítica" (un solo clic).
 */
function resolveForgePressureChoice(userId, sid, choice, rng = Math.random) {
    return withUserLock(userId, async () => {
        const state = await getOrCreatePlayerState(userId);
        const { profile } = state;
        const session = profile.active_sessions.forge;

        if (!session || session.sid !== sid) {
            return { ok: false, reason: 'stale_session', state };
        }
        if (choice !== 'safe' && choice !== 'overload') {
            return { ok: false, reason: 'invalid_choice', state };
        }

        const outcome = loot.resolveForgePressure(choice, rng);
        profile.master_keys = Number(profile.master_keys || 0) + outcome.masterKeys;
        profile.key_fragments = Number(profile.key_fragments || 0) + outcome.fragmentsRefunded;
        delete profile.active_sessions.forge;

        await persistProfile(profile);
        return { ok: true, outcome, state: await getOrCreatePlayerState(userId) };
    });
}

// =====================================================================
// CATEGORÍA 3 — COFRES DE CERRADURAS
// =====================================================================

/**
 * Inicia la sesión de apertura de un cofre. Exige tener las Llaves Maestras necesarias
 * (se descuentan al revelar, no ahora).
 */
function startChestSession(userId, chestId) {
    return withUserLock(userId, async () => {
        const state = await getOrCreatePlayerState(userId);
        const { profile } = state;
        const chest = loot.CHESTS[chestId];

        if (!chest) return { ok: false, reason: 'invalid_chest', state };
        if (profile.active_sessions.chest) return { ok: false, reason: 'session_exists', state };

        const have = Number(profile.master_keys || 0);
        if (have < chest.keysRequired) {
            return { ok: false, reason: 'not_enough_keys', need: chest.keysRequired, have, chest, state };
        }

        const nowMs = Date.now();
        profile.active_sessions.chest = {
            sid: loot.newSessionId(),
            chestId: chest.id,
            step: 'locks',
            locksTurned: 0,
            locksTotal: chest.keysRequired,
            createdAt: nowMs,
            expiresAt: sessionExpiry(nowMs)
        };
        await persistProfile(profile);
        return { ok: true, chest, state: await getOrCreatePlayerState(userId) };
    });
}

/**
 * Gira la cerradura número `lockIndex` (1-based). Solo acepta la cerradura que toca girar.
 */
function turnChestLock(userId, sid, lockIndex) {
    return withUserLock(userId, async () => {
        const state = await getOrCreatePlayerState(userId);
        const { profile } = state;
        const session = profile.active_sessions.chest;

        if (!session || session.sid !== sid || session.step !== 'locks') {
            return { ok: false, reason: 'stale_session', state };
        }
        if (Number(session.locksTurned) + 1 !== Number(lockIndex)) {
            return { ok: false, reason: 'stale_step', state };
        }

        session.locksTurned += 1;
        if (session.locksTurned >= session.locksTotal) {
            session.step = 'risk';
        }
        session.expiresAt = sessionExpiry();

        await persistProfile(profile);
        return { ok: true, readyForRisk: session.step === 'risk', state: await getOrCreatePlayerState(userId) };
    });
}

function cancelChestSession(userId, sid) {
    return withUserLock(userId, async () => {
        const state = await getOrCreatePlayerState(userId);
        const { profile } = state;
        const session = profile.active_sessions.chest;

        if (!session || session.sid !== sid) {
            return { ok: false, reason: 'stale_session', state };
        }
        delete profile.active_sessions.chest;
        await persistProfile(profile);
        return { ok: true, state: await getOrCreatePlayerState(userId) };
    });
}

/**
 * Aplica el consumible temporal del Cofre Estándar. Si el consumible es una Poción de
 * Velocidad pero ya hay un Elixir Mega activo, se sustituye por Tónico del Prospector
 * para no pisar el Elixir.
 */
function applyConsumable(profile, consumable, nowMs) {
    if (!consumable) return null;
    let kind = consumable.kind;
    let substituted = false;

    const potionExpMs = profile.potion_expires_at ? new Date(profile.potion_expires_at).getTime() : 0;
    const megaActive = profile.potion_type === 'mega_elixir' && potionExpMs > nowMs;
    if (kind === 'speed_potion' && megaActive) {
        kind = 'prospector_tonic';
        substituted = true;
    }

    const extend = (currentRaw) => {
        const curMs = currentRaw ? new Date(currentRaw).getTime() : 0;
        const baseMs = Number.isFinite(curMs) && curMs > nowMs ? curMs : nowMs;
        return new Date(baseMs + consumable.minutes * 60000).toISOString();
    };

    if (kind === 'prospector_tonic') {
        profile.prospector_expires_at = extend(profile.prospector_expires_at);
    } else {
        profile.potion_type = 'speed_potion';
        profile.potion_expires_at = extend(profile.potion_expires_at);
    }
    return { kind, minutes: consumable.minutes, substituted };
}

/**
 * Entrega un Limited (o Limited U si queda stock) como premio extra del Cofre Vóxel.
 */
function prepareLimitedPrize(userId, catalogMap, rng) {
    const allItems = [...catalogMap.values()];
    const limitedPool = allItems.filter(it => it.category === 'LIMITED');
    const limitedUPool = allItems.filter(
        it => it.category === 'LIMITED_U' && Number(it.minted_count || 0) < Number(it.max_supply || 15)
    );

    const rollLimitedU = limitedUPool.length > 0 && loot.rollChance(0.25, rng);
    const pool = rollLimitedU ? limitedUPool : limitedPool;
    const item = pool[Math.floor(rng() * pool.length)] || limitedPool[0];
    if (!item) return null;

    item.minted_count = Number(item.minted_count || 0) + 1;
    const serialNumber = item.category === 'LIMITED_U' ? item.minted_count : null;

    const instance = {
        instance_id: `inv_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: String(userId),
        item_id: item.item_id,
        serial_number: serialNumber,
        acquired_at: new Date().toISOString()
    };
    return { item, serialNumber, instance };
}

/**
 * Revela el botín: descuenta las llaves, tira el botín base, aplica el factor de riesgo
 * elegido y acredita todo en una única escritura.
 */
function revealChest(userId, sid, tierId, rng = Math.random) {
    return withUserLock(userId, async () => {
        const state = await getOrCreatePlayerState(userId);
        const { profile, catalogMap } = state;
        const session = profile.active_sessions.chest;

        if (!session || session.sid !== sid || session.step !== 'risk') {
            return { ok: false, reason: 'stale_session', state };
        }
        if (!loot.RISK_TIERS[tierId]) {
            return { ok: false, reason: 'invalid_tier', state };
        }

        const chest = loot.CHESTS[session.chestId];
        const have = Number(profile.master_keys || 0);
        if (!chest || have < chest.keysRequired) {
            delete profile.active_sessions.chest;
            await persistProfile(profile);
            return { ok: false, reason: 'not_enough_keys', state: await getOrCreatePlayerState(userId) };
        }

        const nowMs = Date.now();
        profile.master_keys = have - chest.keysRequired;

        const base = loot.rollChestBaseLoot(chest.id, rng);
        const risk = loot.applyRiskTier(base, tierId, rng);

        profile.tix_balance = Number(profile.tix_balance || 0) + risk.tix;
        profile.crystal_balance = Number(profile.crystal_balance || 0) + risk.voxeles;

        let permanentBonusGained = 0;
        if (base.permanentBonusPct > 0) {
            const before = Number(profile.permanent_tix_bonus_pct || 0);
            profile.permanent_tix_bonus_pct = loot.addPermanentBonus(before, base.permanentBonusPct);
            permanentBonusGained = Number((profile.permanent_tix_bonus_pct - before).toFixed(2));
        }

        const consumable = applyConsumable(profile, base.consumable, nowMs);

        const extraWrites = [];
        let limitedPrize = null;
        if (base.limitedRoll) {
            limitedPrize = prepareLimitedPrize(userId, catalogMap, rng);
            if (limitedPrize) {
                extraWrites.push(
                    supabase.from('tycoon_items_catalog').upsert(limitedPrize.item, { onConflict: 'item_id' }),
                    supabase.from('tycoon_user_inventory').insert(limitedPrize.instance)
                );
            }
        }

        delete profile.active_sessions.chest;
        incrementQuestProgress(profile, 'q_use_potions', 1);

        await persistProfile(profile, extraWrites);

        return {
            ok: true,
            chest,
            base,
            risk,
            consumable,
            permanentBonusGained,
            limitedPrize,
            keysSpent: chest.keysRequired,
            state: await getOrCreatePlayerState(userId)
        };
    });
}

// =====================================================================
// CATEGORÍA 1 — EVENTO "CALIBRACIÓN DEL UPGRADER LÁSER"
// =====================================================================

/**
 * Tirada de descalibración al cargar/actualizar la Categoría 1 (5%).
 * Limitada a una tirada cada 5 minutos para que refrescar el panel no sirva para farmear el evento.
 */
function rollLaserEvent(userId, rng = Math.random) {
    return withUserLock(userId, async () => {
        const state = await getOrCreatePlayerState(userId);
        const { profile, metrics } = state;
        const nowMs = Date.now();

        if (!metrics.unlockedPads.includes('pad_laser')) {
            return { miscalibrated: false, justTriggered: false };
        }

        const laser = profile.laser_state;
        if (laser.miscalibrated) {
            return { miscalibrated: true, justTriggered: false };
        }
        if (!loot.isLaserRollDue(laser, nowMs)) {
            return { miscalibrated: false, justTriggered: false };
        }

        laser.next_roll_at = nowMs + loot.LASER_EVENT.rollCooldownMs;
        const triggered = loot.rollChance(loot.DROP_RATES.laserMiscalibration, rng);
        if (triggered) {
            laser.miscalibrated = true;
            laser.triggered_at = nowMs;
        }

        await persistProfile(profile);
        return { miscalibrated: triggered, justTriggered: triggered };
    });
}

/**
 * Recalibra el Láser con un solo clic: Tix instantáneos + probabilidad de Fragmento de Llave.
 */
function calibrateLaser(userId, rng = Math.random) {
    return withUserLock(userId, async () => {
        const state = await getOrCreatePlayerState(userId);
        const { profile, metrics } = state;
        const laser = profile.laser_state;

        if (!laser.miscalibrated) {
            return { ok: false, reason: 'not_miscalibrated', state };
        }

        const nowMs = Date.now();
        const rewardTix = Math.max(
            loot.LASER_EVENT.minRewardTix,
            metrics.effectiveTixPerMin * loot.LASER_EVENT.rewardMinutes
        );
        const bonusFragment = loot.rollFragmentDrop(
            loot.DROP_RATES.laserCalibration,
            metrics.prospectorActive,
            rng
        );

        laser.miscalibrated = false;
        laser.next_roll_at = nowMs + loot.LASER_EVENT.rollCooldownMs;
        laser.calibrated_at = nowMs;

        profile.tix_balance = Number(profile.tix_balance || 0) + rewardTix;
        if (bonusFragment) {
            profile.key_fragments = Number(profile.key_fragments || 0) + 1;
        }

        await persistProfile(profile);
        return { ok: true, rewardTix, bonusFragment, state: await getOrCreatePlayerState(userId) };
    });
}

module.exports = {
    forgeMasterKey,
    resolveForgePressureChoice,
    startChestSession,
    turnChestLock,
    cancelChestSession,
    revealChest,
    rollLaserEvent,
    calibrateLaser
};
