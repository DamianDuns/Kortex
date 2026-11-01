-- ==========================================
-- ARCHIVO: supabase_tycoon_schema.sql
-- Esquema de Base de Datos en Supabase para el Ecosistema /tycoon de Kortex
-- ==========================================

-- 1. Perfil y Progreso del Estudio Tycoon
CREATE TABLE IF NOT EXISTS tycoon_profiles (
    user_id TEXT PRIMARY KEY,
    tix_balance BIGINT DEFAULT 100,
    collector_tix BIGINT DEFAULT 0,
    collector_cap BIGINT DEFAULT 500,
    studio_stage INT DEFAULT 1,
    rebirth_count INT DEFAULT 0,
    ascension_tokens INT DEFAULT 0,
    ugc_license_unlocked BOOLEAN DEFAULT FALSE,
    equipped_item_id TEXT DEFAULT NULL,
    potion_type TEXT DEFAULT NULL,
    potion_expires_at TIMESTAMPTZ DEFAULT NULL,
    vip_nitro_boost BOOLEAN DEFAULT FALSE,
    vip_yt_sub BOOLEAN DEFAULT FALSE,
    last_yt_potion_at TIMESTAMPTZ DEFAULT NULL,
    last_collected_at TIMESTAMPTZ DEFAULT NOW(),
    last_silent_reward_at TIMESTAMPTZ DEFAULT NULL,
    unlocked_pads JSONB DEFAULT '["pad_dropper1"]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Catálogo Global de Ítems (Normales, UGC, Limited y Limited U)
CREATE TABLE IF NOT EXISTS tycoon_items_catalog (
    item_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_en TEXT DEFAULT NULL,
    category TEXT NOT NULL CHECK (category IN ('NORMAL', 'UGC', 'LIMITED', 'LIMITED_U')),
    creator_id TEXT DEFAULT 'SYSTEM',
    creator_name TEXT DEFAULT 'Kortex System',
    base_price BIGINT NOT NULL,
    current_rap BIGINT DEFAULT 0,
    boost_pct INT DEFAULT 5,
    max_supply INT DEFAULT NULL,
    minted_count INT DEFAULT 0,
    sales_count INT DEFAULT 0,
    icon_emoji TEXT DEFAULT '🎩',
    color_hex TEXT DEFAULT '#5865F2',
    description_es TEXT DEFAULT '',
    description_en TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Inventario de Ítems de cada Jugador (Con Número de Serie para Limited U)
CREATE TABLE IF NOT EXISTS tycoon_user_inventory (
    instance_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL REFERENCES tycoon_items_catalog(item_id),
    serial_number INT DEFAULT NULL,
    acquired_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Registro Anti-AutoCompra y Límite de 1 Copia UGC por Comprador
CREATE TABLE IF NOT EXISTS tycoon_ugc_purchases (
    purchase_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES tycoon_items_catalog(item_id),
    buyer_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    price_paid BIGINT NOT NULL,
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_id, buyer_id)
);

-- 5. Ofertas de Trading P2P (Exclusivo para Limited y Limited U: Tablero Público + Directo)
CREATE TABLE IF NOT EXISTS tycoon_trades_p2p (
    trade_id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    sender_name TEXT DEFAULT NULL,
    receiver_id TEXT NOT NULL, -- 'PUBLIC' para tablero público o ID de Discord para oferta directa
    receiver_name TEXT DEFAULT NULL,
    sender_items JSONB NOT NULL,
    receiver_items JSONB DEFAULT '[]'::jsonb,
    requested_item_id TEXT DEFAULT NULL,
    tix_offered BIGINT DEFAULT 0,
    tix_requested BIGINT DEFAULT 0,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
