// ==========================================
// ARCHIVO: interactions/index.js
// Enrutador central de componentes v2 (Botones, Selects, Modales) y Módulos Multicategoría
// ==========================================

const fs = require('fs');
const path = require('path');
const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags
} = require('discord.js');

const { construirMenuPrincipal } = require('./buttons/navigation');
const { construirPanelHelp } = require('../commands/help');
const { construirPanelPing } = require('../commands/ping');
const { construirPanelBienvenidaServidor } = require('../events/guildCreate');
const {
    obtenerCuentaVinculada,
    obtenerConfigDiscord,
    guardarConfigDiscord,
    verificarAutorizacionDiscordOAuth,
    verificarAutorizacionRobloxOAuth,
    construirPanelVinculacionCuenta,
    construirPanelConfigDiscord,
    construirPanelDesbloqueoRequerido
} = require('../src/utils/fastLink');
const { handleEconomyInteraction } = require('../src/modules/economyModule');
const { handleAvatarInteraction } = require('../src/modules/avatarModule');
const { handleGamesInteraction } = require('../src/modules/gamesModule');
const {
    optimizarMemoriaRam,
    ejecutarDiagnosticoArranqueYCalibracion,
    ejecutarSecuenciaOptimizacionEnVivo,
    obtenerConfigPropietario,
    guardarConfigPropietario,
    esPropietarioDelBot,
    construirPanelAvisoModeracion,
    ejecutarInteraccionConOptimizacionYProgreso
} = require('../src/utils/performanceManager');
const {
    TIER_LABELS,
    obtenerIdiomaUsuario,
    guardarIdiomaUsuario,
    guardarPreferenciasUsuario
} = require('../src/utils/i18n');
const {
    actualizarIntervalosMonitoreo,
    ejecutarEscaneoManualCompleto
} = require('../services/priceTracker');
const {
    construirPanelTycoon,
    handleTycoonInteraction
} = require('./tycoonHandler');
const {
    rewardSilentActivity,
    getCatalogItems,
    deleteUgcItemByOwner
} = require('../services/tycoonEngine');

const buttons = new Map();
const selects = new Map();
const modals = new Map();

function cargarHandlers(subfolder, mapa) {
    const dirPath = path.join(__dirname, subfolder);
    if (!fs.existsSync(dirPath)) return;

    const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.js'));
    for (const file of files) {
        const handler = require(path.join(dirPath, file));
        if (handler.customIdPrefix && handler.execute) {
            mapa.set(handler.customIdPrefix, handler);
        }
    }
}

cargarHandlers('buttons', buttons);
cargarHandlers('selects', selects);
cargarHandlers('modals', modals);

function obtenerResumenHandlers() {
    const extraBotones = [
        'btn_fastlink_modal',
        'btn_fastlink_refresh',
        'btn_config_refresh',
        'btn_lang_first_pick:*',
        'btn_pref_lang:*',
        'btn_welcome_open_*',
        'btn_owner_*',
        'btn_econ_*',
        'btn_ava_*',
        'btn_games_*',
        'tycoon_*'
    ];
    const extraSelects = [
        'roblox_category_select',
        'help_category_select',
        'help_roblox_subcat_select',
        'config_category_select',
        'select_pref_tier',
        'welcome_tour_select',
        'select_owner_mechanic',
        'select_econ_*',
        'select_ava_*',
        'select_games_*',
        'tycoon_section_select',
        'tycoon_*'
    ];
    const extraModales = [
        'modal_owner_limits_submit',
        'modal_owner_intervals_submit',
        'modal_owner_ugc_delete_submit',
        'modal_econ_*',
        'modal_ava_*',
        'modal_games_*',
        'tycoon_modal_*'
    ];
    return {
        botones: [...buttons.keys(), ...extraBotones],
        selects: [...selects.keys(), ...extraSelects],
        modales: [...modals.keys(), ...extraModales],
        total: buttons.size + selects.size + modals.size + extraBotones.length + extraSelects.length + extraModales.length
    };
}

function siguienteModoMotor(modoActual) {
    if (modoActual === 'auto') return 'ahorro';
    if (modoActual === 'ahorro') return 'maximo';
    return 'auto';
}

