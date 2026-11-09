const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    WEEKLY_QUESTS_POOL,
    getOrCreatePlayerState,
    claimWeeklyQuestReward,
    buyCrystalShopItem,
    claimDailyStreak,
    getTycoonLeaderboard
} = require('../services/tycoonEngine');
const {
    renderTycoonSnapshot,
    renderTycoonShopShowcase,
    renderTycoonVaultShowcase,
    renderTycoonQuestsShowcase
} = require('../utils/tycoonRenderer');
const { construirPanelTycoon } = require('../interactions/tycoonHandler');
const {
    obtenerEstadoServidoresRoblox,
    generateRobloxStatusCanvas,
    construirPanelEstadoRoblox,
    construirPanelTendenciasRoblox,
    construirPanelInspectorPerfil,
    construirPanelRadarLimiteds,
    construirPanelComparadorJuegos
} = require('../src/modules/statusModule');
const { DEFINICION_CATEGORIAS, construirMenuPrincipal } = require('../interactions/buttons/navigation');
const supabase = require('../db');

test('Standalone /status command is removed and Category 4 of /roblox has 5 symmetrical tools', () => {
    const statusCmdPath = path.join(__dirname, '..', 'commands', 'status.js');
    assert.equal(fs.existsSync(statusCmdPath), false, 'commands/status.js should not exist');

    assert.ok(DEFINICION_CATEGORIAS.cat_status, 'cat_status must exist in DEFINICION_CATEGORIAS');
    assert.equal(DEFINICION_CATEGORIAS.cat_economy.herramientas.length, 5);
    assert.equal(DEFINICION_CATEGORIAS.cat_avatar.herramientas.length, 5);
    assert.equal(DEFINICION_CATEGORIAS.cat_games.herramientas.length, 5);
    assert.equal(DEFINICION_CATEGORIAS.cat_status.herramientas.length, 5);

    const statusBtns = DEFINICION_CATEGORIAS.cat_status.herramientas.map(h => h.btnId);
    assert.deepEqual(statusBtns, [
        'btn_status_roblox',
        'btn_status_trending',
        'btn_status_profile',
        'btn_status_limiteds',
        'btn_status_compare'
    ]);

    const mainHub = construirMenuPrincipal('test_nav_user', 'cat_status');
    assert.ok(Array.isArray(mainHub.components) && mainHub.components.length === 1);
});

test('Tycoon Weekly Quests, Voxels, Daily Streak & Leaderboard work end-to-end', async () => {
    const testUserId = `test_tycoon_${Date.now()}`;
    const initialState = await getOrCreatePlayerState(testUserId);

    assert.equal(typeof initialState.profile.crystal_balance, 'number');
    assert.equal(WEEKLY_QUESTS_POOL.length, 4);
    assert.equal(initialState.weeklyQuests.quests.length, 4);

    // Claim Daily Streak
    const dailyRes = await claimDailyStreak(testUserId);
    assert.equal(dailyRes.ok, true);
    assert.equal(dailyRes.streakDay, 1);
    assert.ok(dailyRes.rewardTix >= 150);

    // Second claim on same day should be rejected cleanly
    const dailyDuplicate = await claimDailyStreak(testUserId);
    assert.equal(dailyDuplicate.ok, false);
    assert.equal(dailyDuplicate.reason, 'cooldown');

    // Complete a weekly quest and claim Voxels
    const qState = {
        ...(initialState.profile.weekly_quests_state || {}),
        progress: { ...(initialState.profile.weekly_quests_state?.progress || {}), q_collect_tix: 3000 },
        claimed: {}
    };
    await supabase
        .from('tycoon_profiles')
        .update({ weekly_quests_state: qState, crystal_balance: 30 })
        .eq('user_id', testUserId);

    const claimRes = await claimWeeklyQuestReward(testUserId, 'all');
    assert.equal(claimRes.ok, true);
    assert.ok(claimRes.totalCrystalsEarned >= 12);
    assert.equal(claimRes.state.profile.crystal_balance, 30 + claimRes.totalCrystalsEarned);

    // Buy Voxel item
    const buyRes = await buyCrystalShopItem(testUserId, 'crys_darkheart_katana');
    assert.equal(buyRes.ok, true);
    assert.equal(buyRes.cost, 35);

    // Leaderboard
    await getOrCreatePlayerState('leaderboard_hero_player');
    const topList = await getTycoonLeaderboard(5);
    assert.ok(Array.isArray(topList) && topList.length >= 1);
});

test('All 4 symmetrical /tycoon categories render visual PNG showcases without RAP clutter', async () => {
    const testUserId = `test_render_${Date.now()}`;
    const state = await getOrCreatePlayerState(testUserId);
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    const bStudio = await renderTycoonSnapshot({ state, username: 'damianpro13', lang: 'es' });
    const bShop = await renderTycoonShopShowcase({ state, username: 'damianpro13', lang: 'es' });
    const bVault = await renderTycoonVaultShowcase({ state, username: 'damianpro13', lang: 'es' });
    const bQuests = await renderTycoonQuestsShowcase({ state, username: 'damianpro13', lang: 'es', leaderboard: [] });

    for (const buf of [bStudio, bShop, bVault, bQuests]) {
        assert.ok(Buffer.isBuffer(buf) && buf.length > 12000);
        assert.deepEqual(buf.subarray(0, 8), pngSignature);
    }

    for (const sec of ['sec_studio', 'sec_shop', 'sec_vault', 'sec_perks']) {
        const panel = await construirPanelTycoon({ id: testUserId, username: 'damianpro13' }, sec);
        assert.ok(Array.isArray(panel.components) && panel.components.length === 1);
        assert.ok(Array.isArray(panel.files) && panel.files.length === 0);
    }
});

