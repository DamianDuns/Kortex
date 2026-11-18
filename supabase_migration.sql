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

ALTER TABLE public.discord_configs
    ADD COLUMN IF NOT EXISTS custom_prefix text DEFAULT '!',
    ADD COLUMN IF NOT EXISTS default_tier text DEFAULT 'TIER_100',
    ADD COLUMN IF NOT EXISTS default_category text DEFAULT 'cat_economy',
    ADD COLUMN IF NOT EXISTS default_chart_range text DEFAULT '7d',
    ADD COLUMN IF NOT EXISTS default_camera_mode text DEFAULT 'full',
    ADD COLUMN IF NOT EXISTS auto_cashback_40 boolean DEFAULT true,
    ADD COLUMN IF NOT EXISTS ephemeral_config boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS dm_alerts_enabled boolean DEFAULT true,
    ADD COLUMN IF NOT EXISTS pending_web_code text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS pending_web_digits text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS pending_web_expires_at bigint DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS web_approved_in_discord boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS web_approved_until bigint DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_discord_configs_pending_web_code
    ON public.discord_configs(pending_web_code)
    WHERE pending_web_code IS NOT NULL;

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

-- =====================================================================
-- 9. PROCEDIMIENTOS RPC DE SINCRONIZACIÓN WEB ↔ DISCORD (/config)
-- Reemplazan por completo el flujo OAuth 2.0 heredado usando verificación
-- de propiedad mediante clave personal KTX-XXXXXX (/config) y biografía
-- de Roblox (KORTEX-XXXX) con RLS seguro (SECURITY DEFINER).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.kortex_web_get_account_status(p_discord_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id text := btrim(coalesce(p_discord_id, ''));
    v_cfg record;
    v_link record;
    v_hist jsonb := '[]'::jsonb;
    v_has_discord boolean := false;
    v_has_roblox boolean := false;
    v_has_active boolean := false;
    v_wl_count integer := 0;
    v_pr_count integer := 0;
    v_rc_count integer := 0;
    v_gs_count integer := 0;
    v_tycoon jsonb := NULL;
BEGIN
    IF v_id = '' OR v_id = 'default_session' OR v_id LIKE 'guest_%' THEN
        RETURN jsonb_build_object(
            'ok', true,
            'discordId', '',
            'discordConfig', NULL,
            'linkedAccount', NULL,
            'hasActiveAccount', false,
            'history', '[]'::jsonb,
            'stats', jsonb_build_object(
                'wishlistCount', 0,
                'pendingRobuxCount', 0,
                'redeemedCodesCount', 0,
                'gameSubsCount', 0
            ),
            'tycoonSummary', NULL
        );
    END IF;

    SELECT * INTO v_cfg FROM public.discord_configs WHERE discord_id = v_id;
    SELECT * INTO v_link FROM public.user_links WHERE discord_id = v_id;

    v_has_discord := FOUND AND v_cfg.discord_id IS NOT NULL AND coalesce(v_cfg.oauth_verified, false);
    v_has_roblox := v_link.roblox_user_id IS NOT NULL;
    v_has_active := v_has_discord OR v_has_roblox;

    IF NOT v_has_active THEN
        RETURN jsonb_build_object(
            'ok', true,
            'discordId', v_id,
            'discordConfig', NULL,
            'linkedAccount', NULL,
            'hasActiveAccount', false,
            'history', '[]'::jsonb,
            'stats', jsonb_build_object(
                'wishlistCount', 0,
                'pendingRobuxCount', 0,
                'redeemedCodesCount', 0,
                'gameSubsCount', 0
            ),
            'tycoonSummary', NULL
        );
    END IF;

    SELECT coalesce(events, '[]'::jsonb) INTO v_hist
    FROM public.account_history
    WHERE discord_id = v_id;

    SELECT count(*)::int INTO v_wl_count FROM public.roblox_wishlist WHERE user_id = v_id;
    SELECT count(*)::int INTO v_pr_count FROM public.pending_robux WHERE discord_id = v_id AND notified = false;
    SELECT count(*)::int INTO v_rc_count FROM public.user_redeemed_codes WHERE discord_id = v_id;
    SELECT count(*)::int INTO v_gs_count FROM public.game_update_subscriptions WHERE discord_id = v_id;

    IF to_regclass('public.tycoon_profiles') IS NOT NULL THEN
        EXECUTE
            'SELECT jsonb_build_object(
                ''studio_stage'', coalesce(studio_stage, 1),
                ''rebirth_count'', coalesce(rebirth_count, 0),
                ''tix_balance'', coalesce(tix_balance, 0),
                ''voxeles'', coalesce(crystal_balance, 0),
                ''key_fragments'', coalesce(key_fragments, 0),
                ''master_keys'', coalesce(master_keys, 0)
            ) FROM public.tycoon_profiles WHERE user_id = $1'
        INTO v_tycoon
        USING v_id;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'discordId', v_id,
        'discordConfig', CASE WHEN v_has_discord THEN jsonb_build_object(
            'discord_id', v_cfg.discord_id,
            'discord_username', v_cfg.discord_username,
            'discord_tag', v_cfg.discord_tag,
            'discord_avatar', v_cfg.discord_avatar,
            'oauth_verified', true,
            'lang', coalesce(v_cfg.lang, 'es')
        ) ELSE NULL END,
        'linkedAccount', CASE WHEN v_has_roblox THEN jsonb_build_object(
            'discord_id', v_link.discord_id,
            'roblox_user_id', v_link.roblox_user_id,
            'roblox_username', v_link.roblox_username,
            'display_name', coalesce(v_link.display_name, v_link.roblox_username),
            'avatar_url', v_link.avatar_url,
            'auth_method', coalesce(v_link.auth_method, 'bio_verified')
        ) ELSE NULL END,
        'hasActiveAccount', true,
        'history', coalesce(v_hist, '[]'::jsonb),
        'stats', jsonb_build_object(
            'wishlistCount', v_wl_count,
            'pendingRobuxCount', v_pr_count,
            'redeemedCodesCount', v_rc_count,
            'gameSubsCount', v_gs_count
        ),
        'tycoonSummary', v_tycoon
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.kortex_web_verify_discord(p_discord_id text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_raw_id text := btrim(coalesce(p_discord_id, ''));
    v_prev_rblx_session text := '';
    v_target_id text := '';
    v_clean_code text := upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));
    v_digits text := regexp_replace(v_clean_code, '[^0-9]', '', 'g');
    v_now_ms bigint := (extract(epoch FROM now()) * 1000)::bigint;
    v_cfg public.discord_configs%ROWTYPE;
    v_prev_link public.user_links%ROWTYPE;
    v_target_link public.user_links%ROWTYPE;
