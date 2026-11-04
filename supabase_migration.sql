-- =====================================================================
-- KORTEX v2.0 — SCRIPT MAESTRO DE MIGRACIÓN SQL PARA SUPABASE
-- Conforme a Supabase Postgres Best Practices (Query, Schema, Security & RLS)
-- =====================================================================
-- Ejecutá este script en el "SQL Editor" de tu proyecto de Supabase.
-- Todas las sentencias son idempotentes (CREATE TABLE IF NOT EXISTS /
-- CREATE INDEX IF NOT EXISTS / RLS policies seguras) y preservan tus datos.
-- =====================================================================

-- 1. Tabla de Servidores de Discord (guilds)
CREATE TABLE IF NOT EXISTS public.guilds (
    guild_id text PRIMARY KEY,
    name text NOT NULL,
    joined_at timestamptz DEFAULT now()
);

ALTER TABLE public.guilds ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'guilds' AND policyname = 'guilds_service_role'
    ) THEN
        CREATE POLICY guilds_service_role ON public.guilds FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 2. Tabla de Lista de Monitoreo de Precios (roblox_wishlist)
CREATE TABLE IF NOT EXISTS public.roblox_wishlist (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id text NOT NULL,
    id_objet text NOT NULL,
    item_name text NOT NULL,
    item_type text DEFAULT 'catalog',
    last_price numeric DEFAULT 0,
    target_price numeric DEFAULT NULL,
    alert_destination text DEFAULT 'dm',
    channel_id text DEFAULT NULL,
    webhook_url text DEFAULT NULL,
    is_paused boolean DEFAULT false,
    price_history jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Asegurar columnas en instalaciones previas de roblox_wishlist
ALTER TABLE public.roblox_wishlist
    ADD COLUMN IF NOT EXISTS price_history jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS target_price numeric DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS alert_destination text DEFAULT 'dm',
    ADD COLUMN IF NOT EXISTS channel_id text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS webhook_url text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS is_paused boolean DEFAULT false;

-- Índices B-Tree para búsquedas y filtros frecuentes
CREATE INDEX IF NOT EXISTS idx_roblox_wishlist_user_id ON public.roblox_wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_roblox_wishlist_id_objet ON public.roblox_wishlist(id_objet);
CREATE INDEX IF NOT EXISTS idx_roblox_wishlist_user_item ON public.roblox_wishlist(user_id, id_objet);

-- Índice Parcial (Partial Index) para el escaneo periódico de ítems activos
CREATE INDEX IF NOT EXISTS idx_roblox_wishlist_active ON public.roblox_wishlist(id_objet) WHERE is_paused = false;

ALTER TABLE public.roblox_wishlist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'roblox_wishlist' AND policyname = 'wishlist_service_role'
    ) THEN
        CREATE POLICY wishlist_service_role ON public.roblox_wishlist FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 3. Sistema Transversal "Fast-Link" (user_links)
CREATE TABLE IF NOT EXISTS public.user_links (
    discord_id text PRIMARY KEY,
    roblox_user_id bigint NOT NULL,
    roblox_username text NOT NULL,
    display_name text DEFAULT NULL,
    avatar_url text DEFAULT NULL,
    auth_method text DEFAULT 'code_verified',
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_links
    ADD COLUMN IF NOT EXISTS auth_method text DEFAULT 'code_verified';

CREATE INDEX IF NOT EXISTS idx_user_links_roblox_id ON public.user_links(roblox_user_id);

ALTER TABLE public.user_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_links' AND policyname = 'user_links_service_role'
    ) THEN
        CREATE POLICY user_links_service_role ON public.user_links FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 3B. Configuración de Discord y Sesiones Persistentes (discord_configs)
CREATE TABLE IF NOT EXISTS public.discord_configs (
    discord_id text PRIMARY KEY,
    discord_username text DEFAULT NULL,
    discord_tag text DEFAULT NULL,
    discord_avatar text DEFAULT NULL,
    access_token text DEFAULT NULL,
    refresh_token text DEFAULT NULL,
    oauth_verified boolean DEFAULT false,
    verified_at timestamptz DEFAULT NULL,
    lang text DEFAULT 'es',
    language_selected boolean DEFAULT false,
    default_tier text DEFAULT 'TIER_100',
    default_category text DEFAULT 'cat_economy',
    default_chart_range text DEFAULT '7d',
    default_camera_mode text DEFAULT 'full',
    auto_cashback_40 boolean DEFAULT true,
    ephemeral_config boolean DEFAULT false,
    dm_alerts_enabled boolean DEFAULT true,
    pending_web_code text DEFAULT NULL,
    pending_web_digits text DEFAULT NULL,
    pending_web_expires_at bigint DEFAULT NULL,
    web_approved_in_discord boolean DEFAULT false,
    web_approved_until bigint DEFAULT NULL,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.discord_configs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discord_configs' AND policyname = 'discord_configs_service_role'
    ) THEN
        CREATE POLICY discord_configs_service_role ON public.discord_configs FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 3C. Historial de Actividad de la Cuenta Activa (account_history)