test('All 5 tools of Category 4 (/roblox) build interactive panels with PNG attachments', async () => {
    const statusSnapshot = await obtenerEstadoServidoresRoblox(false);
    assert.equal(statusSnapshot.services.length, 5);

    const statusPng = await generateRobloxStatusCanvas(statusSnapshot, 'es');
    assert.ok(Buffer.isBuffer(statusPng) && statusPng.length > 10000);

    const p41 = await construirPanelEstadoRoblox('test_status_user', false);
    const p42 = await construirPanelTendenciasRoblox('test_status_user', false);
    const p43 = await construirPanelInspectorPerfil('test_status_user', 'Roblox');
    const p44 = await construirPanelRadarLimiteds('test_status_user');
    const p45 = await construirPanelComparadorJuegos('test_status_user');

    for (const panel of [p41, p42, p43, p44, p45]) {
        assert.ok(Array.isArray(panel.components) && panel.components.length === 1);
        assert.ok(Array.isArray(panel.files) && panel.files.length === 1);
    }

    const p41Json = JSON.stringify(p41.components[0].toJSON());
    const p42Json = JSON.stringify(p42.components[0].toJSON());
    assert.equal(p41Json.includes('Blox Fruits'), false);
    assert.equal(p41Json.includes('Brookhaven'), false);
    assert.equal(p42Json.includes('Blox Fruits'), false);
    assert.equal(p42Json.includes('Brookhaven'), false);
});

test('Streamlined performanceManager executes in 1 direct step and blocks duplicate rapid heavy clicks', async () => {
    const {
        leerEstadoRecursos,
        optimizarMemoriaRam,
        ejecutarSecuenciaOptimizacionEnVivo,
        ejecutarInteraccionConOptimizacionYProgreso
    } = require('../src/utils/performanceManager');

    const recursos = leerEstadoRecursos();
    assert.ok(recursos.rssMB > 0);
    assert.equal(typeof recursos.limites.maxGpu, 'number');

    let editReplyCalls = 0;
    let handlerExecutions = 0;

    const mockHeavyInteraction1 = {
        customId: 'tycoon_collect_pad',
        user: { id: 'spam_user_1' },
        isButton: () => true,
        deferUpdate: async () => {},
        editReply: async () => {
            editReplyCalls++;
        }
    };

    const mockHeavyInteraction2 = {
        customId: 'tycoon_collect_pad',
        user: { id: 'spam_user_1' },
        isButton: () => true,
        deferUpdate: async () => {},
        editReply: async () => {
            editReplyCalls++;
        }
    };

    // Start first heavy operation (takes 120ms) and fire a duplicate click 20ms later from the same user
    const p1 = ejecutarInteraccionConOptimizacionYProgreso(mockHeavyInteraction1, async () => {
        await mockHeavyInteraction1.deferUpdate();
        await new Promise(r => setTimeout(r, 120));
        handlerExecutions++;
        await mockHeavyInteraction1.editReply({ ok: true });
    });

    await new Promise(r => setTimeout(r, 20));
    const p2 = ejecutarInteraccionConOptimizacionYProgreso(mockHeavyInteraction2, async () => {
        handlerExecutions++;
        await mockHeavyInteraction2.editReply({ ok: true });
    });

    await Promise.all([p1, p2]);

    // Only 1 handler execution and 1 editReply should happen (zero intermediate 4-row edits, duplicate click blocked)
    assert.equal(handlerExecutions, 1);
    assert.equal(editReplyCalls, 1);

    // Direct 1-step cache cleanup without 4-row delay
    const t0 = Date.now();
    const purgeRes = await ejecutarSecuenciaOptimizacionEnVivo();
    const elapsed = Date.now() - t0;
    assert.equal(purgeRes.ejecutado, true);
    assert.ok(elapsed < 200, 'Cache cleanup should be instant (<200ms) without artificial 4-row delays');

    const manualPurge = optimizarMemoriaRam(true, 'manual_propietario');
    assert.equal(manualPurge.ejecutado, true);
});

test('Apache ECharts + @resvg/resvg-js Floor Chart and Vercel Satori HTML-to-PNG render cleanly in RAM', async () => {
    const {
        generatePriceFloorsChart,
        renderHtmlCardWithSatori
    } = require('../src/utils/chartGenerator');
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    const floorsPng = await generatePriceFloorsChart([
        { name: 'Cabeza', floor: 55 },
        { name: 'Cara', floor: 25 },
        { name: 'Cuello', floor: 25 },
        { name: 'Hombro', floor: 25 },
        { name: 'Frente', floor: 30 },
        { name: 'Espalda', floor: 105 },
        { name: 'Cintura', floor: 55 },
        { name: 'Pelo', floor: 55 }
    ]);
    assert.ok(Buffer.isBuffer(floorsPng) && floorsPng.length > 15000);
    assert.deepEqual(floorsPng.subarray(0, 8), pngSignature);

    const satoriPng = await renderHtmlCardWithSatori(
        '<div style="display:flex;width:100%;height:100%;background:#1e293b;color:#f8fafc;align-items:center;justify-content:center;font-size:24px;font-weight:bold;">Kortex Satori Test</div>',
        400,
        120
    );
    assert.ok(Buffer.isBuffer(satoriPng) && satoriPng.length > 1000);
    assert.deepEqual(satoriPng.subarray(0, 8), pngSignature);
});

