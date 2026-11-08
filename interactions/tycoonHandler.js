// ==========================================
// ARCHIVO: interactions/tycoonHandler.js
// Constructor de Paneles Simétricos de 4 Categorías (Components V2) para /tycoon
// Soporta Español ('es') e Inglés ('en') con Vitrinas Gráficas PNG por Categoría (Sin RAP)
// ==========================================

const {
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');

const { COLORES, footer, separador } = require('../utils/ui');
const { obtenerIdiomaUsuario } = require('../src/utils/i18n');
const { obtenerCuentaVinculada } = require('../src/utils/fastLink');
const { obtenerConfigPropietario, construirPanelAvisoModeracion } = require('../src/utils/performanceManager');
const { renderTycoonSectionCanvas } = require('../utils/tycoonRenderer');
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
    buyAndActivatePotion,
    syncCommunityPerks
} = require('../services/tycoonEngine');

function buildQuestProgressBar(current, target, width = 8) {
    const ratio = Math.max(0, Math.min(1, Number(current || 0) / Math.max(1, Number(target || 1))));
    const filled = Math.round(ratio * width);
    return '▰'.repeat(filled) + '▱'.repeat(Math.max(0, width - filled));
}

/**
 * Normaliza la clave de categoría a las 4 Categorías Simétricas de /tycoon.
 */
function normalizeTycoonSection(sec) {
    if (sec === 'sec_ugc' || sec === 'sec_shop') return 'sec_shop';
    if (sec === 'sec_vault') return 'sec_vault';
    if (sec === 'sec_perks' || sec === 'sec_quests') return 'sec_perks';
    return 'sec_studio';
}

/**
 * Construye el selector simétrico de las 4 Categorías de /tycoon.
 */
function buildSectionSelectMenu(activeSection = 'sec_studio', isEn = false) {
    const norm = normalizeTycoonSection(activeSection);
    return new StringSelectMenuBuilder()
        .setCustomId('tycoon_section_select')
        .setPlaceholder(
            isEn
                ? '🏭 Select a /tycoon category (1 to 4)...'
                : '🏭 Seleccioná una categoría de /tycoon (1 a 4)...'
        )
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? 'Category 1: My Studio & Production' : 'Categoría 1: Mi Estudio y Producción')
                .setDescription(
                    isEn
                        ? '3D Isometric Studio, Tix Collector, Machines, Daily Streak & Rebirth'
                        : 'Mapa 3D del Estudio, Colector de Tix, Máquinas, Racha Diaria y Rebirth'
                )
                .setValue('sec_studio')
                .setEmoji('🏗️')
                .setDefault(norm === 'sec_studio'),
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? 'Category 2: Shop, Items & UGC Workshop' : 'Categoría 2: Tienda, Ítems y Taller UGC')
                .setDescription(
                    isEn
                        ? 'Visual Item Showcase, Tix Shop, Crystal Artifacts, Inventory & UGC'
                        : 'Vitrina Visual de Ítems, Tienda Tix, Artefactos de Cristal, Equipo y UGC'
                )
                .setValue('sec_shop')
                .setEmoji('🎒')
                .setDefault(norm === 'sec_shop'),
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? 'Category 3: Chests, Limiteds & P2P Trades' : 'Categoría 3: Cofres, Limiteds e Intercambios')
                .setDescription(
                    isEn
                        ? 'Unbox Ascension Chests, Serialized Limited U (#01/15) & P2P Trading'
                        : 'Abrí Cofres de Ascensión, Limited U numerados (#01/15) e Intercambios P2P'
                )
                .setValue('sec_vault')
                .setEmoji('👑')
                .setDefault(norm === 'sec_vault'),
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? 'Category 4: Weekly Quests, Potions & Ranking' : 'Categoría 4: Misiones, Pociones y Ranking')
                .setDescription(
                    isEn
                        ? 'Earn free Kortex Crystals in Weekly Quests, Lab Potions & Top Ranking'
                        : 'Ganá Cristales Kortex gratis en Misiones Semanales, Pociones y Ranking'
                )
                .setValue('sec_perks')
                .setEmoji('💠')
                .setDefault(norm === 'sec_perks')
        ]);
}

/**
 * Construye el panel completo de /tycoon para la categoría seleccionada.
 */