CREATE TABLE IF NOT EXISTS public.account_history (
    discord_id text PRIMARY KEY,
    events jsonb DEFAULT '[]'::jsonb,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.account_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'account_history' AND policyname = 'account_history_service_role'
    ) THEN
        CREATE POLICY account_history_service_role ON public.account_history FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 4. Categoría 1 (Herramienta 1.1): Historial de Pisos de Precios UGC (price_floors_history)
CREATE TABLE IF NOT EXISTS public.price_floors_history (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subcategory_key text UNIQUE NOT NULL,
    subcategory_name text NOT NULL,
    asset_type_id integer NOT NULL,
    subcategory_id integer NOT NULL,
    floor_price integer NOT NULL,
    previous_floor_price integer NOT NULL,
    reference_max_floor integer DEFAULT 150,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.price_floors_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'price_floors_history' AND policyname = 'price_floors_service_role'
    ) THEN
        CREATE POLICY price_floors_service_role ON public.price_floors_history FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'price_floors_history' AND policyname = 'price_floors_public_read'
    ) THEN
        CREATE POLICY price_floors_public_read ON public.price_floors_history FOR SELECT TO anon, authenticated USING (true);
    END IF;
END $$;

-- Semilla inicial de referencia de pisos UGC por categoría de accesorio
INSERT INTO public.price_floors_history (subcategory_key, subcategory_name, asset_type_id, subcategory_id, floor_price, previous_floor_price, reference_max_floor)
VALUES
    ('hat',      'Sombreros (Hat)',       8,  9,  65, 85,  105),
    ('hair',     'Pelo (Hair)',           41, 20, 65, 75,  95),
    ('face',     'Cara (Face)',           42, 21, 50, 65,  85),
    ('neck',     'Cuello (Neck)',         43, 22, 50, 60,  80),
    ('shoulder', 'Hombros (Shoulder)',    44, 23, 50, 65,  85),
    ('front',    'Frente (Front)',        45, 24, 55, 75,  95),
    ('back',     'Espalda (Back)',        46, 25, 85, 110, 140),
    ('waist',    'Cintura (Waist)',       47, 26, 60, 75,  95)
ON CONFLICT (subcategory_key) DO NOTHING;

-- 5. Categoría 1 (Herramienta 1.3): Agenda y Alerta de Robux Pendientes (pending_robux)
CREATE TABLE IF NOT EXISTS public.pending_robux (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    discord_id text NOT NULL,
    source_type text NOT NULL CHECK (source_type IN ('cashback_40', 'gamepass_sale', 'clothing_sale', 'limited_sale')),
    source_label text DEFAULT NULL,
    amount_robux integer NOT NULL CHECK (amount_robux > 0),
    created_at timestamptz DEFAULT now(),
    estimated_release_min timestamptz NOT NULL,
    estimated_release_max timestamptz NOT NULL,
    notified boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_pending_robux_discord_id ON public.pending_robux(discord_id);
-- Índice parcial ultra eficiente: solo indexa los pendientes por notificar
CREATE INDEX IF NOT EXISTS idx_pending_robux_unnotified ON public.pending_robux(estimated_release_min) WHERE notified = false;

ALTER TABLE public.pending_robux ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pending_robux' AND policyname = 'pending_robux_service_role'
    ) THEN
        CREATE POLICY pending_robux_service_role ON public.pending_robux FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 6. Categoría 3 (Herramienta 3.3): Bóveda de Códigos Activos (roblox_game_codes)
CREATE TABLE IF NOT EXISTS public.roblox_game_codes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    universe_id bigint NOT NULL,
    game_name text NOT NULL,
    code text NOT NULL,
    reward_description text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    UNIQUE (universe_id, code)
);

