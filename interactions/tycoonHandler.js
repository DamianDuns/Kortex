// ==========================================
// ARCHIVO: interactions/tycoonHandler.js
// Sistema Interactivo Nativos Components V2 para /tycoon (100% Texto Estructurado, Sin Canvas)
// Diseño Moderno de 4 Categorías Simétricas en Español ('es') e Inglés ('en')
// ==========================================

const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');

const { COLORES, footer, separador } = require('../utils/ui');
const { obtenerIdiomaUsuario } = require('../src/utils/i18n');
const { obtenerCuentaVinculada } = require('../src/utils/fastLink');
const { obtenerConfigPropietario, construirPanelAvisoModeracion } = require('../src/utils/performanceManager');
const {
    STUDIO_PADS,
    getOrCreatePlayerState,
    collectPadTix,
    buyNextStudioPad,
    performRebirth,
    claimDailyStreak,
    getTycoonLeaderboard,
    buyNormalShopItem,
    buyCrystalShopItem,
    claimWeeklyQuestReward,
    equipUserItem,
    unlockUgcCreatorLicense,
    publishCustomUgcItem,
    buyCommunityUgcItem,
    openAscensionChest,
    claimLimitedUDrop,
    getActiveTrades,
    createTradeOffer,
    resolveTradeOffer,
    buyAndActivatePotion
} = require('../services/tycoonEngine');

/**
 * Construye una barra de progreso visual limpia en bloques Unicode.
 */
function buildVisualBar(current, max, slots = 10) {
    const safeMax = Math.max(1, Number(max || 1));
    const ratio = Math.max(0, Math.min(1, Number(current || 0) / safeMax));
    const filled = Math.round(ratio * slots);
    return '▰'.repeat(filled) + '▱'.repeat(Math.max(0, slots - filled));
}

/**
 * Normaliza la clave de categoría activa a una de las 4 secciones de /tycoon.
 */
function resolveActiveSection(sec) {
    if (sec === 'sec_ugc' || sec === 'sec_shop') return 'sec_shop';
    if (sec === 'sec_vault') return 'sec_vault';
    if (sec === 'sec_perks' || sec === 'sec_quests') return 'sec_perks';
    return 'sec_studio';
}

/**
 * Construye el selector desplegable de las 4 Categorías de /tycoon.
 */
function createCategoryMenu(activeSection = 'sec_studio', isEn = false) {
    const current = resolveActiveSection(activeSection);
    return new StringSelectMenuBuilder()
        .setCustomId('tycoon_section_select')
        .setPlaceholder(
            isEn
                ? '🏭 Navigate /tycoon categories (1 to 4)...'
                : '🏭 Navegá por las categorías de /tycoon (1 a 4)...'
        )
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? '1. My Studio & Production' : '1. Mi Estudio y Producción')
                .setDescription(
                    isEn
                        ? 'Collector Vault, 6 Studio Stations, Daily Streak & Rebirth'
                        : 'Bóveda Colectora, las 6 Estaciones del Estudio, Racha Diaria y Rebirth'
                )
                .setValue('sec_studio')
                .setEmoji('🏗️')
                .setDefault(current === 'sec_studio'),
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? '2. My Profile & Inventory' : '2. Mi Perfil e Inventario')
                .setDescription(
                    isEn
                        ? 'General Tycoon Statistics, Your Owned Items & UGC Creation'
                        : 'Estadísticas Generales del Tycoon, Tus Objetos Adquiridos y Taller UGC'
                )
                .setValue('sec_shop')
                .setEmoji('👤')
                .setDefault(current === 'sec_shop'),
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? '3. Unified Shop, Chests & P2P Trades' : '3. Tienda, Cofres e Intercambios')
                .setDescription(
                    isEn
                        ? 'Buy Classic Items, Limiteds & Crystal Artifacts, Unbox Chests & Trade P2P'
                        : 'Tienda Unificada (Clásicos, Limiteds y Cristales), Cofres e Intercambios P2P'
                )
                .setValue('sec_vault')
                .setEmoji('🛒')
                .setDefault(current === 'sec_vault'),
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? '4. Weekly Quests, Lab & Leaderboard' : '4. Misiones, Laboratorio y Ranking')
                .setDescription(
                    isEn
                        ? 'Earn Kortex Crystals in Weekly Quests, Lab Potions & Top Studios'
                        : 'Ganá Cristales Kortex en Misiones Semanales, Pociones y Ranking Top'
                )
                .setValue('sec_perks')
                .setEmoji('🏆')
                .setDefault(current === 'sec_perks')
        ]);
}

/**
 * Construye el panel completo de /tycoon en formato nativo Discord Components V2 (100% texto estructurado, sin imágenes).
 */