async function construirPanelTycoon(user, activeSection = 'sec_studio', feedbackMsg = null) {
    const userId = String(user.id);
    const lang = obtenerIdiomaUsuario(userId);
    const isEn = lang === 'en';
    const normSection = normalizeTycoonSection(activeSection);

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
        getOrCreatePlayerState(userId),
        obtenerCuentaVinculada(userId).catch(() => null)
    ]);

    const { profile, inventory, equippedItem, metrics, weeklyQuests, dailyStreak, catalogMap } = state;
    const displayUsername = linkedRoblox?.roblox_username || user.username || 'Player';
    const avatarUrl = linkedRoblox?.avatar_full_url || linkedRoblox?.avatar_url || null;
    if (linkedRoblox?.roblox_user_id && !profile.roblox_user_id) {
        profile.roblox_user_id = linkedRoblox.roblox_user_id;
    }

    let activeTrades = [];
    let leaderboard = [];
    if (normSection === 'sec_vault') {
        const trRes = await getActiveTrades(userId);
        activeTrades = trRes.trades || [];
    } else if (normSection === 'sec_perks') {
        leaderboard = await getTycoonLeaderboard(5);
    }

    // Renderizar la vitrina visual PNG correspondiente a la categoría activa
    const pngBuffer = await renderTycoonSectionCanvas({
        state,
        username: displayUsername,
        avatarUrl,
        lang,
        activeSection: normSection,
        tradesCount: activeTrades.length,
        leaderboard
    });
    const attachment = new AttachmentBuilder(pngBuffer, { name: 'tycoon_snapshot.png' });

    const accentColors = {
        sec_studio: 0x22C55E,
        sec_shop: 0x38BDF8,
        sec_vault: 0xF59E0B,
        sec_perks: 0xEC4899
    };
    const container = new ContainerBuilder().setAccentColor(accentColors[normSection] || COLORES.primario);

    const eqTitle = equippedItem
        ? `${equippedItem.icon_emoji || '🎩'} **${isEn ? (equippedItem.name_en || equippedItem.name) : equippedItem.name}** (\`+${equippedItem.boost_pct}%\`)`
        : (isEn ? '`None`' : '`Ninguno`');

    // Encabezado limpio y simétrico de 4 indicadores (Sin RAP)
    const headerBanner =
        (isEn
            ? `# 🏭 Roblox Tycoon — @${displayUsername}\n` +
              `🏗️ **Stage:** \`${profile.studio_stage || 1}/6 (Rebirth x${profile.rebirth_count || 0})\`  •  ` +
              `🎟️ **Tix:** \`${Number(profile.tix_balance || 0).toLocaleString()}\`  •  ` +
              `💠 **Crystals:** \`${Number(profile.crystal_balance ?? 15).toLocaleString()}\`  •  ` +
              `⚡ **Production:** \`+${metrics.effectiveTixPerMin} Tix/min (x${metrics.multiplier})\``
            : `# 🏭 Roblox Tycoon — @${displayUsername}\n` +
              `🏗️ **Estudio:** \`Nivel ${profile.studio_stage || 1}/6 (Rebirth x${profile.rebirth_count || 0})\`  •  ` +
              `🎟️ **Tix:** \`${Number(profile.tix_balance || 0).toLocaleString()}\`  •  ` +
              `💠 **Cristales:** \`${Number(profile.crystal_balance ?? 15).toLocaleString()}\`  •  ` +
              `⚡ **Producción:** \`+${metrics.effectiveTixPerMin} Tix/min (x${metrics.multiplier})\``) +
        (feedbackMsg ? `\n\n> ${feedbackMsg}` : '');

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerBanner));

    // Imagen visual dinámica (Estudio 3D, Vitrina de Ítems, Bóveda de Cofres o Tablero de Misiones/Ranking)
    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://tycoon_snapshot.png')
        )
    );

    // Selector de las 4 Categorías Simétricas
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(buildSectionSelectMenu(normSection, isEn))
    );
    container.addSeparatorComponents(separador(true));

    // =========================================================================
    // CATEGORÍA 1: MI ESTUDIO Y PRODUCCIÓN
    // =========================================================================
    if (normSection === 'sec_studio') {
        const unlockedSet = new Set(metrics.unlockedPads);
        const builtCount = STUDIO_PADS.filter(p => unlockedSet.has(p.id)).length;
        const nextPad = metrics.nextPad;

        const nextPadLine = nextPad
            ? (isEn
                ? `🟡 **Next Upgrade:** ${nextPad.emoji} **${nextPad.name_en}** — Cost: \`${nextPad.cost.toLocaleString()} Tix\` (\`+${nextPad.tixPerMin} Tix/min\`)`
                : `🟡 **Siguiente Mejora:** ${nextPad.emoji} **${nextPad.name_es}** — Costo: \`${nextPad.cost.toLocaleString()} Tix\` (\`+${nextPad.tixPerMin} Tix/min\`)`)
            : (isEn
                ? `✨ **All 6 Machines Built!** Your Studio is ready for **Rebirth** (\`+35%\` permanent speed & \`+1 Ascension Key\`).`
                : `✨ **¡Las 6 Máquinas están Construidas!** Tu Estudio está listo para hacer **Rebirth** (\`+35%\` permanente y \`+1 Llave de Cofre\`).`);

        const ds = dailyStreak || { currentStreak: 0, nextStreakDay: 1, canClaim: true, rewardTix: 350, rewardCrystals: 5, hoursLeft: 0, minsLeft: 0 };
        const streakLine = ds.canClaim
            ? (isEn
                ? `🔥 **Daily Reward (Day ${ds.nextStreakDay}/7):** \`Ready to claim!\` (**+${ds.rewardTix} 🎟️** & **+${ds.rewardCrystals} 💠**)`
                : `🔥 **Racha Diaria (Día ${ds.nextStreakDay}/7):** \`¡Lista para reclamar!\` (**+${ds.rewardTix} 🎟️** y **+${ds.rewardCrystals} 💠**)`)
            : (isEn
                ? `🔥 **Daily Streak (Day ${ds.currentStreak}/7):** Next reward in \`${ds.hoursLeft}h ${ds.minsLeft}m\``
                : `🔥 **Racha Diaria (Día ${ds.currentStreak}/7):** Próxima recompensa en \`${ds.hoursLeft}h ${ds.minsLeft}m\``);

        const studioText = isEn
            ? `### 🏗️ Category 1: My Studio & Production (\`${builtCount}/6\` Machines)\n` +
              `• **Green Collector Vault:** \`${Number(profile.collector_tix || 0).toLocaleString()} / ${Number(profile.collector_cap || 500).toLocaleString()} Tix\`  •  **Equipped Item:** ${eqTitle}\n` +
              `• ${nextPadLine}\n` +
              `• ${streakLine}`
            : `### 🏗️ Categoría 1: Mi Estudio y Producción (\`${builtCount}/6\` Máquinas)\n` +
              `• **Bóveda Colectora Verde:** \`${Number(profile.collector_tix || 0).toLocaleString()} / ${Number(profile.collector_cap || 500).toLocaleString()} Tix\`  •  **Ítem Equipado:** ${eqTitle}\n` +
              `• ${nextPadLine}\n` +
              `• ${streakLine}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(studioText));
        container.addSeparatorComponents(separador());

        const collectorTix = Number(profile.collector_tix || 0);
        const btnCollect = new ButtonBuilder()
            .setCustomId('tycoon_collect_pad')
            .setLabel(
                isEn
                    ? `Collect (${collectorTix.toLocaleString()} Tix)`
                    : `Recolectar (${collectorTix.toLocaleString()} Tix)`
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
                    : (isEn ? '6/6 Built' : '6/6 Construidas')
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
    // CATEGORÍA 2: TIENDA, ÍTEMS Y TALLER UGC (VITRINA VISUAL DE TARJETAS)
    // =========================================================================
    else if (normSection === 'sec_shop') {
        const allCatalog = [...catalogMap.values()];
        const allShopItems = allCatalog.filter(it => it.category === 'NORMAL' && Number(it.base_price) > 0);
        const normalTixItems = allShopItems.filter(
            it => it.currency_type !== 'CRYSTAL' && !String(it.item_id).startsWith('crys_')
        );
        const crystalShopItems = allShopItems.filter(
            it => it.currency_type === 'CRYSTAL' || String(it.item_id).startsWith('crys_')
        );
        const ugcItems = allCatalog
            .filter(it => it.category === 'UGC')
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const myUgcs = ugcItems.filter(it => String(it.creator_id) === userId);
        const hasLicense = Boolean(profile.ugc_license_unlocked || profile.vip_nitro_boost || profile.vip_yt_sub);
        const ownedIds = new Set(inventory.map(i => String(i.item_id)));

        const shopSummaryText = isEn
            ? `### 🎒 Category 2: Visual Item Showcase, Inventory & UGC Workshop\n` +
              `Inspect all items visually in the showcase image above! Every item grants a passive **Tix/min production bonus** when equipped.\n` +
              `• **Equipped Item:** ${eqTitle}  •  **Owned Items:** \`${inventory.length}\`  •  **UGC Creator License:** ${hasLicense ? `🟢 Active (\`${myUgcs.length}/2\`)` : '🔒 Locked (`1,200 Tix` at Stage 6 or Free with VIP)'}`
            : `### 🎒 Categoría 2: Vitrina Visual de Ítems, Inventario y Taller UGC\n` +
              `¡Mirá las tarjetas visuales de todos los ítems en la imagen de arriba! Cada ítem otorga un **bono pasivo de Tix/min** al equiparlo.\n` +
              `• **Ítem Equipado:** ${eqTitle}  •  **Ítems en tu Inventario:** \`${inventory.length}\`  •  **Licencia UGC:** ${hasLicense ? `🟢 Activa (\`${myUgcs.length}/2\`)` : '🔒 Bloqueada (`1,200 Tix` en Nivel 6 o Gratis con VIP)'}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(shopSummaryText));

        // 1. Selector para equipar cualquier ítem que el jugador ya tenga
        const uniqueOwnedItems = [];
        const seenItemIds = new Set();
        for (const inv of inventory) {
            if (!seenItemIds.has(String(inv.item_id)) && inv.catalog) {
                seenItemIds.add(String(inv.item_id));
                uniqueOwnedItems.push(inv);
            }
        }

        if (uniqueOwnedItems.length > 0) {
            const selectEquip = new StringSelectMenuBuilder()
                .setCustomId('tycoon_equip_item_select')
                .setPlaceholder(
                    isEn
                        ? '🎩 Equip an item from your inventory...'
                        : '🎩 Equipar un ítem de tu inventario...'
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

        // 2. Selector unificado para comprar ítems en Tix (Tienda Clásica + UGCs de la Comunidad)
        const buyableNormals = normalTixItems.filter(it => !ownedIds.has(String(it.item_id)));
        const buyableUgcs = ugcItems.filter(
            it => String(it.creator_id) !== userId && !ownedIds.has(String(it.item_id))
        );

        if (buyableNormals.length > 0) {
            const selectBuyNormal = new StringSelectMenuBuilder()
                .setCustomId('tycoon_buy_normal_select')
                .setPlaceholder(
                    isEn
                        ? '🎟️ Buy a Classic Item with Tix (+5% to +11%)...'
                        : '🎟️ Comprar un Ítem Clásico con Tix (+5% a +11%)...'
                )
                .addOptions(
                    buyableNormals.map(it => {
                        const iName = isEn ? (it.name_en || it.name) : it.name;
                        return new StringSelectMenuOptionBuilder()
                            .setLabel(`${iName} — ${Number(it.base_price).toLocaleString()} Tix`)
                            .setDescription(
                                isEn
                                    ? `Grants +${it.boost_pct}% Tix/min passive speed`
                                    : `Otorga +${it.boost_pct}% Tix/min de velocidad pasiva`
                            )
                            .setValue(String(it.item_id))
                            .setEmoji(it.icon_emoji || '🛒');
                    })
                );
            container.addActionRowComponents(new ActionRowBuilder().addComponents(selectBuyNormal));
        }

        // 3. Selector para desbloquear Artefactos con Cristales Kortex (💠)
        const buyableCrystals = crystalShopItems.filter(it => !ownedIds.has(String(it.item_id)));
        if (buyableCrystals.length > 0) {
            const selectBuyCrystal = new StringSelectMenuBuilder()
                .setCustomId('tycoon_buy_crystal_select')
                .setPlaceholder(
                    isEn
                        ? '💠 Unlock a Crystal Artifact (+18% to +34% Tix/min)...'
                        : '💠 Desbloquear Artefacto con Cristales Kortex (+18% a +34% Tix/min)...'
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

        // 4. Si hay ítems UGC de la comunidad disponibles, selector para comprarlos
        if (buyableUgcs.length > 0 && uniqueOwnedItems.length === 0) {
            const selectBuyUgc = new StringSelectMenuBuilder()
                .setCustomId('tycoon_buy_ugc_select')
                .setPlaceholder(
                    isEn
                        ? '🎨 Buy a Community [UGC] Item (70% goes to creator)...'
                        : '🎨 Comprar un Ítem [UGC] de la Comunidad (70% al creador)...'
                )
                .addOptions(
                    buyableUgcs.slice(0, 25).map(it =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`${it.name.slice(0, 65)} — ${Number(it.base_price).toLocaleString()} Tix`)
                            .setDescription(
                                isEn
                                    ? `By ${it.creator_name} • +10% Tix/min`
                                    : `Por ${it.creator_name} • +10% Tix/min`
                            )
                            .setValue(String(it.item_id))
                            .setEmoji('🎨')
                    )
                );
            container.addActionRowComponents(new ActionRowBuilder().addComponents(selectBuyUgc));
        }

        container.addSeparatorComponents(separador());

        const shopBtns = [];
        if (!hasLicense) {
            shopBtns.push(
                new ButtonBuilder()
                    .setCustomId('tycoon_unlock_ugc_license')
                    .setLabel(isEn ? 'Unlock UGC License (1,200 Tix / VIP)' : 'Desbloquear Licencia UGC (1,200 Tix / VIP)')
                    .setEmoji('🔓')
                    .setStyle(ButtonStyle.Success)
            );
        }
        shopBtns.push(
            new ButtonBuilder()
                .setCustomId('tycoon_open_ugc_modal')
                .setLabel(
                    isEn
                        ? `Create Custom UGC (${myUgcs.length}/2)`
                        : `Crear Ítem UGC (${myUgcs.length}/2)`
                )
                .setEmoji('🎨')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!hasLicense || myUgcs.length >= 2),
            new ButtonBuilder()
                .setCustomId('tycoon_refresh:sec_shop')
                .setLabel(isEn ? 'Refresh Showcase' : 'Actualizar Vitrina')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary)
        );

        container.addActionRowComponents(new ActionRowBuilder().addComponents(shopBtns));
    }

    // =========================================================================
    // CATEGORÍA 3: COFRES DE ASCENSIÓN, LIMITEDS E INTERCAMBIOS P2P
    // =========================================================================
    else if (normSection === 'sec_vault') {
        const myLimiteds = inventory.filter(
            i => i.catalog && (i.catalog.category === 'LIMITED' || i.catalog.category === 'LIMITED_U')
        );
        const limitedUDrops = [...catalogMap.values()].filter(it => it.category === 'LIMITED_U');

        const myVaultSummary = myLimiteds.length > 0
            ? myLimiteds.slice(0, 5).map(inv => {
                const c = inv.catalog;
                const cName = isEn ? (c.name_en || c.name) : c.name;
                const serialTag = c.category === 'LIMITED_U' && inv.serial_number
                    ? ` **[#${String(inv.serial_number).padStart(2, '0')}/${c.max_supply || 15}]**`
                    : '';
                return `• ${c.icon_emoji} **${cName}**${serialTag} (\`+${c.boost_pct}% Tix/min\`)`;
            }).join('\n')
            : (isEn
                ? '> *You don\'t have any Limited items yet. Open an **Ascension Chest** below to win a guaranteed Limited item!*'
                : '> *Aún no tenés ítems Limited. ¡Abrí un **Cofre de Ascensión** abajo para ganar un ítem Limited garantizado!*');

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
                ? '> *No active P2P trades right now. Use the buttons below to post or send an offer!*'
                : '> *No hay intercambios P2P activos ahora mismo. ¡Usá los botones de abajo para publicar o enviar una oferta!*');

        const vaultText = isEn
            ? `### 👑 Category 3: Ascension Chests, Limiteds & P2P Trading\n` +
              `• **Ascension Chest Keys:** \`🗝️ ${profile.ascension_tokens || 0}\` *(Earned via Rebirth, or open with \`3,500 Tix\`)*\n\n` +
              `**🎒 Your Limited Collection (${myLimiteds.length}):**\n${myVaultSummary}\n\n` +
              `**🤝 Active P2P Trade Board:**\n${tradesLines}`
            : `### 👑 Categoría 3: Cofres de Ascensión, Limiteds e Intercambios\n` +
              `• **Llaves de Cofre de Ascensión:** \`🗝️ ${profile.ascension_tokens || 0}\` *(Se ganan al hacer Rebirth, o abrí un cofre por \`3,500 Tix\`)*\n\n` +
              `**🎒 Tu Colección Limited (${myLimiteds.length}):**\n${myVaultSummary}\n\n` +
              `**🤝 Tablero de Intercambios P2P Activos:**\n${tradesLines}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(vaultText));

        // Selector para reclamar un Drop de Limited U con stock disponible
        const availableDrops = limitedUDrops.filter(d => Number(d.minted_count || 0) < Number(d.max_supply || 15));
        if (availableDrops.length > 0) {
            const selectClaimLimU = new StringSelectMenuBuilder()
                .setCustomId('tycoon_claim_limu_select')
                .setPlaceholder(
                    isEn
                        ? '🔥 Mint a serialized Limited U Drop (#01/Max)...'
                        : '🔥 Reclamar un Drop Limited U con Número de Serie (#01/Máx)...'
                )
                .addOptions(
                    availableDrops.map(d => {
                        const dName = isEn ? (d.name_en || d.name) : d.name;
                        const nextSerial = Number(d.minted_count || 0) + 1;
                        return new StringSelectMenuOptionBuilder()
                            .setLabel(`${dName} (#${String(nextSerial).padStart(2, '0')}/${d.max_supply}) — ${Number(d.base_price).toLocaleString()} Tix`)
                            .setDescription(
                                isEn
                                    ? `+${d.boost_pct}% Tix/min • Serialized Limited U`
                                    : `+${d.boost_pct}% Tix/min • Limited U numerado`
                            )
                            .setValue(String(d.item_id))
                            .setEmoji(d.icon_emoji || '👑');
                    })
                );
            container.addActionRowComponents(new ActionRowBuilder().addComponents(selectClaimLimU));
        }

        // Selector para Aceptar o Cancelar ofertas de Trading P2P activas
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
    // CATEGORÍA 4: MISIONES SEMANALES (CRISTALES 💠), POCIONES Y RANKING
    // =========================================================================
    else if (normSection === 'sec_perks') {
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
            const bar = buildQuestProgressBar(q.current, q.target, 7);
            const qTitle = isEn ? q.title_en : q.title_es;
            const statusBadge = q.claimed
                ? (isEn ? '✅ **[CLAIMED]**' : '✅ **[RECLAMADA]**')
                : (q.completed
                    ? (isEn ? '🎁 **[READY!]**' : '🎁 **[¡LISTA!]**')
                    : `\`${bar}\` (\`${q.current.toLocaleString()}/${q.target.toLocaleString()}\`)`);
            return `• ${q.emoji} **${qTitle}** — ${statusBadge} • **+${q.rewardCrystals} 💠** & **+${q.rewardTix} 🎟️**`;
        }).join('\n');

        const potionStatus = metrics.potionActive
            ? (isEn
                ? `🟢 **Active:** ${metrics.potionInfo?.emoji || '🧪'} **${metrics.potionInfo?.name_en}** (\`+${metrics.potionBonusPct}%\` for \`${metrics.potionRemainingMin}m\` left)`
                : `🟢 **Activa:** ${metrics.potionInfo?.emoji || '🧪'} **${metrics.potionInfo?.name_es}** (\`+${metrics.potionBonusPct}%\` por \`${metrics.potionRemainingMin}m\` restantes)`)
            : (isEn ? '⚪ **No active potion right now**' : '⚪ **Sin poción activa en este momento**');

        const perksText = isEn
            ? `### 💠 Category 4: Weekly Quests (\`${wq.resetDays}d ${wq.resetHours}h\` left), Lab Potions & VIP\n` +
              `${questsLines}\n\n` +
              `• **🧪 Lab Potion Status:** ${potionStatus}\n` +
              `• **💎 Community VIP Perks:** Nitro Boost (\`+50%\`) & YouTube VIP (\`+35%\` + Free Daily Potion)`
            : `### 💠 Categoría 4: Misiones Semanales (\`${wq.resetDays}d ${wq.resetHours}h\` restantes), Pociones y VIP\n` +
              `${questsLines}\n\n` +
              `• **🧪 Estado de Poción:** ${potionStatus}\n` +
              `• **💎 Beneficios VIP de Comunidad:** Nitro Boost (\`+50%\`) y YouTube VIP (\`+35%\` + Poción Diaria Gratis)`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(perksText));
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
                    .setCustomId('tycoon_sync_vip')
                    .setLabel(isEn ? 'Sync VIP Perks' : 'Sincronizar VIP')
                    .setEmoji('💎')
                    .setStyle(ButtonStyle.Success),
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
                ? 'Roblox Tycoon • 4 Symmetrical Categories • /tycoon'
                : 'Roblox Tycoon • 4 Categorías Simétricas • /tycoon'
        )
    ));

    return {
        components: [container],
        files: [attachment],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

/**
 * Construye el Modal del Taller UGC para diseñar y publicar un ítem comunitario.
 */
function construirModalCrearUgc(isEn = false) {
    const modal = new ModalBuilder()
        .setCustomId('tycoon_modal_ugc_create')
        .setTitle(isEn ? '🎨 Create & Publish UGC Item' : '🎨 Crear y Publicar Ítem UGC');

    const inputName = new TextInputBuilder()
        .setCustomId('ugc_name')
        .setLabel(isEn ? 'Item Name (auto-prefixed with [🎨 UGC])' : 'Nombre del Ítem (se añade [🎨 UGC])')
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

    // 1. Apertura de Modales (deben responder con showModal antes de deferUpdate)
    if (cid === 'tycoon_open_ugc_modal' && interaction.isButton()) {
        return await interaction.showModal(construirModalCrearUgc(isEn));
    }

    if ((cid === 'tycoon_open_trade_public_modal' || cid === 'tycoon_open_trade_direct_modal') && interaction.isButton()) {
        const state = await getOrCreatePlayerState(userId);
        const myLimiteds = state.inventory.filter(
            i => i.catalog && (i.catalog.category === 'LIMITED' || i.catalog.category === 'LIMITED_U')
        );
        const mode = cid === 'tycoon_open_trade_direct_modal' ? 'direct' : 'public';
        return await interaction.showModal(construirModalTradeP2P(myLimiteds, mode, isEn));
    }

    await interaction.deferUpdate();

    // 2. Cambio de categoría en el menú desplegable principal
    if (cid === 'tycoon_section_select' && interaction.isStringSelectMenu()) {
        const selectedSection = interaction.values[0] || 'sec_studio';
        const panel = await construirPanelTycoon(interaction.user, selectedSection, null);
        return await interaction.editReply(panel);
    }

    // 3. Botón Actualizar vista de cualquier categoría
    if (cid.startsWith('tycoon_refresh:')) {
        const targetSec = cid.split(':')[1] || 'sec_studio';
        const msg = isEn
            ? '🔄 **View synchronized in real time.**'
            : '🔄 **Vista actualizada en tiempo real.**';
        const panel = await construirPanelTycoon(interaction.user, targetSec, msg);
        return await interaction.editReply(panel);
    }

    // 4. CATEGORÍA 1: Recolectar Pad, Construir Máquina, Racha Diaria, Hacer Rebirth
    if (cid === 'tycoon_collect_pad') {
        const res = await collectPadTix(userId);
        const msg = res.ok
            ? (isEn
                ? `🟢 **Collected \`+${res.collected.toLocaleString()} Tix\`** from your Collector Pad! Wallet: \`${Number(res.state.profile.tix_balance).toLocaleString()} Tix\`.`
                : `🟢 **¡Recolectaste \`+${res.collected.toLocaleString()} Tix\`** de tu Colector Verde! Billetera: \`${Number(res.state.profile.tix_balance).toLocaleString()} Tix\`.`)
            : (isEn
                ? `ℹ️ Your Collector Pad is at \`0 Tix\` right now. Wait a moment while your machines produce more Tix!`
                : `ℹ️ Tu Colector Verde está en \`0 Tix\` ahora mismo. ¡Esperá unos instantes mientras tus máquinas fabrican más Tix!`);
        const panel = await construirPanelTycoon(interaction.user, 'sec_studio', msg);
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
        const panel = await construirPanelTycoon(interaction.user, 'sec_studio', msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_buy_next_pad') {
        const res = await buyNextStudioPad(userId);
        let msg;
        if (res.ok) {
            const pName = isEn ? res.pad.name_en : res.pad.name_es;
            msg = isEn
                ? `🎉 **Machine Built:** ${res.pad.emoji} **${pName}**! Your Studio is now **Stage ${res.state.profile.studio_stage}/6** (\`+${res.pad.tixPerMin} Tix/min\`).`
                : `🎉 **¡Máquina Construida:** ${res.pad.emoji} **${pName}**! Tu Estudio subió a **Nivel ${res.state.profile.studio_stage}/6** (\`+${res.pad.tixPerMin} Tix/min\`).`;
        } else if (res.reason === 'insufficient_tix') {
            const pName = isEn ? res.pad.name_en : res.pad.name_es;
            msg = isEn
                ? `⚠️ You need \`${res.needed.toLocaleString()} Tix\` to build **${pName}** (you have \`${res.balance.toLocaleString()} Tix\`).`
                : `⚠️ Necesitás \`${res.needed.toLocaleString()} Tix\` para construir **${pName}** (tenés \`${res.balance.toLocaleString()} Tix\`).`;
        } else {
            msg = isEn
                ? `✅ All 6 Studio Machines are built! Click **Rebirth** to ascend.`
                : `✅ ¡Ya construiste las 6 Máquinas del Estudio! Tocá **Rebirth** para ascender.`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_studio', msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_rebirth') {
        const res = await performRebirth(userId);
        const msg = res.ok
            ? (isEn
                ? `✨ **REBIRTH #${res.newRebirthCount} COMPLETED!** You gained a permanent **+35% production multiplier**, **+1,500 Collector Cap**, and **+1 Ascension Chest Key (\`🗝️\`)** for Category 3!`
                : `✨ **¡REBIRTH #${res.newRebirthCount} COMPLETADO!** Ganaste **+35% de multiplicador permanente**, **+1,500 de capacidad en Colector** y **+1 Llave de Cofre de Ascensión (\`🗝️\`)** para la Categoría 3.`)
            : (isEn
                ? `⚠️ Build all 6 Studio Machines (Stage 6) before performing a Rebirth.`
                : `⚠️ Necesitás construir las 6 Máquinas del Estudio (Nivel 6) antes de hacer Rebirth.`);
        const panel = await construirPanelTycoon(interaction.user, 'sec_studio', msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_open_quests') {
        const panel = await construirPanelTycoon(interaction.user, 'sec_perks', null);
        return await interaction.editReply(panel);
    }

    // 5. CATEGORÍA 2: Tienda Clásica (Tix), Cristales Kortex (💠), Equipar y Taller UGC
    if (cid === 'tycoon_buy_normal_select' && interaction.isStringSelectMenu()) {
        const itemId = interaction.values[0];
        const res = await buyNormalShopItem(userId, itemId);
        let msg;
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
        const panel = await construirPanelTycoon(interaction.user, 'sec_shop', msg);
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
        const panel = await construirPanelTycoon(interaction.user, 'sec_shop', msg);
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
        const panel = await construirPanelTycoon(interaction.user, 'sec_shop', msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_unlock_ugc_license') {
        const res = await unlockUgcCreatorLicense(userId);
        let msg;
        if (res.ok) {
            msg = res.method === 'vip_free'
                ? (isEn
                    ? `🔓 **UGC Creator License Unlocked for FREE** thanks to your VIP perks!`
                    : `🔓 **¡Licencia de Creador UGC Desbloqueada GRATIS** gracias a tus beneficios VIP!`)
                : (isEn
                    ? `🔓 **UGC Creator License Unlocked** for \`1,200 Tix\`!`
                    : `🔓 **¡Licencia de Creador UGC Desbloqueada** por \`1,200 Tix\`!`);
        } else if (res.reason === 'requires_stage_6') {
            msg = isEn
                ? `🔒 Reach **Studio Stage 6** (or 1 Rebirth) + \`1,200 Tix\`, or sync **VIP Perks** in Category 4 for free access!`
                : `🔒 Necesitás **Estudio Nivel 6** (o 1 Rebirth) + \`1,200 Tix\`, o sincronizar **Beneficios VIP** en la Categoría 4 para acceso gratis.`;
        } else if (res.reason === 'insufficient_tix') {
            msg = isEn
                ? `⚠️ You need \`1,200 Tix\` to unlock the UGC License (you have \`${res.balance.toLocaleString()} Tix\`).`
                : `⚠️ Necesitás \`1,200 Tix\` para desbloquear la Licencia UGC (tenés \`${res.balance.toLocaleString()} Tix\`).`;
        } else {
            msg = isEn ? `✅ Your UGC Creator License is already active.` : `✅ Tu Licencia de Creador UGC ya está activa.`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_shop', msg);
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

        const panel = await construirPanelTycoon(interaction.user, 'sec_shop', msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_buy_ugc_select' && interaction.isStringSelectMenu()) {
        const itemId = interaction.values[0];
        const res = await buyCommunityUgcItem(userId, itemId);
        let msg;
        if (res.ok) {
            msg = isEn
                ? `🛍️ **Bought Community UGC:** ${res.item.icon_emoji} **${res.item.name}** for \`${res.price.toLocaleString()} Tix\`!`
                : `🛍️ **¡Compraste el UGC:** ${res.item.icon_emoji} **${res.item.name}** por \`${res.price.toLocaleString()} Tix\`!`;
        } else {
            msg = isEn
                ? `⚠️ Could not complete UGC purchase (${res.reason}).`
                : `⚠️ No se pudo completar la compra del UGC (${res.reason}).`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_shop', msg);
        return await interaction.editReply(panel);
    }

    // 6. CATEGORÍA 3: Cofres de Ascensión, Limited U e Intercambios P2P
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
        const panel = await construirPanelTycoon(interaction.user, 'sec_vault', msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_claim_limu_select' && interaction.isStringSelectMenu()) {
        const itemId = interaction.values[0];
        const res = await claimLimitedUDrop(userId, itemId);
        let msg;
        if (res.ok) {
            const dName = isEn ? (res.item.name_en || res.item.name) : res.item.name;
            msg = isEn
                ? `👑 **SERIALIZED LIMITED U MINTED!** You claimed ${res.item.icon_emoji} **${dName} [#${String(res.serialNumber).padStart(2, '0')}/${res.maxSupply}]** (\`+${res.item.boost_pct}% Tix/min\`)!`
                : `👑 **¡LIMITED U NUMERADO ACUÑADO!** Reclamaste ${res.item.icon_emoji} **${dName} [#${String(res.serialNumber).padStart(2, '0')}/${res.maxSupply}]** (\`+${res.item.boost_pct}% Tix/min\`)!`;
        } else if (res.reason === 'sold_out') {
            msg = isEn
                ? `🔴 **SOLD OUT!** All global copies have been claimed. Acquire it via P2P Trading!`
                : `🔴 **¡AGOTADO!** Todas las copias globales ya fueron reclamadas. ¡Conseguilo por Intercambio P2P!`;
        } else if (res.reason === 'insufficient_tix') {
            msg = isEn
                ? `⚠️ You need \`${res.cost.toLocaleString()} Tix\` to claim this Limited U Drop.`
                : `⚠️ Necesitás \`${res.cost.toLocaleString()} Tix\` para reclamar este Drop Limited U.`;
        } else {
            msg = isEn ? `⚠️ Could not claim Limited U drop.` : `⚠️ No se pudo reclamar el Drop Limited U.`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_vault', msg);
        return await interaction.editReply(panel);
    }

    if ((cid === 'tycoon_modal_trade_public' || cid === 'tycoon_modal_trade_direct') && interaction.isModalSubmit()) {
        const isDirect = cid === 'tycoon_modal_trade_direct';
        const targetUser = isDirect ? interaction.fields.getTextInputValue('trade_target_user').trim() : 'PUBLIC';
        const rawOfferItem = interaction.fields.getTextInputValue('trade_offer_item').trim();
        const rawOfferTix = interaction.fields.getTextInputValue('trade_offer_tix').trim();
        const rawRequestTix = interaction.fields.getTextInputValue('trade_request_tix').trim();
        const rawRequestItem = interaction.fields.getTextInputValue('trade_request_item')?.trim() || '';

        const state = await getOrCreatePlayerState(userId);
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
            const panel = await construirPanelTycoon(interaction.user, 'sec_vault', msg);
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

        const panel = await construirPanelTycoon(interaction.user, 'sec_vault', msg);
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
        const panel = await construirPanelTycoon(interaction.user, 'sec_vault', msg);
        return await interaction.editReply(panel);
    }

    // 7. CATEGORÍA 4: Reclamar Misiones Semanales (Cristales 💠), Pociones y Beneficios VIP
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
        const panel = await construirPanelTycoon(interaction.user, 'sec_perks', msg);
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
        const panel = await construirPanelTycoon(interaction.user, 'sec_perks', msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_sync_vip') {
        const res = await syncCommunityPerks(interaction);
        const perksUnlocked = [];
        if (res.detectedNitro) perksUnlocked.push('💎 Discord Nitro Boost (+50%)');
        if (res.detectedYt) perksUnlocked.push('▶️ YouTube VIP (+35%)');
        if (res.grantedTopHat) perksUnlocked.push(isEn ? '🎩 Neon Booster Top Hat' : '🎩 Sombrero Neón Booster');
        if (res.grantedDailyPotion) perksUnlocked.push(isEn ? '🧪 Free Daily Speed Potion' : '🧪 Poción Diaria Gratis');

        const msg = isEn
            ? `🌟 **VIP Perks Synchronized!** Active: ${perksUnlocked.join(' • ')} + **Free UGC License**!`
            : `🌟 **¡Beneficios VIP Sincronizados!** Activos: ${perksUnlocked.join(' • ')} + **Licencia UGC Gratis**!`;

        const panel = await construirPanelTycoon(interaction.user, 'sec_perks', msg);
        return await interaction.editReply(panel);
    }
}

module.exports = {
    construirPanelTycoon,
    handleTycoonInteraction
};
