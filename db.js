// ==========================================
// ARCHIVO: db.js
// Cliente de Supabase con Persistencia Automática en Disco + Memoria
// Garantiza que las sesiones, cuentas y datos guardados no se pierdan al actualizar el bot
// ==========================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const DATA_DIR = path.join(__dirname, 'data');
const DB_SNAPSHOT_FILE = path.join(DATA_DIR, 'kortex_db_snapshot.json');

const DEFAULT_PRICE_FLOORS = [
    { id: 1, subcategory_key: 'hat',      subcategory_name: 'Sombreros (Hat)',    asset_type_id: 8,  subcategory_id: 9,  floor_price: 65, previous_floor_price: 85,  reference_max_floor: 105, updated_at: new Date().toISOString() },
    { id: 2, subcategory_key: 'hair',     subcategory_name: 'Pelo (Hair)',        asset_type_id: 41, subcategory_id: 20, floor_price: 65, previous_floor_price: 75,  reference_max_floor: 95,  updated_at: new Date().toISOString() },
    { id: 3, subcategory_key: 'face',     subcategory_name: 'Cara (Face)',        asset_type_id: 42, subcategory_id: 21, floor_price: 50, previous_floor_price: 65,  reference_max_floor: 85,  updated_at: new Date().toISOString() },
    { id: 4, subcategory_key: 'neck',     subcategory_name: 'Cuello (Neck)',      asset_type_id: 43, subcategory_id: 22, floor_price: 50, previous_floor_price: 60,  reference_max_floor: 80,  updated_at: new Date().toISOString() },
    { id: 5, subcategory_key: 'shoulder', subcategory_name: 'Hombros (Shoulder)', asset_type_id: 44, subcategory_id: 23, floor_price: 50, previous_floor_price: 65,  reference_max_floor: 85,  updated_at: new Date().toISOString() },
    { id: 6, subcategory_key: 'front',    subcategory_name: 'Frente (Front)',     asset_type_id: 45, subcategory_id: 24, floor_price: 55, previous_floor_price: 75,  reference_max_floor: 95,  updated_at: new Date().toISOString() },
    { id: 7, subcategory_key: 'back',     subcategory_name: 'Espalda (Back)',     asset_type_id: 46, subcategory_id: 25, floor_price: 85, previous_floor_price: 110, reference_max_floor: 140, updated_at: new Date().toISOString() },
    { id: 8, subcategory_key: 'waist',    subcategory_name: 'Cintura (Waist)',    asset_type_id: 47, subcategory_id: 26, floor_price: 60, previous_floor_price: 75,  reference_max_floor: 95,  updated_at: new Date().toISOString() }
];

const DEFAULT_GAME_CODES = [
    { id: 1,  universe_id: 994732206,  game_name: 'Blox Fruits',      code: 'KITT_RESET',      reward_description: 'Reinicio gratuito de estadísticas (Stat Reset)', is_active: true, created_at: new Date().toISOString() },
    { id: 2,  universe_id: 994732206,  game_name: 'Blox Fruits',      code: 'SUB2CAPTAINMAUI', reward_description: '20 minutos de 2x EXP Boost', is_active: true, created_at: new Date().toISOString() },
    { id: 3,  universe_id: 994732206,  game_name: 'Blox Fruits',      code: 'SUB2FER999',      reward_description: '2x EXP Boost por 20 minutos', is_active: true, created_at: new Date().toISOString() },
    { id: 4,  universe_id: 994732206,  game_name: 'Blox Fruits',      code: 'ENYU_IS_PRO',     reward_description: '2x EXP Boost por 20 minutos', is_active: true, created_at: new Date().toISOString() },
    { id: 5,  universe_id: 994732206,  game_name: 'Blox Fruits',      code: 'STARCODEHEO',     reward_description: '2x EXP Boost por 20 minutos', is_active: true, created_at: new Date().toISOString() },
    { id: 6,  universe_id: 3317771874, game_name: 'Pet Simulator 99', code: 'pet-d67518012',   reward_description: 'Pociones de suerte Diamante IV + Boosts', is_active: true, created_at: new Date().toISOString() },
    { id: 7,  universe_id: 3317771874, game_name: 'Pet Simulator 99', code: 'big-games-99',    reward_description: 'Hoverboard exclusivo + 5 Llaves de Cristal', is_active: true, created_at: new Date().toISOString() },
    { id: 8,  universe_id: 1008451066, game_name: 'Da Hood',          code: 'DAHOOD2026',      reward_description: '250,000 Da Hood Cash ($DHC) + Cajas de Skins', is_active: true, created_at: new Date().toISOString() },
    { id: 9,  universe_id: 1008451066, game_name: 'Da Hood',          code: 'RUBY',            reward_description: '250,000 Da Hood Cash ($DHC)', is_active: true, created_at: new Date().toISOString() },
    { id: 10, universe_id: 5846386835, game_name: 'Anime Defenders',  code: 'DEFENDERS2026',   reward_description: '1,500 Gemas + 5 Trait Crystals', is_active: true, created_at: new Date().toISOString() },
    { id: 11, universe_id: 5846386835, game_name: 'Anime Defenders',  code: 'WISHES_UPDATE',   reward_description: '1,000 Gemas + 3 Reroll Tokens', is_active: true, created_at: new Date().toISOString() }
];