test('Price Sniper menu (construirMenuSniper), Watchlist (construirLista/construirListaVacia), and quickActions work without MAX_WISHLIST_ITEMS ReferenceError', async () => {
    const {
        construirMenuSniper,
        construirLista,
        construirListaVacia
    } = require('../interactions/buttons/navigation');
    const quickActions = require('../interactions/buttons/quickActions');

    const sniperEs = construirMenuSniper('es');
    const sniperEn = construirMenuSniper('en');
    assert.ok(Array.isArray(sniperEs.components) && sniperEs.components.length === 1);
    assert.ok(Array.isArray(sniperEn.components) && sniperEn.components.length === 1);

    const emptyList = construirListaVacia('es');
    assert.ok(Array.isArray(emptyList.components) && emptyList.components.length === 1);

    const populatedList = await construirLista(
        [
            {
                id: 1,
                id_objet: '123456',
                item_name: 'Valkyrie Helm',
                item_type: 'catalog',
                last_price: 50000,
                target_price: 45000,
                is_paused: false
            }
        ],
        new Map(),
        'es'
    );
    assert.ok(Array.isArray(populatedList.components) && populatedList.components.length === 1);
    assert.ok(Array.isArray(populatedList.files) && populatedList.files.length === 0);

    let capturedReply = null;
    await quickActions.execute({
        customId: 'btn_quick_sniper',
        user: { id: 'test_sniper_user' },
        deferUpdate: async () => {},
        editReply: async (payload) => {
            capturedReply = payload;
            return payload;
        }
    });
    assert.ok(capturedReply && Array.isArray(capturedReply.components) && capturedReply.components.length === 1);
});

test('All upgraded ECharts + Satori + Skia generators (1.1 Price Chart, 1.2 Calc, 1.4 Pending, 3.1 Servers, 4.1-4.5 Infographics) work accurately', async () => {
    const {
        generatePriceChart,
        generateCalculatorBreakdownCard,
        generatePendingRobuxCard,
        generateEmptyServersRadarCard
    } = require('../src/utils/chartGenerator');
    const { construirPanelBienvenidaServidor } = require('../events/guildCreate');
    const { ejecutarEscaneoManualCompleto } = require('../services/priceTracker');
    const { calcularEmbedResultado } = require('../interactions/calcHelpers');
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    const now = Date.now();
    const pricePng = await generatePriceChart(
        [
            { price: 240, timestamp: new Date(now - 6 * 86400000) },
            { price: 210, timestamp: new Date(now - 4 * 86400000) },
            { price: 180, timestamp: new Date(now - 2 * 86400000) },
            { price: 145, timestamp: new Date(now) }
        ],
        'Valkyrie Helm UGC',
        { itemId: 'test_echarts_price', daysRange: '7d', targetPrice: 150, lang: 'es' }
    );
    assert.ok(Buffer.isBuffer(pricePng) && pricePng.length > 10000);
    assert.deepEqual(pricePng.subarray(0, 8), pngSignature);

    const calcRes = await calcularEmbedResultado(1000, ['grupo_40', 'roblox_regional'], 'TIER_60');
    assert.ok(Array.isArray(calcRes.files) && calcRes.files.length === 1);

    const calcPng = await generateCalculatorBreakdownCard({
        basePrice: 1000,
        regionalPrice: 600,
        cashback: 240,
        plusDiscount: 0,
        finalPrice: 360,
        totalSaved: 640,
        pctSaved: 64
    });
    assert.ok(Buffer.isBuffer(calcPng) && calcPng.length > 8000);

    const pendingPng = await generatePendingRobuxCard([
        { source_type: 'group_funds', source_label: 'Fondos de Grupo', amount_robux: 400, estimated_release_min: new Date(now - 3600000).toISOString() }
    ]);
    assert.ok(Buffer.isBuffer(pendingPng) && pendingPng.length > 8000);

    const serversPng = await generateEmptyServersRadarCard(
        { name: 'Blox Fruits', playing: 400000, maxPlayers: 12 },
        [{ id: 'srv-1', playing: 1, maxPlayers: 12, ping: 45, fps: 60 }]
    );
    assert.ok(Buffer.isBuffer(serversPng) && serversPng.length > 8000);

    const welcomeStatus = construirPanelBienvenidaServidor({ name: 'Test Guild', memberCount: 120 }, 'cat_status');
    assert.ok(Array.isArray(welcomeStatus.components) && welcomeStatus.components.length === 1);

    const scanStats = await ejecutarEscaneoManualCompleto(null);
    assert.equal(typeof scanStats.total, 'number');
    assert.equal(typeof scanStats.totalItems, 'number');
    assert.equal(scanStats.total, scanStats.totalItems);
});