BEGIN
    IF v_raw_id LIKE 'rblx_%' THEN
        v_prev_rblx_session := v_raw_id;
        v_raw_id := '';
    END IF;

    IF v_raw_id ~ '^\d{15,22}$' THEN
        v_target_id := v_raw_id;
    ELSIF v_clean_code <> '' THEN
        SELECT discord_id INTO v_target_id
        FROM public.discord_configs
        WHERE (
            upper(coalesce(pending_web_code, '')) = v_clean_code
            OR (length(v_digits) = 6 AND coalesce(pending_web_digits, '') = v_digits)
        )
        AND coalesce(pending_web_expires_at, 0) > v_now_ms
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1;
    END IF;

    IF coalesce(v_target_id, '') = '' THEN
        RETURN jsonb_build_object(
            'ok', false,
            'message', '❌ Código no encontrado o expirado. Ejecutá /config en Discord para obtener tu clave KTX-XXXXXX.'
        );
    END IF;

    SELECT * INTO v_cfg FROM public.discord_configs WHERE discord_id = v_target_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'message', '❌ Primero ejecutá /config en Discord para generar tu código personal KTX-XXXXXX.'
        );
    END IF;

    IF NOT (
        (coalesce(v_cfg.web_approved_in_discord, false) AND coalesce(v_cfg.web_approved_until, 0) > v_now_ms)
        OR (
            v_clean_code <> ''
            AND coalesce(v_cfg.pending_web_expires_at, 0) > v_now_ms
            AND (
                upper(coalesce(v_cfg.pending_web_code, '')) = v_clean_code
                OR (length(v_digits) = 6 AND coalesce(v_cfg.pending_web_digits, '') = v_digits)
            )
        )
    ) THEN
        RETURN jsonb_build_object(
            'ok', false,
            'message', '❌ El código KTX ingresado no coincide o expiró. Abrí /config en Discord y copiá tu código vigente.'
        );
    END IF;

    UPDATE public.discord_configs
    SET oauth_verified = true,
        verified_at = now(),
        updated_at = now()
    WHERE discord_id = v_target_id;

    -- Si el usuario había verificado primero su cuenta de Roblox en la web (rblx_<id>), fusionarla con su Discord ID real
    IF v_prev_rblx_session <> '' THEN
        SELECT * INTO v_prev_link FROM public.user_links WHERE discord_id = v_prev_rblx_session;
        IF FOUND AND v_prev_link.roblox_user_id IS NOT NULL THEN
            SELECT * INTO v_target_link FROM public.user_links WHERE discord_id = v_target_id;
            IF NOT FOUND OR v_target_link.roblox_user_id IS NULL THEN
                INSERT INTO public.user_links (discord_id, roblox_user_id, roblox_username, display_name, avatar_url, auth_method, updated_at)
                VALUES (v_target_id, v_prev_link.roblox_user_id, v_prev_link.roblox_username, v_prev_link.display_name, v_prev_link.avatar_url, v_prev_link.auth_method, now())
                ON CONFLICT (discord_id) DO UPDATE
                SET roblox_user_id = EXCLUDED.roblox_user_id,
                    roblox_username = EXCLUDED.roblox_username,
                    display_name = EXCLUDED.display_name,
                    avatar_url = EXCLUDED.avatar_url,
                    auth_method = EXCLUDED.auth_method,
                    updated_at = now();
            END IF;
            DELETE FROM public.user_links WHERE discord_id = v_prev_rblx_session;
            DELETE FROM public.account_history WHERE discord_id = v_prev_rblx_session;
        END IF;
    END IF;

    RETURN public.kortex_web_get_account_status(v_target_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.kortex_web_link_roblox(
    p_discord_id text,
    p_roblox_user_id bigint,
    p_roblox_username text,
    p_display_name text DEFAULT NULL,
    p_avatar_url text DEFAULT NULL,
    p_auth_method text DEFAULT 'bio_verified'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_raw_id text := btrim(coalesce(p_discord_id, ''));
    v_existing_discord_id text := '';
    v_session_id text;
BEGIN
    IF coalesce(p_roblox_user_id, 0) <= 0 OR btrim(coalesce(p_roblox_username, '')) = '' THEN
        RETURN jsonb_build_object(
            'ok', false,
            'message', 'Datos de cuenta de Roblox incompletos.'
        );
    END IF;

    IF v_raw_id ~ '^\d{15,22}$' THEN
        v_session_id := v_raw_id;
    ELSE
        -- Si este Roblox ya estaba vinculado a una cuenta de Discord, unificar automáticamente en el perfil real
        SELECT discord_id INTO v_existing_discord_id
        FROM public.user_links
        WHERE roblox_user_id = p_roblox_user_id
          AND discord_id ~ '^\d{15,22}$'
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1;

        IF coalesce(v_existing_discord_id, '') <> '' THEN
            v_session_id := v_existing_discord_id;
            UPDATE public.discord_configs
            SET oauth_verified = true,
                updated_at = now()
            WHERE discord_id = v_session_id;
        ELSE
            v_session_id := 'rblx_' || p_roblox_user_id::text;
        END IF;
    END IF;

    INSERT INTO public.user_links (
        discord_id,
        roblox_user_id,
        roblox_username,
        display_name,
        avatar_url,
        auth_method,
        updated_at
    ) VALUES (
        v_session_id,
        p_roblox_user_id,
        btrim(p_roblox_username),
        coalesce(nullif(btrim(p_display_name), ''), btrim(p_roblox_username)),
        nullif(btrim(p_avatar_url), ''),
        coalesce(nullif(btrim(p_auth_method), ''), 'bio_verified'),
        now()
    )
    ON CONFLICT (discord_id) DO UPDATE
    SET roblox_user_id = EXCLUDED.roblox_user_id,
        roblox_username = EXCLUDED.roblox_username,
        display_name = EXCLUDED.display_name,
        avatar_url = coalesce(EXCLUDED.avatar_url, public.user_links.avatar_url),
        auth_method = EXCLUDED.auth_method,
        updated_at = now();

    IF v_session_id ~ '^\d{15,22}$' THEN
        DELETE FROM public.user_links WHERE discord_id = ('rblx_' || p_roblox_user_id::text);
        DELETE FROM public.account_history WHERE discord_id = ('rblx_' || p_roblox_user_id::text);
    END IF;

    RETURN public.kortex_web_get_account_status(v_session_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.kortex_web_sync_discord_oauth(
    p_discord_id text,
    p_username text DEFAULT NULL,
    p_avatar_url text DEFAULT NULL,
    p_previous_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id text := btrim(coalesce(p_discord_id, ''));
    v_prev text := btrim(coalesce(p_previous_session_id, ''));
    v_prev_link public.user_links%ROWTYPE;
    v_target_link public.user_links%ROWTYPE;
BEGIN
    IF v_id !~ '^\d{15,22}$' THEN
        RETURN jsonb_build_object('ok', false, 'message', 'ID de Discord inválido.');
    END IF;

    INSERT INTO public.discord_configs (discord_id, discord_username, discord_avatar, oauth_verified, verified_at, updated_at)
    VALUES (
        v_id,
        nullif(btrim(coalesce(p_username, '')), ''),
        nullif(btrim(coalesce(p_avatar_url, '')), ''),
        true,
        now(),
        now()
    )
    ON CONFLICT (discord_id) DO UPDATE
    SET discord_username = coalesce(EXCLUDED.discord_username, public.discord_configs.discord_username),
        discord_avatar = coalesce(EXCLUDED.discord_avatar, public.discord_configs.discord_avatar),
        oauth_verified = true,
        verified_at = coalesce(public.discord_configs.verified_at, now()),
        updated_at = now();

    IF v_prev LIKE 'rblx_%' THEN
        SELECT * INTO v_prev_link FROM public.user_links WHERE discord_id = v_prev;
        IF FOUND AND v_prev_link.roblox_user_id IS NOT NULL THEN
            SELECT * INTO v_target_link FROM public.user_links WHERE discord_id = v_id;
            IF NOT FOUND OR v_target_link.roblox_user_id IS NULL THEN
                INSERT INTO public.user_links (discord_id, roblox_user_id, roblox_username, display_name, avatar_url, auth_method, updated_at)
                VALUES (v_id, v_prev_link.roblox_user_id, v_prev_link.roblox_username, v_prev_link.display_name, v_prev_link.avatar_url, v_prev_link.auth_method, now())
                ON CONFLICT (discord_id) DO UPDATE
                SET roblox_user_id = EXCLUDED.roblox_user_id,
                    roblox_username = EXCLUDED.roblox_username,
                    display_name = EXCLUDED.display_name,
                    avatar_url = EXCLUDED.avatar_url,
                    auth_method = EXCLUDED.auth_method,
                    updated_at = now();
            END IF;
            DELETE FROM public.user_links WHERE discord_id = v_prev;
            DELETE FROM public.account_history WHERE discord_id = v_prev;
        END IF;
    END IF;

    RETURN public.kortex_web_get_account_status(v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.kortex_web_disconnect_account(
    p_discord_id text,
    p_provider text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id text := btrim(coalesce(p_discord_id, ''));
    v_prov text := lower(btrim(coalesce(p_provider, 'all')));
BEGIN
    IF v_id = '' THEN
        RETURN public.kortex_web_get_account_status('');
    END IF;

    IF v_prov IN ('discord', 'all') THEN
        UPDATE public.discord_configs
        SET oauth_verified = false,
            access_token = NULL,
            refresh_token = NULL,
            verified_at = NULL,
            web_approved_in_discord = false,
            web_approved_until = NULL,
            updated_at = now()
        WHERE discord_id = v_id;
    END IF;

    IF v_prov IN ('roblox', 'all') THEN
        DELETE FROM public.user_links WHERE discord_id = v_id;
    END IF;

    IF v_prov = 'all' THEN
        DELETE FROM public.account_history WHERE discord_id = v_id;
    END IF;

    RETURN public.kortex_web_get_account_status(v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.kortex_web_get_account_status(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kortex_web_verify_discord(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kortex_web_link_roblox(text, bigint, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kortex_web_sync_discord_oauth(text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kortex_web_disconnect_account(text, text) TO anon, authenticated, service_role;

-- ============================================================================
-- 8. SINCRONIZACIÓN EN TIEMPO REAL (SUPABASE REALTIME: WEB ↔ DISCORD BOT)
-- ============================================================================
-- Tabla ligera de señales públicas sin datos sensibles (nunca expone tokens ni códigos KTX)
CREATE TABLE IF NOT EXISTS public.kortex_realtime_signals (
    discord_id text PRIMARY KEY,
    last_table text NOT NULL DEFAULT 'sync',
    event_type text NOT NULL DEFAULT 'UPDATE',
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kortex_realtime_signals REPLICA IDENTITY FULL;
ALTER TABLE public.kortex_realtime_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública de señales Realtime" ON public.kortex_realtime_signals;
CREATE POLICY "Lectura pública de señales Realtime"
    ON public.kortex_realtime_signals
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Acceso total service_role en kortex_realtime_signals" ON public.kortex_realtime_signals;
CREATE POLICY "Acceso total service_role en kortex_realtime_signals"
    ON public.kortex_realtime_signals
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT SELECT ON public.kortex_realtime_signals TO anon, authenticated, service_role;
GRANT ALL ON public.kortex_realtime_signals TO service_role;

CREATE OR REPLACE FUNCTION public.kortex_emit_realtime_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record jsonb;
    v_uid text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_record := to_jsonb(OLD);
    ELSE
        v_record := to_jsonb(NEW);
    END IF;

    v_uid := btrim(coalesce(v_record->>'discord_id', v_record->>'user_id', ''));
    IF v_uid <> '' AND v_uid <> 'default_session' THEN
        INSERT INTO public.kortex_realtime_signals (discord_id, last_table, event_type, updated_at)
        VALUES (v_uid, TG_TABLE_NAME, TG_OP, now())
        ON CONFLICT (discord_id) DO UPDATE
        SET last_table = EXCLUDED.last_table,
            event_type = EXCLUDED.event_type,
            updated_at = now();
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    v_tbl text;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY[
        'discord_configs',
        'user_links',
        'roblox_wishlist',
        'pending_robux',
        'tycoon_profiles',
        'account_history'
    ]
    LOOP
        IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_kortex_realtime_%I ON public.%I;', v_tbl, v_tbl);
            EXECUTE format(
                'CREATE TRIGGER trg_kortex_realtime_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.kortex_emit_realtime_signal();',
                v_tbl,
                v_tbl
            );
        END IF;
    END LOOP;
END;
$$;

DO $$
DECLARE
    v_tbl text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH v_tbl IN ARRAY ARRAY[
            'kortex_realtime_signals',
            'discord_configs',
            'user_links',
            'roblox_wishlist',
            'pending_robux',
            'tycoon_profiles',
            'account_history'
        ]
        LOOP
            IF to_regclass('public.' || v_tbl) IS NOT NULL AND NOT EXISTS (
                SELECT 1
                FROM pg_publication_tables
                WHERE pubname = 'supabase_realtime'
                  AND schemaname = 'public'
                  AND tablename = v_tbl
            ) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', v_tbl);
            END IF;
        END LOOP;
    END IF;
END;
$$;