const DEFAULT_TYCOON_CATALOG = [
    // TIENDA NORMAL (Fijos, No Tradeables, +5% a +12%)
    {
        item_id: 'norm_bloxy_cola',
        name: 'Bloxy Cola Clásica',
        name_en: 'Classic Bloxy Cola',
        category: 'NORMAL',
        creator_id: 'SYSTEM',
        creator_name: 'Roblox Classic',
        base_price: 250,
        current_rap: 0,
        boost_pct: 5,
        max_supply: null,
        minted_count: 0,
        sales_count: 0,
        icon_emoji: '🥤',
        color_hex: '#F59E0B',
        description_es: 'Bebida energética clásica que acelera la línea de ensamblaje (+5% Tix/min).',
        description_en: 'Classic energy drink that speeds up your assembly line (+5% Tix/min).',
        created_at: new Date().toISOString()
    },
    {
        item_id: 'norm_builders_helmet',
        name: 'Casco Builders Club (BC)',
        name_en: 'Builders Club Hard Hat (BC)',
        category: 'NORMAL',
        creator_id: 'SYSTEM',
        creator_name: 'Roblox Classic',
        base_price: 600,
        current_rap: 0,
        boost_pct: 7,
        max_supply: null,
        minted_count: 0,
        sales_count: 0,
        icon_emoji: '⛑️',
        color_hex: '#FBBF24',
        description_es: 'Casco oficial de constructor veterano (+7% Tix/min).',
        description_en: 'Official veteran builder safety hard hat (+7% Tix/min).',
        created_at: new Date().toISOString()
    },
    {
        item_id: 'norm_shaggy_hair',
        name: 'Pelo Shaggy Clásico',
        name_en: 'Classic Shaggy Hair',
        category: 'NORMAL',
        creator_id: 'SYSTEM',
        creator_name: 'Roblox Classic',
        base_price: 1100,
        current_rap: 0,
        boost_pct: 9,
        max_supply: null,
        minted_count: 0,
        sales_count: 0,
        icon_emoji: '💇',
        color_hex: '#92400E',
        description_es: 'Estilo legendario de la vieja escuela de Roblox (+9% Tix/min).',
        description_en: 'Legendary old-school Roblox hairstyle (+9% Tix/min).',
        created_at: new Date().toISOString()
    },
    {
        item_id: 'norm_golden_boombox',
        name: 'Boombox Dorada Clásica',
        name_en: 'Classic Golden Super Fly Boombox',
        category: 'NORMAL',
        creator_id: 'SYSTEM',
        creator_name: 'Roblox Classic',
        base_price: 1850,
        current_rap: 0,
        boost_pct: 11,
        max_supply: null,
        minted_count: 0,
        sales_count: 0,
        icon_emoji: '📻',
        color_hex: '#EAB308',
        description_es: 'Música motivadora en todo el estudio Tycoon (+11% Tix/min).',
        description_en: 'High-voltage beats across your Tycoon studio (+11% Tix/min).',
        created_at: new Date().toISOString()
    },
    {
        item_id: 'norm_linked_sword',
        name: 'Espada Linked Sword',
        name_en: 'Classic Linked Sword',
        category: 'NORMAL',
        creator_id: 'SYSTEM',
        creator_name: 'Shedletsky',
        base_price: 2600,
        current_rap: 0,
        boost_pct: 12,
        max_supply: null,
        minted_count: 0,
        sales_count: 0,
        icon_emoji: '⚔️',
        color_hex: '#38BDF8',
        description_es: 'Reliquia de combate de Crossroads (+12% Tix/min).',
        description_en: 'Iconic Crossroads combat relic (+12% Tix/min).',
        created_at: new Date().toISOString()
    },
    // RECOMPENSAS EXCLUSIVAS VIP COMUNIDAD (No Tradeable)
    {
        item_id: 'vip_neon_booster_tophat',
        name: 'Sombrero de Copa Neón Booster',
        name_en: 'Neon Booster Top Hat',
        category: 'NORMAL',
        currency_type: 'TIX',
        creator_id: 'SYSTEM',
        creator_name: 'Kortex VIP',
        base_price: 0,
        current_rap: 0,
        boost_pct: 15,
        max_supply: null,
        minted_count: 0,
        sales_count: 0,
        icon_emoji: '🎩',
        color_hex: '#F472B6',
        description_es: 'Ítem cosmético exclusivo para Discord Server Boosters (+15% Tix/min al equipar).',
        description_en: 'Exclusive cosmetic item for Discord Server Boosters (+15% Tix/min when equipped).',
        created_at: new Date().toISOString()
    },
    // TIENDA PREMIUM DE VÓXELES (Se consiguen gratis completando Misiones Semanales)
    {
        item_id: 'crys_darkheart_katana',
        name: 'Katana Darkheart de Vóxeles',
        name_en: 'Voxel Darkheart Katana',
        category: 'NORMAL',
        currency_type: 'CRYSTAL',
        creator_id: 'SYSTEM',
        creator_name: 'Kortex Voxel Vault',
        base_price: 35,
        current_rap: 0,
        boost_pct: 18,
        max_supply: null,
        minted_count: 0,
        sales_count: 0,
        icon_emoji: '🗡️',
        color_hex: '#EC4899',
        description_es: 'Reliquia forjada con Vóxeles de Misiones Semanales (+18% Tix/min).',
        description_en: 'Relic forged with Voxels from Weekly Quests (+18% Tix/min).',
        created_at: new Date().toISOString()
    },
    {
        item_id: 'crys_quantum_wings',
        name: 'Alas Cuánticas de Valquiria',
        name_en: 'Quantum Valkyrie Wings',
        category: 'NORMAL',
        currency_type: 'CRYSTAL',
        creator_id: 'SYSTEM',
        creator_name: 'Kortex Voxel Vault',
        base_price: 65,
        current_rap: 0,
        boost_pct: 25,
        max_supply: null,
        minted_count: 0,
        sales_count: 0,
        icon_emoji: '🪽',
        color_hex: '#38BDF8',
        description_es: 'Alas cibernéticas de energía pura comprables con Vóxeles (+25% Tix/min).',
        description_en: 'Pure energy cybernetic wings purchasable with Voxels (+25% Tix/min).',
        created_at: new Date().toISOString()
    },
    {
        item_id: 'crys_celestial_halo',
        name: 'Halo Celestial del Arquitecto',
        name_en: 'Celestial Architect Halo',
        category: 'NORMAL',
        currency_type: 'CRYSTAL',
        creator_id: 'SYSTEM',
        creator_name: 'Kortex Voxel Vault',
        base_price: 110,
        current_rap: 0,
        boost_pct: 34,
        max_supply: null,
        minted_count: 0,
        sales_count: 0,
        icon_emoji: '💫',
        color_hex: '#A855F7',
        description_es: 'Corona gravitatoria suprema de la Tienda de Vóxeles (+34% Tix/min).',
        description_en: 'Supreme gravitational crown from the Voxel Shop (+34% Tix/min).',
        created_at: new Date().toISOString()
    },
    // BÓVEDA LIMITED (Cofres de Ascensión / Rebirth, Tradeables con RAP dinámico)
    {
        item_id: 'lim_valkyrie_helm',
        name: 'Valkyrie Helm Clásico',
        name_en: 'Classic Valkyrie Helm',
        category: 'LIMITED',
        creator_id: 'SYSTEM',
        creator_name: 'Roblox Vault',
        base_price: 4500,
        current_rap: 4800,
        boost_pct: 22,
        max_supply: null,
        minted_count: 0,
        sales_count: 0,
        icon_emoji: '🪶',
        color_hex: '#38BDF8',
        description_es: 'Yelmo Limited de Cofre de Ascensión. Tradeable P2P (+22% Tix/min).',
        description_en: 'Ascension Chest Limited helm. P2P Tradeable (+22% Tix/min).',
        created_at: new Date().toISOString()
    },
    {
        item_id: 'lim_sparkle_time_fedora',
        name: 'Sparkle Time Fedora',
        name_en: 'Sparkle Time Fedora',
        category: 'LIMITED',
        creator_id: 'SYSTEM',
        creator_name: 'Roblox Vault',
        base_price: 6200,
        current_rap: 6500,
        boost_pct: 28,
        max_supply: null,
        minted_count: 0,
        sales_count: 0,
        icon_emoji: '✨',
        color_hex: '#A855F7',
        description_es: 'Fedora brillante Limited de alta cotización RAP (+28% Tix/min).',
        description_en: 'High-RAP sparkling Limited fedora (+28% Tix/min).',
        created_at: new Date().toISOString()
    },
    {
        item_id: 'lim_clockwork_shades',
        name: 'Clockwork Shades & Headphones',
        name_en: 'Clockwork Shades & Headphones',
        category: 'LIMITED',
        creator_id: 'SYSTEM',
        creator_name: 'Clockwork',
        base_price: 7800,
        current_rap: 8200,
        boost_pct: 32,
        max_supply: null,
        minted_count: 0,
        sales_count: 0,
        icon_emoji: '🕶️',
        color_hex: '#F59E0B',
        description_es: 'Combo legendario de Clockwork para coleccionistas (+32% Tix/min).',
        description_en: 'Legendary Clockwork collector combo (+32% Tix/min).',
        created_at: new Date().toISOString()
    },
    // BÓVEDA LIMITED U (Stock Finito Global y Número de Serie Único #01/15)
    {
        item_id: 'limu_dominus_empyreus',
        name: 'Dominus Empyreus Kortex',
        name_en: 'Kortex Dominus Empyreus',
        category: 'LIMITED_U',
        creator_id: 'SYSTEM',
        creator_name: 'Kortex Drops',
        base_price: 12000,
        current_rap: 14500,
        boost_pct: 40,
        max_supply: 15,
        minted_count: 0,
        sales_count: 0,
        icon_emoji: '👑',
        color_hex: '#EF4444',
        description_es: 'Reliquia Limited U de stock finito global (15 copias numeradas #01/15). +40% Tix/min.',
        description_en: 'Finite-supply Limited U relic (15 serialized copies #01/15). +40% Tix/min.',
        created_at: new Date().toISOString()
    },
    {
        item_id: 'limu_domino_crown',
        name: 'Corona Domino Imperial',
        name_en: 'Imperial Domino Crown',
        category: 'LIMITED_U',
        creator_id: 'SYSTEM',
        creator_name: 'Kortex Drops',
        base_price: 9500,
        current_rap: 10800,
        boost_pct: 36,
        max_supply: 25,
        minted_count: 0,
        sales_count: 0,
        icon_emoji: '🎲',
        color_hex: '#10B981',
        description_es: 'Corona Limited U con número de serie grabado (#01/25). +36% Tix/min.',
        description_en: 'Serialized Limited U Domino Crown (#01/25). +36% Tix/min.',
        created_at: new Date().toISOString()
    }
];