test('Tool 2.2 (Buscador de Clones y Similares + Demo button) and Tool 2.1 (Probador de Ropa en Vivo + ECharts Breakdown) work reliably', async () => {
    const {
        buscarAlternativasYSimilares,
        construirPanelClones,
        construirPanelClonesInicial,
        construirPanelSandbox,
        handleAvatarInteraction
    } = require('../src/modules/avatarModule');
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    // 1. Initial Clones panel has the Demo Valkyrie button
    const initialClones = construirPanelClonesInicial();
    const initialJson = JSON.stringify(initialClones.components[0].toJSON());
    assert.ok(initialJson.includes('btn_ava_clones_demo:1365767'));

    // 2. buscarAlternativasYSimilares for 1365767 (Valkyrie Helm) returns real priced alternatives
    const { refItem, alternatives } = await buscarAlternativasYSimilares('1365767');
    assert.ok(refItem && Number(refItem.id) === 1365767);
    assert.ok(Number(refItem.price) > 0, 'Reference Valkyrie Helm must have a positive price');
    assert.ok(Array.isArray(alternatives) && alternatives.length >= 3, 'Must return at least 3 buyable alternatives');
    for (const alt of alternatives) {
        assert.ok(Number(alt.price) > 0, `Alternative ${alt.name} must have a positive price`);
    }

    // 3. construirPanelClones renders the v2.0 ECharts + Skia Clones Comparison PNG and pre-selects #1 alternative
    const clonesPanel = await construirPanelClones('1365767', 'test_clones_user');
    assert.ok(Array.isArray(clonesPanel.files) && clonesPanel.files.length === 1);
    const clonesAttachmentBuf = clonesPanel.files[0].attachment;
    assert.ok(Buffer.isBuffer(clonesAttachmentBuf) && clonesAttachmentBuf.length > 12000);
    assert.deepEqual(clonesAttachmentBuf.subarray(0, 8), pngSignature);
    const clonesJson = JSON.stringify(clonesPanel.components[0].toJSON());
    assert.ok(clonesJson.includes('btn_ava_clones_tryon:'), 'Quick Try-On button for #1 alternative must be immediately visible');

    // 4. Clicking btn_ava_clones_demo:1365767 through handleAvatarInteraction works end-to-end
    let demoReply = null;
    await handleAvatarInteraction({
        customId: 'btn_ava_clones_demo:1365767',
        user: { id: 'test_clones_demo_user' },
        isButton: () => true,
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
        deferUpdate: async () => {},
        editReply: async (payload) => {
            demoReply = payload;
            return payload;
        }
    });
    assert.ok(demoReply && Array.isArray(demoReply.files) && demoReply.files.length === 1);

    // 5. Tool 2.1 (Probador de Ropa en Vivo / Outfit Sandbox) demo outfit + ECharts breakdown
    let sandboxDemoReply = null;
    await handleAvatarInteraction({
        customId: 'btn_ava_sandbox_demo',
        user: { id: 'test_sandbox_demo_user' },
        isButton: () => true,
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
        deferUpdate: async () => {},
        editReply: async (payload) => {
            sandboxDemoReply = payload;
            return payload;
        }
    });
    assert.ok(sandboxDemoReply && Array.isArray(sandboxDemoReply.files) && sandboxDemoReply.files.length === 1);
    const sbBuf = sandboxDemoReply.files[0].attachment;
    assert.ok(Buffer.isBuffer(sbBuf) && sbBuf.length > 15000);
    assert.deepEqual(sbBuf.subarray(0, 8), pngSignature);
});

test('OAuth2 URL normalization and direct in-Discord account linking work without stale container URLs', async () => {
    const {
        DEFAULT_APP_URL,
        normalizarUrlPublica,
        obtenerUrlBasePublica,
        activarSesionDiscordDirecta,
        construirPanelVinculacionCuenta,
        construirPanelConfigDiscord,
        construirPanelDesbloqueoRequerido
    } = require('../src/utils/fastLink');

    assert.equal(
        DEFAULT_APP_URL,
        'https://damianduns.github.io/Kortex'
    );
    assert.equal(
        normalizarUrlPublica('http://damianduns.github.io/Kortex/'),
        'https://damianduns.github.io/Kortex'
    );

    const publicBase = obtenerUrlBasePublica();
    assert.ok(publicBase.startsWith('https://'));
    assert.equal(publicBase.includes('dmpwse4jqkfkz4vfkzt6pu'), false);

    const directCfg = await activarSesionDiscordDirecta({
        id: '999888777666555444',
        username: 'tester_kortex',
        globalName: 'Tester Kortex'
    });
    assert.equal(directCfg.oauth_verified, true);
    assert.equal(directCfg.discord_username, 'Tester Kortex');

    const linkPanel = await construirPanelVinculacionCuenta('999888777666555444');
    const linkJson = JSON.stringify(linkPanel.components[0].toJSON());
    assert.ok(linkJson.includes('btn_fastlink_open_modal'));
    assert.ok(linkJson.includes('Permisos de la aplicación'));
    assert.equal(linkJson.includes('dmpwse4jqkfkz4vfkzt6pu'), false);

    const cfgPanel = await construirPanelConfigDiscord(
        { id: '999888777666555444', username: 'tester_kortex' },
        null,
        'cat_accounts',
        null
    );
    const cfgJson = JSON.stringify(cfgPanel.components[0].toJSON());
    assert.ok(cfgJson.includes('btn_config_refresh'));
    assert.equal(cfgJson.includes('btn_config_unlink_roblox'), false);
    assert.ok(cfgJson.includes('btn_config_direct_discord'), '/config section 1 must have interactive Discord button');
    assert.ok(cfgJson.includes('btn_fastlink_open_modal'), '/config section 2 must have interactive Roblox modal button');
    assert.ok(cfgJson.includes('Permisos de la aplicación'), '/config must specify Configuración -> Permisos de la aplicación');
    assert.ok(cfgJson.includes('KTX-'), '/config must host the user KTX-XXXXXX verification code');
    assert.equal(cfgJson.includes('Robux Pendientes'), false);
    assert.equal(cfgJson.includes('dmpwse4jqkfkz4vfkzt6pu'), false);

    const unlockDiscord = construirPanelDesbloqueoRequerido({
        tipo: 'discord',
        userId: 'test_direct_discord_user',
        nombreHerramienta: 'Test Tool',
        motivo: 'Test reason'
    });
    const unlockJson = JSON.stringify(unlockDiscord.components[0].toJSON());
    assert.ok(unlockJson.includes('btn_config_direct_discord'));
    assert.equal(unlockJson.includes('dmpwse4jqkfkz4vfkzt6pu'), false);
});