function construirModalLimitesPropietario(cfg, isEn = false) {
    const modal = new ModalBuilder()
        .setCustomId('modal_owner_limits_submit')
        .setTitle(isEn ? '📏 User Capacity Limits' : '📏 Límites de Capacidad por Usuario');

    const inputWishlist = new TextInputBuilder()
        .setCustomId('owner_max_wishlist')
        .setLabel(isEn ? '1.1 Watchlist Max Items (1 to 25)' : '1.1 Máx. Objetos en Mi Lista (1 a 25)')
        .setStyle(TextInputStyle.Short)
        .setValue(String(cfg.maxWishlistItems || 5))
        .setPlaceholder('5')
        .setRequired(true);

    const inputSandbox = new TextInputBuilder()
        .setCustomId('owner_max_sandbox')
        .setLabel(isEn ? '2.1 Outfit Sandbox Max Items (1 to 15)' : '2.1 Máx. Prendas en Probador (1 a 15)')
        .setStyle(TextInputStyle.Short)
        .setValue(String(cfg.maxSandboxItems || 5))
        .setPlaceholder('5')
        .setRequired(true);

    const inputGameSubs = new TextInputBuilder()
        .setCustomId('owner_max_gamesubs')
        .setLabel(isEn ? '3.4 Patch Alerts Max Games (1 to 15)' : '3.4 Máx. Juegos en Alertas (1 a 15)')
        .setStyle(TextInputStyle.Short)
        .setValue(String(cfg.maxGameSubs || 3))
        .setPlaceholder('3')
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(inputWishlist),
        new ActionRowBuilder().addComponents(inputSandbox),
        new ActionRowBuilder().addComponents(inputGameSubs)
    );
    return modal;
}

function construirModalIntervalosPropietario(cfg, isEn = false) {
    const modal = new ModalBuilder()
        .setCustomId('modal_owner_intervals_submit')
        .setTitle(isEn ? '⏱️ Automatic Scan Intervals' : '⏱️ Intervalos de Escaneo Automático');

    const inputPrices = new TextInputBuilder()
        .setCustomId('owner_interval_prices')
        .setLabel(isEn ? '1.1 Price Check Interval in Minutes (1 to 60)' : '1.1 Revisión de Precios en Minutos (1 a 60)')
        .setStyle(TextInputStyle.Short)
        .setValue(String(cfg.priceCheckIntervalMinutes || 5))
        .setPlaceholder('5')
        .setRequired(true);

    const inputWorkers = new TextInputBuilder()
        .setCustomId('owner_interval_workers')
        .setLabel(isEn ? '1.4 Robux & 3.4 Patches Interval (2 to 120)' : '1.4 Robux y 3.4 Parches en Minutos (2 a 120)')
        .setStyle(TextInputStyle.Short)
        .setValue(String(cfg.workersIntervalMinutes || 15))
        .setPlaceholder('15')
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(inputPrices),
        new ActionRowBuilder().addComponents(inputWorkers)
    );
    return modal;
}

function construirModalModeracionUgcPropietario(isEn = false) {
    const modal = new ModalBuilder()
        .setCustomId('modal_owner_ugc_delete_submit')
        .setTitle(isEn ? '🎨 Delete Community UGC Item' : '🎨 Eliminar Ítem UGC del Catálogo');

    const inputUgcTarget = new TextInputBuilder()
        .setCustomId('owner_ugc_target')
        .setLabel(isEn ? 'UGC Item ID or Name to Delete' : 'ID o Nombre del Ítem UGC a Eliminar')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ugc_123456_abc')
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(inputUgcTarget));
    return modal;
}

