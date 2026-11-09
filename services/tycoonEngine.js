// ==========================================
// ARCHIVO: services/tycoonEngine.js
// Motor Central del Ecosistema /tycoon (Estudio, Tienda, Taller UGC,
// Bóveda Limited / Limited U, Trading P2P, Pociones y Beneficios VIP)
// 100% Independiente de las herramientas técnicas de /roblox
// ==========================================

const supabase = require('../db');
const { obtenerConfigPropietario, guardarConfigPropietario } = require('../src/utils/performanceManager');

function isUserAuthorizedVip(userId, member = null) {
    const uid = String(userId || '').trim();
    if (!uid) return false;
    const ownerCfg = obtenerConfigPropietario();
    const vipUsers = Array.isArray(ownerCfg.vipUserIds) ? ownerCfg.vipUserIds.map(String) : [];
    if (vipUsers.includes(uid)) {
        return true;
    }
    const vipRoles = Array.isArray(ownerCfg.vipRoleIds) ? ownerCfg.vipRoleIds.map(r => String(r).toLowerCase()) : [];
    if (vipRoles.length > 0 && member && member.roles?.cache) {
        const hasConfiguredRole = member.roles.cache.some(role =>
            vipRoles.includes(String(role.id).toLowerCase()) ||
            vipRoles.includes(String(role.name || '').toLowerCase())
        );
        if (hasConfiguredRole) {
            return true;
        }
    }
    return false;
}

// Definición de los 6 Pads de Construcción del Estudio Tycoon
const STUDIO_PADS = [
    {
        id: 'pad_dropper1',
        stage: 1,
        cost: 0,
        tixPerMin: 15,
        capBonus: 0,
        emoji: '⚙️',
        name_es: 'Dropper Básico Lv.1',
        name_en: 'Basic Dropper Lv.1',
        desc_es: 'Generador inicial de bloques de Tix en la cinta transportadora.',
        desc_en: 'Starter Tix block generator on the main conveyor belt.'
    },
    {
        id: 'pad_walls',
        stage: 2,
        cost: 350,
        tixPerMin: 25,
        capBonus: 500,
        emoji: '🧱',
        name_es: 'Muros Neón y Cinta Rápida',
        name_en: 'Neon Walls & Fast Conveyor',
        desc_es: 'Cierra el perímetro del estudio y acelera el transporte de Tix.',
        desc_en: 'Encloses the studio perimeter and speeds up Tix transport.'
    },
    {
        id: 'pad_dropper2',
        stage: 3,
        cost: 900,
        tixPerMin: 45,
        capBonus: 1000,
        emoji: '🪙',
        name_es: 'Dropper Doble de Oro',
        name_en: 'Golden Dual Dropper',
        desc_es: 'Doble cañón de bloques dorados de alta densidad.',
        desc_en: 'Dual cannon dropping high-density golden Tix blocks.'
    },
    {
        id: 'pad_laser',
        stage: 4,
        cost: 2200,
        tixPerMin: 75,
        capBonus: 1500,
        emoji: '⚡',
        name_es: 'Upgrader Láser de Partículas',
        name_en: 'Particle Laser Upgrader',
        desc_es: 'Arco láser que sobrecarga el valor de cada bloque en la cinta.',
        desc_en: 'Laser arch that supercharges the value of every block on the belt.'
    },
    {
        id: 'pad_servers',
        stage: 5,
        cost: 5000,
        tixPerMin: 120,
        capBonus: 2500,
        emoji: '🖥️',
        name_es: 'Racks de Servidores Roblox',
        name_en: 'Roblox Quantum Server Racks',
        desc_es: 'Servidores dedicados que automatizan la minería de Tix.',
        desc_en: 'Dedicated servers automating high-speed Tix mining.'
    },
    {
        id: 'pad_tower',
        stage: 6,
        cost: 11000,
        tixPerMin: 200,
        capBonus: 4000,
        emoji: '🏰',
        name_es: 'Torre Central de Desarrolladores',
        name_en: 'Central Developer Tower',
        desc_es: 'Completa el Estudio Nivel 6 y habilita el Rebirth (Ascensión).',
        desc_en: 'Completes Studio Stage 6 and unlocks Rebirth (Ascension).'
    }
];

const POTIONS_CATALOG = {
    speed_potion: {
        id: 'speed_potion',
        cost: 450,
        boostPct: 50,
        durationMinutes: 30,
        emoji: '🧪',
        name_es: 'Poción de Velocidad (+50%)',
        name_en: 'Speed Potion (+50%)',
        desc_es: '+50% de producción de Tix/min durante 30 minutos.',
        desc_en: '+50% Tix/min production for 30 minutes.'
    },
    mega_elixir: {
        id: 'mega_elixir',
        cost: 850,
        boostPct: 100,
        durationMinutes: 30,
        emoji: '⚗️',
        name_es: 'Elixir de Mega Producción (+100%)',
        name_en: 'Mega Production Elixir (+100%)',
        desc_es: 'Duplica (+100%) la velocidad base de Tix/min por 30 minutos.',
        desc_en: 'Doubles (+100%) base Tix/min speed for 30 minutes.'
    }
};

// Misiones Semanales (Weekly Quests) que se reinician cada semana ISO y otorgan Cristales Kortex (💠) gratuitos
const WEEKLY_QUESTS_POOL = [
    {
        id: 'q_collect_tix',
        target: 2500,
        rewardCrystals: 25,
        rewardTix: 600,
        emoji: '🟢',
        title_es: 'Cosechador de Tix',
        title_en: 'Tix Harvester',
        desc_es: 'Recolectá un total de 2,500 Tix del Colector Verde esta semana.',
        desc_en: 'Collect a total of 2,500 Tix from your Green Collector Pad this week.'
    },
    {
        id: 'q_build_pads',
        target: 3,
        rewardCrystals: 30,
        rewardTix: 750,
        emoji: '🏗️',
        title_es: 'Arquitecto de Roblox Studio',
        title_en: 'Roblox Studio Architect',
        desc_es: 'Construí 3 Pads de máquinas en tu Estudio Tycoon.',
        desc_en: 'Build 3 Machine Purchase Pads inside your Tycoon Studio.'
    },
    {
        id: 'q_use_potions',
        target: 2,
        rewardCrystals: 35,
        rewardTix: 900,
        emoji: '🧪',
        title_es: 'Alquimista y Explorador',
        title_en: 'Alchemist & Vault Explorer',
        desc_es: 'Activá 2 Pociones de Laboratorio o abrí Cofres de Ascensión.',
        desc_en: 'Activate 2 Laboratory Potions or unbox Ascension Chests.'
    },
    {
        id: 'q_rebirth_or_bot',
        target: 5,
        rewardCrystals: 45,
        rewardTix: 1200,
        emoji: '⚡',
        title_es: 'Maestro de Kortex y Ascensión',
        title_en: 'Kortex Master & Ascension',
        desc_es: 'Completá 5 acciones en el bot o hacé 1 Rebirth (cuenta como 5/5).',
        desc_en: 'Complete 5 bot actions or perform 1 Rebirth (counts as 5/5).'
    }
];

const WEEKLY_ALL_COMPLETED_BONUS_CRYSTALS = 30;

function getCurrentWeekKey(nowMs = Date.now()) {
    const d = new Date(nowMs);
    const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
    return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getNextWeekResetInfo(nowMs = Date.now()) {
    const d = new Date(nowMs);
    const dayOfWeek = d.getUTCDay() || 7; // 1 (Lun) .. 7 (Dom)
    const daysUntilMonday = 8 - dayOfWeek;
    const nextMondayUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilMonday, 0, 0, 0);
    const diffMs = Math.max(0, nextMondayUtc - nowMs);
    const days = Math.floor(diffMs / 86400000);
    const hours = Math.floor((diffMs % 86400000) / 3600000);
    return { days, hours, nextMondayUtc };
}

function syncWeeklyQuestsState(profile, nowMs = Date.now()) {
    const currentWeekKey = getCurrentWeekKey(nowMs);
    let raw = profile.weekly_quests_state;
    if (typeof raw === 'string') {
        try {
            raw = JSON.parse(raw);
        } catch {
            raw = null;
        }
    }

    let mutated = false;
    if (!raw || typeof raw !== 'object' || raw.weekKey !== currentWeekKey) {
        raw = {
            weekKey: currentWeekKey,
            progress: {
                q_collect_tix: 0,
                q_build_pads: 0,
                q_use_potions: 0,
                q_rebirth_or_bot: 0
            },
            claimed: {},
            allBonusClaimed: false
        };
        profile.weekly_quests_state = raw;
        mutated = true;
    } else {
        if (!raw.progress || typeof raw.progress !== 'object') {
            raw.progress = {};
            mutated = true;
        }
        if (!raw.claimed || typeof raw.claimed !== 'object') {
            raw.claimed = {};
            mutated = true;
        }
        for (const q of WEEKLY_QUESTS_POOL) {
            if (typeof raw.progress[q.id] !== 'number') {
                raw.progress[q.id] = Number(raw.progress[q.id] || 0);
                mutated = true;
            }
        }
    }

    if (profile.crystal_balance === undefined || profile.crystal_balance === null) {
        profile.crystal_balance = 15; // 15 Cristales de bienvenida
        mutated = true;
    }

    return { stateObj: raw, mutated };
}

