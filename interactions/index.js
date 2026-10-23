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
const {
    resolverUsuarioRoblox,
    guardarCuentaVinculada,
    obtenerCuentaVinculada,
    conectarCuentaBotRoblox,
    iniciarVerificacionCodigoRoblox,
    confirmarVerificacionCodigoRoblox,
    obtenerVerificacionPendienteRoblox,
    obtenerConfigDiscord,
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
        'btn_fastlink_manual_modal',
        'btn_fastlink_verify_code_modal',
        'btn_fastlink_check_roblox',
        'btn_fastlink_refresh',
        'btn_config_refresh',
        'btn_owner_*',
        'btn_econ_*',
        'btn_ava_*',
        'btn_games_*'
    ];
    const extraSelects = [
        'roblox_category_select',
        'help_category_select',
        'help_roblox_subcat_select',
        'config_category_select',
        'select_owner_mechanic',
        'select_econ_*',
        'select_ava_*',
        'select_games_*'
    ];
    const extraModales = [
        'modal_fastlink_submit',
        'modal_fastlink_code_submit',
        'modal_owner_bot_roblox_submit',
        'modal_econ_*',
        'modal_ava_*',
        'modal_games_*'
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

function construirModalCuentaRobloxDelBot() {
    const modal = new ModalBuilder()
        .setCustomId('modal_owner_bot_roblox_submit')
        .setTitle('🤖 Cuenta de Roblox del Bot');

    const inputCookie = new TextInputBuilder()
        .setCustomId('bot_roblox_cookie_input')
        .setLabel('Cookie .ROBLOSECURITY de la cuenta del Bot')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Pegá el valor de .ROBLOSECURITY de la cuenta de Roblox del bot (o escribí QUITAR)')
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(inputCookie));
    return modal;
}