async function procesarInteraccionInterna(interaction) {
    // Puente Silencioso: Recompensar con Tix en segundo plano (cooldown 5 min) sin interrumpir /roblox
    if (interaction.user?.id) {
        rewardSilentActivity(interaction.user.id).catch(() => null);
    }

    // Protección de paneles públicos: solo quien ejecutó el comando puede usar sus controles
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isChannelSelectMenu()) {
        const esControlCompartido =
            interaction.customId.startsWith('btn_pause_item_') ||
            interaction.customId.startsWith('btn_resume_item_') ||
            interaction.customId === 'welcome_tour_select' ||
            interaction.customId.startsWith('btn_welcome_open_');
        const ownerId = interaction.message?.interactionMetadata?.user?.id ||
                        interaction.message?.interaction?.user?.id;

        if (!esControlCompartido && ownerId && ownerId !== interaction.user.id) {
            const isEn = obtenerIdiomaUsuario(interaction.user.id) === 'en';
            return await interaction.reply({
                content: isEn
                    ? `🔒 This panel was opened by <@${ownerId}>. Run the command yourself to use your own controls.`
                    : `🔒 Este panel fue abierto por <@${ownerId}>. Ejecutá el comando por tu cuenta para usar tus propios controles.`,
                flags: MessageFlags.Ephemeral
            });
        }
    }

    const cid = interaction.customId || '';
    const ownerCfg = obtenerConfigPropietario();

    // 0. Selección de idioma por primera vez (Español / English) al ejecutar un comando
    if (cid.startsWith('btn_lang_first_pick:') && interaction.isButton()) {
        const parts = cid.split(':');
        const chosenLang = parts[1] === 'en' ? 'en' : 'es';
        const targetCmd = parts[2] || 'roblox';

        guardarIdiomaUsuario(interaction.user.id, chosenLang);
        await interaction.deferUpdate();

        if (targetCmd === 'config') {
            const panel = await construirPanelConfigDiscord(
                interaction.user,
                chosenLang === 'en'
                    ? '✅ **Language saved:** English (`🇺🇸`). You can change it anytime in **Language & Preferences**.'
                    : '✅ **Idioma guardado:** Español (`🇪🇸`). Podés cambiarlo cuando quieras en **Idioma y Preferencias**.',
                'cat_accounts',
                interaction.client
            );
            return await interaction.editReply(panel);
        }

        if (targetCmd === 'ping') {
            const latencia = Math.max(0, Date.now() - interaction.createdTimestamp);
            return await interaction.editReply(construirPanelPing(interaction.client, latencia, chosenLang));
        }

        if (targetCmd === 'help') {
            return await interaction.editReply(construirPanelHelp('cmd_overview', 'sub_economy', chosenLang));
        }

        if (targetCmd === 'tycoon') {
            const panel = await construirPanelTycoon(interaction.user, 'sec_studio', null);
            return await interaction.editReply(panel);
        }

        await obtenerCuentaVinculada(interaction.user.id).catch(() => null);
        return await interaction.editReply(construirMenuPrincipal(interaction.user.id, 'main'));
    }

    // 0A. Controles Exclusivos del Propietario en /config (Categoría: Administración del Bot)
    if (
        cid === 'select_owner_mechanic' ||
        cid.startsWith('btn_owner_') ||
        cid === 'modal_owner_limits_submit' ||
        cid === 'modal_owner_intervals_submit' ||
        cid === 'modal_owner_ugc_delete_submit'
    ) {
        const esOwner = await esPropietarioDelBot(interaction.user.id, interaction.client);
        const isEn = obtenerIdiomaUsuario(interaction.user.id) === 'en';
        if (!esOwner) {
            return await interaction.reply({
                content: isEn
                    ? '🔒 Only the bot owner can use the Bot Administration controls.'
                    : '🔒 Solo el propietario del bot puede utilizar los controles de Administración del Bot.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Si eligió una opción del desplegable que abre una ventana modal, mostrar el modal antes de deferUpdate
        if (cid === 'select_owner_mechanic' && interaction.isStringSelectMenu()) {
            const chosen = interaction.values[0];
            if (chosen === 'owner_modal_limits') {
                return await interaction.showModal(construirModalLimitesPropietario(ownerCfg, isEn));
            }
            if (chosen === 'owner_modal_intervals') {
                return await interaction.showModal(construirModalIntervalosPropietario(ownerCfg, isEn));
            }
            if (chosen === 'owner_modal_ugc_mod') {
                return await interaction.showModal(construirModalModeracionUgcPropietario(isEn));
            }
        }

        await interaction.deferUpdate();
        let feedback = null;

        if (cid === 'modal_owner_limits_submit' && interaction.isModalSubmit()) {
            const rawWish = parseInt(interaction.fields.getTextInputValue('owner_max_wishlist').trim(), 10);
            const rawSand = parseInt(interaction.fields.getTextInputValue('owner_max_sandbox').trim(), 10);
            const rawSubs = parseInt(interaction.fields.getTextInputValue('owner_max_gamesubs').trim(), 10);

            const updated = guardarConfigPropietario({
                maxWishlistItems: Number.isFinite(rawWish) ? rawWish : ownerCfg.maxWishlistItems,
                maxSandboxItems: Number.isFinite(rawSand) ? rawSand : ownerCfg.maxSandboxItems,
                maxGameSubs: Number.isFinite(rawSubs) ? rawSubs : ownerCfg.maxGameSubs
            });

            feedback = isEn
                ? `📏 **User limits updated:** Watchlist (1.1): \`${updated.maxWishlistItems}\` • Outfit Sandbox (2.1): \`${updated.maxSandboxItems}\` • Patch Alerts (3.4): \`${updated.maxGameSubs}\`.`
                : `📏 **Límites por usuario actualizados:** Mi Lista (1.1): \`${updated.maxWishlistItems}\` • Probador (2.1): \`${updated.maxSandboxItems}\` • Alertas de Parches (3.4): \`${updated.maxGameSubs}\`.`;
        } else if (cid === 'modal_owner_intervals_submit' && interaction.isModalSubmit()) {
            const rawPrices = parseInt(interaction.fields.getTextInputValue('owner_interval_prices').trim(), 10);
            const rawWorkers = parseInt(interaction.fields.getTextInputValue('owner_interval_workers').trim(), 10);

            guardarConfigPropietario({
                priceCheckIntervalMinutes: Number.isFinite(rawPrices) ? rawPrices : ownerCfg.priceCheckIntervalMinutes,
                workersIntervalMinutes: Number.isFinite(rawWorkers) ? rawWorkers : ownerCfg.workersIntervalMinutes
            });

            const applied = actualizarIntervalosMonitoreo(interaction.client);
            feedback = isEn
                ? `⏱️ **Scan intervals updated in real time:** Prices (1.1) every \`${applied.priceMinutes} min\` • Pending Robux & Game Patches every \`${applied.workerMinutes} min\`.`
                : `⏱️ **Intervalos de escaneo actualizados en vivo:** Precios (1.1) cada \`${applied.priceMinutes} min\` • Robux Pendientes y Parches cada \`${applied.workerMinutes} min\`.`;
        } else if (cid === 'modal_owner_ugc_delete_submit' && interaction.isModalSubmit()) {
            const query = interaction.fields.getTextInputValue('owner_ugc_target').trim();
            const { items } = await getCatalogItems();
            const qLower = query.toLowerCase();
            const foundUgc = items.find(
                it =>
                    it.category === 'UGC' &&
                    (String(it.item_id).toLowerCase() === qLower || String(it.name).toLowerCase().includes(qLower))
            );
            if (foundUgc) {
                await deleteUgcItemByOwner(foundUgc.item_id);
                feedback = isEn
                    ? `🗑️ **UGC Item Removed:** Deleted **${foundUgc.name}** (\`${foundUgc.item_id}\`) from the catalog and inventories.`
                    : `🗑️ **Ítem UGC Eliminado:** Se borró **${foundUgc.name}** (\`${foundUgc.item_id}\`) del catálogo e inventarios.`;
            } else {
                feedback = isEn
                    ? `⚠️ No community UGC item found matching \`${query}\`.`
                    : `⚠️ No se encontró ningún ítem UGC que coincida con \`${query}\`.`;
            }
        } else if (cid === 'btn_owner_scan_now') {
            const scanRes = await ejecutarEscaneoManualCompleto(interaction.client);
            feedback = isEn
                ? `⚡ **Manual scan completed:** Checked \`${scanRes.total}\` tracked items (\`${scanRes.cambios}\` price changes, \`${scanRes.alertas}\` alerts sent) + Pending Robux & Game Patches.`
                : `⚡ **Escaneo manual completado:** Se revisaron \`${scanRes.total}\` objetos en seguimiento (\`${scanRes.cambios}\` cambios de precio, \`${scanRes.alertas}\` alertas enviadas) + Robux Pendientes y Parches.`;
        } else if (cid === 'btn_owner_optimize_ram') {
            const res = await ejecutarSecuenciaOptimizacionEnVivo(interaction);
            const detalleModulos = res.desglosePorSubsistema && res.desglosePorSubsistema.length > 0
                ? res.desglosePorSubsistema.map(d => `${d.label}: **${d.count}**`).join(' • ')
                : (isEn ? 'All temporary caches were already clean' : 'Todas las cachés temporales ya estaban limpias');
            feedback = isEn
                ? `🧹 **Cache cleanup completed:** Freed **${res.entradasLiberadas}** temporary items (~${res.kbCachesLiberados || 0} KB) • ${detalleModulos}.`
                : `🧹 **Limpieza de caché completada:** Se liberaron **${res.entradasLiberadas}** objetos temporales (~${res.kbCachesLiberados || 0} KB) • ${detalleModulos}.`;
        } else if (cid === 'btn_owner_cycle_engine') {
            const nuevoModo = siguienteModoMotor(ownerCfg.engineMode);
            guardarConfigPropietario({ engineMode: nuevoModo });
            feedback = isEn
                ? `🎛️ **Performance Mode updated to:** \`${nuevoModo.toUpperCase()}\`.`
                : `🎛️ **Modo de Rendimiento actualizado a:** \`${nuevoModo.toUpperCase()}\`.`;
        } else if (cid === 'btn_owner_toggle_maintenance') {
            const nuevoEstado = !ownerCfg.maintenanceMode;
            guardarConfigPropietario({ maintenanceMode: nuevoEstado });
            feedback = nuevoEstado
                ? (isEn
                    ? '🛠️ **Maintenance Mode ENABLED:** Only you (Owner) can run commands right now.'
                    : '🛠️ **Modo Mantenimiento ACTIVADO:** Solo vos (Propietario) podés usar el bot ahora.')
                : (isEn
                    ? '🟢 **Maintenance Mode DISABLED:** The bot is open for all users again.'
                    : '🟢 **Modo Mantenimiento DESACTIVADO:** El bot volvió a estar abierto para todos.');
        } else if (cid === 'btn_owner_refresh') {
            feedback = isEn
                ? '🔄 **Bot parameters and memory metrics refreshed.**'
                : '🔄 **Parámetros y uso de memoria actualizados.**';
        } else if (cid === 'select_owner_mechanic' && interaction.isStringSelectMenu()) {
            const chosen = interaction.values[0];
            if (chosen === 'owner_cycle_engine') {
                const nuevoModo = siguienteModoMotor(ownerCfg.engineMode);
                guardarConfigPropietario({ engineMode: nuevoModo });
                feedback = isEn
                    ? `🎛️ **Performance Mode changed to:** \`${nuevoModo.toUpperCase()}\`.`
                    : `🎛️ **Modo de Rendimiento cambiado a:** \`${nuevoModo.toUpperCase()}\`.`;
            } else if (chosen === 'owner_toggle_tycoon') {
                const nuevo = ownerCfg.tycoonEnabled === false;
                guardarConfigPropietario({ tycoonEnabled: nuevo });
                feedback = nuevo
                    ? (isEn
                        ? '🏭 **Tycoon Ecosystem (`/tycoon`):** 🟢 Enabled for all players.'
                        : '🏭 **Ecosistema Tycoon (`/tycoon`):** 🟢 Activado para todos los jugadores.')
                    : (isEn
                        ? '⏸️ **Tycoon Ecosystem (`/tycoon`):** Paused temporarily.'
                        : '⏸️ **Ecosistema Tycoon (`/tycoon`):** Pausado temporalmente.');
            } else if (chosen === 'owner_toggle_maintenance') {
                const nuevo = !ownerCfg.maintenanceMode;
                guardarConfigPropietario({ maintenanceMode: nuevo });
                feedback = nuevo
                    ? (isEn
                        ? '🛠️ **Maintenance Mode ENABLED** (owner-only access).'
                        : '🛠️ **Modo Mantenimiento ACTIVADO** (acceso exclusivo para el propietario).')
                    : (isEn
                        ? '🟢 **Maintenance Mode DISABLED** (public access restored).'
                        : '🟢 **Modo Mantenimiento DESACTIVADO** (acceso público restablecido).');
            } else if (chosen === 'owner_toggle_discord_oauth') {
                const nuevo = !ownerCfg.requireDiscordOAuth;
                guardarConfigPropietario({ requireDiscordOAuth: nuevo });
                feedback = nuevo
                    ? (isEn
                        ? '🔐 **Discord Web Login REQUIRED:** Users must verify their Discord account on the web before saving items.'
                        : '🔐 **Login Web de Discord REQUERIDO:** Los usuarios deberán verificar su cuenta en la web para guardar datos.')
                    : (isEn
                        ? '🔓 **Direct Save ENABLED:** Users can now save items in Watchlist, Pending Robux, Codes, and Patch Alerts without web login.'
                        : '🔓 **Guardado Directo ACTIVADO:** Los usuarios ahora pueden guardar en Mi Lista, Robux, Códigos y Parches directamente sin ir a la web.');
            } else if (chosen === 'owner_toggle_loading') {
                const nuevo = !ownerCfg.dynamicLoadingEnabled;
                guardarConfigPropietario({ dynamicLoadingEnabled: nuevo });
                feedback = nuevo
                    ? (isEn
                        ? '📋 **Step-by-Step Loading Screen:** 🟢 Enabled (4-row progress).'
                        : '📋 **Pantalla de Carga por Filas:** 🟢 Activada (progreso de 4 filas).')
                    : (isEn
                        ? '⚡ **Step-by-Step Loading Screen:** Disabled (instant direct reply).'
                        : '⚡ **Pantalla de Carga por Filas:** Desactivada (respuesta directa al instante).');
            }
        }

        const panel = await construirPanelConfigDiscord(interaction.user, feedback, 'cat_owner_bot', interaction.client);
        return await interaction.editReply(panel);
    }

    // 0B. Si el Modo Mantenimiento Global está activo y el usuario no es propietario (excepto en /config)
    const esAccionConfig =
        cid === 'config_category_select' ||
        cid === 'btn_config_refresh' ||
        cid === 'select_pref_tier' ||
        cid.startsWith('btn_pref_');
    if (ownerCfg.maintenanceMode && !esAccionConfig) {
        const esOwner = await esPropietarioDelBot(interaction.user.id, interaction.client);
        if (!esOwner) {
            await interaction.deferUpdate();
            return await interaction.editReply(construirPanelAvisoModeracion({
                titulo: '🛠️ Bot en Mantenimiento Temporal',
                descripcion: 'El propietario del bot activó el **Modo Mantenimiento** para optimizar recursos o aplicar ajustes. Intentá nuevamente en unos minutos.'
            }));
        }
    }

    // 1. Selector principal de categorías (/roblox)
    if (cid === 'roblox_category_select' && interaction.isStringSelectMenu()) {
        const selectedCat = interaction.values[0];
        await interaction.deferUpdate();
        await obtenerCuentaVinculada(interaction.user.id).catch(() => null);
        return await interaction.editReply(construirMenuPrincipal(interaction.user.id, selectedCat));
    }

    // 2. Selectores de comandos y subcategorías en /help
    if (cid === 'help_category_select' && interaction.isStringSelectMenu()) {
        const selectedMain = interaction.values[0];
        const lang = obtenerIdiomaUsuario(interaction.user.id);
        await interaction.deferUpdate();
        return await interaction.editReply(construirPanelHelp(selectedMain, 'sub_economy', lang));
    }

    if (cid === 'help_roblox_subcat_select' && interaction.isStringSelectMenu()) {
        const selectedSub = interaction.values[0];
        const lang = obtenerIdiomaUsuario(interaction.user.id);
        await interaction.deferUpdate();
        return await interaction.editReply(construirPanelHelp('cmd_roblox', selectedSub, lang));
    }

    // 2B. Selector de categorías y controles de Preferencias en /config
    if (cid === 'config_category_select' && interaction.isStringSelectMenu()) {
        const selectedCat = interaction.values[0];
        await interaction.deferUpdate();
        const panel = await construirPanelConfigDiscord(interaction.user, null, selectedCat, interaction.client);
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_pref_lang:') && interaction.isButton()) {
        const newLang = cid.split(':')[1] === 'en' ? 'en' : 'es';
        guardarIdiomaUsuario(interaction.user.id, newLang);
        await interaction.deferUpdate();
        const feedback = newLang === 'en'
            ? '🇺🇸 **Language updated to English!** All bot panels, tools, and rendered images will now appear in English.'
            : '🇪🇸 **¡Idioma actualizado a Español!** Todos los paneles, herramientas e imágenes del bot se mostrarán en Español.';
        const panel = await construirPanelConfigDiscord(interaction.user, feedback, 'cat_preferences', interaction.client);
        return await interaction.editReply(panel);
    }

    if (cid === 'select_pref_tier' && interaction.isStringSelectMenu()) {
        const selectedTier = interaction.values[0] || 'TIER_100';
        const prefs = guardarPreferenciasUsuario(interaction.user.id, { default_tier: selectedTier });
        const isEn = prefs.lang === 'en';
        const tierLabel = (TIER_LABELS[isEn ? 'en' : 'es'] || TIER_LABELS.es)[prefs.default_tier];
        await interaction.deferUpdate();
        const feedback = isEn
            ? `🌎 **Default pricing region saved:** ${tierLabel}`
            : `🌎 **Región de precios predeterminada guardada:** ${tierLabel}`;
        const panel = await construirPanelConfigDiscord(interaction.user, feedback, 'cat_preferences', interaction.client);
        return await interaction.editReply(panel);
    }

    // 2C. Sistema Interactivo de Bienvenida al Servidor (Selector de Tour + Botones de Apertura en 1 Clic)
    if (cid === 'welcome_tour_select' && interaction.isStringSelectMenu()) {
        const selectedTab = interaction.values[0] || 'overview';
        await interaction.deferUpdate();
        return await interaction.editReply(construirPanelBienvenidaServidor(interaction.guild, selectedTab));
    }

    if (cid.startsWith('btn_welcome_open_') && interaction.isButton()) {
        if (cid === 'btn_welcome_open_roblox') {
            await obtenerCuentaVinculada(interaction.user.id).catch(() => null);
            const panel = construirMenuPrincipal(interaction.user.id, 'cat_economy');
            return await interaction.reply({
                ...panel,
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
        }
        if (cid === 'btn_welcome_open_config') {
            const panel = await construirPanelConfigDiscord(interaction.user, null, 'cat_accounts', interaction.client);
            return await interaction.reply({
                ...panel,
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
        }
        if (cid === 'btn_welcome_open_help') {
            const lang = obtenerIdiomaUsuario(interaction.user.id);
            const panel = construirPanelHelp('cmd_overview', 'sub_economy', lang);
            return await interaction.reply({
                ...panel,
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
        }
        if (cid === 'btn_welcome_open_ping') {
            const latencia = Math.max(0, Date.now() - interaction.createdTimestamp);
            const lang = obtenerIdiomaUsuario(interaction.user.id);
            const panel = construirPanelPing(interaction.client, latencia, lang);
            return await interaction.reply({
                ...panel,
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
        }
    }

    // 3A. Centro de Vinculación de Cuenta de ROBLOX (en /roblox y /config)
    if (cid === 'btn_fastlink_modal' && interaction.isButton()) {
        await interaction.deferUpdate();
        const panel = await construirPanelVinculacionCuenta(interaction.user.id);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_fastlink_refresh' && interaction.isButton()) {
        await interaction.deferUpdate();
        const isEn = obtenerIdiomaUsuario(interaction.user.id) === 'en';
        const cuenta = await verificarAutorizacionRobloxOAuth(interaction.user.id).catch(() => null);
        const msg = cuenta && cuenta.roblox_user_id
            ? (isEn
                ? `✅ Status verified: your active authorized Roblox account is **@${cuenta.roblox_username}** (ID \`${cuenta.roblox_user_id}\`).`
                : `✅ Estado comprobado: tu cuenta de Roblox autorizada activa es **@${cuenta.roblox_username}** (ID \`${cuenta.roblox_user_id}\`).`)
            : (isEn
                ? `ℹ️ No active authorized Roblox account detected. Click **Authorize with Roblox OAuth 2.0** above to sign in.`
                : `ℹ️ No se detectó una cuenta de Roblox autorizada activa. Tocá el botón **Autorizar con Roblox OAuth 2.0** arriba para iniciar sesión.`);
        const panel = await construirPanelVinculacionCuenta(interaction.user.id, msg);
        return await interaction.editReply(panel);
    }

    // 3B. Configuración de Usuario (/config — Categoría: Cuentas y Conexión)
    if (cid === 'btn_config_refresh' && interaction.isButton()) {
        await interaction.deferUpdate();
        const uid = interaction.user.id;
        const isEn = obtenerIdiomaUsuario(uid) === 'en';
        const [updatedCfg, cuentaRoblox] = await Promise.all([
            verificarAutorizacionDiscordOAuth(uid),
            verificarAutorizacionRobloxOAuth(uid).catch(() => null)
        ]);
        const estadoDisc = updatedCfg?.oauth_verified
            ? (isEn
                ? `🟢 **Connected** (\`@${updatedCfg.discord_username || interaction.user.username}\`)`
                : `🟢 **Conectada** (\`@${updatedCfg.discord_username || interaction.user.username}\`)`)
            : (isEn ? `🔴 **Not connected**` : `🔴 **Sin conectar**`);
        const estadoRob = cuentaRoblox && cuentaRoblox.roblox_user_id
            ? (isEn
                ? `🟢 **Connected** (\`@${cuentaRoblox.roblox_username}\` • ID \`${cuentaRoblox.roblox_user_id}\`)`
                : `🟢 **Conectada** (\`@${cuentaRoblox.roblox_username}\` • ID \`${cuentaRoblox.roblox_user_id}\`)`)
            : (isEn ? `🔴 **Not linked**` : `🔴 **Sin vincular**`);
        const msg = isEn
            ? `🔄 **Account Verification Completed:**  💬 Discord: ${estadoDisc}   •   🎮 Roblox: ${estadoRob}`
            : `🔄 **Verificación de Cuentas Completada:**  💬 Discord: ${estadoDisc}   •   🎮 Roblox: ${estadoRob}`;
        const panel = await construirPanelConfigDiscord(interaction.user, msg, 'cat_accounts', interaction.client);
        return await interaction.editReply(panel);
    }

    // 3D. Verificación funcional inteligente de cuenta vinculada:
    const ACCIONES_REQUIEREN_ROBLOX = {
        'btn_ava_sandbox_load_worn': {
            nombre: '2.1 Cotizar Mi Ropa Actual (Probador en Vivo)',
            motivo: 'Para leer e importar las prendas que llevás equipadas actualmente en tu propio avatar, es necesario vincular tu **Cuenta de Roblox**.',
            backId: 'btn_ava_sandbox',
            backLabel: 'Volver Atrás'
        },
        'btn_ava_export3d_linked': {
            nombre: '2.4 Exportar Mi Avatar en 3D (.PNG + .ZIP)',
            motivo: 'Para exportar el modelo 3D y las texturas de tu propio personaje (en lugar de otro jugador o accesorio), necesitás tener vinculada tu **Cuenta de Roblox**.',
            backId: 'btn_ava_export3d',
            backLabel: 'Volver Atrás'
        },
        'btn_ava_colormatch_myavatar': {
            nombre: '2.5 Analizar Colores de Mi Avatar (Color-Match)',
            motivo: 'Para detectar automáticamente la paleta de colores de tu propio personaje, necesitás vincular primero tu **Cuenta de Roblox**.',
            backId: 'btn_ava_colormatch',
            backLabel: 'Volver Atrás'
        }
    };

    if (ACCIONES_REQUIEREN_ROBLOX[cid]) {
        const cuentaRoblox = await obtenerCuentaVinculada(interaction.user.id).catch(() => null);
        if (!cuentaRoblox || !cuentaRoblox.roblox_user_id) {
            const reqInfo = ACCIONES_REQUIEREN_ROBLOX[cid];
            await interaction.deferUpdate();
            return await interaction.editReply(construirPanelDesbloqueoRequerido({
                tipo: 'roblox',
                userId: interaction.user.id,
                nombreHerramienta: reqInfo.nombre,
                motivo: reqInfo.motivo,
                backButtonId: reqInfo.backId,
                backLabel: reqInfo.backLabel
            }));
        }
    }

    const ACCIONES_REQUIEREN_DISCORD = {
        'select_sniper_type': {
            nombre: '1.1 Seguimiento y Alertas de Precios',
            motivo: 'Para guardar objetos en tu lista personal y enviarte alertas automáticas en Discord cuando bajen de precio, es necesario que inicies sesión con tu **Cuenta de Discord**.',
            backId: 'btn_quick_sniper',
            backLabel: 'Volver Atrás'
        },
        'btn_nav_wishlist': {
            nombre: '1.1 Mi Lista Personal de Seguimiento',
            motivo: `Para gestionar tu lista personal de hasta ${ownerCfg.maxWishlistItems || 5} objetos en seguimiento y recibir avisos de bajada de precio, iniciá sesión con tu **Cuenta de Discord**.`,
            backId: 'btn_quick_sniper',
            backLabel: 'Volver Atrás'
        },
        'btn_econ_pending_add_modal': {
            nombre: '1.4 Agenda y Alerta de Robux Pendientes',
            motivo: 'Para registrar tus cobros en retención y enviarte un mensaje directo automático cuando tus Robux se acrediten, es necesario conectar tu **Cuenta de Discord**.',
            backId: 'btn_econ_pending',
            backLabel: 'Volver Atrás'
        },
        'select_games_codes_toggle': {
            nombre: '3.3 Checklist Personal de Códigos Canjeados',
            motivo: 'Podés consultar todos los códigos libremente sin registrarte, pero para guardar qué códigos ya canjeaste en tu perfil necesitás iniciar sesión con tu **Cuenta de Discord**.',
            backId: 'btn_games_codes',
            backLabel: 'Volver Atrás'
        },
        'btn_games_codes_add_modal': {
            nombre: '3.3 Registrar Código en la Bóveda',
            motivo: 'Para aportar y guardar nuevos códigos promocionales verificados en la bóveda, necesitás tener iniciada tu sesión de **Discord**.',
            backId: 'btn_games_codes',
            backLabel: 'Volver Atrás'
        },
        'btn_games_patch_add_modal': {
            nombre: '3.4 Suscripción a Avisos de Actualizaciones',
            motivo: 'Para suscribir tus juegos favoritos y enviarte avisos automáticos por Discord apenas salga un parche nuevo, es necesario conectar tu **Cuenta de Discord**.',
            backId: 'btn_games_patches',
            backLabel: 'Volver Atrás'
        }
    };

    const requiereDiscordInfo = ACCIONES_REQUIEREN_DISCORD[cid] || (
        (cid.startsWith('btn_sniper_save_') || cid.startsWith('btn_ava_clones_watch:') || cid.startsWith('btn_games_passes_watch:'))
            ? {
                nombre: 'Guardar en Mi Lista de Seguimiento',
                motivo: 'Para guardar este artículo en tu lista de seguimiento y recibir alertas de precio en Discord, iniciá sesión con tu **Cuenta de Discord**.',
                backId: 'btn_nav_main_menu',
                backLabel: 'Volver Atrás'
            }
            : null
    );

    if (requiereDiscordInfo && ownerCfg.requireDiscordOAuth !== false) {
        const cfgDiscord = obtenerConfigDiscord(interaction.user.id);
        if (!cfgDiscord || !cfgDiscord.oauth_verified) {
            await interaction.deferUpdate();
            return await interaction.editReply(construirPanelDesbloqueoRequerido({
                tipo: 'discord',
                userId: interaction.user.id,
                nombreHerramienta: requiereDiscordInfo.nombre,
                motivo: requiereDiscordInfo.motivo,
                backButtonId: requiereDiscordInfo.backId,
                backLabel: requiereDiscordInfo.backLabel
            }));
        }
    }

    // 4. Delegación a los 3 Módulos Multicategoría y al Ecosistema /tycoon
    if (cid.startsWith('tycoon_')) {
        return await handleTycoonInteraction(interaction);
    }

    if (cid.startsWith('btn_econ_') || cid.startsWith('modal_econ_') || cid.startsWith('select_econ_')) {
        return await handleEconomyInteraction(interaction);
    }

    if (cid.startsWith('btn_ava_') || cid.startsWith('modal_ava_') || cid.startsWith('select_ava_')) {
        return await handleAvatarInteraction(interaction);
    }

    if (cid.startsWith('btn_games_') || cid.startsWith('modal_games_') || cid.startsWith('select_games_')) {
        return await handleGamesInteraction(interaction);
    }

    // 5. Handlers clásicos (Precios, Mi Lista, Gráficas, Calculadoras, Ping)
    let mapa = null;
    if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu()) mapa = selects;
    else if (interaction.isButton()) mapa = buttons;
    else if (interaction.isModalSubmit()) mapa = modals;

    if (!mapa) return;

    const prefijosOrdenados = [...mapa.entries()].sort((a, b) => b[0].length - a[0].length);

    for (const [prefix, handler] of prefijosOrdenados) {
        if (cid.startsWith(prefix)) {
            await handler.execute(interaction);
            return;
        }
    }
}

async function routerInteracciones(interaction) {
    return await ejecutarInteraccionConOptimizacionYProgreso(interaction, () => procesarInteraccionInterna(interaction));
}

routerInteracciones.obtenerResumenHandlers = obtenerResumenHandlers;
module.exports = routerInteracciones;