CREATE INDEX IF NOT EXISTS idx_roblox_game_codes_universe ON public.roblox_game_codes(universe_id);
CREATE INDEX IF NOT EXISTS idx_roblox_game_codes_active ON public.roblox_game_codes(universe_id) WHERE is_active = true;

ALTER TABLE public.roblox_game_codes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'roblox_game_codes' AND policyname = 'game_codes_service_role'
    ) THEN
        CREATE POLICY game_codes_service_role ON public.roblox_game_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'roblox_game_codes' AND policyname = 'game_codes_public_read'
    ) THEN
        CREATE POLICY game_codes_public_read ON public.roblox_game_codes FOR SELECT TO anon, authenticated USING (true);
    END IF;
END $$;

-- Semilla inicial de códigos activos para experiencias populares de Roblox
INSERT INTO public.roblox_game_codes (universe_id, game_name, code, reward_description, is_active)
VALUES
    (994732206,  'Blox Fruits',      'KITT_RESET',       'Reinicio gratuito de estadísticas (Stat Reset)', true),
    (994732206,  'Blox Fruits',      'SUB2CAPTAINMAUI',  '20 minutos de 2x EXP Boost', true),
    (994732206,  'Blox Fruits',      'SUB2FER999',       '2x EXP Boost por 20 minutos', true),
    (994732206,  'Blox Fruits',      'ENYU_IS_PRO',      '2x EXP Boost por 20 minutos', true),
    (994732206,  'Blox Fruits',      'STARCODEHEO',      '2x EXP Boost por 20 minutos', true),
    (3317771874, 'Pet Simulator 99', 'pet-d67518012',    'Pociones de suerte Diamante IV + Boosts', true),
    (3317771874, 'Pet Simulator 99', 'big-games-99',     'Hoverboard exclusivo + 5 Llaves de Cristal', true),
    (1008451066, 'Da Hood',          'DAHOOD2026',       '250,000 Da Hood Cash ($DHC) + Cajas de Skins', true),
    (1008451066, 'Da Hood',          'RUBY',             '250,000 Da Hood Cash ($DHC)', true),
    (5846386835, 'Anime Defenders',  'DEFENDERS2026',    '1,500 Gemas + 5 Trait Crystals', true),
    (5846386835, 'Anime Defenders',  'WISHES_UPDATE',    '1,000 Gemas + 3 Reroll Tokens', true)
ON CONFLICT (universe_id, code) DO NOTHING;

-- 7. Categoría 3 (Herramienta 3.3): Checklist Personal de Códigos Canjeados (user_redeemed_codes)
CREATE TABLE IF NOT EXISTS public.user_redeemed_codes (
    discord_id text NOT NULL,
    code_id bigint NOT NULL REFERENCES public.roblox_game_codes(id) ON DELETE CASCADE,
    redeemed_at timestamptz DEFAULT now(),
    PRIMARY KEY (discord_id, code_id)
);

-- Indexar columna Foreign Key (Evita Sequential Scans en ON DELETE CASCADE y JOINs)
CREATE INDEX IF NOT EXISTS idx_user_redeemed_codes_code_id ON public.user_redeemed_codes(code_id);

ALTER TABLE public.user_redeemed_codes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_redeemed_codes' AND policyname = 'user_redeemed_codes_service_role'
    ) THEN
        CREATE POLICY user_redeemed_codes_service_role ON public.user_redeemed_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 8. Categoría 3 (Herramienta 3.4): Suscriptor de Parches y Actualizaciones Silenciosas (game_update_subscriptions)
CREATE TABLE IF NOT EXISTS public.game_update_subscriptions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    discord_id text NOT NULL,
    channel_id text DEFAULT NULL,
    universe_id bigint NOT NULL,
    place_id bigint DEFAULT NULL,
    game_name text NOT NULL,
    last_updated_iso text NOT NULL,
    is_paused boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    UNIQUE (discord_id, universe_id)
);

CREATE INDEX IF NOT EXISTS idx_game_update_subs_discord ON public.game_update_subscriptions(discord_id);
CREATE INDEX IF NOT EXISTS idx_game_update_subs_universe ON public.game_update_subscriptions(universe_id);
CREATE INDEX IF NOT EXISTS idx_game_update_subs_active ON public.game_update_subscriptions(universe_id) WHERE is_paused = false;

ALTER TABLE public.game_update_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'game_update_subscriptions' AND policyname = 'game_update_subs_service_role'
    ) THEN
        CREATE POLICY game_update_subs_service_role ON public.game_update_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