async function procesarInteraccionInterna(interaction) {
    // Protección de paneles públicos: solo quien ejecutó el comando puede usar sus controles
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isChannelSelectMenu()) {
        const esBotonAlerta = interaction.customId.startsWith('btn_pause_item_') ||
                              interaction.customId.startsWith('btn_resume_item_');
        const ownerId = interaction.message?.interactionMetadata?.user?.id ||
                        interaction.message?.interaction?.user?.id;

        if (!esBotonAlerta && ownerId && ownerId !== interaction.user.id) {
            return await interaction.reply({
                content: `🔒 Este panel fue abierto por <@${ownerId}>. Ejecutá el comando por tu cuenta para usar tus propios controles.`,
                flags: MessageFlags.Ephemeral
            });
        }
    }

    const cid = interaction.customId || '';
    const ownerCfg = obtenerConfigPropietario();

    // 0A. Controles Exclusivos del Propietario en /config (Categoría: Configuración y Moderación del Bot)
    if (
        cid === 'select_owner_mechanic' ||
        cid.startsWith('btn_owner_') ||
        cid === 'modal_owner_bot_roblox_submit'
    ) {
        const esOwner = await esPropietarioDelBot(interaction.user.id, interaction.client);
        if (!esOwner) {
            return await interaction.reply({
                content: '🔒 Solo el propietario del bot puede utilizar los controles de Configuración y Moderación del Bot.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Si el propietario pulsó el botón o seleccionó configurar la Cuenta de Roblox del Bot, abrir el modal directamente
        if (
            cid === 'btn_owner_bot_roblox_modal' ||
            (cid === 'select_owner_mechanic' && interaction.isStringSelectMenu() && interaction.values[0] === 'owner_config_roblox_bot')
        ) {
            return await interaction.showModal(construirModalCuentaRobloxDelBot());
        }

        // Si el propietario envió el modal con la cookie .ROBLOSECURITY de la cuenta de Roblox del Bot
        if (cid === 'modal_owner_bot_roblox_submit' && interaction.isModalSubmit()) {
            const rawCookie = interaction.fields.getTextInputValue('bot_roblox_cookie_input').trim();
            await interaction.deferUpdate();
            const resBot = await conectarCuentaBotRoblox(rawCookie);
            const panel = await construirPanelConfigDiscord(
                interaction.user,
                resBot.message,
                'cat_owner_bot',
                interaction.client
            );
            return await interaction.editReply(panel);
        }

        await interaction.deferUpdate();
        let feedback = null;

        if (cid === 'btn_owner_optimize_ram') {
            const res = await ejecutarSecuenciaOptimizacionEnVivo(interaction);
            const detalleModulos = res.desglosePorSubsistema && res.desglosePorSubsistema.length > 0
                ? res.desglosePorSubsistema.map(d => `${d.label}: **${d.count}**`).join(' • ')
                : 'No había basura pendiente (todas las cachés ya estaban limpias)';
            feedback =
                `🧹 **Purga de Caché y Buffers completada (Filas 1 a 4):**\n` +
                `> • **Objetos temporales descartados:** **${res.entradasLiberadas}** (~${res.kbCachesLiberados || 0} KB en cachés${res.diffMB > 0 ? ` / **-${res.diffMB} MB** en RAM` : ''})\n` +
                `> • **Desglose:** ${detalleModulos}\n` +
                `> • **Cuentas y sesiones de usuarios:** 100% intactas y protegidas.`;
        } else if (cid === 'btn_owner_boot_diag') {
            const diag = ejecutarDiagnosticoArranqueYCalibracion();
            feedback =
                `🚀 **Diagnóstico de Arranque y Calibración completado:**\n` +
                `> • **Subsistemas verificados:** \`${diag.subsistemasActivos}\` activos y sincronizados\n` +
                `> • **Residuos vencidos barridos:** \`${diag.purgadosExpirados}\` eliminados\n` +
                `> • **Estado del Motor:** **${diag.estado.etiquetaModo}** (\`${diag.estado.rssMB} MB\` RSS).`;
        } else if (cid === 'btn_owner_cycle_engine') {
            const nuevoModo = siguienteModoMotor(ownerCfg.engineMode);
            guardarConfigPropietario({ engineMode: nuevoModo });
            feedback = `⚡ **Modo del Motor RAM/GPU actualizado a:** \`${nuevoModo.toUpperCase()}\`.`;
        } else if (cid === 'btn_owner_toggle_maintenance') {
            const nuevoEstado = !ownerCfg.maintenanceMode;
            guardarConfigPropietario({ maintenanceMode: nuevoEstado });
            feedback = nuevoEstado
                ? '🛠️ **Modo Mantenimiento ACTIVADO:** Solo vos (Propietario) podés ejecutar comandos y herramientas ahora.'
                : '🟢 **Modo Mantenimiento DESACTIVADO:** El bot volvió a estar abierto para todos los usuarios.';
        } else if (cid === 'btn_owner_refresh') {
            feedback = '🔄 **Métricas de memoria, subsistemas en caché y mecánicas actualizadas en vivo.**';
        } else if (cid === 'select_owner_mechanic' && interaction.isStringSelectMenu()) {
            const chosen = interaction.values[0];
            if (chosen === 'owner_cycle_engine') {
                const nuevoModo = siguienteModoMotor(ownerCfg.engineMode);
                guardarConfigPropietario({ engineMode: nuevoModo });
                feedback = `🎛️ **Modo del Motor cambiado a:** \`${nuevoModo.toUpperCase()}\`.`;
            } else if (chosen === 'owner_run_boot_diag') {
                const diag = ejecutarDiagnosticoArranqueYCalibracion();
                feedback = `🚀 **Calibración del sistema ejecutada:** \`${diag.subsistemasActivos}\` subsistemas verificados y \`${diag.purgadosExpirados}\` tokens vencidos barridos.`;
            } else if (chosen === 'owner_toggle_maintenance') {
                const nuevo = !ownerCfg.maintenanceMode;
                guardarConfigPropietario({ maintenanceMode: nuevo });
                feedback = nuevo
                    ? '🛠️ **Modo Mantenimiento Global ACTIVADO** (acceso exclusivo para el propietario).'
                    : '🟢 **Modo Mantenimiento Global DESACTIVADO** (acceso público restablecido).';
            } else if (chosen === 'owner_toggle_loading') {
                const nuevo = !ownerCfg.dynamicLoadingEnabled;
                guardarConfigPropietario({ dynamicLoadingEnabled: nuevo });
                feedback = `📋 **Sistema de Ejecución por Filas (1 a 4) + Terminal:** ${nuevo ? '🟢 Activado' : '🔴 Pausado'}.`;
            } else if (chosen === 'owner_toggle_monitors') {
                const nuevo = !ownerCfg.backgroundMonitorsEnabled;
                guardarConfigPropietario({ backgroundMonitorsEnabled: nuevo });
                feedback = `🔔 **Monitoreo de Alertas en 2do Plano:** ${nuevo ? '🟢 Activado' : '🔴 Pausado'}.`;
            } else if (chosen === 'owner_toggle_canvas3d') {
                const nuevo = !ownerCfg.heavyCanvas3DEnabled;
                guardarConfigPropietario({ heavyCanvas3DEnabled: nuevo });
                feedback = `🎨 **Motor Gráfico Canvas HD y Exportador 3D:** ${nuevo ? '🟢 Activado' : '🔴 Pausado'}.`;
            } else if (chosen === 'owner_toggle_apicache') {
                const nuevo = !ownerCfg.smartApiCacheEnabled;
                guardarConfigPropietario({ smartApiCacheEnabled: nuevo });
                feedback = `⚡ **Caché Rápida Anti-Rate-Limit (Roblox API):** ${nuevo ? '🟢 Activada' : '🔴 Pausada'}.`;
            } else if (chosen === 'owner_toggle_failover') {
                const nuevo = !ownerCfg.autoFailoverShieldEnabled;
                guardarConfigPropietario({ autoFailoverShieldEnabled: nuevo });
                feedback = `🛡️ **Escudo Failover Automático RoProxy:** ${nuevo ? '🟢 Activado' : '🔴 Pausado'}.`;
            }
        }

        const panel = await construirPanelConfigDiscord(interaction.user, feedback, 'cat_owner_bot', interaction.client);
        return await interaction.editReply(panel);
    }

    // 0B. Si el Modo Mantenimiento Global está activo y el usuario no es propietario (excepto en /config)
    const esAccionConfig = cid === 'config_category_select' || cid === 'btn_config_refresh';
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
        await interaction.deferUpdate();
        return await interaction.editReply(construirPanelHelp(selectedMain, 'sub_economy'));
    }

    if (cid === 'help_roblox_subcat_select' && interaction.isStringSelectMenu()) {
        const selectedSub = interaction.values[0];
        await interaction.deferUpdate();
        return await interaction.editReply(construirPanelHelp('cmd_roblox', selectedSub));
    }

    // 2B. Selector de categorías en /config (Cuentas y Conexión | Configuración y Moderación del Bot)
    if (cid === 'config_category_select' && interaction.isStringSelectMenu()) {
        const selectedCat = interaction.values[0];
        await interaction.deferUpdate();
        const panel = await construirPanelConfigDiscord(interaction.user, null, selectedCat, interaction.client);
        return await interaction.editReply(panel);
    }

    // 3A. Centro de Vinculación de Cuenta de ROBLOX (en /roblox)
    if (cid === 'btn_fastlink_modal' && interaction.isButton()) {
        await interaction.deferUpdate();
        const panel = await construirPanelVinculacionCuenta(interaction.user.id);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_fastlink_refresh' && interaction.isButton()) {
        await interaction.deferUpdate();
        const cuenta = await verificarAutorizacionRobloxOAuth(interaction.user.id).catch(() => null);
        const msg = cuenta && cuenta.roblox_user_id
            ? `✅ Estado comprobado: tu cuenta de Roblox activa es **@${cuenta.roblox_username}** (ID \`${cuenta.roblox_user_id}\`).`
            : `ℹ️ No se detectó una cuenta de Roblox autorizada activa. Podés autorizar con Roblox OAuth 2.0 o verificar en Roblox.`;
        const panel = await construirPanelVinculacionCuenta(interaction.user.id, msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_fastlink_manual_modal' && interaction.isButton()) {
        const modal = new ModalBuilder()
            .setCustomId('modal_fastlink_submit')
            .setTitle('📬 Enviar Código a tu Roblox');

        const inputUser = new TextInputBuilder()
            .setCustomId('fastlink_username_or_id')
            .setLabel('Usuario o ID de tu cuenta de Roblox')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Builderman o tu ID numérico de Roblox')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputUser));
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_fastlink_submit' && interaction.isModalSubmit()) {
        const rawInput = interaction.fields.getTextInputValue('fastlink_username_or_id').trim();
        await interaction.deferUpdate();

        const verifResult = await iniciarVerificacionCodigoRoblox(interaction.user.id, rawInput);
        if (!verifResult.ok) {
            const panelError = await construirPanelVinculacionCuenta(
                interaction.user.id,
                `⚠️ ${verifResult.message}`
            );
            return await interaction.editReply(panelError);
        }

        const panelPending = await construirPanelVinculacionCuenta(
            interaction.user.id,
            verifResult.message
        );
        return await interaction.editReply(panelPending);
    }

    if (cid === 'btn_fastlink_verify_code_modal' && interaction.isButton()) {
        const pending = obtenerVerificacionPendienteRoblox(interaction.user.id);
        const safeUser = pending?.profile?.roblox_username
            ? `@${pending.profile.roblox_username}`.slice(0, 18)
            : 'Roblox';

        const modal = new ModalBuilder()
            .setCustomId('modal_fastlink_code_submit')
            .setTitle(`🔑 Verificar en Roblox (${safeUser})`);

        const inputCode = new TextInputBuilder()
            .setCustomId('fastlink_security_code')
            .setLabel('Código de 6 dígitos recibido en Roblox')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Leelo en tu Galería de Mensajes de Roblox')
            .setMinLength(4)
            .setMaxLength(16)
            .setRequired(false);

        modal.addComponents(new ActionRowBuilder().addComponents(inputCode));
        return await interaction.showModal(modal);
    }

    if (cid === 'btn_fastlink_check_roblox' && interaction.isButton()) {
        await interaction.deferUpdate();
        const confirmRes = await confirmarVerificacionCodigoRoblox(interaction.user.id, '');
        const panel = await construirPanelVinculacionCuenta(
            interaction.user.id,
            confirmRes.message
        );
        return await interaction.editReply(panel);
    }

    if (cid === 'modal_fastlink_code_submit' && interaction.isModalSubmit()) {
        const rawCode = (interaction.fields.getTextInputValue('fastlink_security_code') || '').trim();
        await interaction.deferUpdate();

        const confirmRes = await confirmarVerificacionCodigoRoblox(interaction.user.id, rawCode);
        const panel = await construirPanelVinculacionCuenta(
            interaction.user.id,
            confirmRes.message
        );
        return await interaction.editReply(panel);
    }

    // 3B. Configuración de Usuario (/config — Categoría: Cuentas y Conexión)
    if (cid === 'btn_config_refresh' && interaction.isButton()) {
        await interaction.deferUpdate();
        const uid = interaction.user.id;
        const updatedCfg = await verificarAutorizacionDiscordOAuth(uid);
        const msg = updatedCfg.oauth_verified
            ? `✅ Conexión activa comprobada en Discord (**@${updatedCfg.discord_username || interaction.user.username}**).`
            : `ℹ️ No se detectó una conexión activa en Aplicaciones Autorizadas de Discord.`;
        const panel = await construirPanelConfigDiscord(interaction.user, msg, 'cat_accounts', interaction.client);
        return await interaction.editReply(panel);
    }

    // 3C. Verificación de Renderizados Pesados Pausados por el Propietario en /config
    const esAva = cid.startsWith('btn_ava_') || cid.startsWith('modal_ava_') || cid.startsWith('select_ava_');

    if (
        !ownerCfg.heavyCanvas3DEnabled &&
        (esAva || cid === 'btn_econ_floors' || cid === 'btn_econ_floors_refresh' || cid.startsWith('chart_'))
    ) {
        await interaction.deferUpdate();
        return await interaction.editReply(construirPanelAvisoModeracion({
            titulo: '🎨 Motor Gráfico Canvas / 3D en Modo Ahorro',
            descripcion: 'El propietario del bot pausó temporalmente la generación de renderizados pesados en Canvas HD y paquetes `.ZIP` 3D para reservar memoria RAM/GPU.'
        }));
    }

    // 3D. Verificación funcional inteligente de cuenta vinculada:
    const ACCIONES_REQUIEREN_ROBLOX = {
        'btn_ava_sandbox_load_worn': {
            nombre: '2.1 Cotizar Mi Ropa Actual (Probador en Vivo)',
            motivo: 'Para leer e importar las prendas que llevás equipadas actualmente en tu propio avatar, es necesario vincular tu **Cuenta de Roblox**.',
            backId: 'btn_ava_sandbox',
            backLabel: 'Volver al Probador'
        },
        'btn_ava_export3d_linked': {
            nombre: '2.4 Exportar Mi Avatar en 3D (.PNG + .ZIP)',
            motivo: 'Para exportar el modelo 3D y las texturas de tu propio personaje (en lugar de otro jugador o accesorio), necesitás tener vinculada tu **Cuenta de Roblox**.',
            backId: 'btn_ava_export3d',
            backLabel: 'Volver al Exportador 3D'
        },
        'btn_ava_colormatch_myavatar': {
            nombre: '2.5 Analizar Colores de Mi Avatar (Color-Match)',
            motivo: 'Para detectar automáticamente la paleta de colores de tu propio personaje, necesitás vincular primero tu **Cuenta de Roblox**.',
            backId: 'btn_ava_colormatch',
            backLabel: 'Volver a Color-Match'
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
            backLabel: 'Volver al Seguimiento'
        },
        'btn_nav_wishlist': {
            nombre: '1.1 Mi Lista Personal de Seguimiento',
            motivo: 'Para gestionar tu lista personal de hasta 5 objetos en seguimiento y recibir avisos de bajada de precio, iniciá sesión con tu **Cuenta de Discord**.',
            backId: 'btn_quick_sniper',
            backLabel: 'Volver al Seguimiento'
        },
        'btn_econ_pending_add_modal': {
            nombre: '1.4 Agenda y Alerta de Robux Pendientes',
            motivo: 'Para registrar tus cobros en retención y enviarte un mensaje directo automático cuando tus Robux se acrediten, es necesario conectar tu **Cuenta de Discord**.',
            backId: 'btn_econ_pending',
            backLabel: 'Volver a Robux Pendientes'
        },
        'select_games_codes_toggle': {
            nombre: '3.3 Checklist Personal de Códigos Canjeados',
            motivo: 'Podés consultar todos los códigos libremente sin registrarte, pero para guardar qué códigos ya canjeaste en tu perfil necesitás iniciar sesión con tu **Cuenta de Discord**.',
            backId: 'btn_games_codes',
            backLabel: 'Volver a la Bóveda de Códigos'
        },
        'btn_games_codes_add_modal': {
            nombre: '3.3 Registrar Código en la Bóveda',
            motivo: 'Para aportar y guardar nuevos códigos promocionales verificados en la bóveda, necesitás tener iniciada tu sesión de **Discord**.',
            backId: 'btn_games_codes',
            backLabel: 'Volver a la Bóveda de Códigos'
        },
        'btn_games_patch_add_modal': {
            nombre: '3.4 Suscripción a Avisos de Actualizaciones',
            motivo: 'Para suscribir tus juegos favoritos y enviarte avisos automáticos por Discord apenas salga un parche nuevo, es necesario conectar tu **Cuenta de Discord**.',
            backId: 'btn_games_patches',
            backLabel: 'Volver a Avisos de Parches'
        }
    };

    const requiereDiscordInfo = ACCIONES_REQUIEREN_DISCORD[cid] || (
        (cid.startsWith('btn_sniper_save_') || cid.startsWith('btn_ava_clones_watch:') || cid.startsWith('btn_games_passes_watch:'))
            ? {
                nombre: 'Guardar en Mi Lista de Seguimiento',
                motivo: 'Para guardar este artículo en tu lista de seguimiento y recibir alertas de precio en Discord, iniciá sesión con tu **Cuenta de Discord**.',
                backId: 'btn_nav_main_menu',
                backLabel: 'Volver a las Herramientas'
            }
            : null
    );

    if (requiereDiscordInfo) {
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

    // 4. Delegación a los 3 Módulos Multicategoría
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