// Tablas en memoria respaldadas automáticamente en disco (data/kortex_db_snapshot.json)
const memoryTables = {
    guilds: [],
    roblox_wishlist: [],
    user_links: [],
    discord_configs: [],
    account_history: [],
    price_floors_history: [...DEFAULT_PRICE_FLOORS],
    pending_robux: [],
    roblox_game_codes: [...DEFAULT_GAME_CODES],
    user_redeemed_codes: [],
    game_update_subscriptions: [],
    tycoon_profiles: [],
    tycoon_items_catalog: [...DEFAULT_TYCOON_CATALOG],
    tycoon_user_inventory: [],
    tycoon_ugc_purchases: [],
    tycoon_trades_p2p: []
};

let autoIncrementId = 200;

function cargarSnapshotDesdeDisco() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (fs.existsSync(DB_SNAPSHOT_FILE)) {
            const raw = fs.readFileSync(DB_SNAPSHOT_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                const persistentKeys = [
                    'guilds',
                    'roblox_wishlist',
                    'user_links',
                    'discord_configs',
                    'account_history',
                    'pending_robux',
                    'user_redeemed_codes',
                    'game_update_subscriptions',
                    'tycoon_profiles',
                    'tycoon_user_inventory',
                    'tycoon_ugc_purchases',
                    'tycoon_trades_p2p'
                ];
                for (const key of persistentKeys) {
                    if (Array.isArray(parsed[key])) {
                        memoryTables[key] = parsed[key];
                    }
                }
                if (Array.isArray(parsed.price_floors_history) && parsed.price_floors_history.length > 0) {
                    memoryTables.price_floors_history = parsed.price_floors_history;
                }
                if (Array.isArray(parsed.roblox_game_codes) && parsed.roblox_game_codes.length > 0) {
                    memoryTables.roblox_game_codes = parsed.roblox_game_codes;
                }
                if (Array.isArray(parsed.tycoon_items_catalog) && parsed.tycoon_items_catalog.length > 0) {
                    const savedMap = new Map(parsed.tycoon_items_catalog.map(it => [it.item_id, it]));
                    for (const defItem of DEFAULT_TYCOON_CATALOG) {
                        if (!savedMap.has(defItem.item_id)) {
                            savedMap.set(defItem.item_id, defItem);
                        }
                    }
                    memoryTables.tycoon_items_catalog = [...savedMap.values()];
                }
                if (typeof parsed._autoIncrementId === 'number' && parsed._autoIncrementId > autoIncrementId) {
                    autoIncrementId = parsed._autoIncrementId;
                }
            }
        }
    } catch (err) {
        console.warn('[DB] No se pudo cargar kortex_db_snapshot.json:', err.message);
    }
}

