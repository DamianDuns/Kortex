-- ==========================================
-- ARCHIVO: supabase_tycoon_schema.sql
-- Esquema de Base de Datos en Supabase para el Ecosistema /tycoon de Kortex
-- Conforme a Supabase Postgres Best Practices (Query, Foreign Keys, Indexes & RLS)
-- ==========================================

-- 1. Perfil y Progreso del Estudio Tycoon
CREATE TABLE IF NOT EXISTS public.tycoon_profiles (
    user_id text PRIMARY KEY,
    tix_balance bigint DEFAULT 100,
    crystal_balance bigint DEFAULT 0,
    collector_tix bigint DEFAULT 0,
    collector_cap bigint DEFAULT 500,
    studio_stage integer DEFAULT 1,
    rebirth_count integer DEFAULT 0,
    ascension_tokens integer DEFAULT 0,
    key_fragments integer DEFAULT 0,
    master_keys integer DEFAULT 0,
    permanent_tix_bonus_pct integer DEFAULT 0,
    prospector_expires_at timestamptz DEFAULT NULL,
    laser_state jsonb DEFAULT '{}'::jsonb,
    active_sessions jsonb DEFAULT '{}'::jsonb,
    ugc_license_unlocked boolean DEFAULT false,
    equipped_item_id text DEFAULT NULL,
    potion_type text DEFAULT NULL,
    potion_expires_at timestamptz DEFAULT NULL,
    vip_nitro_boost boolean DEFAULT false,
    vip_yt_sub boolean DEFAULT false,
    last_yt_potion_at timestamptz DEFAULT NULL,
    last_collected_at timestamptz DEFAULT now(),
    last_silent_reward_at timestamptz DEFAULT NULL,
    unlocked_pads jsonb DEFAULT '["pad_dropper1"]'::jsonb,
    weekly_quests_state jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Índice optimizado para consultas de Ranking / Leaderboard
CREATE INDEX IF NOT EXISTS idx_tycoon_profiles_leaderboard ON public.tycoon_profiles(rebirth_count DESC, tix_balance DESC);

ALTER TABLE public.tycoon_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tycoon_profiles' AND policyname = 'tycoon_profiles_service_role'
    ) THEN
        CREATE POLICY tycoon_profiles_service_role ON public.tycoon_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 2. Catálogo Global de Ítems (Normales, UGC, Limited y Limited U)
CREATE TABLE IF NOT EXISTS public.tycoon_items_catalog (
    item_id text PRIMARY KEY,
    name text NOT NULL,
    name_en text DEFAULT NULL,
    category text NOT NULL CHECK (category IN ('NORMAL', 'UGC', 'LIMITED', 'LIMITED_U')),
    currency_type text DEFAULT 'TIX',
    creator_id text DEFAULT 'SYSTEM',
    creator_name text DEFAULT 'Kortex System',
    base_price bigint NOT NULL,
    current_rap bigint DEFAULT 0,
    boost_pct integer DEFAULT 5,
    max_supply integer DEFAULT NULL,
    minted_count integer DEFAULT 0,
    sales_count integer DEFAULT 0,
    icon_emoji text DEFAULT '🎩',
    color_hex text DEFAULT '#5865F2',
    description_es text DEFAULT '',
    description_en text DEFAULT '',
    created_at timestamptz DEFAULT now()
);

-- Índices para navegación por categorías y autor UGC
CREATE INDEX IF NOT EXISTS idx_tycoon_items_category ON public.tycoon_items_catalog(category);
CREATE INDEX IF NOT EXISTS idx_tycoon_items_creator ON public.tycoon_items_catalog(creator_id);

ALTER TABLE public.tycoon_items_catalog ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tycoon_items_catalog' AND policyname = 'tycoon_items_service_role'
    ) THEN
        CREATE POLICY tycoon_items_service_role ON public.tycoon_items_catalog FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tycoon_items_catalog' AND policyname = 'tycoon_items_public_read'
    ) THEN
        CREATE POLICY tycoon_items_public_read ON public.tycoon_items_catalog FOR SELECT TO anon, authenticated USING (true);
    END IF;