test('/config User Comfort Preferences, 4 Regional Pricing Tiers (100/80/60/40%) in Calculator & Config, and Bot Administration controls persist cleanly', async () => {
    const {
        obtenerPreferenciasUsuario,
        guardarPreferenciasUsuario,
        restaurarPreferenciasUsuarioPorDefecto,
        REGIONAL_TIERS_LIST
    } = require('../src/utils/i18n');
    const {
        obtenerConfigPropietario,
        guardarConfigPropietario,
        restaurarConfigPropietarioPorDefecto
    } = require('../src/utils/performanceManager');
    const { construirPanelConfigDiscord } = require('../src/utils/fastLink');
    const { construirMenuPrincipal } = require('../interactions/buttons/navigation');
    const {
        construirPanelCalculadoraLimpio,
        calcularEmbedResultado
    } = require('../interactions/calcHelpers');

    // Verify the 4 canonical regional pricing tiers are ordered 100%, 80%, 60%, 40%
    assert.deepEqual(
        REGIONAL_TIERS_LIST.map(t => t.id),
        ['TIER_100', 'TIER_80', 'TIER_60', 'TIER_40']
    );

    const testUid = 'test_pref_user_999';
    const savedPrefs = guardarPreferenciasUsuario(testUid, {
        lang: 'es',
        default_tier: 'TIER_60',
        default_category: 'cat_avatar',
        default_chart_range: '30d',
        default_camera_mode: 'headshot',
        auto_cashback_40: false,
        dm_alerts_enabled: false,
        ephemeral_config: true
    });

    assert.equal(savedPrefs.default_tier, 'TIER_60');
    assert.equal(savedPrefs.default_category, 'cat_avatar');
    assert.equal(savedPrefs.default_chart_range, '30d');
    assert.equal(savedPrefs.default_camera_mode, 'headshot');
    assert.equal(savedPrefs.auto_cashback_40, false);
    assert.equal(savedPrefs.dm_alerts_enabled, false);
    assert.equal(savedPrefs.ephemeral_config, true);

    // Calculator 1.2 main panel and result panel both include the 4 aligned Tiers (100%, 80%, 60%, 40%)
    const calcClean = construirPanelCalculadoraLimpio(['grupo_40', 'roblox_regional'], testUid);
    const calcCleanJson = JSON.stringify(calcClean.components[0].toJSON());
    assert.ok(calcCleanJson.includes('select_calc_tier_preset'));
    assert.ok(calcCleanJson.includes('Tier 100%'));
    assert.ok(calcCleanJson.includes('Tier 80%'));
    assert.ok(calcCleanJson.includes('Tier 60%'));
    assert.ok(calcCleanJson.includes('Tier 40%'));

    const calcResult = await calcularEmbedResultado(1000, ['grupo_40', 'roblox_regional'], null, testUid);
    const calcResultJson = JSON.stringify(calcResult.components[0].toJSON());
    assert.ok(calcResultJson.includes('select_calc_region:1000'));
    assert.ok(calcResultJson.includes('Tier 60%'));

    // Opening /roblox without a category argument should open the user's preferred default_category ('cat_avatar')
    const mainHub = construirMenuPrincipal(testUid);
    const mainHubJson = JSON.stringify(mainHub.components[0].toJSON());
    assert.ok(mainHubJson.includes('Categoría 2: Avatares y Estudio 3D/2D'));

    // Render cat_preferences panel and verify comfort controls and 4 Tiers exist
    const prefPanel = await construirPanelConfigDiscord(
        { id: testUid, username: 'pref_tester' },
        null,
        'cat_preferences',
        null
    );
    const prefJson = JSON.stringify(prefPanel.components[0].toJSON());
    assert.ok(prefJson.includes('select_pref_default_cat'));
    assert.ok(prefJson.includes('select_pref_tier'));
    assert.ok(prefJson.includes('Tier 100%'));
    assert.ok(prefJson.includes('Tier 80%'));
    assert.ok(prefJson.includes('Tier 60%'));
    assert.ok(prefJson.includes('Tier 40%'));
    assert.ok(prefJson.includes('select_pref_comfort'));
    assert.ok(prefJson.includes('btn_pref_toggle_alerts'));
    assert.ok(prefJson.includes('btn_pref_toggle_ephemeral'));
    assert.ok(prefJson.includes('select_pref_prefix'));

    // Reset test user's preferences to defaults
    const resetPrefs = restaurarPreferenciasUsuarioPorDefecto(testUid);
    assert.equal(resetPrefs.default_category, 'cat_economy');
    assert.equal(resetPrefs.default_chart_range, '7d');
    assert.equal(resetPrefs.dm_alerts_enabled, true);
    assert.equal(resetPrefs.ephemeral_config, false);

    // Snapshot real owner config before testing so running tests never overwrites the owner's real status/settings
    const prevOwnerSnapshot = obtenerConfigPropietario();
    try {
        const updatedOwner = guardarConfigPropietario({
            ownerId: prevOwnerSnapshot.ownerId || testUid,
            botPresenceStatus: 'idle',
            botActivityText: 'Probando Kortex v2'
        });
        assert.equal(updatedOwner.botPresenceStatus, 'idle');
        assert.equal(updatedOwner.botActivityText, 'Probando Kortex v2');

        const ownerPanel = await construirPanelConfigDiscord(
            { id: updatedOwner.ownerId || testUid, username: 'owner_tester' },
            null,
            'cat_owner_bot',
            null
        );
        const ownerJson = JSON.stringify(ownerPanel.components[0].toJSON());
        assert.ok(ownerJson.includes('owner_cycle_presence'));
        assert.ok(ownerJson.includes('owner_modal_presence'));
        assert.ok(ownerJson.includes('owner_toggle_alerts'));
        assert.ok(ownerJson.includes('owner_reset_defaults'));

        const restoredOwner = restaurarConfigPropietarioPorDefecto();
        assert.equal(restoredOwner.botPresenceStatus, 'online');
        assert.equal(restoredOwner.botActivityText, '/roblox • /tycoon • /help • /config');
        assert.equal(restoredOwner.botActivityText.includes('/status'), false);
    } finally {
        guardarConfigPropietario(prevOwnerSnapshot);
    }
});

