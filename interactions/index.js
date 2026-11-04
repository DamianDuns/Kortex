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
    ButtonBuilder,
    ButtonStyle,
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
    activarSesionDiscordDirecta,
    resolverUsuarioRoblox,
    guardarCuentaVinculada,
    eliminarCuentaVinculada,
    iniciarVerificacionCodigoRoblox,
    confirmarVerificacionCodigoRoblox,
    cancelarVerificacionCodigoRoblox,
    generarCodigoVinculacionDiscord,
    procesarAccionSeguridadDiscordWeb,
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
    construirPanelEstadoRoblox,
    handleStatusInteraction
} = require('../src/modules/statusModule');
const {
    optimizarMemoriaRam,
    ejecutarDiagnosticoArranqueYCalibracion,
    ejecutarSecuenciaOptimizacionEnVivo,
    obtenerConfigPropietario,
    guardarConfigPropietario,
    restaurarConfigPropietarioPorDefecto,
    aplicarPresenciaBotDiscord,
    esPropietarioDelBot,
    construirPanelAvisoModeracion,
    ejecutarInteraccionConOptimizacionYProgreso
} = require('../src/utils/performanceManager');
const {
    TIER_LABELS,
    obtenerPreferenciasUsuario,
    obtenerIdiomaUsuario,
    guardarIdiomaUsuario,
    guardarPreferenciasUsuario,
    restaurarPreferenciasUsuarioPorDefecto
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
        'btn_fastlink_open_modal',
        'btn_fastlink_verify_now',
        'btn_fastlink_cancel_verify',
        'btn_fastlink_refresh',
        'btn_discord_web_approve:*',
        'btn_discord_web_block:*',
        'btn_config_direct_discord',
        'btn_config_unlink_roblox',
        'btn_config_refresh',
        'btn_lang_first_pick:*',
        'btn_pref_lang:*',
        'btn_pref_toggle_alerts',
        'btn_pref_toggle_ephemeral',
        'btn_pref_reset',
        'btn_welcome_open_*',
        'btn_owner_*',
        'btn_econ_*',
        'btn_ava_*',
        'btn_games_*',
        'btn_status_*',
        'tycoon_*'
    ];
    const extraSelects = [
        'roblox_category_select',
        'help_category_select',
        'help_roblox_subcat_select',
        'config_category_select',
        'select_pref_default_cat',
        'select_pref_tier',
        'select_pref_comfort',
        'welcome_tour_select',
        'select_owner_mechanic',
        'select_econ_*',
        'select_ava_*',
        'select_games_*',
        'select_status_*',
        'tycoon_section_select',
        'tycoon_*'
    ];
    const extraModales = [
        'modal_fastlink_roblox_submit',
        'modal_owner_limits_submit',
        'modal_owner_intervals_submit',
        'modal_owner_presence_submit',
        'modal_owner_ugc_delete_submit',
        'modal_econ_*',
        'modal_ava_*',
        'modal_games_*',
        'modal_status_*',
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

function siguienteEstadoPresencia(estadoActual) {
    if (estadoActual === 'online') return 'idle';
    if (estadoActual === 'idle') return 'dnd';
    return 'online';
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

function construirModalPresenciaPropietario(cfg, isEn = false) {
    const modal = new ModalBuilder()
        .setCustomId('modal_owner_presence_submit')
        .setTitle(isEn ? '💬 Custom Bot Activity Text' : '💬 Frase de Estado del Bot en Discord');

    const inputActivity = new TextInputBuilder()
        .setCustomId('owner_activity_text')
        .setLabel(isEn ? 'Activity text shown under the bot' : 'Frase de actividad que mostrará el bot')
        .setStyle(TextInputStyle.Short)
        .setValue(String(cfg.botActivityText || '/roblox • /tycoon • /help • /config'))
        .setPlaceholder('/roblox • /tycoon • /help • /config')
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(inputActivity));
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
        cid === 'modal_owner_presence_submit' ||
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
            if (chosen === 'owner_modal_presence') {
                return await interaction.showModal(construirModalPresenciaPropietario(ownerCfg, isEn));
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
        } else if (cid === 'modal_owner_presence_submit' && interaction.isModalSubmit()) {
            const rawText = interaction.fields.getTextInputValue('owner_activity_text').trim();
            const updated = guardarConfigPropietario({ botActivityText: rawText });
            aplicarPresenciaBotDiscord(interaction.client);
            feedback = isEn
                ? `💬 **Bot activity text updated in Discord:** \`${updated.botActivityText}\`.`
                : `💬 **Frase de actividad del bot actualizada en Discord:** \`${updated.botActivityText}\`.`;
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
            aplicarPresenciaBotDiscord(interaction.client);
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
            if (chosen === 'owner_cycle_presence') {
                const nextStatus = siguienteEstadoPresencia(ownerCfg.botPresenceStatus || 'online');
                guardarConfigPropietario({ botPresenceStatus: nextStatus });
                aplicarPresenciaBotDiscord(interaction.client);
                const statusLabels = {
                    online: isEn ? '🟢 Online' : '🟢 En línea',
                    idle: isEn ? '🌙 Idle / Away' : '🌙 Ausente (Idle)',
                    dnd: isEn ? '⛔ Do Not Disturb' : '⛔ No Molestar (DND)'
                };
                feedback = isEn
                    ? `🟢 **Bot Discord Status changed to:** ${statusLabels[nextStatus]}.`
                    : `🟢 **Estado del bot en Discord cambiado a:** ${statusLabels[nextStatus]}.`;
            } else if (chosen === 'owner_cycle_engine') {
                const nuevoModo = siguienteModoMotor(ownerCfg.engineMode);
                guardarConfigPropietario({ engineMode: nuevoModo });
                feedback = isEn
                    ? `🎛️ **Performance Mode changed to:** \`${nuevoModo.toUpperCase()}\`.`
                    : `🎛️ **Modo de Rendimiento cambiado a:** \`${nuevoModo.toUpperCase()}\`.`;
            } else if (chosen === 'owner_toggle_alerts') {
                const nuevo = ownerCfg.alertsEnabled === false;
                guardarConfigPropietario({ alertsEnabled: nuevo });
                feedback = nuevo
                    ? (isEn
                        ? '🔔 **Global Background Alerts:** 🟢 Active (Price Sniper 1.1, Pending Robux 1.4, and Game Patches 3.4).'
                        : '🔔 **Alertas Automáticas Globales:** 🟢 Activadas (Precios 1.1, Robux Pendientes 1.4 y Parches 3.4).')
                    : (isEn
                        ? '⏸️ **Global Background Alerts:** Paused temporarily.'
                        : '⏸️ **Alertas Automáticas Globales:** Pausadas temporalmente.');
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
                aplicarPresenciaBotDiscord(interaction.client);
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
                        ? '🟡 **Queue Notice on Heavy Load:** Enabled (shows notice only if all concurrency slots are full).'
                        : '🟡 **Aviso de Cola en Tráfico Alto:** Activado (solo muestra aviso si los slots de concurrencia están llenos).')
                    : (isEn
                        ? '⚡ **Direct 1-Step Reply:** Enabled (zero intermediate edits, minimum RAM & API usage).'
                        : '⚡ **Respuesta Directa en 1 Paso:** Activada (sin ediciones intermedias, mínimo consumo de RAM y Discord API).');
            } else if (chosen === 'owner_reset_defaults') {
                restaurarConfigPropietarioPorDefecto();
                actualizarIntervalosMonitoreo(interaction.client);
                aplicarPresenciaBotDiscord(interaction.client);
                feedback = isEn
                    ? '🔄 **All bot parameters restored to safe factory defaults.**'
                    : '🔄 **Todos los parámetros del bot se restauraron a sus valores óptimos por defecto.**';
            }
        }

        const panel = await construirPanelConfigDiscord(interaction.user, feedback, 'cat_owner_bot', interaction.client);
        return await interaction.editReply(panel);
    }

    // 0B. Si el Modo Mantenimiento Global está activo y el usuario no es propietario (excepto en /config)
    const esAccionConfig =
        cid === 'config_category_select' ||
        cid === 'btn_config_refresh' ||
        cid === 'btn_config_direct_discord' ||
        cid === 'btn_config_unlink_roblox' ||
        cid === 'btn_fastlink_open_modal' ||
        cid === 'btn_fastlink_verify_now' ||
        cid === 'btn_fastlink_cancel_verify' ||
        cid.startsWith('btn_discord_web_') ||
        cid === 'modal_fastlink_roblox_submit' ||
        cid === 'select_pref_default_cat' ||
        cid === 'select_pref_tier' ||
        cid === 'select_pref_comfort' ||
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

    if (cid === 'select_pref_default_cat' && interaction.isStringSelectMenu()) {
        const nextCat = interaction.values[0] || 'cat_economy';
        const prefs = guardarPreferenciasUsuario(interaction.user.id, { default_category: nextCat });
        const isEn = prefs.lang === 'en';
        const labels = isEn
            ? {
                cat_economy: '💰 1. Economy & Pricing',
                cat_avatar: '👕 2. Avatars & 3D/2D Studio',
                cat_games: '🎮 3. Games & Servers',
                cat_status: '📊 4. Roblox Analytics & Status'
            }
            : {
                cat_economy: '💰 1. Economía y Precios',
                cat_avatar: '👕 2. Avatares y Estudio 3D/2D',
                cat_games: '🎮 3. Juegos y Servidores',
                cat_status: '📊 4. Estadísticas y Estado'
            };
        await interaction.deferUpdate();
        const feedback = isEn
            ? `📂 **Default \`/roblox\` starting category saved:** ${labels[prefs.default_category] || labels.cat_economy}`
            : `📂 **Categoría de inicio en \`/roblox\` guardada:** ${labels[prefs.default_category] || labels.cat_economy}`;
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

    if (cid === 'select_pref_comfort' && interaction.isStringSelectMenu()) {
        const choice = interaction.values[0] || '';
        const uid = interaction.user.id;
        const currentPrefs = obtenerPreferenciasUsuario(uid);
        const isEn = currentPrefs.lang === 'en';
        await interaction.deferUpdate();

        let feedback = '';
        if (choice.startsWith('cat:')) {
            const nextCat = choice.split(':')[1] || 'cat_economy';
            guardarPreferenciasUsuario(uid, { default_category: nextCat });
            const labels = isEn
                ? {
                    cat_economy: '💰 1. Economy & Pricing',
                    cat_avatar: '👕 2. Avatars & 3D/2D Studio',
                    cat_games: '🎮 3. Games & Servers',
                    cat_status: '📊 4. Roblox Analytics & Status'
                }
                : {
                    cat_economy: '💰 1. Economía y Precios',
                    cat_avatar: '👕 2. Avatares y Estudio 3D/2D',
                    cat_games: '🎮 3. Juegos y Servidores',
                    cat_status: '📊 4. Estadísticas y Estado'
                };
            feedback = isEn
                ? `📂 **Default \`/roblox\` category updated to:** ${labels[nextCat] || labels.cat_economy}`
                : `📂 **Categoría inicial de \`/roblox\` guardada:** ${labels[nextCat] || labels.cat_economy}`;
        } else if (choice.startsWith('range:')) {
            const nextRange = choice.split(':')[1] || '7d';
            guardarPreferenciasUsuario(uid, { default_chart_range: nextRange });
            const rangeLabels = isEn
                ? { '24h': '24 Hours (24h)', '7d': '7 Days (7d)', '30d': '30 Days (30d)', 'all': 'Full History (All)' }
                : { '24h': '24 Horas (24h)', '7d': '7 Días (7d)', '30d': '30 Días (30d)', 'all': 'Histórico Completo' };
            feedback = isEn
                ? `📈 **Default chart range (1.1) set to:** \`${rangeLabels[nextRange] || '7d'}\``
                : `📈 **Rango predeterminado de gráficas (1.1) guardado:** \`${rangeLabels[nextRange] || '7d'}\``;
        } else if (choice === 'toggle_camera') {
            const nextCam = currentPrefs.default_camera_mode === 'headshot' ? 'full' : 'headshot';
            guardarPreferenciasUsuario(uid, { default_camera_mode: nextCam });
            feedback = nextCam === 'headshot'
                ? (isEn
                    ? '📸 **2.1 Outfit Sandbox Camera:** Set to **🔍 Head / Face Zoom** by default.'
                    : '📸 **Cámara Inicial del Probador 2.1:** Configurada en **🔍 Zoom Cabeza / Rostro** por defecto.')
                : (isEn
                    ? '📸 **2.1 Outfit Sandbox Camera:** Set to **🧍 Full Body 3D** by default.'
                    : '📸 **Cámara Inicial del Probador 2.1:** Configurada en **🧍 Cuerpo Completo 3D** por defecto.');
        } else if (choice === 'toggle_cashback') {
            const nextCb = currentPrefs.auto_cashback_40 === false;
            guardarPreferenciasUsuario(uid, { auto_cashback_40: nextCb });
            feedback = nextCb
                ? (isEn
                    ? '🧮 **1.2 Economy Calculator:** 40% Group Method Cashback is now **pre-enabled** by default.'
                    : '🧮 **Calculadora 1.2:** El **Cashback del 40% (Método de Grupo)** ahora estará pre-activado al abrir la calculadora.')
                : (isEn
                    ? '🧮 **1.2 Economy Calculator:** Set to manual benefit selection.'
                    : '🧮 **Calculadora 1.2:** Configurada en selección manual de beneficios.');
        }

        const panel = await construirPanelConfigDiscord(interaction.user, feedback, 'cat_preferences', interaction.client);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_pref_toggle_alerts' && interaction.isButton()) {
        const uid = interaction.user.id;
        const current = obtenerPreferenciasUsuario(uid);
        const nextState = current.dm_alerts_enabled === false;
        const updated = guardarPreferenciasUsuario(uid, { dm_alerts_enabled: nextState });
        const isEn = updated.lang === 'en';
        await interaction.deferUpdate();
        const feedback = nextState
            ? (isEn
                ? '🔔 **Personal DM Alerts ENABLED:** You will receive automatic DM notifications for Price Sniper (1.1), Pending Robux (1.4), and Game Updates (3.4).'
                : '🔔 **Alertas por MD ACTIVADAS:** Recibirás avisos automáticos de Precios (1.1), Robux Pendientes (1.4) y Parches (3.4).')
            : (isEn
                ? '🔕 **Do Not Disturb Mode ENABLED:** All automatic DM alerts are paused until you turn them back on (your saved items remain intact).'
                : '🔕 **Modo No Molestar ACTIVADO:** Se pausaron todos los avisos por Mensaje Directo sin borrar tus objetos guardados.');
        const panel = await construirPanelConfigDiscord(interaction.user, feedback, 'cat_preferences', interaction.client);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_pref_toggle_ephemeral' && interaction.isButton()) {
        const uid = interaction.user.id;
        const current = obtenerPreferenciasUsuario(uid);
        const nextEphemeral = !current.ephemeral_config;
        const updated = guardarPreferenciasUsuario(uid, { ephemeral_config: nextEphemeral });
        const isEn = updated.lang === 'en';
        await interaction.deferUpdate();
        const feedback = nextEphemeral
            ? (isEn
                ? '🔒 **Private Mode (Only visible to me) ENABLED:** Next time you run `/roblox`, `/status`, `/tycoon`, or `/config`, the panel will open privately so only you can see it in the channel.'
                : '🔒 **Modo Privado (Solo visible para mí) ACTIVADO:** La próxima vez que ejecutes `/roblox`, `/status`, `/tycoon` o `/config`, el panel se abrirá en privado para que nadie más en el canal lo vea.')
            : (isEn
                ? '👁️ **Public Mode ENABLED:** Commands will open normally in the channel.'
                : '👁️ **Modo Público ACTIVADO:** Los comandos se abrirán públicamente en el canal como de costumbre.');
        const panel = await construirPanelConfigDiscord(interaction.user, feedback, 'cat_preferences', interaction.client);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_pref_reset' && interaction.isButton()) {
        const uid = interaction.user.id;
        const updated = restaurarPreferenciasUsuarioPorDefecto(uid);
        const isEn = updated.lang === 'en';
        await interaction.deferUpdate();
        const feedback = isEn
            ? '🔄 **Preferences restored to default settings!**'
            : '🔄 **¡Tus preferencias volvieron a los valores predeterminados!**';
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

    if (cid === 'btn_fastlink_open_modal' && interaction.isButton()) {
        const isEn = obtenerIdiomaUsuario(interaction.user.id) === 'en';
        const modal = new ModalBuilder()
            .setCustomId('modal_fastlink_roblox_submit')
            .setTitle(isEn ? '🎮 Link Roblox Account (@Username or ID)' : '🎮 Vincular Cuenta de Roblox (@Usuario o ID)');

        const inputUser = new TextInputBuilder()
            .setCustomId('fastlink_roblox_input')
            .setLabel(isEn ? 'Your Roblox @Username or numeric User ID' : 'Tu @Usuario de Roblox o ID numérico')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(isEn ? 'e.g. damianpro13 or 123456789' : 'Ej: damianpro13 o 123456789')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputUser));
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_fastlink_roblox_submit' && interaction.isModalSubmit()) {
        await interaction.deferUpdate();
        const uid = interaction.user.id;
        const isEn = obtenerIdiomaUsuario(uid) === 'en';
        const rawQuery = interaction.fields.getTextInputValue('fastlink_roblox_input').trim();

        const isConfigView = interaction.message?.components?.some(c => {
            try {
                const jsonStr = JSON.stringify(c.toJSON ? c.toJSON() : c);
                return jsonStr.includes('config_category_select') || jsonStr.includes('btn_config_refresh');
            } catch {
                return false;
            }
        });

        // Iniciar verificación obligatoria de propiedad (Nunca vincular en 1 clic sin comprobar que la cuenta le pertenece)
        const challengeRes = await iniciarVerificacionCodigoRoblox(uid, rawQuery, { requesterIp: `discord:${uid}` });
        if (!challengeRes.ok) {
            const errMsg = isEn
                ? `❌ Could not find any Roblox user matching \`${rawQuery}\`. Check the spelling or enter your numeric Roblox ID.`
                : (challengeRes.message || `❌ No se encontró ningún usuario de Roblox que coincida con \`${rawQuery}\`.`);
            const panel = isConfigView
                ? await construirPanelConfigDiscord(interaction.user, errMsg, 'cat_accounts', interaction.client)
                : await construirPanelVinculacionCuenta(uid, errMsg);
            return await interaction.editReply(panel);
        }

        const verifyMsg = isEn
            ? `🛡️ **Ownership verification required for @${challengeRes.profile.roblox_username} (ID \`${challengeRes.profile.roblox_user_id}\`):** Paste the temporary code \`${challengeRes.verifyCode}\` in your Roblox profile **"About" (Description)**, save it, and click **✅ Verify Now** below.`
            : challengeRes.message;

        const panel = isConfigView
            ? await construirPanelConfigDiscord(interaction.user, verifyMsg, 'cat_accounts', interaction.client)
            : await construirPanelVinculacionCuenta(uid, verifyMsg);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_fastlink_verify_now' && interaction.isButton()) {
        await interaction.deferUpdate();
        const uid = interaction.user.id;
        const isConfigView = interaction.message?.components?.some(c => {
            try {
                const jsonStr = JSON.stringify(c.toJSON ? c.toJSON() : c);
                return jsonStr.includes('config_category_select') || jsonStr.includes('btn_config_refresh');
            } catch {
                return false;
            }
        });

        const verifyRes = await confirmarVerificacionCodigoRoblox(uid);
        const panel = isConfigView
            ? await construirPanelConfigDiscord(interaction.user, verifyRes.message, 'cat_accounts', interaction.client)
            : await construirPanelVinculacionCuenta(uid, verifyRes.message);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_fastlink_cancel_verify' && interaction.isButton()) {
        await interaction.deferUpdate();
        const uid = interaction.user.id;
        const isEn = obtenerIdiomaUsuario(uid) === 'en';
        cancelarVerificacionCodigoRoblox(uid);
        const cancelMsg = isEn
            ? '✖️ **Pending Roblox verification canceled.**'
            : '✖️ **Solicitud de verificación de Roblox cancelada.**';
        const isConfigView = interaction.message?.components?.some(c => {
            try {
                const jsonStr = JSON.stringify(c.toJSON ? c.toJSON() : c);
                return jsonStr.includes('config_category_select') || jsonStr.includes('btn_config_refresh');
            } catch {
                return false;
            }
        });
        const panel = isConfigView
            ? await construirPanelConfigDiscord(interaction.user, cancelMsg, 'cat_accounts', interaction.client)
            : await construirPanelVinculacionCuenta(uid, cancelMsg);
        return await interaction.editReply(panel);
    }

    if ((cid.startsWith('btn_discord_web_approve:') || cid.startsWith('btn_discord_web_block:')) && interaction.isButton()) {
        const parts = cid.split(':');
        const targetUid = parts[1] || '';
        const tokenDigits = parts[2] || '';
        if (targetUid && targetUid !== interaction.user.id) {
            return await interaction.reply({
                content: '🔒 Solo el titular de esta cuenta de Discord puede usar este control.',
                flags: MessageFlags.Ephemeral
            });
        }
        const action = cid.startsWith('btn_discord_web_block:') ? 'block' : 'approve';
        const resSec = await procesarAccionSeguridadDiscordWeb(interaction.user, action, tokenDigits);

        if (action === 'approve' && resSec.ok) {
            const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`btn_discord_web_approve:${interaction.user.id}:${resSec.rawDigits || tokenDigits}`)
                    .setLabel(`Autorizado en Web • Código: ${resSec.code || `KTX-${tokenDigits}`}`)
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`btn_discord_web_block:${interaction.user.id}`)
                    .setLabel('Revocar / Bloquear Solicitudes')
                    .setEmoji('🚫')
                    .setStyle(ButtonStyle.Secondary)
            );
            return await interaction.update({
                content: resSec.message,
                components: [updatedRow]
            });
        }

        return await interaction.update({
            content: resSec.message,
            components: []
        });
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
                ? `ℹ️ No active authorized Roblox account detected. Click **Link by @Username / ID** or **Web OAuth 2.0** above.`
                : `ℹ️ No se detectó una cuenta de Roblox activa. Tocá **Vincular por @Usuario / ID** o **OAuth 2.0 Web** arriba.`);
        const panel = await construirPanelVinculacionCuenta(interaction.user.id, msg);
        return await interaction.editReply(panel);
    }

    // 3B. Configuración de Usuario (/config — Categoría: Cuentas y Conexión)
    if (cid === 'btn_config_direct_discord' && interaction.isButton()) {
        await interaction.deferUpdate();
        const uid = interaction.user.id;
        const isEn = obtenerIdiomaUsuario(uid) === 'en';
        const savedCfg = await activarSesionDiscordDirecta(interaction.user);
        const newChallenge = generarCodigoVinculacionDiscord(uid, interaction.user, { forceNew: true });
        const msg = isEn
            ? `⚡ **Discord Account Active & Web Code Generated in \`/config\`:** Connected as **@${savedCfg?.discord_username || interaction.user.username}** (ID \`${uid}\`). Your code to link on the web is **\`${newChallenge?.code}\`** *(no DM spam)*.`
            : `⚡ **Cuenta de Discord Activa y Código Alojado en \`/config\`:** Conectada como **@${savedCfg?.discord_username || interaction.user.username}** (ID \`${uid}\`). Tu código para conectar tu ID en la web es **\`${newChallenge?.code}\`** *(sin enviar MDs)*.`;
        const panel = await construirPanelConfigDiscord(interaction.user, msg, 'cat_accounts', interaction.client);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_config_unlink_roblox' && interaction.isButton()) {
        await interaction.deferUpdate();
        const uid = interaction.user.id;
        const isEn = obtenerIdiomaUsuario(uid) === 'en';
        await eliminarCuentaVinculada(uid, 'roblox');
        const msg = isEn
            ? '🔌 **Roblox account unlinked:** You can link another Roblox account anytime by @Username / ID or Web OAuth.'
            : '🔌 **Cuenta de Roblox desvinculada:** Podés vincular otra cuenta cuando quieras por @Usuario / ID o desde el Portal Web.';
        const panel = await construirPanelConfigDiscord(interaction.user, msg, 'cat_accounts', interaction.client);
        return await interaction.editReply(panel);
    }

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

    if (cid.startsWith('btn_status_') || cid.startsWith('modal_status_') || cid.startsWith('select_status_')) {
        return await handleStatusInteraction(interaction);
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