let snapshotDebounceTimer = null;
let snapshotDirty = false;

function flushSnapshotSync() {
    if (!snapshotDirty) return;
    snapshotDirty = false;
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const payload = {
            _autoIncrementId: autoIncrementId,
            _savedAt: new Date().toISOString(),
            guilds: memoryTables.guilds || [],
            roblox_wishlist: memoryTables.roblox_wishlist || [],
            user_links: memoryTables.user_links || [],
            discord_configs: memoryTables.discord_configs || [],
            account_history: memoryTables.account_history || [],
            price_floors_history: memoryTables.price_floors_history || [],
            pending_robux: memoryTables.pending_robux || [],
            roblox_game_codes: memoryTables.roblox_game_codes || [],
            user_redeemed_codes: memoryTables.user_redeemed_codes || [],
            game_update_subscriptions: memoryTables.game_update_subscriptions || [],
            tycoon_profiles: memoryTables.tycoon_profiles || [],
            tycoon_items_catalog: memoryTables.tycoon_items_catalog || [],
            tycoon_user_inventory: memoryTables.tycoon_user_inventory || [],
            tycoon_ugc_purchases: memoryTables.tycoon_ugc_purchases || [],
            tycoon_trades_p2p: memoryTables.tycoon_trades_p2p || []
        };
        fs.writeFileSync(DB_SNAPSHOT_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
        console.warn('[DB] No se pudo guardar kortex_db_snapshot.json:', err.message);
    }
}