async function construirPanelTycoon(user, activeSection = 'sec_studio', feedbackMsg = null, member = null) {
    const userId = String(user.id);
    const lang = obtenerIdiomaUsuario(userId);
    const isEn = lang === 'en';
    const sectionKey = resolveActiveSection(activeSection);

    const ownerCfg = obtenerConfigPropietario();
    if (ownerCfg.tycoonEnabled === false) {
        return construirPanelAvisoModeracion({
            titulo: isEn ? '⏸️ /tycoon Temporarily Paused' : '⏸️ /tycoon Pausado Temporalmente',
            descripcion: isEn
                ? 'The **/tycoon** module is temporarily paused. Please try again in a few minutes.'
                : 'El módulo **/tycoon** se encuentra pausado temporalmente. Intentá nuevamente en unos minutos.',
            includeBackButton: false
        });
    }

    const [state, linkedRoblox] = await Promise.all([
        getOrCreatePlayerState(userId, member),
        obtenerCuentaVinculada(userId).catch(() => null)
    ]);

    const { profile, inventory, equippedItem, metrics, weeklyQuests, dailyStreak, catalogMap } = state;
    const displayUsername = linkedRoblox?.roblox_username || user.username || 'Player';
    const discordAvatarUrl = typeof user.displayAvatarURL === 'function'
        ? user.displayAvatarURL({ extension: 'png', size: 256 })
        : null;
    const thumbUrl = linkedRoblox?.avatar_url || linkedRoblox?.avatar_full_url || discordAvatarUrl || null;

    if (linkedRoblox?.roblox_user_id && !profile.roblox_user_id) {
        profile.roblox_user_id = linkedRoblox.roblox_user_id;
    }

    const sectionColors = {
        sec_studio: 0x22C55E,
        sec_shop: 0x38BDF8,
        sec_vault: 0xF59E0B,
        sec_perks: 0xA855F7
    };

    const sectionTitlesEs = {
        sec_studio: '🏗️ Categoría 1 • Mi Estudio y Producción',
        sec_shop: '👤 Categoría 2 • Mi Perfil e Inventario',
        sec_vault: '🛒 Categoría 3 • Tienda, Cofres e Intercambios',
        sec_perks: '🏆 Categoría 4 • Misiones, Laboratorio y Ranking'
    };

    const sectionTitlesEn = {
        sec_studio: '🏗️ Category 1 • My Studio & Production',
        sec_shop: '👤 Category 2 • My Profile & Inventory',
        sec_vault: '🛒 Category 3 • Shop, Chests & P2P Trades',
        sec_perks: '🏆 Category 4 • Quests, Lab & Leaderboard'
    };

    const container = new ContainerBuilder().setAccentColor(sectionColors[sectionKey] || COLORES.primario);

    const headerLines = [
        `# 🏭 Kortex Tycoon — @${displayUsername}`,
        `**${isEn ? sectionTitlesEn[sectionKey] : sectionTitlesEs[sectionKey]}**`
    ];
    if (feedbackMsg) {
        headerLines.push(`\n> ${feedbackMsg}`);
    }

    const headerText = new TextDisplayBuilder().setContent(headerLines.join('\n'));
    if (thumbUrl && /^https?:\/\//i.test(String(thumbUrl))) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(headerText)
                .setThumbnailAccessory(thumb => thumb.setURL(String(thumbUrl)))
        );
    } else {
        container.addTextDisplayComponents(headerText);
    }

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(createCategoryMenu(sectionKey, isEn))
    );
    container.addSeparatorComponents(separador(true));

    const eqLabel = equippedItem
        ? `${equippedItem.icon_emoji || '🎩'} **${isEn ? (equippedItem.name_en || equippedItem.name) : equippedItem.name}** (\`+${equippedItem.boost_pct}% Tix/min\`)`
        : (isEn ? '`None`' : '`Ninguno`');

    // =========================================================================
    // CATEGORÍA 1: MI ESTUDIO Y PRODUCCIÓN
    // =========================================================================
    if (sectionKey === 'sec_studio') {
        const unlockedSet = new Set(metrics.unlockedPads);
        const builtCount = STUDIO_PADS.filter(p => unlockedSet.has(p.id)).length;
        const nextPad = metrics.nextPad;

        const collectorNow = Number(profile.collector_tix || 0);
        const collectorCap = Math.max(1, Number(profile.collector_cap || 500));
        const collectorPct = Math.min(100, Math.round((collectorNow / collectorCap) * 100));
        const collectorBar = buildVisualBar(collectorNow, collectorCap, 10);

        const vaultAndProdBlock = isEn
            ? `### 🟢 Collector Vault & Live Production\n` +
              `• ⚡ **Production Speed:** \`+${metrics.effectiveTixPerMin} Tix/min\` • **Multiplier:** \`x${metrics.multiplier}\`\n` +
              `• 🟢 **Stored in Collector:** \`${collectorNow.toLocaleString()} / ${collectorCap.toLocaleString()} Tix\` (\`${collectorPct}%\`)\n` +
              `• 📊 **Vault Capacity:** \`[${collectorBar}]\` • 🎟️ **Wallet:** \`${Number(profile.tix_balance || 0).toLocaleString()} Tix\``
            : `### 🟢 Bóveda Colectora y Producción en Vivo\n` +
              `• ⚡ **Ritmo de Producción:** \`+${metrics.effectiveTixPerMin} Tix/min\` • **Multiplicador:** \`x${metrics.multiplier}\`\n` +
              `• 🟢 **Acumulado en Colector:** \`${collectorNow.toLocaleString()} / ${collectorCap.toLocaleString()} Tix\` (\`${collectorPct}%\`)\n` +
              `• 📊 **Nivel de Llenado:** \`[${collectorBar}]\` • 🎟️ **Billetera:** \`${Number(profile.tix_balance || 0).toLocaleString()} Tix\``;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(vaultAndProdBlock));
        container.addSeparatorComponents(separador());

        const stationsLines = STUDIO_PADS.map(pad => {
            const isBuilt = unlockedSet.has(pad.id);
            const isNext = nextPad && nextPad.id === pad.id;
            const pName = isEn ? pad.name_en : pad.name_es;
            if (isBuilt) {
                return isEn
                    ? `🟢 **Stage ${pad.stage}:** ${pad.emoji} **${pName}** — \`Active (+${pad.tixPerMin} Tix/min)\``
                    : `🟢 **Nivel ${pad.stage}:** ${pad.emoji} **${pName}** — \`Operativa (+${pad.tixPerMin} Tix/min)\``;
            }
            if (isNext) {
                return isEn
                    ? `🟡 **Stage ${pad.stage}:** ${pad.emoji} **${pName}** — \`Next Upgrade: ${pad.cost.toLocaleString()} Tix (+${pad.tixPerMin} Tix/min)\``
                    : `🟡 **Nivel ${pad.stage}:** ${pad.emoji} **${pName}** — \`Siguiente Mejora: ${pad.cost.toLocaleString()} Tix (+${pad.tixPerMin} Tix/min)\``;
            }
            return isEn
                ? `🔒 **Stage ${pad.stage}:** ${pad.emoji} *${pName}* — \`${pad.cost.toLocaleString()} Tix (+${pad.tixPerMin} Tix/min)\``
                : `🔒 **Nivel ${pad.stage}:** ${pad.emoji} *${pName}* — \`${pad.cost.toLocaleString()} Tix (+${pad.tixPerMin} Tix/min)\``;
        }).join('\n');

        const ds = dailyStreak || { currentStreak: 0, nextStreakDay: 1, canClaim: true, rewardTix: 350, rewardCrystals: 5, hoursLeft: 0, minsLeft: 0 };
        const streakStatus = ds.canClaim
            ? (isEn
                ? `🔥 **Daily Streak (Day ${ds.nextStreakDay}/7):** 🟢 **Ready to Claim!** (\`+${ds.rewardTix} Tix\` & \`+${ds.rewardCrystals} 💠\`)`
                : `🔥 **Racha Diaria (Día ${ds.nextStreakDay}/7):** 🟢 **¡Lista para reclamar!** (\`+${ds.rewardTix} Tix\` y \`+${ds.rewardCrystals} 💠\`)`)
            : (isEn
                ? `🔥 **Daily Streak (Day ${ds.currentStreak}/7):** Next reward in \`${ds.hoursLeft}h ${ds.minsLeft}m\``
                : `🔥 **Racha Diaria (Día ${ds.currentStreak}/7):** Próxima recompensa en \`${ds.hoursLeft}h ${ds.minsLeft}m\``);

        const rebirthStatus = metrics.allPadsUnlocked
            ? (isEn
                ? `✨ **Rebirth Ready:** All 6 stations are active! Ascend now for **+35% permanent speed** & **+1 Chest Key**.`
                : `✨ **Rebirth Disponible:** ¡Completaste las 6 estaciones! Ascendé para ganar **+35% permanente** y **+1 Llave de Cofre**.`)
            : (isEn
                ? `✨ **Rebirth Progress:** \`${builtCount}/6\` stations built (Current Rebirths: \`x${profile.rebirth_count || 0}\`)`
                : `✨ **Progreso hacia Rebirth:** \`${builtCount}/6\` estaciones construidas (Rebirths actuales: \`x${profile.rebirth_count || 0}\`)`);

        const blueprintBlock = isEn
            ? `### 🏗️ Studio Assembly Line (\`${builtCount}/6\` Built)\n${stationsLines}\n\n• ${streakStatus}\n• ${rebirthStatus}`
            : `### 🏗️ Estaciones de tu Estudio (\`${builtCount}/6\` Construidas)\n${stationsLines}\n\n• ${streakStatus}\n• ${rebirthStatus}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(blueprintBlock));
        container.addSeparatorComponents(separador());

        const btnCollect = new ButtonBuilder()
            .setCustomId('tycoon_collect_pad')
            .setLabel(
                isEn
                    ? `Collect (${collectorNow.toLocaleString()} Tix)`
                    : `Recolectar (${collectorNow.toLocaleString()} Tix)`
            )
            .setEmoji('🟢')
            .setStyle(ButtonStyle.Success);

        const btnBuyPad = new ButtonBuilder()
            .setCustomId('tycoon_buy_next_pad')
            .setLabel(
                nextPad
                    ? (isEn
                        ? `Build: ${nextPad.name_en} (${nextPad.cost.toLocaleString()} Tix)`
                        : `Construir: ${nextPad.name_es} (${nextPad.cost.toLocaleString()} Tix)`)
                    : (isEn ? '6/6 Stations Built' : '6/6 Estaciones Listas')
            )
            .setEmoji('🟡')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!nextPad);

        const btnDaily = new ButtonBuilder()
            .setCustomId('tycoon_claim_daily')
            .setLabel(
                ds.canClaim
                    ? (isEn ? `Daily Day ${ds.nextStreakDay} (+${ds.rewardCrystals} 💠)` : `Racha Día ${ds.nextStreakDay} (+${ds.rewardCrystals} 💠)`)
                    : (isEn ? `Streak (${ds.hoursLeft}h)` : `Racha (${ds.hoursLeft}h)`)
            )
            .setEmoji('🔥')
            .setStyle(ds.canClaim ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!ds.canClaim);

        const btnRebirth = new ButtonBuilder()
            .setCustomId('tycoon_rebirth')
            .setLabel(isEn ? 'Rebirth (+35% & Key)' : 'Rebirth (+35% y Llave)')
            .setEmoji('✨')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!metrics.allPadsUnlocked);

        const btnRefresh = new ButtonBuilder()
            .setCustomId('tycoon_refresh:sec_studio')
            .setLabel(isEn ? 'Refresh' : 'Actualizar')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary);

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(btnCollect, btnBuyPad, btnDaily, btnRebirth, btnRefresh)
        );
    }

    // =========================================================================
    // CATEGORÍA 2: MI PERFIL E INVENTARIO
    // =========================================================================
    else if (sectionKey === 'sec_shop') {
        const allCatalog = [...catalogMap.values()];
        const myUgcs = allCatalog.filter(it => it.category === 'UGC' && String(it.creator_id) === userId);
        const myLimiteds = inventory.filter(
            i => i.catalog && (i.catalog.category === 'LIMITED' || i.catalog.category === 'LIMITED_U')
        );
        const isVipActive = Boolean(profile.vip_nitro_boost || profile.vip_yt_sub);
        const hasLicense = Boolean(profile.ugc_license_unlocked || isVipActive);

        const rebirthBonusPct = Number(profile.rebirth_count || 0) * 35;
        const vipStatusText = isVipActive
            ? (isEn ? '🟢 **VIP Active** (`+50% Tix/min` & UGC License)' : '🟢 **VIP Activo** (`+50% Tix/min` y Licencia UGC)')
            : (isEn ? '⚪ Standard Account' : '⚪ Cuenta Estándar');

        const statsBlock = isEn
            ? `### 📊 General Tycoon Statistics\n` +
              `**💰 Wallet & Resources:**\n` +
              `• 🎟️ **Tix Balance:** \`${Number(profile.tix_balance || 0).toLocaleString()} Tix\`\n` +
              `• 💠 **Kortex Crystals:** \`${Number(profile.crystal_balance ?? 15).toLocaleString()} Crystals\`\n` +
              `• 🗝️ **Ascension Chest Keys:** \`${Number(profile.ascension_tokens || 0)} Key(s)\`\n\n` +
              `**⚙️ Studio Performance & Progression:**\n` +
              `• 🏗️ **Studio Stage:** \`Stage ${profile.studio_stage || 1}/6\` (\`[${buildVisualBar(profile.studio_stage || 1, 6, 6)}]\`)\n` +
              `• ✨ **Rebirths Completed:** \`x${profile.rebirth_count || 0}\` (\`+${rebirthBonusPct}% permanent bonus\`)\n` +
              `• ⚡ **Total Production:** \`+${metrics.effectiveTixPerMin} Tix/min\` (\`x${metrics.multiplier} multiplier\`)\n` +
              `• 💎 **Account Status:** ${vipStatusText}`
            : `### 📊 Estadísticas Generales del Tycoon\n` +
              `**💰 Billetera y Recursos:**\n` +
              `• 🎟️ **Saldo de Tix:** \`${Number(profile.tix_balance || 0).toLocaleString()} Tix\`\n` +
              `• 💠 **Cristales Kortex:** \`${Number(profile.crystal_balance ?? 15).toLocaleString()} Cristales\`\n` +
              `• 🗝️ **Llaves de Cofre de Ascensión:** \`${Number(profile.ascension_tokens || 0)} Llave(s)\`\n\n` +
              `**⚙️ Rendimiento y Progreso del Estudio:**\n` +
              `• 🏗️ **Nivel del Estudio:** \`Nivel ${profile.studio_stage || 1}/6\` (\`[${buildVisualBar(profile.studio_stage || 1, 6, 6)}]\`)\n` +
              `• ✨ **Ascensiones (Rebirths):** \`x${profile.rebirth_count || 0}\` (\`+${rebirthBonusPct}% bono permanente\`)\n` +
              `• ⚡ **Producción Total:** \`+${metrics.effectiveTixPerMin} Tix/min\` (\`Multiplicador x${metrics.multiplier}\`)\n` +
              `• 💎 **Estado de Cuenta:** ${vipStatusText}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statsBlock));
        container.addSeparatorComponents(separador());

        const uniqueOwnedItems = [];
        const seenItemIds = new Set();
        for (const inv of inventory) {
            if (!seenItemIds.has(String(inv.item_id)) && inv.catalog) {
                seenItemIds.add(String(inv.item_id));
                uniqueOwnedItems.push(inv);
            }
        }

        const ownedLines = uniqueOwnedItems.length > 0
            ? uniqueOwnedItems.slice(0, 10).map(inv => {
                const c = inv.catalog;
                const cName = isEn ? (c.name_en || c.name) : c.name;
                const isEq = String(profile.equipped_item_id) === String(c.item_id);
                const serialTag = c.category === 'LIMITED_U' && inv.serial_number
                    ? ` **[#${String(inv.serial_number).padStart(2, '0')}/${c.max_supply || 15}]**`
                    : '';
                const eqTag = isEq ? (isEn ? ' • 🟢 **[EQUIPPED]**' : ' • 🟢 **[EQUIPADO]**') : '';
                return `• ${c.icon_emoji || '🎩'} **${cName}**${serialTag} — \`+${c.boost_pct}% Tix/min\`${eqTag}`;
            }).join('\n')
            : (isEn
                ? `> 📭 You don't have any items in your inventory yet. Visit **Category 3: Shop, Chests & Trades** to get items and Limiteds!`
                : `> 📭 Todavía no tenés objetos en tu inventario. ¡Visitá la **Categoría 3: Tienda, Cofres e Intercambios** para adquirir ítems y Limiteds!`);

        const ugcPublishedLines = myUgcs.length > 0
            ? '\n\n' + (isEn ? '**🎨 Your Published UGC Designs:**\n' : '**🎨 Tus Diseños UGC Publicados:**\n') +
              myUgcs.map(u => `• ${u.icon_emoji || '🎨'} **${u.name}** — Precio: \`${Number(u.base_price).toLocaleString()} Tix\` (\`+10% Tix/min\`)`).join('\n')
            : '';

        const ugcLicenseLine = hasLicense
            ? (isEn
                ? `🟢 **Creator License Active** (\`${myUgcs.length}/2\` custom UGC items published • Earn 70% royalties per sale)`
                : `🟢 **Licencia de Creador Activa** (\`${myUgcs.length}/2\` objetos UGC publicados • Ganás 70% de regalías por venta)`)
            : (isEn
                ? `🔒 **Locked** (Requires Studio Stage 6 + \`1,200 Tix\`, or VIP status)`
                : `🔒 **Bloqueada** (Requiere Estudio Nivel 6 + \`1,200 Tix\`, o estado VIP)`);

        const inventoryBlock = isEn
            ? `### 🎒 My Inventory (\`${inventory.length}\` Total • \`${myLimiteds.length}\` Limiteds)\n` +
              `• 🎩 **Currently Equipped:** ${eqLabel}\n` +
              `• 🎨 **UGC Creator Workshop:** ${ugcLicenseLine}\n\n` +
              `${ownedLines}${ugcPublishedLines}`
            : `### 🎒 Mi Inventario de Objetos (\`${inventory.length}\` en Total • \`${myLimiteds.length}\` Limiteds)\n` +
              `• 🎩 **Objeto Equipado:** ${eqLabel}\n` +
              `• 🎨 **Taller de Creación UGC:** ${ugcLicenseLine}\n\n` +
              `${ownedLines}${ugcPublishedLines}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(inventoryBlock));

        if (uniqueOwnedItems.length > 0) {
            const selectEquip = new StringSelectMenuBuilder()
                .setCustomId('tycoon_equip_item_select')
                .setPlaceholder(
                    isEn
                        ? '🎩 Select an item from your inventory to equip...'
                        : '🎩 Seleccioná un objeto de tu inventario para equipar...'
                )
                .addOptions(
                    uniqueOwnedItems.slice(0, 25).map(inv => {
                        const c = inv.catalog;
                        const cName = isEn ? (c.name_en || c.name) : c.name;
                        const isEq = String(profile.equipped_item_id) === String(c.item_id);
                        return new StringSelectMenuOptionBuilder()
                            .setLabel(`${cName.slice(0, 75)} (+${c.boost_pct}% Tix/min)`)
                            .setDescription(
                                isEn
                                    ? `${isEq ? '🟢 Currently Equipped' : 'Click to equip on your avatar'}`
                                    : `${isEq ? '🟢 Equipado actualmente' : 'Tocar para equipar en tu avatar'}`
                            )
                            .setValue(String(c.item_id))
                            .setEmoji(c.icon_emoji || '🎩')
                            .setDefault(isEq);
                    })
                );
            container.addActionRowComponents(new ActionRowBuilder().addComponents(selectEquip));
        }

        container.addSeparatorComponents(separador());

        const profileBtns = [];
        if (!hasLicense) {
            profileBtns.push(
                new ButtonBuilder()
                    .setCustomId('tycoon_unlock_ugc_license')
                    .setLabel(isEn ? 'Unlock UGC License (1,200 Tix)' : 'Desbloquear Licencia UGC (1,200 Tix)')
                    .setEmoji('🔓')
                    .setStyle(ButtonStyle.Success)
            );
        }
        profileBtns.push(
            new ButtonBuilder()
                .setCustomId('tycoon_open_ugc_modal')
                .setLabel(
                    isEn
                        ? `Create Custom UGC (${myUgcs.length}/2)`
                        : `Diseñar Objeto UGC (${myUgcs.length}/2)`
                )
                .setEmoji('🎨')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!hasLicense || myUgcs.length >= 2),
            new ButtonBuilder()
                .setCustomId('tycoon_refresh:sec_shop')
                .setLabel(isEn ? 'Refresh Profile' : 'Actualizar Perfil')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary)
        );

        container.addActionRowComponents(new ActionRowBuilder().addComponents(profileBtns));
    }

    // =========================================================================
    // CATEGORÍA 3: TIENDA UNIFICADA, COFRES DE ASCENSIÓN E INTERCAMBIOS P2P
    // =========================================================================
    else if (sectionKey === 'sec_vault') {
        const trRes = await getActiveTrades(userId);
        const activeTrades = trRes.trades || [];

        const allCatalog = [...catalogMap.values()];
        const ownedIds = new Set(inventory.map(i => String(i.item_id)));
        const myLimiteds = inventory.filter(
            i => i.catalog && (i.catalog.category === 'LIMITED' || i.catalog.category === 'LIMITED_U')
        );

        const allShopItems = allCatalog.filter(it => it.category === 'NORMAL' && Number(it.base_price) > 0);
        const normalTixItems = allShopItems.filter(
            it => it.currency_type !== 'CRYSTAL' && !String(it.item_id).startsWith('crys_')
        );
        const crystalShopItems = allShopItems.filter(
            it => it.currency_type === 'CRYSTAL' || String(it.item_id).startsWith('crys_')
        );
        const limitedUDrops = allCatalog.filter(it => it.category === 'LIMITED_U');
        const ugcItems = allCatalog
            .filter(it => it.category === 'UGC')
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const tixCatalogLines = [
            ...normalTixItems.map(it => {
                const iName = isEn ? (it.name_en || it.name) : it.name;
                const status = ownedIds.has(String(it.item_id))
                    ? (isEn ? '✅ Owned' : '✅ Adquirido')
                    : `\`${Number(it.base_price).toLocaleString()} Tix\``;
                return `• ${it.icon_emoji || '🛒'} **${iName}** (\`+${it.boost_pct}% Tix/min\`) — ${status}`;
            }),
            ...limitedUDrops.map(d => {
                const dName = isEn ? (d.name_en || d.name) : d.name;
                const rem = Math.max(0, Number(d.max_supply || 15) - Number(d.minted_count || 0));
                const stockTxt = rem > 0
                    ? `\`${Number(d.base_price).toLocaleString()} Tix\` (\`${rem}/${d.max_supply}\` disp.)`
                    : (isEn ? '🔴 Sold Out' : '🔴 Agotado');
                return `• ${d.icon_emoji || '👑'} **[LIMITED U] ${dName}** (\`+${d.boost_pct}% Tix/min\`) — ${stockTxt}`;
            })
        ].join('\n');

        const crystalCatalogLines = crystalShopItems.map(it => {
            const iName = isEn ? (it.name_en || it.name) : it.name;
            const status = ownedIds.has(String(it.item_id))
                ? (isEn ? '✅ Owned' : '✅ Adquirido')
                : `\`${Number(it.base_price).toLocaleString()} 💠\``;
            return `• ${it.icon_emoji || '💠'} **${iName}** (\`+${it.boost_pct}% Tix/min\`) — ${status}`;
        }).join('\n');

        const shopBlock = isEn
            ? `### 🛍️ Unified Item & Limited Shop\n` +
              `• **Your Balance:** 🎟️ \`${Number(profile.tix_balance || 0).toLocaleString()} Tix\` • 💠 \`${Number(profile.crystal_balance ?? 15).toLocaleString()} Crystals\` • 🗝️ \`${Number(profile.ascension_tokens || 0)} Key(s)\`\n\n` +
              `**🎟️ Classic Gear & Serialized Limited U (Tix):**\n${tixCatalogLines}\n\n` +
              `**💠 Kortex Crystal Artifacts:**\n${crystalCatalogLines}`
            : `### 🛍️ Catálogo de la Tienda Unificada\n` +
              `• **Tu Saldo:** 🎟️ \`${Number(profile.tix_balance || 0).toLocaleString()} Tix\` • 💠 \`${Number(profile.crystal_balance ?? 15).toLocaleString()} Cristales\` • 🗝️ \`${Number(profile.ascension_tokens || 0)} Llave(s)\`\n\n` +
              `**🎟️ Ítems Clásicos y Limited U Numerados (Tix):**\n${tixCatalogLines}\n\n` +
              `**💠 Artefactos de Cristales Kortex:**\n${crystalCatalogLines}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(shopBlock));
        container.addSeparatorComponents(separador());

        const tradesLines = activeTrades.length > 0
            ? activeTrades.slice(0, 4).map(tr => {
                const sItems = (tr.sender_items || []).map(si => {
                    const sTag = si.serial_number ? ` #${String(si.serial_number).padStart(2, '0')}` : '';
                    return `${si.icon_emoji || '👑'} ${si.name}${sTag}`;
                }).join(' + ');
                const tixOff = Number(tr.tix_offered || 0) > 0 ? ` + \`${Number(tr.tix_offered).toLocaleString()} Tix\`` : '';
                const reqCat = tr.requested_item_id ? catalogMap.get(String(tr.requested_item_id)) : null;
                const reqParts = [];
                if (reqCat) reqParts.push(`${reqCat.icon_emoji} ${isEn ? (reqCat.name_en || reqCat.name) : reqCat.name}`);
                if (Number(tr.tix_requested || 0) > 0) reqParts.push(`\`${Number(tr.tix_requested).toLocaleString()} Tix\``);
                const reqText = reqParts.length > 0 ? reqParts.join(' + ') : (isEn ? 'Open Offer' : 'Oferta Abierta');
                const scopeBadge = tr.receiver_id === 'PUBLIC' ? '🌐' : `🎯 <@${tr.receiver_id}>`;
                return `• \`${tr.trade_id}\` ${scopeBadge} **${tr.sender_name}:** **${sItems}**${tixOff} ⇄ **${reqText}**`;
            }).join('\n')
            : (isEn
                ? '> *No active P2P trade offers right now. Use the buttons below to post or send a trade!*'
                : '> *No hay ofertas de intercambio P2P activas en este momento. ¡Usá los botones de abajo para publicar o enviar un trade!*');

        const chestAndTradesBlock = isEn
            ? `### 🗝️ Ascension Chests & P2P Trading\n` +
              `• **Ascension Chest:** Costs \`1 Rebirth Key\` or \`3,500 Tix\` — Grants **1 Guaranteed Limited Item** (\`+16%\` to \`+30% Tix/min\`; duplicates award \`+1,200 Tix\`).\n\n` +
              `**🤝 Active P2P Trade Board (\`${activeTrades.length}\`):**\n${tradesLines}`
            : `### 🗝️ Cofres de Ascensión e Intercambios P2P\n` +
              `• **Cofre de Ascensión:** Cuesta \`1 Llave de Rebirth\` o \`3,500 Tix\` — Otorga **1 Objeto Limited Garantizado** (\`+16%\` a \`+30% Tix/min\`; duplicados dan \`+1,200 Tix\`).\n\n` +
              `**🤝 Tablero de Intercambios P2P Activos (\`${activeTrades.length}\`):**\n${tradesLines}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(chestAndTradesBlock));

        // 1. Selector de Tienda Unificada en Tix (Ítems Clásicos + Limiteds Numerados + UGCs de la Comunidad)
        const buyableNormals = normalTixItems.filter(it => !ownedIds.has(String(it.item_id)));
        const availableDrops = limitedUDrops.filter(d => Number(d.minted_count || 0) < Number(d.max_supply || 15));
        const buyableUgcs = ugcItems.filter(
            it => String(it.creator_id) !== userId && !ownedIds.has(String(it.item_id))
        );

        const unifiedTixOptions = [];
        for (const it of buyableNormals) {
            const iName = isEn ? (it.name_en || it.name) : it.name;
            unifiedTixOptions.push(
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${iName} — ${Number(it.base_price).toLocaleString()} Tix`)
                    .setDescription(
                        isEn
                            ? `Classic Shop • Grants +${it.boost_pct}% Tix/min passive speed`
                            : `Tienda Clásica • Otorga +${it.boost_pct}% Tix/min de velocidad pasiva`
                    )
                    .setValue(String(it.item_id))
                    .setEmoji(it.icon_emoji || '🛒')
            );
        }

        for (const d of availableDrops) {
            const dName = isEn ? (d.name_en || d.name) : d.name;
            const nextSerial = Number(d.minted_count || 0) + 1;
            unifiedTixOptions.push(
                new StringSelectMenuOptionBuilder()
                    .setLabel(`[LIMITED] ${dName} (#${String(nextSerial).padStart(2, '0')}/${d.max_supply}) — ${Number(d.base_price).toLocaleString()} Tix`)
                    .setDescription(
                        isEn
                            ? `Serialized Limited U • +${d.boost_pct}% Tix/min`
                            : `Limited U Numerado en Tienda • +${d.boost_pct}% Tix/min`
                    )
                    .setValue(String(d.item_id))
                    .setEmoji(d.icon_emoji || '👑')
            );
        }

        for (const u of buyableUgcs) {
            if (unifiedTixOptions.length < 25) {
                unifiedTixOptions.push(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${u.name.slice(0, 60)} — ${Number(u.base_price).toLocaleString()} Tix`)
                        .setDescription(
                            isEn
                                ? `Community UGC by ${u.creator_name} • +10% Tix/min`
                                : `UGC de Comunidad por ${u.creator_name} • +10% Tix/min`
                        )
                        .setValue(String(u.item_id))
                        .setEmoji(u.icon_emoji || '🎨')
                );
            }
        }

        if (unifiedTixOptions.length > 0) {
            const selectBuyNormal = new StringSelectMenuBuilder()
                .setCustomId('tycoon_buy_normal_select')
                .setPlaceholder(
                    isEn
                        ? '🛒 Tix Shop: Buy Classic Items, Limiteds & Community UGCs...'
                        : '🛒 Tienda en Tix: Comprar Ítems Clásicos, Limiteds y UGCs...'
                )
                .addOptions(unifiedTixOptions.slice(0, 25));
            container.addActionRowComponents(new ActionRowBuilder().addComponents(selectBuyNormal));
        }

        // 2. Selector de Tienda de Artefactos de Cristales Kortex (💠)
        const buyableCrystals = crystalShopItems.filter(it => !ownedIds.has(String(it.item_id)));
        if (buyableCrystals.length > 0) {
            const selectBuyCrystal = new StringSelectMenuBuilder()
                .setCustomId('tycoon_buy_crystal_select')
                .setPlaceholder(
                    isEn
                        ? '💠 Crystal Shop: Unlock Artifacts (+18% to +34% Tix/min)...'
                        : '💠 Tienda de Cristales: Desbloquear Artefactos (+18% a +34% Tix/min)...'
                )
                .addOptions(
                    buyableCrystals.map(it => {
                        const iName = isEn ? (it.name_en || it.name) : it.name;
                        return new StringSelectMenuOptionBuilder()
                            .setLabel(`${iName} — ${Number(it.base_price).toLocaleString()} ${isEn ? 'Crystals' : 'Cristales'}`)
                            .setDescription(
                                isEn
                                    ? `+${it.boost_pct}% Tix/min • Earned via Weekly Quests in Category 4`
                                    : `+${it.boost_pct}% Tix/min • Se ganan en Misiones de la Categoría 4`
                            )
                            .setValue(String(it.item_id))
                            .setEmoji(it.icon_emoji || '💠');
                    })
                );
            container.addActionRowComponents(new ActionRowBuilder().addComponents(selectBuyCrystal));
        }

        // 3. Selector para Aceptar o Cancelar ofertas de Trading P2P activas
        if (activeTrades.length > 0) {
            const tradeOptions = [];
            for (const tr of activeTrades.slice(0, 12)) {
                const isSender = String(tr.sender_id) === userId;
                const firstItem = (tr.sender_items && tr.sender_items[0]?.name) || 'Limited';
                if (isSender) {
                    tradeOptions.push(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(
                                isEn
                                    ? `❌ Cancel My Offer (${tr.trade_id}) — ${firstItem.slice(0, 35)}`
                                    : `❌ Cancelar Mi Oferta (${tr.trade_id}) — ${firstItem.slice(0, 35)}`
                            )
                            .setDescription(
                                isEn
                                    ? 'Withdraw your pending P2P trade offer'
                                    : 'Retirar tu oferta de intercambio pendiente'
                            )
                            .setValue(`cancel:${tr.trade_id}`)
                            .setEmoji('🗑️')
                    );
                } else if (tr.receiver_id === 'PUBLIC' || String(tr.receiver_id) === userId) {
                    tradeOptions.push(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(
                                isEn
                                    ? `✅ Accept Trade (${tr.trade_id}) from ${tr.sender_name}`
                                    : `✅ Aceptar Trade (${tr.trade_id}) de ${tr.sender_name}`
                            )
                            .setDescription(
                                isEn
                                    ? `Receive ${firstItem.slice(0, 35)} • Ask: ${Number(tr.tix_requested || 0).toLocaleString()} Tix`
                                    : `Recibís ${firstItem.slice(0, 35)} • Pide: ${Number(tr.tix_requested || 0).toLocaleString()} Tix`
                            )
                            .setValue(`accept:${tr.trade_id}`)
                            .setEmoji('🤝')
                    );
                }
            }

            if (tradeOptions.length > 0) {
                const selectTradeAction = new StringSelectMenuBuilder()
                    .setCustomId('tycoon_trade_action_select')
                    .setPlaceholder(
                        isEn
                            ? '🤝 Accept or cancel an active P2P Trade Offer...'
                            : '🤝 Aceptar o cancelar un intercambio P2P activo...'
                    )
                    .addOptions(tradeOptions.slice(0, 25));
                container.addActionRowComponents(new ActionRowBuilder().addComponents(selectTradeAction));
            }
        }

        container.addSeparatorComponents(separador());

        const chestLabel = Number(profile.ascension_tokens || 0) > 0
            ? (isEn ? `Open Chest (1 Key)` : `Abrir Cofre (1 Llave)`)
            : (isEn ? `Open Chest (3,500 Tix)` : `Abrir Cofre (3,500 Tix)`);

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('tycoon_open_chest')
                    .setLabel(chestLabel)
                    .setEmoji('🗝️')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('tycoon_open_trade_public_modal')
                    .setLabel(isEn ? 'Post Public Trade' : 'Publicar en Tablero')
                    .setEmoji('🌐')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(myLimiteds.length === 0),
                new ButtonBuilder()
                    .setCustomId('tycoon_open_trade_direct_modal')
                    .setLabel(isEn ? 'Send Direct Trade' : 'Enviar Trade Directo')
                    .setEmoji('🤝')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(myLimiteds.length === 0),
                new ButtonBuilder()
                    .setCustomId('tycoon_refresh:sec_vault')
                    .setLabel(isEn ? 'Refresh' : 'Actualizar')
                    .setEmoji('🔄')
                    .setStyle(ButtonStyle.Secondary)
            )
        );
    }

    // =========================================================================
    // CATEGORÍA 4: MISIONES SEMANALES, LABORATORIO Y RANKING TOP
    // =========================================================================
    else if (sectionKey === 'sec_perks') {
        const leaderboard = await getTycoonLeaderboard(5);
        const wq = weeklyQuests || {
            weekKey: '2026-W01',
            resetDays: 4,
            resetHours: 12,
            quests: [],
            claimableCount: 0,
            allBonusClaimed: false,
            bonusCrystals: 30
        };

        const questsLines = (wq.quests || []).map(q => {
            const bar = buildVisualBar(q.current, q.target, 8);
            const qTitle = isEn ? q.title_en : q.title_es;
            const statusBadge = q.claimed
                ? (isEn ? '✅ **[CLAIMED]**' : '✅ **[RECLAMADA]**')
                : (q.completed
                    ? (isEn ? '🎁 **[READY!]**' : '🎁 **[¡LISTA!]**')
                    : `\`[${bar}]\` (\`${q.current.toLocaleString()}/${q.target.toLocaleString()}\`)`);
            return `• ${q.emoji} **${qTitle}** — ${statusBadge} • **+${q.rewardCrystals} 💠** & **+${q.rewardTix} 🎟️**`;
        }).join('\n');

        const bonusLine = wq.allBonusClaimed
            ? (isEn ? `✅ **Weekly Full Completion Bonus (+${wq.bonusCrystals} 💠):** Claimed!` : `✅ **Bono por Completar las 4 Misiones (+${wq.bonusCrystals} 💠):** ¡Reclamado!`)
            : (isEn ? `🌟 **Full Completion Bonus:** Complete all 4 quests for an extra **+${wq.bonusCrystals} Kortex Crystals (💠)**.` : `🌟 **Bono Semanal Extra:** Completá las 4 misiones para recibir **+${wq.bonusCrystals} Cristales Kortex (💠)** adicionales.`);

        const questsBlock = isEn
            ? `### 🎯 Weekly Quests (\`${wq.resetDays}d ${wq.resetHours}h\` until reset)\n${questsLines}\n\n• ${bonusLine}`
            : `### 🎯 Misiones Semanales (\`${wq.resetDays}d ${wq.resetHours}h\` para el reinicio)\n${questsLines}\n\n• ${bonusLine}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(questsBlock));
        container.addSeparatorComponents(separador());

        const potionStatus = metrics.potionActive
            ? (isEn
                ? `🟢 **Active:** ${metrics.potionInfo?.emoji || '🧪'} **${metrics.potionInfo?.name_en}** (\`+${metrics.potionBonusPct}%\` for \`${metrics.potionRemainingMin}m\` left)`
                : `🟢 **Activa:** ${metrics.potionInfo?.emoji || '🧪'} **${metrics.potionInfo?.name_es}** (\`+${metrics.potionBonusPct}%\` durante \`${metrics.potionRemainingMin}m\` restantes)`)
            : (isEn ? '⚪ **No active potion right now**' : '⚪ **Sin poción activa en este momento**');

        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        const rankingLines = leaderboard.length > 0
            ? leaderboard.slice(0, 5).map((row, idx) => {
                const medal = medals[idx] || `#${idx + 1}`;
                return isEn
                    ? `${medal} **${row.displayName}** — \`+${row.tixPerMin} Tix/min\` • Stage \`${row.stage}/6\` • Rebirth \`x${row.rebirths}\``
                    : `${medal} **${row.displayName}** — \`+${row.tixPerMin} Tix/min\` • Nivel \`${row.stage}/6\` • Rebirth \`x${row.rebirths}\``;
            }).join('\n')
            : (isEn ? '> *No studios ranked yet.*' : '> *Todavía no hay estudios registrados en el ranking.*');

        const labAndRankingBlock = isEn
            ? `### 🧪 Potion Laboratory & Top Studios\n` +
              `• **Active Elixir:** ${potionStatus}\n` +
              `• 🧪 **Speed Potion:** \`+50% Tix/min\` for 30 min (\`450 Tix\`) • ⚗️ **Mega Elixir:** \`+100% Tix/min\` for 30 min (\`850 Tix\`)\n\n` +
              `**🏆 Top 5 Tycoon Studios:**\n${rankingLines}`
            : `### 🧪 Laboratorio de Pociones y Ranking Top\n` +
              `• **Estado de Laboratorio:** ${potionStatus}\n` +
              `• 🧪 **Poción de Velocidad:** \`+50% Tix/min\` por 30 min (\`450 Tix\`) • ⚗️ **Elixir Mega:** \`+100% Tix/min\` por 30 min (\`850 Tix\`)\n\n` +
              `**🏆 Top 5 Estudios de /tycoon:**\n${rankingLines}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(labAndRankingBlock));
        container.addSeparatorComponents(separador());

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('tycoon_claim_quests')
                    .setLabel(
                        isEn
                            ? `Claim Quests (${wq.claimableCount})`
                            : `Reclamar Misiones (${wq.claimableCount})`
                    )
                    .setEmoji('🎁')
                    .setStyle(wq.claimableCount > 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setDisabled(wq.claimableCount <= 0),
                new ButtonBuilder()
                    .setCustomId('tycoon_buy_potion_speed')
                    .setLabel(isEn ? 'Speed Potion (450 Tix)' : 'Poción Velocidad (450 Tix)')
                    .setEmoji('🧪')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('tycoon_buy_potion_mega')
                    .setLabel(isEn ? 'Mega Elixir (850 Tix)' : 'Elixir Mega (850 Tix)')
                    .setEmoji('⚗️')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('tycoon_refresh:sec_perks')
                    .setLabel(isEn ? 'Refresh' : 'Actualizar')
                    .setEmoji('🔄')
                    .setStyle(ButtonStyle.Secondary)
            )
        );
    }

    container.addSeparatorComponents(separador());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer(
            isEn
                ? 'Kortex Tycoon • /tycoon'
                : 'Kortex Tycoon • /tycoon'
        )
    ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

/**
 * Construye el Modal del Taller UGC para diseñar y publicar un objeto comunitario.
 */
function construirModalCrearUgc(isEn = false) {
    const modal = new ModalBuilder()
        .setCustomId('tycoon_modal_ugc_create')
        .setTitle(isEn ? '🎨 Create & Publish UGC Item' : '🎨 Diseñar y Publicar Objeto UGC');

    const inputName = new TextInputBuilder()
        .setCustomId('ugc_name')
        .setLabel(isEn ? 'Item Name (auto-prefixed with [🎨 UGC])' : 'Nombre del Objeto (se añade [🎨 UGC])')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(isEn ? 'Cyber Neon Visor' : 'Visor Cyber Neón')
        .setMinLength(3)
        .setMaxLength(30)
        .setRequired(true);

    const inputEmoji = new TextInputBuilder()
        .setCustomId('ugc_emoji')
        .setLabel(isEn ? 'Icon Emoji (1 emoji)' : 'Emoji Representativo (1 emoji)')
        .setStyle(TextInputStyle.Short)
        .setValue('🎨')
        .setPlaceholder('🕶️')
        .setMaxLength(4)
        .setRequired(true);

    const inputColor = new TextInputBuilder()
        .setCustomId('ugc_color')
        .setLabel(isEn ? 'Accent Color (#HEX)' : 'Color Principal (#HEX)')
        .setStyle(TextInputStyle.Short)
        .setValue('#8B5CF6')
        .setPlaceholder('#8B5CF6')
        .setMaxLength(7)
        .setRequired(true);

    const inputPrice = new TextInputBuilder()
        .setCustomId('ugc_price')
        .setLabel(isEn ? 'Sale Price in Tix (200 to 1500 Tix)' : 'Precio de Venta en Tix (200 a 1500 Tix)')
        .setStyle(TextInputStyle.Short)
        .setValue('500')
        .setPlaceholder('500')
        .setRequired(true);

    const inputDesc = new TextInputBuilder()
        .setCustomId('ugc_desc')
        .setLabel(isEn ? 'Short Description (+10% fixed boost)' : 'Descripción Corta (+10% bono fijo)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(isEn ? 'Custom visor designed in Kortex Studio' : 'Visor personalizado diseñado en el Estudio')
        .setMaxLength(85)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(inputName),
        new ActionRowBuilder().addComponents(inputEmoji),
        new ActionRowBuilder().addComponents(inputColor),
        new ActionRowBuilder().addComponents(inputPrice),
        new ActionRowBuilder().addComponents(inputDesc)
    );
    return modal;
}

/**
 * Construye el Modal de Trading P2P (Tablero Público o Envío Directo por ID/Mención).
 */
function construirModalTradeP2P(myLimiteds = [], mode = 'public', isEn = false) {
    const isDirect = mode === 'direct';
    const modal = new ModalBuilder()
        .setCustomId(isDirect ? 'tycoon_modal_trade_direct' : 'tycoon_modal_trade_public')
        .setTitle(
            isDirect
                ? (isEn ? '🤝 Send Direct P2P Trade Offer' : '🤝 Enviar Oferta de Trade Directo')
                : (isEn ? '🌐 Post Offer on Public Trade Board' : '🌐 Publicar Oferta en Tablero P2P')
        );

    const firstInst = myLimiteds[0];
    const defaultItemHint = firstInst ? firstInst.item_id : 'lim_valkyrie_helm';

    const rows = [];

    if (isDirect) {
        const inputTargetUser = new TextInputBuilder()
            .setCustomId('trade_target_user')
            .setLabel(isEn ? 'Target Player (Discord ID or @Mention)' : 'Jugador Destino (ID de Discord o @Mención)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('123456789012345678')
            .setRequired(true);
        rows.push(new ActionRowBuilder().addComponents(inputTargetUser));
    }

    const inputOfferItem = new TextInputBuilder()
        .setCustomId('trade_offer_item')
        .setLabel(
            isEn
                ? 'Your Limited Item ID or Name to Offer'
                : 'ID o Nombre de tu Limited a Ofrecer'
        )
        .setStyle(TextInputStyle.Short)
        .setValue(defaultItemHint)
        .setPlaceholder('lim_valkyrie_helm')
        .setRequired(true);

    const inputOfferTix = new TextInputBuilder()
        .setCustomId('trade_offer_tix')
        .setLabel(isEn ? 'Additional Tix You Offer (0 if none)' : 'Tix Adicionales que Ofrecés (0 si ninguno)')
        .setStyle(TextInputStyle.Short)
        .setValue('0')
        .setPlaceholder('0')
        .setRequired(true);

    const inputRequestTix = new TextInputBuilder()
        .setCustomId('trade_request_tix')
        .setLabel(isEn ? 'Tix Requested in Return (e.g. 5000)' : 'Tix que Pedís a Cambio (ej: 5000)')
        .setStyle(TextInputStyle.Short)
        .setValue('5000')
        .setPlaceholder('5000')
        .setRequired(true);

    const inputRequestItem = new TextInputBuilder()
        .setCustomId('trade_request_item')
        .setLabel(
            isEn
                ? 'Optional: Requested Limited Item ID (or blank)'
                : 'Opcional: ID de Limited que Pedís (o vacío)'
        )
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('lim_sparkle_time_fedora')
        .setRequired(false);

    rows.push(
        new ActionRowBuilder().addComponents(inputOfferItem),
        new ActionRowBuilder().addComponents(inputOfferTix),
        new ActionRowBuilder().addComponents(inputRequestTix),
        new ActionRowBuilder().addComponents(inputRequestItem)
    );

    modal.addComponents(...rows);
    return modal;
}

/**
 * Manejador central de todas las interacciones cuyo customId comienza con 'tycoon_'.
 */
async function handleTycoonInteraction(interaction) {
    const cid = interaction.customId || '';
    const userId = interaction.user.id;
    const isEn = obtenerIdiomaUsuario(userId) === 'en';
    const member = interaction.member || null;

    if (cid === 'tycoon_open_ugc_modal' && interaction.isButton()) {
        return await interaction.showModal(construirModalCrearUgc(isEn));
    }

    if ((cid === 'tycoon_open_trade_public_modal' || cid === 'tycoon_open_trade_direct_modal') && interaction.isButton()) {
        const state = await getOrCreatePlayerState(userId, member);
        const myLimiteds = state.inventory.filter(
            i => i.catalog && (i.catalog.category === 'LIMITED' || i.catalog.category === 'LIMITED_U')
        );
        const mode = cid === 'tycoon_open_trade_direct_modal' ? 'direct' : 'public';
        return await interaction.showModal(construirModalTradeP2P(myLimiteds, mode, isEn));
    }

    await interaction.deferUpdate();

    if (cid === 'tycoon_section_select' && interaction.isStringSelectMenu()) {
        const selectedSection = interaction.values[0] || 'sec_studio';
        const panel = await construirPanelTycoon(interaction.user, selectedSection, null, member);
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('tycoon_refresh:')) {
        const targetSec = cid.split(':')[1] || 'sec_studio';
        const msg = isEn
            ? '🔄 **Panel synchronized in real time.**'
            : '🔄 **Panel actualizado en tiempo real.**';
        const panel = await construirPanelTycoon(interaction.user, targetSec, msg, member);
        return await interaction.editReply(panel);
    }

    // CATEGORÍA 1: Estudio y Producción
    if (cid === 'tycoon_collect_pad') {
        const res = await collectPadTix(userId);
        const msg = res.ok
            ? (isEn
                ? `🟢 **Collected \`+${res.collected.toLocaleString()} Tix\`** from your Collector Vault! Wallet: \`${Number(res.state.profile.tix_balance).toLocaleString()} Tix\`.`
                : `🟢 **¡Recolectaste \`+${res.collected.toLocaleString()} Tix\`** de tu Bóveda Colectora! Billetera: \`${Number(res.state.profile.tix_balance).toLocaleString()} Tix\`.`)
            : (isEn
                ? `ℹ️ Your Collector Vault is at \`0 Tix\` right now. Wait a moment while your stations produce more Tix!`
                : `ℹ️ Tu Bóveda Colectora está en \`0 Tix\` ahora mismo. ¡Esperá unos instantes mientras tus estaciones producen más Tix!`);
        const panel = await construirPanelTycoon(interaction.user, 'sec_studio', msg, member);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_claim_daily') {
        const res = await claimDailyStreak(userId);
        const msg = res.ok
            ? (isEn
                ? `🔥 **Daily Streak Day ${res.streakDay}/7 Claimed!** You received **+${res.rewardTix.toLocaleString()} Tix (\`🎟️\`)** and **+${res.rewardCrystals} Kortex Crystals (\`💠\`)**!`
                : `🔥 **¡Racha Diaria Día ${res.streakDay}/7 Reclamada!** Recibiste **+${res.rewardTix.toLocaleString()} Tix (\`🎟️\`)** y **+${res.rewardCrystals} Cristales Kortex (\`💠\`)**!`)
            : (isEn
                ? `⏳ Your next Daily Streak reward will be ready in \`${res.hoursLeft}h ${res.minsLeft}m\`.`
                : `⏳ Tu próxima recompensa de Racha Diaria estará lista en \`${res.hoursLeft}h ${res.minsLeft}m\`.`);
        const panel = await construirPanelTycoon(interaction.user, 'sec_studio', msg, member);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_buy_next_pad') {
        const res = await buyNextStudioPad(userId);
        let msg;
        if (res.ok) {
            const pName = isEn ? res.pad.name_en : res.pad.name_es;
            msg = isEn
                ? `🎉 **Station Built:** ${res.pad.emoji} **${pName}**! Your Studio reached **Stage ${res.state.profile.studio_stage}/6** (\`+${res.pad.tixPerMin} Tix/min\`).`
                : `🎉 **¡Estación Construida:** ${res.pad.emoji} **${pName}**! Tu Estudio subió a **Nivel ${res.state.profile.studio_stage}/6** (\`+${res.pad.tixPerMin} Tix/min\`).`;
        } else if (res.reason === 'insufficient_tix') {
            const pName = isEn ? res.pad.name_en : res.pad.name_es;
            msg = isEn
                ? `⚠️ You need \`${res.needed.toLocaleString()} Tix\` to build **${pName}** (you have \`${res.balance.toLocaleString()} Tix\`).`
                : `⚠️ Necesitás \`${res.needed.toLocaleString()} Tix\` para construir **${pName}** (tenés \`${res.balance.toLocaleString()} Tix\`).`;
        } else {
            msg = isEn
                ? `✅ All 6 Studio Stations are built! Click **Rebirth** to ascend.`
                : `✅ ¡Ya construiste las 6 Estaciones del Estudio! Tocá **Rebirth** para ascender.`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_studio', msg, member);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_rebirth') {
        const res = await performRebirth(userId);
        const msg = res.ok
            ? (isEn
                ? `✨ **REBIRTH #${res.newRebirthCount} COMPLETED!** You gained a permanent **+35% production multiplier**, **+1,500 Collector Cap**, and **+1 Ascension Chest Key (\`🗝️\`)**!`
                : `✨ **¡REBIRTH #${res.newRebirthCount} COMPLETADO!** Ganaste **+35% de multiplicador permanente**, **+1,500 de capacidad en Colector** y **+1 Llave de Cofre de Ascensión (\`🗝️\`)**.`)
            : (isEn
                ? `⚠️ Build all 6 Studio Stations (Stage 6) before performing a Rebirth.`
                : `⚠️ Necesitás construir las 6 Estaciones del Estudio (Nivel 6) antes de hacer Rebirth.`);
        const panel = await construirPanelTycoon(interaction.user, 'sec_studio', msg, member);
        return await interaction.editReply(panel);
    }

    // CATEGORÍA 2 Y 3: Tienda Unificada, Perfil e Inventario
    if (cid === 'tycoon_buy_normal_select' && interaction.isStringSelectMenu()) {
        const itemId = interaction.values[0];
        let msg;

        if (String(itemId).startsWith('limu_')) {
            const res = await claimLimitedUDrop(userId, itemId);
            if (res.ok) {
                const dName = isEn ? (res.item.name_en || res.item.name) : res.item.name;
                msg = isEn
                    ? `👑 **SERIALIZED LIMITED U PURCHASED!** You acquired ${res.item.icon_emoji} **${dName} [#${String(res.serialNumber).padStart(2, '0')}/${res.maxSupply}]** (\`+${res.item.boost_pct}% Tix/min\`)!`
                    : `👑 **¡LIMITED U NUMERADO COMPRADO!** Adquiriste ${res.item.icon_emoji} **${dName} [#${String(res.serialNumber).padStart(2, '0')}/${res.maxSupply}]** (\`+${res.item.boost_pct}% Tix/min\`)!`;
            } else if (res.reason === 'sold_out') {
                msg = isEn
                    ? `🔴 **SOLD OUT!** All global copies have been claimed. Acquire it via P2P Trading!`
                    : `🔴 **¡AGOTADO!** Todas las copias globales ya fueron reclamadas. ¡Conseguilo por Intercambio P2P!`;
            } else if (res.reason === 'insufficient_tix') {
                msg = isEn
                    ? `⚠️ You need \`${res.cost.toLocaleString()} Tix\` to buy this Limited U item.`
                    : `⚠️ Necesitás \`${res.cost.toLocaleString()} Tix\` para comprar este ítem Limited U.`;
            } else {
                msg = isEn ? `⚠️ Could not buy Limited U item.` : `⚠️ No se pudo comprar el ítem Limited U.`;
            }
        } else if (String(itemId).startsWith('ugc_')) {
            const res = await buyCommunityUgcItem(userId, itemId);
            if (res.ok) {
                msg = isEn
                    ? `🛍️ **Bought Community UGC:** ${res.item.icon_emoji} **${res.item.name}** for \`${res.price.toLocaleString()} Tix\`!`
                    : `🛍️ **¡Compraste el UGC:** ${res.item.icon_emoji} **${res.item.name}** por \`${res.price.toLocaleString()} Tix\`!`;
            } else {
                msg = isEn
                    ? `⚠️ Could not complete UGC purchase (${res.reason}).`
                    : `⚠️ No se pudo completar la compra del UGC (${res.reason}).`;
            }
        } else {
            const res = await buyNormalShopItem(userId, itemId);
            if (res.ok) {
                const iName = isEn ? (res.item.name_en || res.item.name) : res.item.name;
                msg = isEn
                    ? `🛒 **Purchased & Equipped:** ${res.item.icon_emoji} **${iName}** (\`+${res.item.boost_pct}% Tix/min\`)!`
                    : `🛒 **¡Comprado y Equipado:** ${res.item.icon_emoji} **${iName}** (\`+${res.item.boost_pct}% Tix/min\`)!`;
            } else if (res.reason === 'insufficient_tix') {
                msg = isEn
                    ? `⚠️ You need \`${res.cost.toLocaleString()} Tix\` to buy this item (you have \`${res.balance.toLocaleString()} Tix\`).`
                    : `⚠️ Necesitás \`${res.cost.toLocaleString()} Tix\` para comprar este ítem (tenés \`${res.balance.toLocaleString()} Tix\`).`;
            } else {
                msg = isEn ? `ℹ️ You already own this item.` : `ℹ️ Ya tenés este ítem en tu inventario.`;
            }
        }

        const panel = await construirPanelTycoon(interaction.user, 'sec_vault', msg, member);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_buy_crystal_select' && interaction.isStringSelectMenu()) {
        const itemId = interaction.values[0];
        const res = await buyCrystalShopItem(userId, itemId);
        let msg;
        if (res.ok) {
            const iName = isEn ? (res.item.name_en || res.item.name) : res.item.name;
            msg = isEn
                ? `💠 **CRYSTAL ARTIFACT UNLOCKED:** ${res.item.icon_emoji} **${iName}** (\`+${res.item.boost_pct}% Tix/min\`) for \`${res.cost} Crystals\`!`
                : `💠 **¡ARTEFACTO DE CRISTAL DESBLOQUEADO:** ${res.item.icon_emoji} **${iName}** (\`+${res.item.boost_pct}% Tix/min\`) por \`${res.cost} Cristales\`!`;
        } else if (res.reason === 'insufficient_crystals') {
            msg = isEn
                ? `⚠️ You need \`${res.cost} Kortex Crystals (💠)\` to unlock **${res.item?.name_en || res.item?.name}** (you have \`${res.crystalBalance} Crystals\`). Complete **Weekly Quests** in Category 4!`
                : `⚠️ Necesitás \`${res.cost} Cristales Kortex (💠)\` para desbloquear **${res.item?.name}** (tenés \`${res.crystalBalance} Cristales\`). ¡Completá **Misiones Semanales** en la Categoría 4!`;
        } else {
            msg = isEn ? `ℹ️ You already own this Crystal artifact.` : `ℹ️ Ya tenés este artefacto de Cristal en tu inventario.`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_vault', msg, member);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_equip_item_select' && interaction.isStringSelectMenu()) {
        const itemId = interaction.values[0];
        const res = await equipUserItem(userId, itemId);
        const iName = res.item ? (isEn ? (res.item.name_en || res.item.name) : res.item.name) : itemId;
        const msg = res.ok
            ? (isEn
                ? `🎩 **Equipped on your Avatar:** ${res.item?.icon_emoji || '🎩'} **${iName}** (\`+${res.item?.boost_pct || 5}% Tix/min\`)!`
                : `🎩 **¡Equipado en tu Avatar:** ${res.item?.icon_emoji || '🎩'} **${iName}** (\`+${res.item?.boost_pct || 5}% Tix/min\`)!`)
            : (isEn ? `⚠️ Could not equip that item.` : `⚠️ No se pudo equipar ese ítem.`);
        const panel = await construirPanelTycoon(interaction.user, 'sec_shop', msg, member);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_unlock_ugc_license') {
        const res = await unlockUgcCreatorLicense(userId);
        let msg;
        if (res.ok) {
            msg = res.method === 'vip_free'
                ? (isEn
                    ? `🔓 **UGC Creator License Unlocked for FREE** thanks to your VIP status!`
                    : `🔓 **¡Licencia de Creador UGC Desbloqueada GRATIS** gracias a tu estado VIP!`)
                : (isEn
                    ? `🔓 **UGC Creator License Unlocked** for \`1,200 Tix\`!`
                    : `🔓 **¡Licencia de Creador UGC Desbloqueada** por \`1,200 Tix\`!`);
        } else if (res.reason === 'requires_stage_6') {
            msg = isEn
                ? `🔒 Reach **Studio Stage 6** (or 1 Rebirth) + \`1,200 Tix\` to unlock the UGC Creator License.`
                : `🔒 Necesitás **Estudio Nivel 6** (o 1 Rebirth) + \`1,200 Tix\` para desbloquear la Licencia UGC.`;
        } else if (res.reason === 'insufficient_tix') {
            msg = isEn
                ? `⚠️ You need \`1,200 Tix\` to unlock the UGC License (you have \`${res.balance.toLocaleString()} Tix\`).`
                : `⚠️ Necesitás \`1,200 Tix\` para desbloquear la Licencia UGC (tenés \`${res.balance.toLocaleString()} Tix\`).`;
        } else {
            msg = isEn ? `✅ Your UGC Creator License is already active.` : `✅ Tu Licencia de Creador UGC ya está activa.`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_shop', msg, member);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_modal_ugc_create' && interaction.isModalSubmit()) {
        const rawName = interaction.fields.getTextInputValue('ugc_name');
        const rawEmoji = interaction.fields.getTextInputValue('ugc_emoji');
        const rawColorHex = interaction.fields.getTextInputValue('ugc_color');
        const rawPrice = interaction.fields.getTextInputValue('ugc_price');
        const rawDescription = interaction.fields.getTextInputValue('ugc_desc') || '';

        const res = await publishCustomUgcItem(userId, interaction.user.username, {
            rawName,
            rawEmoji,
            rawColorHex,
            rawPrice,
            rawDescription
        });

        let msg;
        if (res.ok) {
            msg = isEn
                ? `🎨 **UGC Published:** ${res.item.icon_emoji} **${res.item.name}** for \`${Number(res.item.base_price).toLocaleString()} Tix\`! You earn **70% royalties** per sale.`
                : `🎨 **¡UGC Publicado:** ${res.item.icon_emoji} **${res.item.name}** a \`${Number(res.item.base_price).toLocaleString()} Tix\`! Ganás el **70% de regalías** por venta.`;
        } else if (res.reason === 'forbidden_words') {
            msg = isEn
                ? `🚫 **Filter:** UGC names cannot contain reserved words like *"Limited"*, *"Admin"*, *"Dominus"*, or *"Valkyrie"*.`
                : `🚫 **Filtro:** El nombre del UGC no puede incluir palabras reservadas como *"Limited"*, *"Admin"*, *"Dominus"* o *"Valkyrie"*.`;
        } else if (res.reason === 'invalid_price_range') {
            msg = isEn
                ? `⚠️ UGC price must be between \`200\` and \`1,500 Tix\`.`
                : `⚠️ El precio del UGC debe estar entre \`200\` y \`1,500 Tix\`.`;
        } else if (res.reason === 'insufficient_deposit') {
            msg = isEn
                ? `⚠️ Publishing a UGC item requires a \`250 Tix\` deposit.`
                : `⚠️ Publicar un ítem UGC requiere un depósito de \`250 Tix\`.`;
        } else {
            msg = isEn
                ? `⚠️ Could not publish UGC item (max 2 active UGCs per creator).`
                : `⚠️ No se pudo publicar el ítem UGC (máx. 2 UGCs activos por creador).`;
        }

        const panel = await construirPanelTycoon(interaction.user, 'sec_shop', msg, member);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_open_chest') {
        const res = await openAscensionChest(userId);
        let msg;
        if (res.ok) {
            const wName = isEn ? (res.wonItem.name_en || res.wonItem.name) : res.wonItem.name;
            const serialTxt = res.serialNumber
                ? ` **[#${String(res.serialNumber).padStart(2, '0')}/${res.wonItem.max_supply}]**`
                : '';
            msg = isEn
                ? `🎉 **ASCENSION CHEST UNBOXED!** You won ${res.wonItem.icon_emoji} **${wName}**${serialTxt} (\`+${res.wonItem.boost_pct}% Tix/min\`)!`
                : `🎉 **¡COFRE DE ASCENSIÓN ABIERTO!** Ganaste ${res.wonItem.icon_emoji} **${wName}**${serialTxt} (\`+${res.wonItem.boost_pct}% Tix/min\`)!`;
        } else if (res.reason === 'requires_stage_3') {
            msg = isEn
                ? `🔒 Reach **Studio Stage 3** (or use a Rebirth Key) to open Ascension Chests.`
                : `🔒 Alcanzá el **Nivel 3 del Estudio** (o usá una Llave de Rebirth) para abrir Cofres de Ascensión.`;
        } else if (res.reason === 'insufficient_tix') {
            msg = isEn
                ? `⚠️ Opening an Ascension Chest without a Key costs \`3,500 Tix\` (you have \`${res.balance.toLocaleString()} Tix\`).`
                : `⚠️ Abrir un Cofre de Ascensión sin Llave cuesta \`3,500 Tix\` (tenés \`${res.balance.toLocaleString()} Tix\`).`;
        } else {
            msg = isEn ? `⚠️ Could not open Ascension Chest.` : `⚠️ No se pudo abrir el Cofre de Ascensión.`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_vault', msg, member);
        return await interaction.editReply(panel);
    }

    if ((cid === 'tycoon_modal_trade_public' || cid === 'tycoon_modal_trade_direct') && interaction.isModalSubmit()) {
        const isDirect = cid === 'tycoon_modal_trade_direct';
        const targetUser = isDirect ? interaction.fields.getTextInputValue('trade_target_user').trim() : 'PUBLIC';
        const rawOfferItem = interaction.fields.getTextInputValue('trade_offer_item').trim();
        const rawOfferTix = interaction.fields.getTextInputValue('trade_offer_tix').trim();
        const rawRequestTix = interaction.fields.getTextInputValue('trade_request_tix').trim();
        const rawRequestItem = interaction.fields.getTextInputValue('trade_request_item')?.trim() || '';

        const state = await getOrCreatePlayerState(userId, member);
        const myLimiteds = state.inventory.filter(
            i => i.catalog && (i.catalog.category === 'LIMITED' || i.catalog.category === 'LIMITED_U')
        );

        const qLower = rawOfferItem.toLowerCase();
        const matchedInstance = myLimiteds.find(
            i =>
                String(i.instance_id).toLowerCase() === qLower ||
                String(i.item_id).toLowerCase() === qLower ||
                String(i.catalog.name).toLowerCase().includes(qLower) ||
                String(i.catalog.name_en || '').toLowerCase().includes(qLower)
        ) || myLimiteds[0];

        if (!matchedInstance) {
            const msg = isEn
                ? `⚠️ You don't own a Limited item matching \`${rawOfferItem}\`.`
                : `⚠️ No tenés ningún ítem Limited que coincida con \`${rawOfferItem}\`.`;
            const panel = await construirPanelTycoon(interaction.user, 'sec_vault', msg, member);
            return await interaction.editReply(panel);
        }

        let resolvedReqItemId = null;
        if (rawRequestItem) {
            const reqLower = rawRequestItem.toLowerCase();
            const allLim = [...state.catalogMap.values()].filter(
                c => c.category === 'LIMITED' || c.category === 'LIMITED_U'
            );
            const foundReq = allLim.find(
                c =>
                    String(c.item_id).toLowerCase() === reqLower ||
                    String(c.name).toLowerCase().includes(reqLower) ||
                    String(c.name_en || '').toLowerCase().includes(reqLower)
            );
            if (foundReq) resolvedReqItemId = foundReq.item_id;
        }

        const res = await createTradeOffer(userId, interaction.user.username, {
            targetReceiverId: isDirect ? targetUser : 'PUBLIC',
            offeredInstanceIds: [matchedInstance.instance_id],
            tixOffered: rawOfferTix,
            requestedItemId: resolvedReqItemId,
            tixRequested: rawRequestTix
        });

        const msg = res.ok
            ? (isEn
                ? `🤝 **Trade Offer Created (\`${res.trade.trade_id}\`)!** Offering **${matchedInstance.catalog.icon_emoji} ${matchedInstance.catalog.name}**.`
                : `🤝 **¡Oferta de Intercambio Creada (\`${res.trade.trade_id}\`)!** Ofreciendo **${matchedInstance.catalog.icon_emoji} ${matchedInstance.catalog.name}**.`)
            : (isEn
                ? `⚠️ Could not create trade offer (${res.reason}).`
                : `⚠️ No se pudo crear la oferta de intercambio (${res.reason}).`);

        const panel = await construirPanelTycoon(interaction.user, 'sec_vault', msg, member);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_trade_action_select' && interaction.isStringSelectMenu()) {
        const val = interaction.values[0] || '';
        const [action, tradeId] = val.split(':');
        const res = await resolveTradeOffer(userId, tradeId, action);
        let msg;
        if (res.ok) {
            msg = res.action === 'ACCEPTED'
                ? (isEn
                    ? `🎉 **Trade \`${tradeId}\` ACCEPTED!** Items and Tix have been exchanged.`
                    : `🎉 **¡Intercambio \`${tradeId}\` ACEPTADO!** Se transfirieron los ítems y Tix.`)
                : (isEn
                    ? `🗑️ **Trade Offer \`${tradeId}\` cancelled.**`
                    : `🗑️ **Oferta de intercambio \`${tradeId}\` cancelada.**`);
        } else {
            msg = isEn
                ? `⚠️ Could not process trade (\`${res.reason}\`).`
                : `⚠️ No se pudo procesar el intercambio (\`${res.reason}\`).`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_vault', msg, member);
        return await interaction.editReply(panel);
    }

    // CATEGORÍA 4: Misiones Semanales y Laboratorio de Pociones
    if (cid === 'tycoon_claim_quests') {
        const res = await claimWeeklyQuestReward(userId);
        let msg;
        if (res.ok) {
            const qNames = res.claimedQuests.map(q => `${q.emoji} **${isEn ? q.title_en : q.title_es}**`).join(', ');
            const bonusNote = res.grantedAllBonus
                ? (isEn ? ` + **+${res.bonusCrystals} 💠 Weekly Completion Bonus**` : ` + **+${res.bonusCrystals} 💠 Bono Semanal Completo**`)
                : '';
            msg = isEn
                ? `🎁 **Weekly Quests Claimed (${qNames})!** You received **+${res.totalCrystalsEarned} Kortex Crystals (\`💠\`)**${bonusNote} and **+${res.totalTixEarned.toLocaleString()} Tix (\`🎟️\`)**!`
                : `🎁 **¡Misiones Semanales Reclamadas (${qNames})!** Recibiste **+${res.totalCrystalsEarned} Cristales Kortex (\`💠\`)**${bonusNote} y **+${res.totalTixEarned.toLocaleString()} Tix (\`🎟️\`)**!`;
        } else {
            msg = isEn
                ? `ℹ️ You don't have any completed quests ready to claim yet.`
                : `ℹ️ Aún no tenés misiones completadas listas para reclamar.`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_perks', msg, member);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_buy_potion_speed' || cid === 'tycoon_buy_potion_mega') {
        const potionId = cid === 'tycoon_buy_potion_mega' ? 'mega_elixir' : 'speed_potion';
        const res = await buyAndActivatePotion(userId, potionId);
        let msg;
        if (res.ok) {
            const pName = isEn ? res.potion.name_en : res.potion.name_es;
            msg = isEn
                ? `🧪 **Potion Activated:** ${res.potion.emoji} **${pName}**! Production: **+${res.state.metrics.effectiveTixPerMin} Tix/min** (\`${res.state.metrics.potionRemainingMin}m\` left).`
                : `🧪 **¡Poción Activada:** ${res.potion.emoji} **${pName}**! Producción: **+${res.state.metrics.effectiveTixPerMin} Tix/min** (\`${res.state.metrics.potionRemainingMin}m\` activos).`;
        } else {
            msg = isEn
                ? `⚠️ You need \`${res.cost.toLocaleString()} Tix\` to buy that potion.`
                : `⚠️ Necesitás \`${res.cost.toLocaleString()} Tix\` para comprar esa poción.`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_perks', msg, member);
        return await interaction.editReply(panel);
    }
}

module.exports = {
    construirPanelTycoon,
    handleTycoonInteraction
};