test('Direct linking by ID/Username requires mandatory 2-step ownership verification and enforces anti-spam protections', async () => {
    const {
        iniciarVerificacionDiscordWeb,
        confirmarVerificacionDiscordWeb,
        procesarAccionSeguridadDiscordWeb,
        generarCodigoVinculacionDiscord,
        iniciarVerificacionCodigoRoblox,
        obtenerVerificacionRobloxPendiente,
        cancelarVerificacionCodigoRoblox,
        obtenerCuentaVinculada,
        obtenerConfigDiscord
    } = require('../src/utils/fastLink');

    // 1. Unknown Discord ID with zero bot interaction and no mutual guild is rejected without spamming strangers
    const unknownDiscordId = '888888888888888888';
    const strangerAttempt = await iniciarVerificacionDiscordWeb(unknownDiscordId, {
        client: null,
        requesterIp: '10.0.0.10'
    });
    assert.equal(strangerAttempt.ok, false);
    assert.equal(strangerAttempt.reason, 'not_in_mutual_guild');

    // 2. Active bot user generates a KTX-XXXXXX code in /config; Web Step 1 requires verification (never links in 1 click)
    const activeDiscordId = '777777777777777777';
    const generated = generarCodigoVinculacionDiscord(activeDiscordId, { username: 'adrian_verified' }, { forceNew: true });
    assert.match(generated.code, /^KTX-\d{6}$/);

    const webStep1 = await iniciarVerificacionDiscordWeb(activeDiscordId, {
        client: null,
        requesterIp: '10.0.0.11'
    });
    assert.equal(webStep1.ok, true);
    assert.equal(webStep1.step, 'verify_required');
    assert.equal(webStep1.dmSent, false, 'Must NEVER send DM spam');
    assert.equal(webStep1.hostedInConfig, true, 'Code must be hosted in /config');

    // Wrong code must fail and NOT link
    const wrongVerify = await confirmarVerificacionDiscordWeb(activeDiscordId, 'KTX-000000', null);
    assert.equal(wrongVerify.ok, false);

    // Correct KTX-XXXXXX code verifies and activates the session
    const rightVerify = await confirmarVerificacionDiscordWeb(activeDiscordId, generated.code, null);
    assert.equal(rightVerify.ok, true);
    assert.equal(rightVerify.step, 'verified');
    assert.equal(obtenerConfigDiscord(activeDiscordId).oauth_verified, true);

    // 2B. Clicking "✅ Sí, fui yo" in Discord DM via routerInteracciones keeps the KTX-XXXXXX code visible in the DM AND allows automatic web login WITHOUT typing the code
    const routerInteracciones = require('../interactions/index');
    const dmApproveId = '765432109876543210';
    const dmGen = generarCodigoVinculacionDiscord(dmApproveId, { id: dmApproveId, username: 'dm_button_user' });
    let dmUpdatedPayload = null;
    await routerInteracciones({
        customId: `btn_discord_web_approve:${dmApproveId}:${dmGen.rawDigits}`,
        user: { id: dmApproveId, username: 'dm_button_user' },
        isButton: () => true,
        isStringSelectMenu: () => false,
        isChannelSelectMenu: () => false,
        isModalSubmit: () => false,
        replied: false,
        deferred: false,
        update: async (payload) => {
            dmUpdatedPayload = payload;
            return payload;
        }
    });
    assert.ok(dmUpdatedPayload, 'routerInteracciones must call interaction.update on btn_discord_web_approve');
    assert.ok(dmUpdatedPayload.content.includes(dmGen.code), 'DM message must keep the KTX-XXXXXX code visible after clicking Sí, fui yo');
    assert.ok(Array.isArray(dmUpdatedPayload.components) && dmUpdatedPayload.components.length === 1, 'DM message must keep updated button row');

    // Web page polling or clicking Verify with EMPTY code ('') succeeds automatically because user already confirmed in Discord
    const autoWebVerify = await confirmarVerificacionDiscordWeb(dmApproveId, '', null, { isPoll: true });
    assert.equal(autoWebVerify.ok, true);
    assert.equal(autoWebVerify.step, 'verified');
    assert.equal(obtenerConfigDiscord(dmApproveId).oauth_verified, true);

    // And if the user ALSO manually enters the code afterward, it still succeeds without expiring
    const manualAfterAuto = await confirmarVerificacionDiscordWeb(dmApproveId, dmGen.code, null);
    assert.equal(manualAfterAuto.ok, true);
    assert.equal(manualAfterAuto.step, 'verified');

    // 3. Anti-spam block button ("🚫 No fui yo") blocks future web requests for that Discord ID
    const blockTargetId = '666666666666666666';
    generarCodigoVinculacionDiscord(blockTargetId, { username: 'protected_user' });
    const blockAction = await procesarAccionSeguridadDiscordWeb({ id: blockTargetId, username: 'protected_user' }, 'block', '');
    assert.equal(blockAction.ok, true);
    assert.equal(blockAction.blocked, true);

    const blockedAttempt = await iniciarVerificacionDiscordWeb(blockTargetId, {
        client: null,
        requesterIp: '10.0.0.12'
    });
    assert.equal(blockedAttempt.ok, false);
    assert.equal(blockedAttempt.reason, 'blocked_by_user');

    // 4. Roblox direct linking by @Username or numeric ID NEVER links in 1 click; requires KORTEX-XXXX bio code
    const robloxTestDiscordId = '555555555555555555';
    const robloxStep1 = await iniciarVerificacionCodigoRoblox(robloxTestDiscordId, '1', {
        requesterKey: 'test_req_roblox_1'
    });
    assert.equal(robloxStep1.ok, true);
    assert.equal(robloxStep1.step, 'verify_required');
    assert.match(robloxStep1.verifyCode, /^KORTEX-\d{4}$/);

    // Must NOT be linked yet after Step 1
    assert.equal(await obtenerCuentaVinculada(robloxTestDiscordId), null);

    // Pending challenge must exist with the same KORTEX-XXXX code
    const pendingChallenge = obtenerVerificacionRobloxPendiente(robloxTestDiscordId);
    assert.ok(pendingChallenge);
    assert.equal(pendingChallenge.verifyCode, robloxStep1.verifyCode);

    // Another stranger trying to spam verification for the same Roblox User ID (1) right away is blocked by anti-spam cooldown
    const spamAttemptOtherUser = await iniciarVerificacionCodigoRoblox('444444444444444444', '1', {
        requesterKey: 'test_req_roblox_2'
    });
    assert.equal(spamAttemptOtherUser.ok, false);
    assert.equal(spamAttemptOtherUser.reason, 'target_cooldown');

    // Cancel pending challenge cleanly
    cancelarVerificacionCodigoRoblox(robloxTestDiscordId);
    assert.equal(obtenerVerificacionRobloxPendiente(robloxTestDiscordId), null);
});