function incrementQuestProgress(profile, questId, amount = 1, nowMs = Date.now()) {
    const { stateObj } = syncWeeklyQuestsState(profile, nowMs);
    const questDef = WEEKLY_QUESTS_POOL.find(q => q.id === questId);
    if (!questDef) return false;

    const prev = Number(stateObj.progress[questId] || 0);
    const next = Math.min(questDef.target, prev + Math.max(0, Number(amount || 0)));
    if (next !== prev) {
        stateObj.progress[questId] = next;
        profile.weekly_quests_state = stateObj;
        return true;
    }
    return false;
}

function buildWeeklyQuestsSummary(profile, nowMs = Date.now()) {
    const { stateObj } = syncWeeklyQuestsState(profile, nowMs);
    const resetInfo = getNextWeekResetInfo(nowMs);
    const quests = WEEKLY_QUESTS_POOL.map(q => {
        const current = Math.min(q.target, Number(stateObj.progress[q.id] || 0));
        const completed = current >= q.target;
        const claimed = Boolean(stateObj.claimed[q.id]);
        return {
            ...q,
            current,
            completed,
            claimed,
            claimable: completed && !claimed
        };
    });

    const claimableCount = quests.filter(q => q.claimable).length;
    const allCompleted = quests.every(q => q.completed);
    const allClaimed = quests.every(q => q.claimed);

    return {
        weekKey: stateObj.weekKey,
        resetDays: resetInfo.days,
        resetHours: resetInfo.hours,
        quests,
        claimableCount,
        allCompleted,
        allClaimed,
        allBonusClaimed: Boolean(stateObj.allBonusClaimed),
        bonusCrystals: WEEKLY_ALL_COMPLETED_BONUS_CRYSTALS
    };
}

// Palabras prohibidas en el Taller UGC para evitar suplantación de Limiteds o staff
const UGC_FORBIDDEN_REGEX = /\b(limited|limited\s*u|lim\s*u|oficial|official|admin|administrador|staff|moderator|mod|kortex|dominus|valkyrie|sparkle\s*time|clockwork|robux\s*gratis|free\s*robux|scam|hack|exploit|nsfw|sex|porn)\b/i;

const UGC_ALLOWED_EMOJIS = ['🎨', '🎩', '👑', '🕶️', '🎧', '⚔️', '🛡️', 'wings', '🎒', '🎸', '🧢', '🧣', '💎', '🌟', '🔥', '🦊', '🐉', '🤖'];

// Cooldown en memoria para el hook silencioso (respaldado además por last_silent_reward_at en DB)
const silentRewardCooldownMap = new Map();
const SILENT_REWARD_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos

function parseUnlockedPads(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            // fallback
        }
    }
    return ['pad_dropper1'];
}

function calculateCollectorCap(unlockedPads, rebirthCount = 0) {
    const padSet = new Set(parseUnlockedPads(unlockedPads));
    let cap = 500;
    for (const pad of STUDIO_PADS) {
        if (padSet.has(pad.id)) {
            cap += pad.capBonus;
        }
    }
    cap += Number(rebirthCount || 0) * 1500;
    return cap;
}

/**
 * Obtiene el catálogo completo de ítems indexado y en lista.
 */
async function getCatalogItems() {
    const { data } = await supabase.from('tycoon_items_catalog').select('*');
    const items = Array.isArray(data) ? data : [];
    const map = new Map(items.map(it => [String(it.item_id), it]));
    return { items, map };
}

/**
 * Obtiene el inventario completo de un usuario enriquecido con datos del catálogo.
 */
async function getUserInventory(userId) {
    const uid = String(userId);
    const [{ data: invRows }, { map: catalogMap }] = await Promise.all([
        supabase.from('tycoon_user_inventory').select('*').eq('user_id', uid),
        getCatalogItems()
    ]);

    const rows = Array.isArray(invRows) ? invRows : [];
    const enriched = [];
    let totalRap = 0;

    for (const row of rows) {
        const catItem = catalogMap.get(String(row.item_id));
        if (!catItem) continue;
        const isLimited = catItem.category === 'LIMITED' || catItem.category === 'LIMITED_U';
        const itemRap = isLimited ? Number(catItem.current_rap || catItem.base_price || 0) : 0;
        if (isLimited) {
            totalRap += itemRap;
        }
        enriched.push({
            ...row,
            catalog: catItem,
            rap: itemRap
        });
    }

    return { items: enriched, totalRap, catalogMap };
}

/**
 * Calcula la producción de Tix/min y todos los multiplicadores activos de un perfil.
 */
function computeProductionMetrics(profile, equippedCatalogItem = null, nowMs = Date.now()) {
    const unlockedPads = parseUnlockedPads(profile.unlocked_pads);
    const padSet = new Set(unlockedPads);

    let baseTixPerMin = 0;
    for (const pad of STUDIO_PADS) {
        if (padSet.has(pad.id)) {
            baseTixPerMin += pad.tixPerMin;
        }
    }
    if (baseTixPerMin <= 0) baseTixPerMin = 15;

    const rebirthCount = Number(profile.rebirth_count || 0);
    const rebirthBonusPct = rebirthCount * 35; // +35% por cada Rebirth
    const equippedBonusPct = equippedCatalogItem ? Number(equippedCatalogItem.boost_pct || 0) : 0;

    let potionActive = false;
    let potionBonusPct = 0;
    let potionRemainingMin = 0;
    let potionInfo = null;

    if (profile.potion_expires_at) {
        const expMs = new Date(profile.potion_expires_at).getTime();
        if (Number.isFinite(expMs) && expMs > nowMs) {
            potionActive = true;
            potionRemainingMin = Math.max(1, Math.ceil((expMs - nowMs) / 60000));
            const pType = profile.potion_type === 'mega_elixir' ? 'mega_elixir' : 'speed_potion';
            potionInfo = POTIONS_CATALOG[pType];
            potionBonusPct = potionInfo.boostPct;
        }
    }

    const nitroBonusPct = profile.vip_nitro_boost ? 50 : 0;
    const ytBonusPct = profile.vip_yt_sub ? 35 : 0;

    const totalBonusPct = rebirthBonusPct + equippedBonusPct + potionBonusPct + nitroBonusPct + ytBonusPct;
    const multiplier = Number((1 + totalBonusPct / 100).toFixed(2));
    const effectiveTixPerMin = Math.max(1, Math.round(baseTixPerMin * multiplier));
    const collectorCap = calculateCollectorCap(unlockedPads, rebirthCount);

    const nextPad = STUDIO_PADS.find(p => !padSet.has(p.id)) || null;
    const allPadsUnlocked = STUDIO_PADS.every(p => padSet.has(p.id));

    return {
        unlockedPads,
        baseTixPerMin,
        effectiveTixPerMin,
        multiplier,
        totalBonusPct,
        rebirthBonusPct,
        equippedBonusPct,
        potionActive,
        potionBonusPct,
        potionRemainingMin,
        potionInfo,
        nitroBonusPct,
        ytBonusPct,
        collectorCap,
        nextPad,
        allPadsUnlocked
    };
}

/**
 * Obtiene o crea el perfil de /tycoon de un jugador y sincroniza su Collector Pad por timestamps.
 */