function guardarSnapshotEnDisco() {
    snapshotDirty = true;
    if (snapshotDebounceTimer) {
        clearTimeout(snapshotDebounceTimer);
    }
    snapshotDebounceTimer = setTimeout(() => {
        snapshotDebounceTimer = null;
        flushSnapshotSync();
    }, 350);
    if (typeof snapshotDebounceTimer.unref === 'function') {
        snapshotDebounceTimer.unref();
    }
}

process.on('beforeExit', () => {
    flushSnapshotSync();
});
process.on('exit', () => {
    flushSnapshotSync();
});

cargarSnapshotDesdeDisco();

function createInMemoryQueryBuilder(tableName) {
    if (!memoryTables[tableName]) {
        memoryTables[tableName] = [];
    }

    const state = {
        op: 'select',
        filters: [],
        orderCol: null,
        orderAsc: true,
        limitCount: null,
        singleMode: null,
        payload: null,
        conflictKey: null,
        countMode: false,
        headMode: false
    };

    const builder = {
        select(cols = '*', opts = {}) {
            if (state.op === 'select') state.op = 'select';
            if (opts && opts.count) state.countMode = true;
            if (opts && opts.head) state.headMode = true;
            return builder;
        },
        insert(data) {
            state.op = 'insert';
            state.payload = Array.isArray(data) ? data : [data];
            return builder;
        },
        upsert(data, opts = {}) {
            state.op = 'upsert';
            state.payload = Array.isArray(data) ? data : [data];
            state.conflictKey = opts.onConflict || null;
            return builder;
        },
        update(data) {
            state.op = 'update';
            state.payload = data;
            return builder;
        },
        delete() {
            state.op = 'delete';
            return builder;
        },
        eq(col, val) {
            state.filters.push(row => String(row[col]) === String(val));
            return builder;
        },
        neq(col, val) {
            state.filters.push(row => String(row[col]) !== String(val));
            return builder;
        },
        in(col, vals) {
            const set = new Set((vals || []).map(v => String(v)));
            state.filters.push(row => set.has(String(row[col])));
            return builder;
        },
        lte(col, val) {
            state.filters.push(row => row[col] <= val);
            return builder;
        },
        gte(col, val) {
            state.filters.push(row => row[col] >= val);
            return builder;
        },
        order(col, { ascending = true } = {}) {
            state.orderCol = col;
            state.orderAsc = ascending;
            return builder;
        },
        limit(n) {
            state.limitCount = n;
            return builder;
        },
        single() {
            state.singleMode = 'single';
            return builder;
        },
        maybeSingle() {
            state.singleMode = 'maybeSingle';
            return builder;
        },
        then(resolve, reject) {
            try {
                const table = memoryTables[tableName];
                let resultData = [];

                if (state.op === 'insert') {
                    const inserted = state.payload.map(item => {
                        const row = {
                            id: item.id ?? (++autoIncrementId),
                            created_at: item.created_at || new Date().toISOString(),
                            ...item
                        };
                        table.push(row);
                        return row;
                    });
                    guardarSnapshotEnDisco();
                    resultData = state.singleMode ? (inserted[0] || null) : inserted;
                    return Promise.resolve({ data: resultData, error: null, count: inserted.length }).then(resolve, reject);
                }

                if (state.op === 'upsert') {
                    const upserted = state.payload.map(item => {
                        const keys = state.conflictKey
                            ? state.conflictKey.split(',').map(k => k.trim())
                            : (
                                item.discord_id && item.code_id
                                    ? ['discord_id', 'code_id']
                                    : item.item_id && item.buyer_id
                                        ? ['item_id', 'buyer_id']
                                        : item.instance_id
                                            ? ['instance_id']
                                            : item.trade_id
                                                ? ['trade_id']
                                                : item.purchase_id
                                                    ? ['purchase_id']
                                                    : item.item_id
                                                        ? ['item_id']
                                                        : item.user_id && tableName === 'tycoon_profiles'
                                                            ? ['user_id']
                                                            : item.guild_id
                                                                ? ['guild_id']
                                                                : item.discord_id
                                                                    ? ['discord_id']
                                                                    : item.subcategory_key
                                                                        ? ['subcategory_key']
                                                                        : ['id']
                            );
                        const idx = table.findIndex(r => keys.every(k => r[k] !== undefined && String(r[k]) === String(item[k])));
                        if (idx >= 0) {
                            table[idx] = { ...table[idx], ...item, updated_at: new Date().toISOString() };
                            return table[idx];
                        }
                        const row = {
                            id: item.id ?? (++autoIncrementId),
                            created_at: item.created_at || new Date().toISOString(),
                            ...item
                        };
                        table.push(row);
                        return row;
                    });
                    guardarSnapshotEnDisco();
                    resultData = state.singleMode ? (upserted[0] || null) : upserted;
                    return Promise.resolve({ data: resultData, error: null, count: upserted.length }).then(resolve, reject);
                }

                const matched = table.filter(row => state.filters.every(fn => fn(row)));

                if (state.op === 'update') {
                    matched.forEach(row => {
                        Object.assign(row, state.payload);
                    });
                    guardarSnapshotEnDisco();
                    resultData = state.singleMode ? (matched[0] || null) : matched;
                    return Promise.resolve({ data: resultData, error: null, count: matched.length }).then(resolve, reject);
                }

                if (state.op === 'delete') {
                    const toRemove = new Set(matched);
                    memoryTables[tableName] = table.filter(row => !toRemove.has(row));
                    guardarSnapshotEnDisco();
                    return Promise.resolve({ data: matched, error: null, count: matched.length }).then(resolve, reject);
                }

                let rows = [...matched];
                if (state.orderCol) {
                    rows.sort((a, b) => {
                        const va = a[state.orderCol];
                        const vb = b[state.orderCol];
                        if (va < vb) return state.orderAsc ? -1 : 1;
                        if (va > vb) return state.orderAsc ? 1 : -1;
                        return 0;
                    });
                }
                const totalCount = rows.length;
                if (typeof state.limitCount === 'number') {
                    rows = rows.slice(0, state.limitCount);
                }

                if (state.singleMode === 'single' || state.singleMode === 'maybeSingle') {
                    resultData = rows[0] || null;
                } else {
                    resultData = state.headMode ? null : rows;
                }

                return Promise.resolve({
                    data: resultData,
                    error: null,
                    count: totalCount
                }).then(resolve, reject);
            } catch (err) {
                return Promise.resolve({ data: null, error: err }).then(resolve, reject);
            }
        },
        catch(onRejected) {
            return new Promise((res, rej) => builder.then(res, rej)).catch(onRejected);
        },
        finally(onFinally) {
            return new Promise((res, rej) => builder.then(res, rej)).finally(onFinally);
        }
    };

    return builder;
}