test('Price Check-in clearly highlights completed target meta and savings below original price across Watchlist, Chart Inspector, and Config', async () => {
    const PriceItem = require('../models/PriceItem');
    const { construirLista } = require('../interactions/buttons/navigation');
    const { renderizarVistaGrafica } = require('../interactions/buttons/chartView');
    const { renderizarPanelConfig } = require('../interactions/buttons/manageActions');

    const now = Date.now();
    const trackedItemCompleted = {
        id: 777,
        user_id: 'checkin_user_1',
        id_objet: '999111',
        item_name: 'Dominus Empyreus UGC',
        item_type: 'catalog',
        last_price: 680,
        target_price: 750,
        is_paused: false,
        price_history: [
            { price: 1000, timestamp: new Date(now - 5 * 86400000).toISOString() },
            { price: 850, timestamp: new Date(now - 2 * 86400000).toISOString() },
            { price: 680, timestamp: new Date(now).toISOString() }
        ]
    };

    const summary = PriceItem.getPriceCheckSummary(trackedItemCompleted);
    assert.equal(summary.firstPrice, 1000);
    assert.equal(summary.lastPrice, 680);
    assert.equal(summary.isBelowOriginal, true);
    assert.equal(summary.savedVsOriginal, 320);
    assert.equal(summary.pctSavedVsOriginal, 32);
    assert.equal(summary.isTargetMet, true);
    assert.equal(summary.belowTargetAmount, 70);

    // 1. Watchlist (construirLista) shows META COMPLETADA banner and original price savings
    const listPayload = await construirLista([trackedItemCompleted], new Map(), 'es');
    const listJson = JSON.stringify(listPayload.components[0].toJSON());
    assert.ok(listJson.includes('META COMPLETADA'));
    assert.ok(listJson.includes('320'));
    assert.ok(listJson.includes('32%'));

    // 2. Chart Inspector (renderizarVistaGrafica) shows META COMPLETADA, original price savings, and Check-in Ahora button
    const chartPayload = await renderizarVistaGrafica(trackedItemCompleted, [trackedItemCompleted], '7d', '🎯 **Check-in completado — ¡META ALCANZADA!**');
    const chartJson = JSON.stringify(chartPayload.components[0].toJSON());
    assert.ok(chartJson.includes('META COMPLETADA'));
    assert.ok(chartJson.includes('YA LLEGASTE A LA META QUE ESTABLECISTE'));
    assert.ok(chartJson.includes('btn_action_checkin:777'));
    assert.ok(Array.isArray(chartPayload.files) && chartPayload.files.length === 1);

    // 3. Config panel (renderizarPanelConfig) shows META COMPLETADA, original price savings, and Check-in button
    const cfgPayload = await renderizarPanelConfig(trackedItemCompleted);
    const cfgJson = JSON.stringify(cfgPayload.components[0].toJSON());
    assert.ok(cfgJson.includes('META COMPLETADA'));
    assert.ok(cfgJson.includes('btn_action_checkin:777:config'));
});