async function getOrCreatePlayerState(userId, member = null) {
    const uid = String(userId);
    const now = new Date();
    const nowMs = now.getTime();

    let { data: profile, error: dbError } = await supabase
        .from('tycoon_profiles')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle();

    if (!profile && dbError) {
        console.warn(`[TYCOON] Error en consulta remota de perfil para ${uid}:`, dbError.message || dbError);
        const memProfile = (supabase.memoryTables?.tycoon_profiles || []).find(p => String(p.user_id) === uid);
        if (memProfile) {
            profile = memProfile;
        } else {
            throw new Error('Base de datos temporalmente no disponible. Tu progreso del Tycoon está a salvo, reintenta en un momento.');
        }
    }

    if (!profile) {
        const memProfile = (supabase.memoryTables?.tycoon_profiles || []).find(p => String(p.user_id) === uid);
        if (memProfile) {
            profile = memProfile;
        } else {
            const initialProfile = {
                user_id: uid,
                tix_balance: 150,
                crystal_balance: 15,
                collector_tix: 25,
                collector_cap: 500,
                studio_stage: 1,
                rebirth_count: 0,
                ascension_tokens: 0,
                ugc_license_unlocked: false,
                equipped_item_id: null,
                potion_type: null,
                potion_expires_at: null,
                vip_nitro_boost: false,
                vip_yt_sub: false,
                last_yt_potion_at: null,
                last_collected_at: now.toISOString(),
                last_silent_reward_at: null,
                unlocked_pads: ['pad_dropper1'],
                weekly_quests_state: null,
                created_at: now.toISOString()
            };
            syncWeeklyQuestsState(initialProfile, nowMs);
            await supabase.from('tycoon_profiles').upsert(initialProfile, { onConflict: 'user_id' });
            profile = initialProfile;
        }
    }

    const { mutated: questsMutated } = syncWeeklyQuestsState(profile, nowMs);

    // Sincronizar estado VIP estrictamente con la configuración del Administrador en /config
    const authorizedVip = isUserAuthorizedVip(uid, member);
    let vipMutated = false;
    if (Boolean(profile.vip_nitro_boost) !== authorizedVip || Boolean(profile.vip_yt_sub) !== false) {
        profile.vip_nitro_boost = authorizedVip;
        profile.vip_yt_sub = false;
        vipMutated = true;
    }

    const { items: inventory, totalRap, catalogMap } = await getUserInventory(uid);
    const equippedItem = profile.equipped_item_id
        ? catalogMap.get(String(profile.equipped_item_id)) || null
        : null;

    const metrics = computeProductionMetrics(profile, equippedItem, nowMs);

    // Calcular Tix generados desde last_collected_at
    const lastCollectedMs = profile.last_collected_at
        ? new Date(profile.last_collected_at).getTime()
        : nowMs;
    const elapsedMinutes = Math.max(0, (nowMs - lastCollectedMs) / 60000);
    const generatedTix = Math.floor(elapsedMinutes * metrics.effectiveTixPerMin);

    let currentCollector = Number(profile.collector_tix || 0);
    let dirty = questsMutated || vipMutated;

    if (generatedTix > 0) {
        currentCollector = Math.min(metrics.collectorCap, currentCollector + generatedTix);
        profile.collector_tix = currentCollector;
        profile.last_collected_at = now.toISOString();
        dirty = true;
    }

    if (Number(profile.collector_cap) !== metrics.collectorCap) {
        profile.collector_cap = metrics.collectorCap;
        dirty = true;
    }

    if (profile.vip_nitro_boost || profile.vip_yt_sub) {
        if (!profile.ugc_license_unlocked) {
            profile.ugc_license_unlocked = true;
            dirty = true;
        }
    }

    if (dirty) {
        await supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' });
    }

    const weeklyQuests = buildWeeklyQuestsSummary(profile, nowMs);
    const dailyStreak = buildDailyStreakSummary(profile, nowMs);

    return {
        profile,
        inventory,
        totalRap,
        equippedItem,
        metrics,
        weeklyQuests,
        dailyStreak,
        catalogMap
    };
}

/**
 * Puente Silencioso: Recompensa al usuario con Tix pasivos cuando usa el bot naturalmente (cooldown 5 min).
 * Nunca interrumpe ni modifica los paneles de /roblox.
 */
async function rewardSilentActivity(userId) {
    try {
        if (!userId) return null;
        const uid = String(userId);
        const nowMs = Date.now();
        const lastMem = silentRewardCooldownMap.get(uid) || 0;
        if (nowMs - lastMem < SILENT_REWARD_COOLDOWN_MS) {
            return null;
        }
        silentRewardCooldownMap.set(uid, nowMs);

        const { data: existing, error: dbError } = await supabase
            .from('tycoon_profiles')
            .select('*')
            .eq('user_id', uid)
            .maybeSingle();

        if (dbError) {
            return null;
        }

        const bonusTix = 30;
        const nowIso = new Date(nowMs).toISOString();

        if (!existing) {
            const memExisting = (supabase.memoryTables?.tycoon_profiles || []).find(p => String(p.user_id) === uid);
            if (memExisting) {
                memExisting.tix_balance = Number(memExisting.tix_balance || 0) + bonusTix;
                memExisting.last_silent_reward_at = nowIso;
                syncWeeklyQuestsState(memExisting, nowMs);
                incrementQuestProgress(memExisting, 'q_rebirth_or_bot', 1, nowMs);
                await supabase.from('tycoon_profiles').upsert(memExisting, { onConflict: 'user_id' });
                return { rewarded: bonusTix };
            }

            const starter = {
                user_id: uid,
                tix_balance: 150 + bonusTix,
                crystal_balance: 15,
                collector_tix: 25,
                collector_cap: 500,
                studio_stage: 1,
                rebirth_count: 0,
                ascension_tokens: 0,
                ugc_license_unlocked: false,
                equipped_item_id: null,
                potion_type: null,
                potion_expires_at: null,
                vip_nitro_boost: false,
                vip_yt_sub: false,
                last_yt_potion_at: null,
                last_collected_at: nowIso,
                last_silent_reward_at: nowIso,
                unlocked_pads: ['pad_dropper1'],
                weekly_quests_state: null,
                created_at: nowIso
            };
            syncWeeklyQuestsState(starter, nowMs);
            incrementQuestProgress(starter, 'q_rebirth_or_bot', 1, nowMs);
            await supabase.from('tycoon_profiles').upsert(starter, { onConflict: 'user_id' });
            return { rewarded: bonusTix };
        }

        if (existing.last_silent_reward_at) {
            const prevMs = new Date(existing.last_silent_reward_at).getTime();
            if (Number.isFinite(prevMs) && nowMs - prevMs < SILENT_REWARD_COOLDOWN_MS) {
                return null;
            }
        }

        existing.tix_balance = Number(existing.tix_balance || 0) + bonusTix;
        existing.last_silent_reward_at = nowIso;
        incrementQuestProgress(existing, 'q_rebirth_or_bot', 1, nowMs);
        await supabase.from('tycoon_profiles').upsert(existing, { onConflict: 'user_id' });
        return { rewarded: bonusTix };
    } catch {
        return null;
    }
}

/**
 * Recolecta todos los Tix acumulados en el Collector Pad verde.
 */
async function collectPadTix(userId) {
    const state = await getOrCreatePlayerState(userId);
    const { profile } = state;
    const available = Number(profile.collector_tix || 0);

    if (available <= 0) {
        return {
            ok: false,
            reason: 'empty',
            collected: 0,
            state
        };
    }

    profile.tix_balance = Number(profile.tix_balance || 0) + available;
    profile.collector_tix = 0;
    profile.last_collected_at = new Date().toISOString();
    incrementQuestProgress(profile, 'q_collect_tix', available);

    await supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' });
    const updatedState = await getOrCreatePlayerState(userId);

    return {
        ok: true,
        collected: available,
        state: updatedState
    };
}

/**
 * Compra el siguiente Pad de construcción del Estudio Tycoon.
 */
async function buyNextStudioPad(userId, targetPadId = null) {
    const state = await getOrCreatePlayerState(userId);
    const { profile, metrics } = state;
    const unlockedSet = new Set(metrics.unlockedPads);

    const padToBuy = targetPadId
        ? STUDIO_PADS.find(p => p.id === targetPadId && !unlockedSet.has(p.id))
        : metrics.nextPad;

    if (!padToBuy) {
        return {
            ok: false,
            reason: 'all_unlocked',
            state
        };
    }

    const balance = Number(profile.tix_balance || 0);
    if (balance < padToBuy.cost) {
        return {
            ok: false,
            reason: 'insufficient_tix',
            needed: padToBuy.cost,
            balance,
            pad: padToBuy,
            state
        };
    }

    unlockedSet.add(padToBuy.id);
    const newUnlocked = [...unlockedSet];
    const maxStage = STUDIO_PADS
        .filter(p => unlockedSet.has(p.id))
        .reduce((acc, p) => Math.max(acc, p.stage), 1);

    profile.tix_balance = balance - padToBuy.cost;
    profile.unlocked_pads = newUnlocked;
    profile.studio_stage = maxStage;
    profile.collector_cap = calculateCollectorCap(newUnlocked, profile.rebirth_count);
    incrementQuestProgress(profile, 'q_build_pads', 1);

    await supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' });
    const updatedState = await getOrCreatePlayerState(userId);

    return {
        ok: true,
        pad: padToBuy,
        state: updatedState
    };
}