function syncRowIntoMemoryTable(tableName, item) {
    if (!item || typeof item !== 'object') return;
    if (!Array.isArray(memoryTables[tableName])) {
        memoryTables[tableName] = [];
    }
    const table = memoryTables[tableName];
    const keys = item.discord_id && item.code_id
        ? ['discord_id', 'code_id']
        : item.item_id && item.buyer_id
            ? ['item_id', 'buyer_id']
            : item.instance_id
                ? ['instance_id']
                : item.trade_id
                    ? ['trade_id']
                    : item.purchase_id
                        ? ['purchase_id']
                        : item.user_id && tableName === 'tycoon_profiles'
                            ? ['user_id']
                            : item.item_id
                                ? ['item_id']
                                : item.guild_id
                                    ? ['guild_id']
                                    : item.discord_id
                                        ? ['discord_id']
                                        : item.subcategory_key
                                            ? ['subcategory_key']
                                            : item.id !== undefined
                                                ? ['id']
                                                : null;
    if (keys && keys.length > 0) {
        const idx = table.findIndex(r => keys.every(k => r[k] !== undefined && String(r[k]) === String(item[k])));
        if (idx >= 0) {
            table[idx] = { ...table[idx], ...item };
            return;
        }
    }
    table.push(item);
}

/**
 * Crea un query builder híbrido que sincroniza tanto en Supabase remoto (si está activo)
 * como en la persistencia local en disco/memoria. Si Supabase remoto devuelve error
 * (por ejemplo si falta una columna o tabla), responde desde la persistencia local sin perder datos.
 */