test('Kortex Tycoon Economy v2: Key Fragments, Master Keys, Forge Critical Pressure, 3 Lock Chests, Risk Multipliers, Laser Calibration & Prospector Tonic work end-to-end', async () => {
    const { withUserLock } = require('../services/tycoonLock');
    const {
        KEY_FRAGMENTS_PER_MASTER_KEY,
        DROP_RATES,
        rollFragmentDrop,
        resolveForgePressure,
        rollChestBaseLoot,
        applyRiskTier
    } = require('../services/tycoonLoot');
    const {
        forgeMasterKey,
        resolveForgePressureChoice,
        startChestSession,
        turnChestLock,
        revealChest,
        calibrateLaser
    } = require('../services/tycoonKeyEngine');
    const {
        collectPadTix,
        buyAndActivatePotion
    } = require('../services/tycoonEngine');

    // 1. Reentrant per-user mutex serializes concurrent operations without deadlocking nested calls
    const order = [];
    const uidLock = 'lock_test_user';
    await Promise.all([
        withUserLock(uidLock, async () => {
            order.push('start-1');
            await new Promise(r => setTimeout(r, 30));
            await withUserLock(uidLock, async () => {
                order.push('nested-1');
            });
            order.push('end-1');
        }),
        withUserLock(uidLock, async () => {
            order.push('start-2');
            order.push('end-2');
        })
    ]);
    assert.deepEqual(order, ['start-1', 'nested-1', 'end-1', 'start-2', 'end-2']);

    // 2. Pure RNG loot unit checks
    assert.equal(KEY_FRAGMENTS_PER_MASTER_KEY, 4);
    assert.equal(rollFragmentDrop(DROP_RATES.criticalVent, false, () => 0.14), true);
    assert.equal(rollFragmentDrop(DROP_RATES.criticalVent, false, () => 0.16), false);
    assert.equal(rollFragmentDrop(DROP_RATES.criticalVent, true, () => 0.28), true);

    assert.equal(rollFragmentDrop(DROP_RATES.foundation, false, () => 0.24), true);
    assert.equal(rollFragmentDrop(DROP_RATES.foundation, false, () => 0.26), false);
    assert.equal(rollFragmentDrop(DROP_RATES.foundation, true, () => 0.49), true);

    assert.deepEqual(resolveForgePressure('safe'), { choice: 'safe', won: true, masterKeys: 1, fragmentsRefunded: 0 });
    assert.deepEqual(resolveForgePressure('overload', () => 0.40), { choice: 'overload', won: true, masterKeys: 2, fragmentsRefunded: 0 });
    assert.deepEqual(resolveForgePressure('overload', () => 0.60), { choice: 'overload', won: false, masterKeys: 0, fragmentsRefunded: 1 });

    const baseVoxel = rollChestBaseLoot('voxel', () => 0.10);
    assert.ok(baseVoxel.voxeles >= 45);
    assert.equal(baseVoxel.permanentBonusPct, 2);

    assert.equal(applyRiskTier(baseVoxel, 'safe').multiplier, 1);
    assert.equal(applyRiskTier(baseVoxel, 'overcharge', () => 0.50).multiplier, 1.5);
    assert.equal(applyRiskTier(baseVoxel, 'overcharge', () => 0.85).multiplier, 0.8);
    assert.equal(applyRiskTier(baseVoxel, 'jackpot', () => 0.20).multiplier, 2.5);
    assert.equal(applyRiskTier(baseVoxel, 'jackpot', () => 0.50).multiplier, 0.5);

    // 3. End-to-End Player Flow: Prospector Tonic, Forge, Chest Unbox, Laser Calibration & 4/4 Weekly Quests
    const testUser = `test_kortex_v2_${Date.now()}`;
    await getOrCreatePlayerState(testUser);

    await supabase.from('tycoon_profiles').update({
        tix_balance: 5000,
        crystal_balance: 10,
        collector_tix: 3500,
        collector_cap: 3500,
        studio_stage: 4,
        unlocked_pads: ['pad_dropper1', 'pad_walls', 'pad_dropper2', 'pad_laser'],
        key_fragments: 8,
        master_keys: 0,
        laser_state: { miscalibrated: true, triggered_at: Date.now() - 1000, next_roll_at: Date.now() + 60000 }
    }).eq('user_id', testUser);

    // Buy Prospector Tonic (600 Tix)
    const tonicRes = await buyAndActivatePotion(testUser, 'prospector_tonic');
    assert.equal(tonicRes.ok, true);
    assert.equal(tonicRes.potion.cost, 600);
    assert.equal(tonicRes.state.metrics.prospectorActive, true);

    // Collect at 100% capacity with deterministic RNG forcing drop
    const collectRes = await collectPadTix(testUser, () => 0.05);
    assert.equal(collectRes.ok, true);
    assert.equal(collectRes.wasFull, true);
    assert.equal(collectRes.bonusFragment, true);

    // Calibrate Stage 4 Laser with deterministic RNG forcing fragment drop
    const calRes = await calibrateLaser(testUser, () => 0.05);
    assert.equal(calRes.ok, true);
    assert.equal(calRes.bonusFragment, true);
    assert.ok(calRes.rewardTix >= 300);

    // Forge Master Key with deterministic RNG triggering Critical Pressure, then Overload success (+2 Master Keys)
    const forgeStep1 = await forgeMasterKey(testUser, () => 0.10);
    assert.equal(forgeStep1.ok, true);
    assert.equal(forgeStep1.pending, true);
    assert.ok(forgeStep1.sid);

    const forgeStep2 = await resolveForgePressureChoice(testUser, forgeStep1.sid, 'overload', () => 0.20);
    assert.equal(forgeStep2.ok, true);
    assert.equal(forgeStep2.outcome.masterKeys, 2);
    assert.equal(forgeStep2.state.profile.master_keys, 2);

    // Open Reinforced Chest (requires 2 Master Keys, 2 locks)
    const chestStart = await startChestSession(testUser, 'reinforced');
    assert.equal(chestStart.ok, true);
    const chestSid = chestStart.state.profile.active_sessions.chest.sid;
    assert.equal(chestStart.state.profile.active_sessions.chest.locksTotal, 2);

    const lock1 = await turnChestLock(testUser, chestSid, 1);
    assert.equal(lock1.ok, true);
    assert.equal(lock1.readyForRisk, false);

    const lock2 = await turnChestLock(testUser, chestSid, 2);
    assert.equal(lock2.ok, true);
    assert.equal(lock2.readyForRisk, true);

    const unboxRes = await revealChest(testUser, chestSid, 'overcharge', () => 0.20);
    assert.equal(unboxRes.ok, true);
    assert.equal(unboxRes.risk.multiplier, 1.5);
    assert.ok(unboxRes.risk.tix >= 4800);
    assert.equal(unboxRes.state.profile.master_keys, 0);

    // Complete all 4/4 weekly quests and verify +30 Vóxeles and +1 Master Key bonus
    const fullQuestsState = {
        weekKey: unboxRes.state.weeklyQuests.weekKey,
        progress: {
            q_collect_tix: 5000,
            q_build_pads: 5,
            q_use_potions: 5,
            q_rebirth_or_bot: 5
        },
        claimed: {},
        allBonusClaimed: false
    };
    await supabase.from('tycoon_profiles').update({ weekly_quests_state: fullQuestsState }).eq('user_id', testUser);
    const weeklyFullRes = await claimWeeklyQuestReward(testUser, 'all');
    assert.equal(weeklyFullRes.ok, true);
    assert.equal(weeklyFullRes.grantedAllBonus, true);
    assert.equal(weeklyFullRes.bonusMasterKeys, 1);
    assert.ok(weeklyFullRes.totalCrystalsEarned >= 30);
    assert.equal(weeklyFullRes.state.profile.master_keys, 1);
});