/**
 * Ejecuta el Rebirth (Ascensión) cuando el jugador completó los 6 Pads del Estudio.
 */
async function performRebirth(userId) {
    const state = await getOrCreatePlayerState(userId);
    const { profile, metrics } = state;

    if (!metrics.allPadsUnlocked) {
        return {
            ok: false,
            reason: 'not_max_stage',
            state
        };
    }

    // Transferir cualquier Tix pendiente del colector antes de reiniciar
    const pendingCollector = Number(profile.collector_tix || 0);
    profile.tix_balance = Number(profile.tix_balance || 0) + pendingCollector;
    profile.collector_tix = 0;
    profile.unlocked_pads = ['pad_dropper1'];
    profile.studio_stage = 1;
    profile.rebirth_count = Number(profile.rebirth_count || 0) + 1;
    profile.ascension_tokens = Number(profile.ascension_tokens || 0) + 1;
    profile.collector_cap = calculateCollectorCap(['pad_dropper1'], profile.rebirth_count);
    profile.last_collected_at = new Date().toISOString();
    incrementQuestProgress(profile, 'q_rebirth_or_bot', 5);
    if (pendingCollector > 0) {
        incrementQuestProgress(profile, 'q_collect_tix', pendingCollector);
    }

    await supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' });
    const updatedState = await getOrCreatePlayerState(userId);

    return {
        ok: true,
        newRebirthCount: profile.rebirth_count,
        ascensionTokens: profile.ascension_tokens,
        state: updatedState
    };
}

/**
 * Compra un ítem de la Tienda Normal (en Tix).
 */