function createResilientHybridBuilder(tableName, realClient) {
    const localBuilder = createInMemoryQueryBuilder(tableName);
    if (!realClient) return localBuilder;

    const remoteCalls = [];
    const runHybrid = async () => {
        const localResult = await new Promise((res, rej) => localBuilder.then(res, rej));
        try {
            let remoteQuery = realClient.from(tableName);
            for (const call of remoteCalls) {
                if (typeof remoteQuery[call.method] === 'function') {
                    remoteQuery = remoteQuery[call.method](...call.args);
                }
            }
            const remoteRes = await remoteQuery;
            if (remoteRes.error) {
                console.warn(`[DB-HYBRID] Error en Supabase remoto para tabla '${tableName}':`, remoteRes.error.message || remoteRes.error);
                return {
                    ...localResult,
                    error: remoteRes.error
                };
            }
            // Sincronizar datos frescos hacia la memoria interna
            if (remoteRes.data) {
                const rowsToSync = Array.isArray(remoteRes.data) ? remoteRes.data : [remoteRes.data];
                for (const r of rowsToSync) {
                    if (r && typeof r === 'object') {
                        syncRowIntoMemoryTable(tableName, r);
                    }
                }
            }
            // Si es lectura y remoto trajo datos vacíos pero en disco local ya teníamos sesión/datos, conservar los datos locales
            if (Array.isArray(remoteRes.data) && remoteRes.data.length === 0 && Array.isArray(localResult.data) && localResult.data.length > 0) {
                return localResult;
            }
            return {
                ...remoteRes,
                data: remoteRes.data !== null && remoteRes.data !== undefined ? remoteRes.data : localResult.data
            };
        } catch (err) {
            console.warn(`[DB-HYBRID] Excepción al ejecutar query en Supabase ('${tableName}'):`, err.message);
            return {
                ...localResult,
                error: err
            };
        }
    };

    const proxy = new Proxy(localBuilder, {
        get(target, prop) {
            if (prop === 'then') {
                return (resolve, reject) => runHybrid().then(resolve, reject);
            }
            if (prop === 'catch') {
                return (onRejected) => runHybrid().catch(onRejected);
            }
            if (prop === 'finally') {
                return (onFinally) => runHybrid().finally(onFinally);
            }

            const orig = target[prop];
            if (typeof orig === 'function') {
                return (...args) => {
                    remoteCalls.push({ method: prop, args });
                    orig.apply(target, args);
                    return proxy;
                };
            }
            return orig;
        }
    });

    return proxy;
}

let realSupabase = null;
if (supabaseUrl && supabaseKey) {
    try {
        realSupabase = createClient(supabaseUrl, supabaseKey);
    } catch (err) {
        console.warn('[WARN] No se pudo inicializar el cliente de Supabase, activando persistencia local:', err.message);
    }
} else {
    console.warn('[WARN] Credenciales de Supabase no detectadas en .env — ejecutando con persistencia local en disco y memoria.');
}

const supabase = {
    isMemoryFallback: !realSupabase,
    realClient: realSupabase,
    memoryTables,
    guardarSnapshotEnDisco,
    from(tableName) {
        return createResilientHybridBuilder(tableName, realSupabase);
    },
    memoryFrom(tableName) {
        return createInMemoryQueryBuilder(tableName);
    }
};

module.exports = supabase;