END $$;

-- 3. Inventario de Ítems de cada Jugador (Con Número de Serie para Limited U)
CREATE TABLE IF NOT EXISTS public.tycoon_user_inventory (
    instance_id text PRIMARY KEY,
    user_id text NOT NULL,
    item_id text NOT NULL REFERENCES public.tycoon_items_catalog(item_id),
    serial_number integer DEFAULT NULL,
    acquired_at timestamptz DEFAULT now()
);

-- Indexación de Clave Foránea (FK) y filtros de usuario (CRÍTICO: evita Seq Scans en getUserInventory y deletes)
CREATE INDEX IF NOT EXISTS idx_tycoon_inventory_user_id ON public.tycoon_user_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_tycoon_inventory_item_id ON public.tycoon_user_inventory(item_id);
CREATE INDEX IF NOT EXISTS idx_tycoon_inventory_user_item ON public.tycoon_user_inventory(user_id, item_id);

ALTER TABLE public.tycoon_user_inventory ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tycoon_user_inventory' AND policyname = 'tycoon_inventory_service_role'
    ) THEN
        CREATE POLICY tycoon_inventory_service_role ON public.tycoon_user_inventory FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 4. Registro Anti-AutoCompra y Límite de 1 Copia UGC por Comprador
CREATE TABLE IF NOT EXISTS public.tycoon_ugc_purchases (
    purchase_id text PRIMARY KEY,
    item_id text NOT NULL REFERENCES public.tycoon_items_catalog(item_id),
    buyer_id text NOT NULL,
    creator_id text NOT NULL,
    price_paid bigint NOT NULL,
    purchased_at timestamptz DEFAULT now(),
    UNIQUE(item_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_tycoon_ugc_buyer ON public.tycoon_ugc_purchases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_tycoon_ugc_creator ON public.tycoon_ugc_purchases(creator_id);
CREATE INDEX IF NOT EXISTS idx_tycoon_ugc_item_fk ON public.tycoon_ugc_purchases(item_id);

ALTER TABLE public.tycoon_ugc_purchases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tycoon_ugc_purchases' AND policyname = 'tycoon_ugc_service_role'
    ) THEN
        CREATE POLICY tycoon_ugc_service_role ON public.tycoon_ugc_purchases FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 5. Ofertas de Trading P2P (Exclusivo para Limited y Limited U: Tablero Público + Directo)
CREATE TABLE IF NOT EXISTS public.tycoon_trades_p2p (
    trade_id text PRIMARY KEY,
    sender_id text NOT NULL,
    sender_name text DEFAULT NULL,
    receiver_id text NOT NULL, -- 'PUBLIC' para tablero público o ID de Discord para oferta directa
    receiver_name text DEFAULT NULL,
    sender_items jsonb NOT NULL,
    receiver_items jsonb DEFAULT '[]'::jsonb,
    requested_item_id text DEFAULT NULL,
    tix_offered bigint DEFAULT 0,
    tix_requested bigint DEFAULT 0,
    status text DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED')),
    created_at timestamptz DEFAULT now()
);

-- Índices de consulta de trades y partial index para ofertas activas
CREATE INDEX IF NOT EXISTS idx_tycoon_trades_sender ON public.tycoon_trades_p2p(sender_id);
CREATE INDEX IF NOT EXISTS idx_tycoon_trades_receiver ON public.tycoon_trades_p2p(receiver_id);
CREATE INDEX IF NOT EXISTS idx_tycoon_trades_pending ON public.tycoon_trades_p2p(created_at DESC) WHERE status = 'PENDING';

ALTER TABLE public.tycoon_trades_p2p ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tycoon_trades_p2p' AND policyname = 'tycoon_trades_service_role'
    ) THEN
        CREATE POLICY tycoon_trades_service_role ON public.tycoon_trades_p2p FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