async function buyNormalShopItem(userId, itemId) {
    const state = await getOrCreatePlayerState(userId);
    const { profile, inventory, catalogMap } = state;
    const item = catalogMap.get(String(itemId));

    const isCrystalItem = item && (item.currency_type === 'CRYSTAL' || String(item.item_id).startsWith('crys_'));
    if (isCrystalItem) {
        return await buyCrystalShopItem(userId, itemId);
    }

    if (!item || item.category !== 'NORMAL' || Number(item.base_price) <= 0) {
        return { ok: false, reason: 'invalid_item', state };
    }

    const alreadyOwned = inventory.some(i => String(i.item_id) === String(itemId));
    if (alreadyOwned) {
        return { ok: false, reason: 'already_owned', item, state };
    }

    const balance = Number(profile.tix_balance || 0);
    const cost = Number(item.base_price || 0);
    if (balance < cost) {
        return { ok: false, reason: 'insufficient_tix', item, cost, balance, state };
    }

    profile.tix_balance = balance - cost;
    if (!profile.equipped_item_id) {
        profile.equipped_item_id = item.item_id;
    }

    const instance = {
        instance_id: `inv_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: String(userId),
        item_id: item.item_id,
        serial_number: null,
        acquired_at: new Date().toISOString()
    };

    item.minted_count = Number(item.minted_count || 0) + 1;
    item.sales_count = Number(item.sales_count || 0) + 1;

    await Promise.all([
        supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' }),
        supabase.from('tycoon_user_inventory').insert(instance),
        supabase.from('tycoon_items_catalog').upsert(item, { onConflict: 'item_id' })
    ]);

    const updatedState = await getOrCreatePlayerState(userId);
    return { ok: true, item, instance, state: updatedState };
}

/**
 * Compra un ítem exclusivo con Cristales Kortex (💠) obtenidos en Misiones Semanales.
 */
async function buyCrystalShopItem(userId, itemId) {
    const state = await getOrCreatePlayerState(userId);
    const { profile, inventory, catalogMap } = state;
    const item = catalogMap.get(String(itemId));

    const isCrystal = item && (item.currency_type === 'CRYSTAL' || String(item.item_id).startsWith('crys_'));
    if (!item || !isCrystal || Number(item.base_price) <= 0) {
        return { ok: false, reason: 'invalid_item', state };
    }

    const alreadyOwned = inventory.some(i => String(i.item_id) === String(itemId));
    if (alreadyOwned) {
        return { ok: false, reason: 'already_owned', item, state };
    }

    const crystalBalance = Number(profile.crystal_balance || 0);
    const cost = Number(item.base_price || 0);
    if (crystalBalance < cost) {
        return {
            ok: false,
            reason: 'insufficient_crystals',
            item,
            cost,
            crystalBalance,
            state
        };
    }

    profile.crystal_balance = crystalBalance - cost;
    profile.equipped_item_id = item.item_id;

    const instance = {
        instance_id: `inv_${userId}_${Date.now()}_crys_${Math.random().toString(36).slice(2, 6)}`,
        user_id: String(userId),
        item_id: item.item_id,
        serial_number: null,
        acquired_at: new Date().toISOString()
    };

    item.minted_count = Number(item.minted_count || 0) + 1;
    item.sales_count = Number(item.sales_count || 0) + 1;

    await Promise.all([
        supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' }),
        supabase.from('tycoon_user_inventory').insert(instance),
        supabase.from('tycoon_items_catalog').upsert(item, { onConflict: 'item_id' })
    ]);

    const updatedState = await getOrCreatePlayerState(userId);
    return { ok: true, item, cost, instance, state: updatedState };
}

/**
 * Reclama todas las Misiones Semanales completadas (o una específica) y acredita Cristales Kortex (💠) + Tix.
 */
async function claimWeeklyQuestReward(userId, targetQuestId = null) {
    const state = await getOrCreatePlayerState(userId);
    const { profile } = state;
    const nowMs = Date.now();
    const { stateObj } = syncWeeklyQuestsState(profile, nowMs);

    const claimedQuests = [];
    let totalCrystalsEarned = 0;
    let totalTixEarned = 0;

    for (const q of WEEKLY_QUESTS_POOL) {
        if (targetQuestId && targetQuestId !== 'all' && q.id !== targetQuestId) continue;
        const current = Number(stateObj.progress[q.id] || 0);
        const isCompleted = current >= q.target;
        const isAlreadyClaimed = Boolean(stateObj.claimed[q.id]);

        if (isCompleted && !isAlreadyClaimed) {
            stateObj.claimed[q.id] = true;
            totalCrystalsEarned += q.rewardCrystals;
            totalTixEarned += q.rewardTix;
            claimedQuests.push(q);
        }
    }

    if (claimedQuests.length === 0) {
        return {
            ok: false,
            reason: 'none_claimable',
            state
        };
    }

    // Verificar si ya reclamó las 4 misiones de la semana para otorgar el bono extra de +30 Cristales
    const allFourClaimed = WEEKLY_QUESTS_POOL.every(q => Boolean(stateObj.claimed[q.id]));
    let grantedAllBonus = false;
    if (allFourClaimed && !stateObj.allBonusClaimed) {
        stateObj.allBonusClaimed = true;
        totalCrystalsEarned += WEEKLY_ALL_COMPLETED_BONUS_CRYSTALS;
        grantedAllBonus = true;
    }

    profile.crystal_balance = Number(profile.crystal_balance || 0) + totalCrystalsEarned;
    profile.tix_balance = Number(profile.tix_balance || 0) + totalTixEarned;
    profile.weekly_quests_state = stateObj;

    await supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' });
    const updatedState = await getOrCreatePlayerState(userId);

    return {
        ok: true,
        claimedQuests,
        totalCrystalsEarned,
        totalTixEarned,
        grantedAllBonus,
        bonusCrystals: grantedAllBonus ? WEEKLY_ALL_COMPLETED_BONUS_CRYSTALS : 0,
        state: updatedState
    };
}

/**
 * Equipa un ítem que el usuario posea en su inventario.
 */
async function equipUserItem(userId, itemId) {
    const state = await getOrCreatePlayerState(userId);
    const { profile, inventory, catalogMap } = state;

    const owns = inventory.some(i => String(i.item_id) === String(itemId));
    if (!owns) {
        return { ok: false, reason: 'not_owned', state };
    }

    profile.equipped_item_id = String(itemId);
    await supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' });
    const updatedState = await getOrCreatePlayerState(userId);

    return {
        ok: true,
        item: catalogMap.get(String(itemId)),
        state: updatedState
    };
}

/**
 * Desbloquea la Licencia de Creador UGC (gratis para Nitro Boosters / YT Subs o F2P en Nivel 6 + 1,200 Tix).
 */
async function unlockUgcCreatorLicense(userId) {
    const state = await getOrCreatePlayerState(userId);
    const { profile } = state;

    if (profile.ugc_license_unlocked) {
        return { ok: false, reason: 'already_unlocked', state };
    }

    const isVip = Boolean(profile.vip_nitro_boost || profile.vip_yt_sub);
    if (isVip) {
        profile.ugc_license_unlocked = true;
        await supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' });
        const updatedState = await getOrCreatePlayerState(userId);
        return { ok: true, method: 'vip_free', cost: 0, state: updatedState };
    }

    const reachedStage6 = Number(profile.studio_stage || 1) >= 6 || Number(profile.rebirth_count || 0) >= 1;
    if (!reachedStage6) {
        return { ok: false, reason: 'requires_stage_6', state };
    }

    const licenseFee = 1200;
    const balance = Number(profile.tix_balance || 0);
    if (balance < licenseFee) {
        return { ok: false, reason: 'insufficient_tix', cost: licenseFee, balance, state };
    }

    profile.tix_balance = balance - licenseFee;
    profile.ugc_license_unlocked = true;
    await supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' });
    const updatedState = await getOrCreatePlayerState(userId);

    return { ok: true, method: 'f2p_paid', cost: licenseFee, state: updatedState };
}

/**
 * Publica un nuevo ítem UGC en el Mercado Comunitario aplicando las 5 Reglas Anti-Abuso.
 */
async function publishCustomUgcItem(userId, username, { rawName, rawEmoji, rawColorHex, rawPrice, rawDescription }) {
    const state = await getOrCreatePlayerState(userId);
    const { profile } = state;

    if (!profile.ugc_license_unlocked && !profile.vip_nitro_boost && !profile.vip_yt_sub) {
        return { ok: false, reason: 'no_license', state };
    }

    // Regla 2: Máximo 2 ítems UGC activos por creador
    const { items: allCatalog } = await getCatalogItems();
    const myUgcs = allCatalog.filter(it => it.category === 'UGC' && String(it.creator_id) === String(userId));
    if (myUgcs.length >= 2) {
        return { ok: false, reason: 'max_ugc_reached', currentCount: myUgcs.length, state };
    }

    // Regla 3: Validación estricta de nombre y palabras reservadas
    const cleanName = String(rawName || '')
        .replace(/\[🎨\s*UGC\]/gi, '')
        .replace(/[<>@#`]/g, '')
        .trim();

    if (cleanName.length < 3 || cleanName.length > 32) {
        return { ok: false, reason: 'invalid_name_length', state };
    }

    if (UGC_FORBIDDEN_REGEX.test(cleanName)) {
        return { ok: false, reason: 'forbidden_words', state };
    }

    // Regla 2: Precio controlado entre 200 y 1,500 Tix
    const price = parseInt(String(rawPrice || '').trim(), 10);
    if (!Number.isFinite(price) || price < 200 || price > 1500) {
        return { ok: false, reason: 'invalid_price_range', state };
    }

    // Regla 2: Costo de Publicación (Depósito de 250 Tix)
    const depositFee = 250;
    const balance = Number(profile.tix_balance || 0);
    if (balance < depositFee) {
        return { ok: false, reason: 'insufficient_deposit', depositFee, balance, state };
    }

    const emojiCandidate = String(rawEmoji || '🎨').trim().slice(0, 4) || '🎨';
    const hexMatch = String(rawColorHex || '').trim().match(/^#?[0-9A-Fa-f]{6}$/);
    const colorHex = hexMatch
        ? (hexMatch[0].startsWith('#') ? hexMatch[0].toUpperCase() : `#${hexMatch[0].toUpperCase()}`)
        : '#8B5CF6';

    const cleanDesc = String(rawDescription || '').replace(/[<>`]/g, '').trim().slice(0, 90) ||
        `Diseño comunitario creado por @${username}`;

    const finalName = `[🎨 UGC] ${cleanName}`;
    const itemId = `ugc_${userId}_${Date.now().toString(36)}`;

    const newCatalogItem = {
        item_id: itemId,
        name: finalName,
        name_en: finalName,
        category: 'UGC',
        creator_id: String(userId),
        creator_name: `@${username}`,
        base_price: price,
        current_rap: 0,
        boost_pct: 10, // Fijo +10% Tix/min (Regla 2)
        max_supply: null,
        minted_count: 1,
        sales_count: 0,
        icon_emoji: emojiCandidate,
        color_hex: colorHex,
        description_es: cleanDesc,
        description_en: cleanDesc,
        created_at: new Date().toISOString()
    };

    // Descontar depósito de 250 Tix y entregar 1 copia de autor al creador
    profile.tix_balance = balance - depositFee;
    const creatorInstance = {
        instance_id: `inv_${userId}_${Date.now()}_ugc`,
        user_id: String(userId),
        item_id: itemId,
        serial_number: null,
        acquired_at: new Date().toISOString()
    };

    await Promise.all([
        supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' }),
        supabase.from('tycoon_items_catalog').insert(newCatalogItem),
        supabase.from('tycoon_user_inventory').insert(creatorInstance)
    ]);

    const updatedState = await getOrCreatePlayerState(userId);
    return {
        ok: true,
        item: newCatalogItem,
        depositFee,
        state: updatedState
    };
}

/**
 * Compra un ítem UGC del Mercado Comunitario aplicando las Reglas 4 y 5:
 * - Prohibido auto-comprarse
 * - Comprador debe tener Estudio Nivel >= 4 (o al menos 1 Rebirth)
 * - Máximo 1 copia por comprador (tycoon_ugc_purchases)
 * - Impuesto del 30% (70% regalía al creador, 30% quemado)
 */
async function buyCommunityUgcItem(buyerId, itemId) {
    const state = await getOrCreatePlayerState(buyerId);
    const { profile, inventory, catalogMap } = state;
    const item = catalogMap.get(String(itemId));

    if (!item || item.category !== 'UGC') {
        return { ok: false, reason: 'not_found', state };
    }

    // Regla 4: Prohibido Auto-Comprarse
    if (String(item.creator_id) === String(buyerId)) {
        return { ok: false, reason: 'self_purchase_forbidden', item, state };
    }

    // Regla 5: Nivel mínimo del comprador (Estudio Nivel 4 o Rebirth >= 1)
    const buyerStage = Number(profile.studio_stage || 1);
    const buyerRebirths = Number(profile.rebirth_count || 0);
    if (buyerStage < 4 && buyerRebirths < 1) {
        return { ok: false, reason: 'buyer_stage_too_low', requiredStage: 4, currentStage: buyerStage, item, state };
    }

    // Regla 5: Límite de 1 copia por comprador
    const { data: existingPurchases } = await supabase
        .from('tycoon_ugc_purchases')
        .select('*')
        .eq('item_id', String(itemId))
        .eq('buyer_id', String(buyerId));

    const alreadyBought = (Array.isArray(existingPurchases) && existingPurchases.length > 0) ||
        inventory.some(i => String(i.item_id) === String(itemId));

    if (alreadyBought) {
        return { ok: false, reason: 'already_purchased_one_copy', item, state };
    }

    const price = Number(item.base_price || 0);
    const balance = Number(profile.tix_balance || 0);
    if (balance < price) {
        return { ok: false, reason: 'insufficient_tix', price, balance, item, state };
    }

    const royalty70 = Math.floor(price * 0.70);
    const burned30 = price - royalty70;

    // 1. Descontar 100% al comprador
    profile.tix_balance = balance - price;
    await supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' });

    // 2. Acreditar 70% de regalía al creador
    const { data: creatorProfile } = await supabase
        .from('tycoon_profiles')
        .select('*')
        .eq('user_id', String(item.creator_id))
        .maybeSingle();

    if (creatorProfile) {
        creatorProfile.tix_balance = Number(creatorProfile.tix_balance || 0) + royalty70;
        await supabase.from('tycoon_profiles').upsert(creatorProfile, { onConflict: 'user_id' });
    }

    // 3. Registrar compra única y entregar instancia al comprador
    const purchaseRecord = {
        purchase_id: `ugcp_${itemId}_${buyerId}`,
        item_id: item.item_id,
        buyer_id: String(buyerId),
        creator_id: String(item.creator_id),
        price_paid: price,
        purchased_at: new Date().toISOString()
    };

    const buyerInstance = {
        instance_id: `inv_${buyerId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: String(buyerId),
        item_id: item.item_id,
        serial_number: null,
        acquired_at: new Date().toISOString()
    };

    item.minted_count = Number(item.minted_count || 0) + 1;
    item.sales_count = Number(item.sales_count || 0) + 1;

    await Promise.all([
        supabase.from('tycoon_ugc_purchases').upsert(purchaseRecord, { onConflict: 'purchase_id' }),
        supabase.from('tycoon_user_inventory').insert(buyerInstance),
        supabase.from('tycoon_items_catalog').upsert(item, { onConflict: 'item_id' })
    ]);

    const updatedState = await getOrCreatePlayerState(buyerId);
    return {
        ok: true,
        item,
        price,
        royalty70,
        burned30,
        state: updatedState
    };
}

/**
 * Permite al propietario del bot eliminar un ítem UGC por moderación desde /config.
 */
async function deleteUgcItemByOwner(itemId) {
    const { map } = await getCatalogItems();
    const target = map.get(String(itemId));
    if (!target || target.category !== 'UGC') {
        return { ok: false, reason: 'not_found' };
    }

    await Promise.all([
        supabase.from('tycoon_items_catalog').delete().eq('item_id', String(itemId)),
        supabase.from('tycoon_user_inventory').delete().eq('item_id', String(itemId)),
        supabase.from('tycoon_ugc_purchases').delete().eq('item_id', String(itemId))
    ]);

    return { ok: true, deletedItem: target };
}

/**
 * Abre un Cofre de Ascensión (con 1 Token de Rebirth o 3,500 Tix) para obtener un Limited o Limited U.
 */
async function openAscensionChest(userId) {
    const state = await getOrCreatePlayerState(userId);
    const { profile, catalogMap } = state;

    const chestCostTix = 3500;
    const tokens = Number(profile.ascension_tokens || 0);
    const balance = Number(profile.tix_balance || 0);
    const usedToken = tokens > 0;

    if (!usedToken) {
        if (Number(profile.studio_stage || 1) < 3 && Number(profile.rebirth_count || 0) < 1) {
            return { ok: false, reason: 'requires_stage_3', state };
        }
        if (balance < chestCostTix) {
            return { ok: false, reason: 'insufficient_tix', cost: chestCostTix, balance, state };
        }
    }

    const allItems = [...catalogMap.values()];
    const limitedPool = allItems.filter(it => it.category === 'LIMITED');
    const limitedUPool = allItems.filter(
        it => it.category === 'LIMITED_U' && Number(it.minted_count || 0) < Number(it.max_supply || 15)
    );

    // 25% probabilidad de sacar un Limited U si aún queda stock global; 75% Limited clásico
    const rollLimitedU = limitedUPool.length > 0 && Math.random() < 0.25;
    const pool = rollLimitedU ? limitedUPool : limitedPool;
    const wonItem = pool[Math.floor(Math.random() * pool.length)] || limitedPool[0];

    if (!wonItem) {
        return { ok: false, reason: 'empty_pool', state };
    }

    if (usedToken) {
        profile.ascension_tokens = tokens - 1;
    } else {
        profile.tix_balance = balance - chestCostTix;
    }
    incrementQuestProgress(profile, 'q_use_potions', 1);

    let serialNumber = null;
    const newMintCount = Number(wonItem.minted_count || 0) + 1;
    if (wonItem.category === 'LIMITED_U') {
        serialNumber = newMintCount;
    }
    wonItem.minted_count = newMintCount;

    const newInstance = {
        instance_id: `inv_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: String(userId),
        item_id: wonItem.item_id,
        serial_number: serialNumber,
        acquired_at: new Date().toISOString()
    };

    await Promise.all([
        supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' }),
        supabase.from('tycoon_items_catalog').upsert(wonItem, { onConflict: 'item_id' }),
        supabase.from('tycoon_user_inventory').insert(newInstance)
    ]);

    const updatedState = await getOrCreatePlayerState(userId);
    return {
        ok: true,
        usedToken,
        costPaid: usedToken ? 0 : chestCostTix,
        wonItem,
        serialNumber,
        instance: newInstance,
        state: updatedState
    };
}

/**
 * Reclama/Compra directamente un Drop de Limited U si aún quedan copias disponibles (#01/Max).
 */
async function claimLimitedUDrop(userId, itemId) {
    const state = await getOrCreatePlayerState(userId);
    const { profile, catalogMap } = state;
    const item = catalogMap.get(String(itemId));

    if (!item || item.category !== 'LIMITED_U') {
        return { ok: false, reason: 'invalid_item', state };
    }

    const minted = Number(item.minted_count || 0);
    const maxSupply = Number(item.max_supply || 15);
    if (minted >= maxSupply) {
        return { ok: false, reason: 'sold_out', item, state };
    }

    const cost = Number(item.base_price || 9500);
    const balance = Number(profile.tix_balance || 0);
    if (balance < cost) {
        return { ok: false, reason: 'insufficient_tix', item, cost, balance, state };
    }

    const serialNumber = minted + 1;
    item.minted_count = serialNumber;
    item.sales_count = Number(item.sales_count || 0) + 1;
    profile.tix_balance = balance - cost;

    const instance = {
        instance_id: `inv_${userId}_${Date.now()}_limu_${serialNumber}`,
        user_id: String(userId),
        item_id: item.item_id,
        serial_number: serialNumber,
        acquired_at: new Date().toISOString()
    };

    await Promise.all([
        supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' }),
        supabase.from('tycoon_items_catalog').upsert(item, { onConflict: 'item_id' }),
        supabase.from('tycoon_user_inventory').insert(instance)
    ]);

    const updatedState = await getOrCreatePlayerState(userId);
    return {
        ok: true,
        item,
        serialNumber,
        maxSupply,
        cost,
        state: updatedState
    };
}

/**
 * Obtiene las ofertas de Trading P2P activas (Tablero Público + Ofertas Directas del usuario).
 */
async function getActiveTrades(userId) {
    const uid = String(userId);
    const [{ data: allPending }, { map: catalogMap }] = await Promise.all([
        supabase.from('tycoon_trades_p2p').select('*').eq('status', 'PENDING'),
        getCatalogItems()
    ]);

    const list = Array.isArray(allPending) ? allPending : [];
    const relevant = list.filter(
        t => t.receiver_id === 'PUBLIC' || String(t.sender_id) === uid || String(t.receiver_id) === uid
    );

    return {
        trades: relevant.slice(0, 20),
        catalogMap
    };
}

/**
 * Crea una Oferta de Trading P2P (en el Tablero Público o Directa a otro jugador por ID/mención).
 * Exclusivo para ítems LIMITED y LIMITED_U.
 */
async function createTradeOffer(senderId, senderName, {
    targetReceiverId = 'PUBLIC',
    offeredInstanceIds = [],
    tixOffered = 0,
    requestedItemId = null,
    tixRequested = 0
}) {
    const state = await getOrCreatePlayerState(senderId);
    const { profile, inventory, catalogMap } = state;

    const cleanInstanceIds = [...new Set((offeredInstanceIds || []).map(String).filter(Boolean))].slice(0, 3);
    if (cleanInstanceIds.length === 0) {
        return { ok: false, reason: 'no_items_offered', state };
    }

    // Verificar que cada instancia pertenezca al remitente y sea estrictamente LIMITED o LIMITED_U
    const offeredInstances = [];
    for (const instId of cleanInstanceIds) {
        const found = inventory.find(i => String(i.instance_id) === instId);
        if (!found) {
            return { ok: false, reason: 'instance_not_owned', state };
        }
        const cat = found.catalog?.category;
        if (cat !== 'LIMITED' && cat !== 'LIMITED_U') {
            return { ok: false, reason: 'not_tradeable_category', state };
        }
        offeredInstances.push({
            instance_id: found.instance_id,
            item_id: found.item_id,
            serial_number: found.serial_number || null,
            name: found.catalog.name,
            icon_emoji: found.catalog.icon_emoji,
            rap: found.rap
        });
    }

    const cleanTixOffered = Math.max(0, parseInt(String(tixOffered || 0), 10) || 0);
    const cleanTixRequested = Math.max(0, parseInt(String(tixRequested || 0), 10) || 0);

    if (cleanTixOffered > Number(profile.tix_balance || 0)) {
        return { ok: false, reason: 'insufficient_tix_offered', state };
    }

    if (requestedItemId) {
        const reqCatItem = catalogMap.get(String(requestedItemId));
        if (!reqCatItem || (reqCatItem.category !== 'LIMITED' && reqCatItem.category !== 'LIMITED_U')) {
            return { ok: false, reason: 'invalid_requested_item', state };
        }
    }

    const cleanReceiver = (!targetReceiverId || targetReceiverId.toUpperCase() === 'PUBLIC')
        ? 'PUBLIC'
        : String(targetReceiverId).replace(/[<@!>]/g, '').trim();

    if (cleanReceiver === String(senderId)) {
        return { ok: false, reason: 'cannot_trade_self', state };
    }

    const tradeRecord = {
        trade_id: `trd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        sender_id: String(senderId),
        sender_name: `@${senderName}`,
        receiver_id: cleanReceiver,
        receiver_name: cleanReceiver === 'PUBLIC' ? 'PUBLIC' : `<@${cleanReceiver}>`,
        sender_items: offeredInstances,
        receiver_items: [],
        requested_item_id: requestedItemId || null,
        tix_offered: cleanTixOffered,
        tix_requested: cleanTixRequested,
        status: 'PENDING',
        created_at: new Date().toISOString()
    };

    await supabase.from('tycoon_trades_p2p').insert(tradeRecord);
    return {
        ok: true,
        trade: tradeRecord,
        state
    };
}

/**
 * Acepta o Cancela una oferta de Trading P2P, transfiriendo los ítems Limited/Limited U y recalculando el RAP.
 */
async function resolveTradeOffer(actorId, tradeId, action = 'accept') {
    const { data: trade } = await supabase
        .from('tycoon_trades_p2p')
        .select('*')
        .eq('trade_id', String(tradeId))
        .maybeSingle();

    if (!trade || trade.status !== 'PENDING') {
        return { ok: false, reason: 'trade_not_active' };
    }

    const uid = String(actorId);

    if (action === 'cancel' || action === 'decline') {
        if (uid !== String(trade.sender_id) && uid !== String(trade.receiver_id)) {
            return { ok: false, reason: 'not_authorized' };
        }
        trade.status = uid === String(trade.sender_id) ? 'CANCELLED' : 'DECLINED';
        await supabase.from('tycoon_trades_p2p').upsert(trade, { onConflict: 'trade_id' });
        const state = await getOrCreatePlayerState(uid);
        return { ok: true, action: trade.status, trade, state };
    }

    // Acción: Aceptar oferta
    if (uid === String(trade.sender_id)) {
        return { ok: false, reason: 'cannot_accept_own_trade' };
    }
    if (trade.receiver_id !== 'PUBLIC' && String(trade.receiver_id) !== uid) {
        return { ok: false, reason: 'not_target_receiver' };
    }

    const [senderState, receiverState] = await Promise.all([
        getOrCreatePlayerState(trade.sender_id),
        getOrCreatePlayerState(uid)
    ]);

    const senderItemsList = Array.isArray(trade.sender_items) ? trade.sender_items : [];
    // Verificar que el sender aún posea todas las instancias ofrecidas
    const verifiedSenderInstances = [];
    for (const sItem of senderItemsList) {
        const owned = senderState.inventory.find(i => String(i.instance_id) === String(sItem.instance_id));
        if (!owned) {
            trade.status = 'CANCELLED';
            await supabase.from('tycoon_trades_p2p').upsert(trade, { onConflict: 'trade_id' });
            return { ok: false, reason: 'sender_no_longer_owns_items' };
        }
        verifiedSenderInstances.push(owned);
    }

    const tixOffered = Number(trade.tix_offered || 0);
    const tixRequested = Number(trade.tix_requested || 0);

    if (Number(senderState.profile.tix_balance || 0) < tixOffered) {
        return { ok: false, reason: 'sender_insufficient_tix' };
    }
    if (Number(receiverState.profile.tix_balance || 0) < tixRequested) {
        return { ok: false, reason: 'receiver_insufficient_tix', needed: tixRequested };
    }

    // Si la oferta pide un ítem Limited específico a cambio, verificar que el receptor lo tenga
    let receiverOfferedInstance = null;
    if (trade.requested_item_id) {
        receiverOfferedInstance = receiverState.inventory.find(
            i => String(i.item_id) === String(trade.requested_item_id)
        );
        if (!receiverOfferedInstance) {
            return {
                ok: false,
                reason: 'receiver_missing_requested_item',
                requestedItemId: trade.requested_item_id
            };
        }
    }

    // 1. Transferir Tix entre ambos jugadores
    senderState.profile.tix_balance = Number(senderState.profile.tix_balance || 0) - tixOffered + tixRequested;
    receiverState.profile.tix_balance = Number(receiverState.profile.tix_balance || 0) - tixRequested + tixOffered;

    // 2. Transferir propiedad de las instancias en tycoon_user_inventory
    for (const inst of verifiedSenderInstances) {
        inst.user_id = uid;
        if (senderState.profile.equipped_item_id === inst.item_id) {
            senderState.profile.equipped_item_id = null;
        }
        await supabase.from('tycoon_user_inventory').upsert({
            instance_id: inst.instance_id,
            user_id: uid,
            item_id: inst.item_id,
            serial_number: inst.serial_number,
            acquired_at: new Date().toISOString()
        }, { onConflict: 'instance_id' });
    }

    if (receiverOfferedInstance) {
        if (receiverState.profile.equipped_item_id === receiverOfferedInstance.item_id) {
            receiverState.profile.equipped_item_id = null;
        }
        await supabase.from('tycoon_user_inventory').upsert({
            instance_id: receiverOfferedInstance.instance_id,
            user_id: String(trade.sender_id),
            item_id: receiverOfferedInstance.item_id,
            serial_number: receiverOfferedInstance.serial_number,
            acquired_at: new Date().toISOString()
        }, { onConflict: 'instance_id' });
    }

    // 3. Actualizar RAP dinámico ponderado (70% RAP anterior + 30% valor de la operación)
    const { map: catalogMap } = await getCatalogItems();
    for (const inst of verifiedSenderInstances) {
        const catItem = catalogMap.get(String(inst.item_id));
        if (catItem && (catItem.category === 'LIMITED' || catItem.category === 'LIMITED_U')) {
            const oldRap = Number(catItem.current_rap || catItem.base_price || 5000);
            const impliedValue = tixRequested > 0
                ? Math.round(tixRequested / Math.max(1, verifiedSenderInstances.length))
                : Math.round(oldRap * 1.06);
            catItem.current_rap = Math.max(500, Math.round(oldRap * 0.70 + impliedValue * 0.30));
            catItem.sales_count = Number(catItem.sales_count || 0) + 1;
            await supabase.from('tycoon_items_catalog').upsert(catItem, { onConflict: 'item_id' });
        }
    }

    trade.status = 'ACCEPTED';
    trade.receiver_id = uid;
    if (receiverOfferedInstance) {
        trade.receiver_items = [{
            instance_id: receiverOfferedInstance.instance_id,
            item_id: receiverOfferedInstance.item_id,
            serial_number: receiverOfferedInstance.serial_number
        }];
    }

    await Promise.all([
        supabase.from('tycoon_profiles').upsert(senderState.profile, { onConflict: 'user_id' }),
        supabase.from('tycoon_profiles').upsert(receiverState.profile, { onConflict: 'user_id' }),
        supabase.from('tycoon_trades_p2p').upsert(trade, { onConflict: 'trade_id' })
    ]);

    const updatedState = await getOrCreatePlayerState(uid);
    return {
        ok: true,
        action: 'ACCEPTED',
        trade,
        state: updatedState
    };
}

/**
 * Compra y activa una Poción Consumible por 30 minutos.
 */
async function buyAndActivatePotion(userId, potionId = 'speed_potion') {
    const state = await getOrCreatePlayerState(userId);
    const { profile } = state;
    const potion = POTIONS_CATALOG[potionId] || POTIONS_CATALOG.speed_potion;

    const balance = Number(profile.tix_balance || 0);
    if (balance < potion.cost) {
        return {
            ok: false,
            reason: 'insufficient_tix',
            potion,
            cost: potion.cost,
            balance,
            state
        };
    }

    const nowMs = Date.now();
    const currentExpMs = profile.potion_expires_at ? new Date(profile.potion_expires_at).getTime() : 0;
    const baseMs = Number.isFinite(currentExpMs) && currentExpMs > nowMs ? currentExpMs : nowMs;
    const newExpiresIso = new Date(baseMs + potion.durationMinutes * 60000).toISOString();

    profile.tix_balance = balance - potion.cost;
    profile.potion_type = potion.id;
    profile.potion_expires_at = newExpiresIso;
    incrementQuestProgress(profile, 'q_use_potions', 1);

    await supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' });
    const updatedState = await getOrCreatePlayerState(userId);

    return {
        ok: true,
        potion,
        state: updatedState
    };
}

/**
 * Sincroniza los Beneficios VIP de Comunidad (Discord Server Boost y YouTube Subscriber/Member)
 * detectando automáticamente el estado del miembro en el servidor o rol/conexión,
 * y entregando el Sombrero de Copa Neón Booster + Poción Diaria de YouTube.
 */
/**
 * Permite al Administrador / Propietario del bot gestionar manualmente qué usuarios o roles tienen VIP en /tycoon.
 */
async function manageVipByAdmin({ action = 'add', rawUsersInput = '', rawRolesInput = '' }) {
    const ownerCfg = obtenerConfigPropietario();
    const currentVipUsers = new Set(Array.isArray(ownerCfg.vipUserIds) ? ownerCfg.vipUserIds.map(String) : []);
    const currentVipRoles = new Set(Array.isArray(ownerCfg.vipRoleIds) ? ownerCfg.vipRoleIds.map(String) : []);

    const normAction = String(action || 'add').trim().toLowerCase();
    const isRemove = normAction === 'remove' || normAction === 'quitar' || normAction === 'delete' || normAction === 'del';

    const parsedUsers = String(rawUsersInput || '')
        .split(/[\s,;]+/)
        .map(t => t.replace(/[<@!>]/g, '').trim())
        .filter(t => /^\d{5,25}$/.test(t));

    const parsedRoles = String(rawRolesInput || '')
        .split(/[,;]+/)
        .map(t => t.replace(/[<@&>]/g, '').trim())
        .filter(Boolean);

    for (const uid of parsedUsers) {
        if (isRemove) {
            currentVipUsers.delete(uid);
        } else {
            currentVipUsers.add(uid);
        }

        const state = await getOrCreatePlayerState(uid).catch(() => null);
        if (state && state.profile) {
            state.profile.vip_nitro_boost = !isRemove;
            state.profile.vip_yt_sub = false;
            if (!isRemove) {
                state.profile.ugc_license_unlocked = true;
                const ownsTopHat = state.inventory.some(i => i.item_id === 'vip_neon_booster_tophat');
                if (!ownsTopHat) {
                    await supabase.from('tycoon_user_inventory').insert({
                        instance_id: `inv_${uid}_vip_tophat`,
                        user_id: String(uid),
                        item_id: 'vip_neon_booster_tophat',
                        serial_number: null,
                        acquired_at: new Date().toISOString()
                    });
                }
            }
            await supabase.from('tycoon_profiles').upsert(state.profile, { onConflict: 'user_id' });
        }
    }

    for (const roleToken of parsedRoles) {
        if (isRemove) {
            currentVipRoles.delete(roleToken);
        } else {
            currentVipRoles.add(roleToken);
        }
    }

    const updatedCfg = guardarConfigPropietario({
        vipUserIds: [...currentVipUsers],
        vipRoleIds: [...currentVipRoles]
    });

    return {
        ok: true,
        action: isRemove ? 'remove' : 'add',
        vipUserIds: updatedCfg.vipUserIds,
        vipRoleIds: updatedCfg.vipRoleIds
    };
}

async function syncCommunityPerks(interaction) {
    const userId = interaction.user.id;
    const authorizedVip = isUserAuthorizedVip(userId, interaction.member);
    const state = await getOrCreatePlayerState(userId, interaction.member);
    return {
        ok: authorizedVip,
        detectedNitro: authorizedVip,
        detectedYt: false,
        grantedTopHat: false,
        grantedDailyPotion: false,
        state
    };
}

/**
 * Calcula el estado de la Racha Diaria (Daily Streak) de 1 a 7 días.
 */
function buildDailyStreakSummary(profile, nowMs = Date.now()) {
    const streakDays = Math.max(0, Number(profile.daily_streak || 0));
    const lastClaimIso = profile.last_daily_claim_at || null;
    const lastClaimMs = lastClaimIso ? new Date(lastClaimIso).getTime() : 0;
    const cooldownMs = 20 * 60 * 60 * 1000; // 20 horas para comodidad del jugador
    const resetWindowMs = 48 * 60 * 60 * 1000; // 48 horas antes de perder racha

    const elapsedMs = lastClaimMs > 0 ? nowMs - lastClaimMs : Infinity;
    const canClaim = elapsedMs >= cooldownMs;
    const nextStreakDay = (lastClaimMs > 0 && elapsedMs > resetWindowMs)
        ? 1
        : ((streakDays % 7) + 1);

    const remainingMs = canClaim ? 0 : Math.max(0, cooldownMs - elapsedMs);
    const hoursLeft = Math.floor(remainingMs / 3600000);
    const minsLeft = Math.max(1, Math.ceil((remainingMs % 3600000) / 60000));

    // Recompensas progresivas Día 1..7
    const rewardTix = 200 + nextStreakDay * 150;
    const rewardCrystals = nextStreakDay === 7 ? 25 : (nextStreakDay >= 4 ? 10 : 5);

    return {
        currentStreak: streakDays,
        nextStreakDay,
        canClaim,
        hoursLeft,
        minsLeft,
        rewardTix,
        rewardCrystals
    };
}

/**
 * Reclama la Racha Diaria (Daily Streak) otorgando Tix + Cristales Kortex (💠).
 */
async function claimDailyStreak(userId) {
    const state = await getOrCreatePlayerState(userId);
    const { profile } = state;
    const nowMs = Date.now();
    const summary = buildDailyStreakSummary(profile, nowMs);

    if (!summary.canClaim) {
        return {
            ok: false,
            reason: 'cooldown',
            hoursLeft: summary.hoursLeft,
            minsLeft: summary.minsLeft,
            streak: summary.currentStreak,
            state
        };
    }

    profile.daily_streak = summary.nextStreakDay;
    profile.last_daily_claim_at = new Date(nowMs).toISOString();
    profile.tix_balance = Number(profile.tix_balance || 0) + summary.rewardTix;
    profile.crystal_balance = Number(profile.crystal_balance || 0) + summary.rewardCrystals;

    incrementQuestProgress(profile, 'q_rebirth_or_bot', 1, nowMs);

    await supabase.from('tycoon_profiles').upsert(profile, { onConflict: 'user_id' });
    const updatedState = await getOrCreatePlayerState(userId);

    return {
        ok: true,
        streakDay: summary.nextStreakDay,
        rewardTix: summary.rewardTix,
        rewardCrystals: summary.rewardCrystals,
        state: updatedState
    };
}

/**
 * Obtiene el Top Ranking de jugadores de /tycoon ordenado por Producción (Tix/min) y Rebirths.
 */
async function getTycoonLeaderboard(limit = 6) {
    const [{ data: profiles }, { map: catalogMap }, { data: links }] = await Promise.all([
        supabase.from('tycoon_profiles').select('*'),
        getCatalogItems(),
        supabase.from('user_links').select('*')
    ]);

    const linkMap = new Map();
    if (Array.isArray(links)) {
        for (const l of links) {
            if (l.discord_id && l.roblox_username) {
                linkMap.set(String(l.discord_id), l.roblox_username);
            }
        }
    }

    const nowMs = Date.now();
    const rows = (Array.isArray(profiles) ? profiles : [])
        .filter(p => p && p.user_id && !String(p.user_id).startsWith('test_'))
        .map(p => {
            const eq = p.equipped_item_id ? catalogMap.get(String(p.equipped_item_id)) || null : null;
            const m = computeProductionMetrics(p, eq, nowMs);
            const rbxName = linkMap.get(String(p.user_id));
            return {
                userId: String(p.user_id),
                displayName: rbxName ? `@${rbxName}` : `Player #${String(p.user_id).slice(-4)}`,
                tixPerMin: m.effectiveTixPerMin,
                multiplier: m.multiplier,
                rebirths: Number(p.rebirth_count || 0),
                stage: Number(p.studio_stage || 1),
                crystals: Number(p.crystal_balance ?? 15),
                tixBalance: Number(p.tix_balance || 0)
            };
        });

    rows.sort((a, b) => {
        if (b.tixPerMin !== a.tixPerMin) return b.tixPerMin - a.tixPerMin;
        if (b.rebirths !== a.rebirths) return b.rebirths - a.rebirths;
        return b.tixBalance - a.tixBalance;
    });

    return rows.slice(0, limit);
}

module.exports = {
    STUDIO_PADS,
    POTIONS_CATALOG,
    WEEKLY_QUESTS_POOL,
    WEEKLY_ALL_COMPLETED_BONUS_CRYSTALS,
    UGC_ALLOWED_EMOJIS,
    getCurrentWeekKey,
    syncWeeklyQuestsState,
    incrementQuestProgress,
    buildWeeklyQuestsSummary,
    buildDailyStreakSummary,
    claimDailyStreak,
    getTycoonLeaderboard,
    getCatalogItems,
    getUserInventory,
    getOrCreatePlayerState,
    rewardSilentActivity,
    collectPadTix,
    buyNextStudioPad,
    performRebirth,
    buyNormalShopItem,
    buyCrystalShopItem,
    claimWeeklyQuestReward,
    equipUserItem,
    unlockUgcCreatorLicense,
    publishCustomUgcItem,
    buyCommunityUgcItem,
    deleteUgcItemByOwner,
    openAscensionChest,
    claimLimitedUDrop,
    getActiveTrades,
    createTradeOffer,
    resolveTradeOffer,
    buyAndActivatePotion,
    syncCommunityPerks,
    manageVipByAdmin,
    isUserAuthorizedVip
};
