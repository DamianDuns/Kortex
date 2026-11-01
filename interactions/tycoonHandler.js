// ==========================================
// ARCHIVO: interactions/tycoonHandler.js
// Constructor de Paneles Components V2 y Manejador de Interacciones de /tycoon
// Soporta Español ('es') e Inglés ('en') dinámicamente
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
const { renderTycoonSnapshot } = require('../utils/tycoonRenderer');
const {
    STUDIO_PADS,
    POTIONS_CATALOG,
    getCatalogItems,
    getOrCreatePlayerState,
    collectPadTix,
    buyNextStudioPad,
    performRebirth,
    buyNormalShopItem,
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

/**
 * Construye el selector principal de las 5 secciones de /tycoon.
 */
function buildSectionSelectMenu(activeSection = 'sec_studio', isEn = false) {
    return new StringSelectMenuBuilder()
        .setCustomId('tycoon_section_select')
        .setPlaceholder(
            isEn
                ? '🏭 Choose a /tycoon section...'
                : '🏭 Elegí una sección de /tycoon...'
        )
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? '1. My Tycoon Studio & Collector' : '1. Mi Estudio Tycoon y Colector')
                .setDescription(
                    isEn
                        ? '3rd-person Studio view, Collector Pad, Purchase Pads & Rebirth'
                        : 'Vista 3ra persona del Estudio, Colector de Tix, Pads y Rebirth'
                )
                .setValue('sec_studio')
                .setEmoji('🏗️')
                .setDefault(activeSection === 'sec_studio'),
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? '2. Normal Shop & Equipment' : '2. Tienda Normal y Equipamiento')
                .setDescription(
                    isEn
                        ? 'Buy classic Roblox items (+5% to +12%) and equip your gear'
                        : 'Comprá ítems clásicos (+5% a +12%) y equipalos en tu avatar'
                )
                .setValue('sec_shop')
                .setEmoji('🛒')
                .setDefault(activeSection === 'sec_shop'),
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? '3. UGC Workshop & Marketplace' : '3. Taller y Mercado UGC')
                .setDescription(
                    isEn
                        ? 'Create custom [🎨 UGC] items (70% royalties) or buy from players'
                        : 'Creá tus propios ítems [🎨 UGC] (70% regalías) o comprá a otros'
                )
                .setValue('sec_ugc')
                .setEmoji('🎨')
                .setDefault(activeSection === 'sec_ugc'),
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? '4. Limited / Limited U Vault & P2P Trading' : '4. Bóveda Limited / Limited U y Trading P2P')
                .setDescription(
                    isEn
                        ? 'Ascension Chests, Serialized Limited U (#01/15), Public & Direct Trades'
                        : 'Cofres de Ascensión, Limited U seriados (#01/15), Tablero y Trade Directo'
                )
                .setValue('sec_vault')
                .setEmoji('👑')
                .setDefault(activeSection === 'sec_vault'),
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? '5. Potions & Community VIP Perks' : '5. Pociones y Beneficios VIP de Comunidad')
                .setDescription(
                    isEn
                        ? 'Speed Potions (30m), Discord Nitro Boost (+50%) & YouTube VIP (+35%)'
                        : 'Pociones de 30m, Discord Nitro Boost (+50%) y YouTube VIP (+35%)'
                )
                .setValue('sec_perks')
                .setEmoji('🧪')
                .setDefault(activeSection === 'sec_perks')
        ]);
}

/**
 * Construye el panel completo de /tycoon para la sección seleccionada.
 */
async function construirPanelTycoon(user, activeSection = 'sec_studio', feedbackMsg = null) {
    const userId = String(user.id);
    const lang = obtenerIdiomaUsuario(userId);
    const isEn = lang === 'en';

    const ownerCfg = obtenerConfigPropietario();
    if (ownerCfg.tycoonEnabled === false) {
        return construirPanelAvisoModeracion({
            titulo: isEn ? '⏸️ /tycoon Temporarily Paused' : '⏸️ /tycoon Pausado Temporalmente',
            descripcion: isEn
                ? 'The bot owner temporarily paused the **/tycoon** module from `/config`. Please try again soon.'
                : 'El propietario del bot pausó temporalmente el módulo **/tycoon** desde `/config`. Intentá nuevamente en unos minutos.'
        });
    }

    const [state, linkedRoblox] = await Promise.all([
        getOrCreatePlayerState(userId),
        obtenerCuentaVinculada(userId).catch(() => null)
    ]);

    const { profile, inventory, totalRap, equippedItem, metrics, catalogMap } = state;
    const displayUsername = linkedRoblox?.roblox_username || user.username || 'Player';
    const avatarUrl = linkedRoblox?.avatar_url || linkedRoblox?.avatar_full_url || null;

    // Renderizar el lienzo en 3ra persona (tycoon_snapshot.png)
    const pngBuffer = await renderTycoonSnapshot({
        state,
        username: displayUsername,
        avatarUrl,
        lang
    });
    const attachment = new AttachmentBuilder(pngBuffer, { name: 'tycoon_snapshot.png' });

    const accentColors = {
        sec_studio: 0x22C55E,
        sec_shop: 0x38BDF8,
        sec_ugc: 0x8B5CF6,
        sec_vault: 0xF59E0B,
        sec_perks: 0xEC4899
    };
    const container = new ContainerBuilder().setAccentColor(accentColors[activeSection] || COLORES.primario);

    // Encabezado superior con resumen de billetera y feedback si existe
    const eqTitle = equippedItem
        ? `${equippedItem.icon_emoji || '🎩'} **${isEn ? (equippedItem.name_en || equippedItem.name) : equippedItem.name}** (\`+${equippedItem.boost_pct}%\`)`
        : (isEn ? '`None`' : '`Ninguno`');

    const headerBanner =
        (isEn
            ? `# 🏭 Roblox Tycoon Studio — @${displayUsername}\n` +
              `🎟️ **Tix:** \`${Number(profile.tix_balance || 0).toLocaleString()}\`  •  ` +
              `🟢 **Collector:** \`${Number(profile.collector_tix || 0).toLocaleString()}/${Number(profile.collector_cap || 500).toLocaleString()}\`  •  ` +
              `⚡ **Speed:** \`+${metrics.effectiveTixPerMin}/min (x${metrics.multiplier})\`  •  ` +
              `💎 **RAP:** \`${Number(totalRap || 0).toLocaleString()}\``
            : `# 🏭 Estudio Roblox Tycoon — @${displayUsername}\n` +
              `🎟️ **Tix:** \`${Number(profile.tix_balance || 0).toLocaleString()}\`  •  ` +
              `🟢 **Colector:** \`${Number(profile.collector_tix || 0).toLocaleString()}/${Number(profile.collector_cap || 500).toLocaleString()}\`  •  ` +
              `⚡ **Producción:** \`+${metrics.effectiveTixPerMin}/min (x${metrics.multiplier})\`  •  ` +
              `💎 **RAP:** \`${Number(totalRap || 0).toLocaleString()}\``) +
        (feedbackMsg ? `\n\n> ${feedbackMsg}` : '');

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerBanner));

    // Galería con la vista en 3ra persona del Estudio Tycoon
    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://tycoon_snapshot.png')
        )
    );

    // Selector de las 5 secciones
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(buildSectionSelectMenu(activeSection, isEn))
    );
    container.addSeparatorComponents(separador(true));

    // =========================================================================
    // SECCIÓN 1: MI ESTUDIO TYCOON Y COLECTOR DE TIX
    // =========================================================================
    if (activeSection === 'sec_studio') {
        const unlockedSet = new Set(metrics.unlockedPads);
        const padsLines = STUDIO_PADS.map(p => {
            const built = unlockedSet.has(p.id);
            const pName = isEn ? p.name_en : p.name_es;
            if (built) {
                return `✅ **${p.emoji} ${pName}** — \`+${p.tixPerMin} Tix/min\``;
            }
            const isNext = metrics.nextPad && metrics.nextPad.id === p.id;
            return `${isNext ? '🟡' : '🔒'} **${p.emoji} ${pName}** — ${isEn ? 'Cost:' : 'Costo:'} \`${p.cost.toLocaleString()} Tix\` (\`+${p.tixPerMin} Tix/min\`)`;
        }).join('\n');

        const bonusBreakdown = [];
        if (metrics.rebirthBonusPct > 0) bonusBreakdown.push(`✨ Rebirth x${profile.rebirth_count}: \`+${metrics.rebirthBonusPct}%\``);
        if (metrics.equippedBonusPct > 0) bonusBreakdown.push(`🎩 ${isEn ? 'Equipped' : 'Equipado'}: \`+${metrics.equippedBonusPct}%\``);
        if (metrics.potionActive) bonusBreakdown.push(`🧪 ${isEn ? 'Potion' : 'Poción'} (${metrics.potionRemainingMin}m): \`+${metrics.potionBonusPct}%\``);
        if (metrics.nitroBonusPct > 0) bonusBreakdown.push(`💎 Nitro Boost: \`+50%\``);
        if (metrics.ytBonusPct > 0) bonusBreakdown.push(`▶️ YouTube VIP: \`+35%\``);

        const studioText = isEn
            ? `### 🏗️ Studio Progress (Stage \`${profile.studio_stage || 1}/6\` • Rebirths: \`${profile.rebirth_count || 0}\`)\n` +
              `• **Equipped Accessory:** ${eqTitle}\n` +
              `• **Active Multipliers:** ${bonusBreakdown.length > 0 ? bonusBreakdown.join(' • ') : '`Base x1.00`'}\n\n` +
              `**🔧 Purchase Pads & Machines:**\n${padsLines}`
            : `### 🏗️ Progreso del Estudio (Nivel \`${profile.studio_stage || 1}/6\` • Rebirths: \`${profile.rebirth_count || 0}\`)\n` +
              `• **Accesorio Equipado:** ${eqTitle}\n` +
              `• **Multiplicadores Activos:** ${bonusBreakdown.length > 0 ? bonusBreakdown.join(' • ') : '`Base x1.00`'}\n\n` +
              `**🔧 Pads de Construcción y Máquinas:**\n${padsLines}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(studioText));
        container.addSeparatorComponents(separador());

        const collectorTix = Number(profile.collector_tix || 0);
        const btnCollect = new ButtonBuilder()
            .setCustomId('tycoon_collect_pad')
            .setLabel(
                isEn
                    ? `Collect Pad (${collectorTix.toLocaleString()} Tix)`
                    : `Recolectar Pad (${collectorTix.toLocaleString()} Tix)`
            )
            .setEmoji('🟢')
            .setStyle(ButtonStyle.Success);

        const nextPad = metrics.nextPad;
        const btnBuyPad = new ButtonBuilder()
            .setCustomId('tycoon_buy_next_pad')
            .setLabel(
                nextPad
                    ? (isEn
                        ? `Buy: ${nextPad.name_en} (${nextPad.cost.toLocaleString()} Tix)`
                        : `Comprar: ${nextPad.name_es} (${nextPad.cost.toLocaleString()} Tix)`)
                    : (isEn ? 'All 6 Pads Built!' : '¡6/6 Pads Construidos!')
            )
            .setEmoji('🟡')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!nextPad);

        const btnRebirth = new ButtonBuilder()
            .setCustomId('tycoon_rebirth')
            .setLabel(isEn ? 'Rebirth (+35% & Chest Key)' : 'Hacer Rebirth (+35% y Llave)')
            .setEmoji('✨')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!metrics.allPadsUnlocked);

        const btnRefresh = new ButtonBuilder()
            .setCustomId('tycoon_refresh:sec_studio')
            .setLabel(isEn ? 'Refresh' : 'Actualizar')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary);

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(btnCollect, btnBuyPad, btnRebirth, btnRefresh)
        );
    }

    // =========================================================================
    // SECCIÓN 2: TIENDA NORMAL Y EQUIPAMIENTO
    // =========================================================================
    else if (activeSection === 'sec_shop') {
        const normalItems = [...catalogMap.values()].filter(
            it => it.category === 'NORMAL' && Number(it.base_price) > 0
        );
        const ownedIds = new Set(inventory.map(i => String(i.item_id)));

        const shopLines = normalItems.map(it => {
            const owned = ownedIds.has(String(it.item_id));
            const isEquipped = String(profile.equipped_item_id) === String(it.item_id);
            const itemName = isEn ? (it.name_en || it.name) : it.name;
            const statusTag = isEquipped
                ? (isEn ? '🟢 **[EQUIPPED]**' : '🟢 **[EQUIPADO]**')
                : (owned ? (isEn ? '✅ **[OWNED]**' : '✅ **[COMPRADO]**') : `🎟️ \`${Number(it.base_price).toLocaleString()} Tix\``);
            return `• ${it.icon_emoji} **${itemName}** (\`+${it.boost_pct}% Tix/min\`) — ${statusTag}`;
        }).join('\n');

        const shopText = isEn
            ? `### 🛒 Classic Roblox Shop & Gear\n` +
              `Standard catalog items have fixed prices, never run out of stock, and boost your passive Tix production.\n` +
              `• **Currently Equipped:** ${eqTitle}\n\n` +
              `${shopLines}`
            : `### 🛒 Tienda Normal y Equipamiento\n` +
              `Los ítems de tienda tienen precio fijo en Tix, stock infinito y aumentan tu producción pasiva.\n` +
              `• **Equipado Actualmente:** ${eqTitle}\n\n` +
              `${shopLines}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(shopText));

        // Selector para comprar ítems normales no adquiridos aún
        const buyableNormals = normalItems.filter(it => !ownedIds.has(String(it.item_id)));
        if (buyableNormals.length > 0) {
            const selectBuyNormal = new StringSelectMenuBuilder()
                .setCustomId('tycoon_buy_normal_select')
                .setPlaceholder(
                    isEn
                        ? '🛒 Select a Normal Shop item to buy...'
                        : '🛒 Elegí un ítem de la Tienda Normal para comprar...'
                )
                .addOptions(
                    buyableNormals.map(it => {
                        const iName = isEn ? (it.name_en || it.name) : it.name;
                        return new StringSelectMenuOptionBuilder()
                            .setLabel(`${iName} — ${Number(it.base_price).toLocaleString()} Tix`)
                            .setDescription(
                                isEn
                                    ? `+${it.boost_pct}% Tix/min passive boost • Non-tradeable`
                                    : `Bono pasivo de +${it.boost_pct}% Tix/min • No tradeable`
                            )
                            .setValue(String(it.item_id))
                            .setEmoji(it.icon_emoji || '🛒');
                    })
                );
            container.addActionRowComponents(new ActionRowBuilder().addComponents(selectBuyNormal));
        }

        // Selector para equipar cualquier ítem del inventario del jugador (Normal, UGC, Limited, Limited U)
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
                        ? '🎩 Select an owned item from your inventory to equip...'
                        : '🎩 Elegí un ítem de tu inventario para equipar en tu avatar...'
                )
                .addOptions(
                    uniqueOwnedItems.slice(0, 25).map(inv => {
                        const c = inv.catalog;
                        const cName = isEn ? (c.name_en || c.name) : c.name;
                        const isEq = String(profile.equipped_item_id) === String(c.item_id);
                        return new StringSelectMenuOptionBuilder()
                            .setLabel(`${cName.slice(0, 75)} (+${c.boost_pct}%)`)
                            .setDescription(
                                isEn
                                    ? `Category: ${c.category} ${isEq ? '• Currently Equipped' : '• Click to equip'}`
                                    : `Categoría: ${c.category} ${isEq ? '• Equipado actualmente' : '• Tocar para equipar'}`
                            )
                            .setValue(String(c.item_id))
                            .setEmoji(c.icon_emoji || '🎩')
                            .setDefault(isEq);
                    })
                );
            container.addActionRowComponents(new ActionRowBuilder().addComponents(selectEquip));
        }
    }

    // =========================================================================
    // SECCIÓN 3: TALLER Y MERCADO UGC (CON REGLAS ANTI-ABUSO)
    // =========================================================================
    else if (activeSection === 'sec_ugc') {
        const allCatalog = [...catalogMap.values()];
        const ugcItems = allCatalog
            .filter(it => it.category === 'UGC')
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const myUgcs = ugcItems.filter(it => String(it.creator_id) === userId);
        const hasLicense = Boolean(profile.ugc_license_unlocked || profile.vip_nitro_boost || profile.vip_yt_sub);

        const licenseStatus = hasLicense
            ? (isEn
                ? `🟢 **Unlocked** (Your UGCs: \`${myUgcs.length}/2\`)`
                : `🟢 **Desbloqueada** (Tus UGCs activos: \`${myUgcs.length}/2\`)`)
            : (isEn
                ? `🔒 **Locked** — Free with Discord Nitro Boost / YouTube VIP, or unlock at **Studio Stage 6** for \`1,200 Tix\`.`
                : `🔒 **Bloqueada** — Gratis con Discord Nitro Boost / YouTube VIP, o desbloqueable en **Estudio Nivel 6** por \`1,200 Tix\`.`);

        const ugcListLines = ugcItems.length > 0
            ? ugcItems.slice(0, 8).map(it => {
                const isMine = String(it.creator_id) === userId;
                return `• ${it.icon_emoji || '🎨'} **${it.name}** — \`${Number(it.base_price).toLocaleString()} Tix\` (\`+10% Tix/min\`) • ${isEn ? 'By' : 'Por'} **${it.creator_name}** • ${isEn ? 'Sales:' : 'Ventas:'} \`${it.sales_count || 0}\` ${isMine ? (isEn ? '*(Yours)*' : '*(Tuyo)*') : ''}`;
            }).join('\n')
            : (isEn
                ? '> *No community UGC items published yet. Be the first creator to publish one!*'
                : '> *Aún no hay ítems UGC publicados. ¡Sé el primer creador en diseñar y publicar uno!*');

        const ugcContent = isEn
            ? `### 🎨 UGC Workshop & Community Marketplace\n` +
              `• **Creator License:** ${licenseStatus}\n` +
              `• **Economy Rules:** Price \`200–1,500 Tix\` • Publishing deposit \`250 Tix\` • Fixed \`+10%\` bonus • **70% Royalty** to creator / **30% Tax Burned** • Buyer needs Stage 4+ (max 1 copy, no self-buy).\n\n` +
              `**🛍️ Active Community UGC Catalog:**\n${ugcListLines}`
            : `### 🎨 Taller de Creación y Mercado UGC\n` +
              `• **Licencia de Creador:** ${licenseStatus}\n` +
              `• **Reglas de Economía:** Precio \`200–1,500 Tix\` • Depósito \`250 Tix\` • Bono fijo \`+10%\` • **70% Regalía** al autor / **30% Impuesto quemado** • Comprador requiere Nivel 4+ (máx. 1 copia, sin auto-compra).\n\n` +
              `**🛍️ Catálogo UGC de la Comunidad:**\n${ugcListLines}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(ugcContent));

        // Selector para comprar UGCs de otros usuarios
        const ownedSet = new Set(inventory.map(i => String(i.item_id)));
        const buyableUgcs = ugcItems.filter(
            it => String(it.creator_id) !== userId && !ownedSet.has(String(it.item_id))
        );

        if (buyableUgcs.length > 0) {
            const selectBuyUgc = new StringSelectMenuBuilder()
                .setCustomId('tycoon_buy_ugc_select')
                .setPlaceholder(
                    isEn
                        ? '🛍️ Select a community [🎨 UGC] item to buy (70% goes to creator)...'
                        : '🛍️ Elegí un ítem [🎨 UGC] de la comunidad para comprar...'
                )
                .addOptions(
                    buyableUgcs.slice(0, 25).map(it =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`${it.name.slice(0, 65)} — ${Number(it.base_price).toLocaleString()} Tix`)
                            .setDescription(
                                isEn
                                    ? `By ${it.creator_name} • +10% Tix/min • 70% creator royalty`
                                    : `Por ${it.creator_name} • +10% Tix/min • 70% regalía al creador`
                            )
                            .setValue(String(it.item_id))
                            .setEmoji('🎨')
                    )
                );
            container.addActionRowComponents(new ActionRowBuilder().addComponents(selectBuyUgc));
        }

        container.addSeparatorComponents(separador());

        const ugcButtons = [];
        if (!hasLicense) {
            ugcButtons.push(
                new ButtonBuilder()
                    .setCustomId('tycoon_unlock_ugc_license')
                    .setLabel(isEn ? 'Unlock UGC License (1,200 Tix / VIP)' : 'Desbloquear Licencia UGC (1,200 Tix / VIP)')
                    .setEmoji('🔓')
                    .setStyle(ButtonStyle.Success)
            );
        }

        ugcButtons.push(
            new ButtonBuilder()
                .setCustomId('tycoon_open_ugc_modal')
                .setLabel(
                    isEn
                        ? `Create & Publish UGC (${myUgcs.length}/2)`
                        : `Crear y Publicar UGC (${myUgcs.length}/2)`
                )
                .setEmoji('🎨')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!hasLicense || myUgcs.length >= 2),
            new ButtonBuilder()
                .setCustomId('tycoon_refresh:sec_ugc')
                .setLabel(isEn ? 'Refresh Market' : 'Actualizar Mercado')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary)
        );

        container.addActionRowComponents(new ActionRowBuilder().addComponents(ugcButtons));
    }

    // =========================================================================
    // SECCIÓN 4: BÓVEDA LIMITED / LIMITED U Y TRADING P2P
    // =========================================================================
    else if (activeSection === 'sec_vault') {
        const myLimiteds = inventory.filter(
            i => i.catalog && (i.catalog.category === 'LIMITED' || i.catalog.category === 'LIMITED_U')
        );
        const limitedUDrops = [...catalogMap.values()].filter(it => it.category === 'LIMITED_U');
        const { trades: activeTrades } = await getActiveTrades(userId);

        const myVaultLines = myLimiteds.length > 0
            ? myLimiteds.slice(0, 8).map(inv => {
                const c = inv.catalog;
                const cName = isEn ? (c.name_en || c.name) : c.name;
                const serialTag = c.category === 'LIMITED_U' && inv.serial_number
                    ? ` **[#${String(inv.serial_number).padStart(2, '0')}/${c.max_supply || 15}]**`
                    : '';
                return `• ${c.icon_emoji} **${cName}**${serialTag} (\`${c.category}\`) — 💎 RAP: \`${Number(inv.rap).toLocaleString()}\` • \`+${c.boost_pct}% Tix/min\``;
            }).join('\n')
            : (isEn
                ? '> *Your Limited Vault is empty. Open an Ascension Chest or claim a Limited U drop below!*'
                : '> *Tu Bóveda Limited está vacía. ¡Abrí un Cofre de Ascensión o reclamá un Drop Limited U abajo!*');

        const dropsLines = limitedUDrops.map(d => {
            const dName = isEn ? (d.name_en || d.name) : d.name;
            const minted = Number(d.minted_count || 0);
            const maxS = Number(d.max_supply || 15);
            const rem = Math.max(0, maxS - minted);
            return `• ${d.icon_emoji} **${dName}** — ${isEn ? 'Stock:' : 'Copias:'} \`#${minted}/${maxS}\` (${rem > 0 ? `🟢 ${rem} ${isEn ? 'left' : 'disponibles'}` : '🔴 SOLD OUT'}) • \`${Number(d.base_price).toLocaleString()} Tix\` • 💎 RAP: \`${Number(d.current_rap).toLocaleString()}\``;
        }).join('\n');

        const tradesLines = activeTrades.length > 0
            ? activeTrades.slice(0, 6).map(tr => {
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
                const scopeBadge = tr.receiver_id === 'PUBLIC'
                    ? (isEn ? '🌐 [PUBLIC]' : '🌐 [PÚBLICO]')
                    : `🎯 [-> <@${tr.receiver_id}>]`;
                return `• \`${tr.trade_id}\` ${scopeBadge} **${tr.sender_name}** ${isEn ? 'offers' : 'ofrece'} **${sItems}**${tixOff} ⇄ ${isEn ? 'wants' : 'pide'} **${reqText}**`;
            }).join('\n')
            : (isEn
                ? '> *No active P2P trade offers right now. Post an offer on the Public Board or send a Direct Trade!*'
                : '> *No hay ofertas P2P activas en este momento. ¡Publicá una en el Tablero Público o enviá un Trade Directo!*');

        const vaultText = isEn
            ? `### 👑 Limited / Limited U Vault & P2P Trading\n` +
              `• **Your Total RAP:** \`💎 ${Number(totalRap || 0).toLocaleString()} RAP\`  •  **Ascension Chest Keys:** \`🗝️ ${profile.ascension_tokens || 0}\`\n\n` +
              `**🎒 Your Limited & Limited U Vault (${myLimiteds.length}):**\n${myVaultLines}\n\n` +
              `**🔥 Global Serialized Limited U Drops:**\n${dropsLines}\n\n` +
              `**🤝 P2P Trade Board (Public & Direct Offers):**\n${tradesLines}`
            : `### 👑 Bóveda Limited / Limited U y Trading P2P\n` +
              `• **Tu RAP Total:** \`💎 ${Number(totalRap || 0).toLocaleString()} RAP\`  •  **Llaves de Cofre de Ascensión:** \`🗝️ ${profile.ascension_tokens || 0}\`\n\n` +
              `**🎒 Tu Bóveda Personal Limited / Limited U (${myLimiteds.length}):**\n${myVaultLines}\n\n` +
              `**🔥 Drops Globales de Limited U (Con Número de Serie):**\n${dropsLines}\n\n` +
              `**🤝 Tablero de Trading P2P (Ofertas Públicas y Directas):**\n${tradesLines}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(vaultText));

        // Selector para reclamar un Drop de Limited U con stock disponible
        const availableDrops = limitedUDrops.filter(d => Number(d.minted_count || 0) < Number(d.max_supply || 15));
        if (availableDrops.length > 0) {
            const selectClaimLimU = new StringSelectMenuBuilder()
                .setCustomId('tycoon_claim_limu_select')
                .setPlaceholder(
                    isEn
                        ? '🔥 Mint a serialized Limited U Drop (#01/Max)...'
                        : '🔥 Reclamar/Acuñar un Drop Limited U con Número de Serie (#01/Máx)...'
                )
                .addOptions(
                    availableDrops.map(d => {
                        const dName = isEn ? (d.name_en || d.name) : d.name;
                        const nextSerial = Number(d.minted_count || 0) + 1;
                        return new StringSelectMenuOptionBuilder()
                            .setLabel(`${dName} (#${String(nextSerial).padStart(2, '0')}/${d.max_supply}) — ${Number(d.base_price).toLocaleString()} Tix`)
                            .setDescription(
                                isEn
                                    ? `+${d.boost_pct}% Tix/min • RAP: ${Number(d.current_rap).toLocaleString()} • Serialized Limited U`
                                    : `+${d.boost_pct}% Tix/min • RAP: ${Number(d.current_rap).toLocaleString()} • Limited U numerado`
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
                            : '🤝 Aceptar o cancelar una oferta activa de Trading P2P...'
                    )
                    .addOptions(tradeOptions.slice(0, 25));
                container.addActionRowComponents(new ActionRowBuilder().addComponents(selectTradeAction));
            }
        }

        container.addSeparatorComponents(separador());

        const chestLabel = Number(profile.ascension_tokens || 0) > 0
            ? (isEn ? `Open Ascension Chest (1 Key)` : `Abrir Cofre Ascensión (1 Llave)`)
            : (isEn ? `Open Ascension Chest (3,500 Tix)` : `Abrir Cofre Ascensión (3,500 Tix)`);

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
    // SECCIÓN 5: POCIONES Y BENEFICIOS VIP DE COMUNIDAD
    // =========================================================================
    else if (activeSection === 'sec_perks') {
        const potionStatus = metrics.potionActive
            ? (isEn
                ? `🟢 **Active:** ${metrics.potionInfo?.emoji || '🧪'} **${metrics.potionInfo?.name_en}** (\`+${metrics.potionBonusPct}%\` for \`${metrics.potionRemainingMin} min\` left)`
                : `🟢 **Activa:** ${metrics.potionInfo?.emoji || '🧪'} **${metrics.potionInfo?.name_es}** (\`+${metrics.potionBonusPct}%\` durante \`${metrics.potionRemainingMin} min\` restantes)`)
            : (isEn ? '⚪ **No active potion right now**' : '⚪ **Sin poción activa en este momento**');

        const nitroStatus = profile.vip_nitro_boost
            ? (isEn
                ? '🟢 **Active (+50% Tix/min + Neon Booster Top Hat + Free UGC License)**'
                : '🟢 **Activo (+50% Tix/min + Sombrero Neón Booster + Licencia UGC Gratis)**')
            : (isEn
                ? '⚪ **Not synced yet** — Click **Sync VIP Perks** below!'
                : '⚪ **Sin sincronizar aún** — ¡Tocá **Sincronizar Beneficios VIP** abajo!');

        const ytStatus = profile.vip_yt_sub
            ? (isEn
                ? '🟢 **Active (+35% Tix/min + 1 Free Daily Speed Potion + Free UGC License)**'
                : '🟢 **Activo (+35% Tix/min + 1 Poción Diaria Gratis + Licencia UGC Gratis)**')
            : (isEn
                ? '⚪ **Not synced yet** — Click **Sync VIP Perks** below!'
                : '⚪ **Sin sincronizar aún** — ¡Tocá **Sincronizar Beneficios VIP** abajo!');

        const perksText = isEn
            ? `### 🧪 Consumable Potions & Community VIP Perks\n` +
              `• **Current Potion Status:** ${potionStatus}\n\n` +
              `**⚗️ Laboratory Potions (Stack time if already active):**\n` +
              `• 🧪 **Speed Potion (+50% for 30 min)** — Cost: \`450 Tix\`\n` +
              `• ⚗️ **Mega Production Elixir (+100% for 30 min)** — Cost: \`850 Tix\`\n\n` +
              `**💎 Community Support Rewards:**\n` +
              `• **🚀 Discord Server Booster:** ${nitroStatus}\n` +
              `• **▶️ YouTube Subscriber / Member:** ${ytStatus}`
            : `### 🧪 Pociones Consumibles y Beneficios VIP de Comunidad\n` +
              `• **Estado de Poción Actual:** ${potionStatus}\n\n` +
              `**⚗️ Laboratorio de Pociones (Acumulan tiempo si ya tenés una activa):**\n` +
              `• 🧪 **Poción de Velocidad (+50% por 30 min)** — Costo: \`450 Tix\`\n` +
              `• ⚗️ **Elixir de Mega Producción (+100% por 30 min)** — Costo: \`850 Tix\`\n\n` +
              `**💎 Recompensas por Apoyar a la Comunidad:**\n` +
              `• **🚀 Discord Server Booster:** ${nitroStatus}\n` +
              `• **▶️ Suscriptor / Miembro de YouTube:** ${ytStatus}`;

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(perksText));
        container.addSeparatorComponents(separador());

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
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
                    .setLabel(isEn ? 'Sync VIP Perks & Daily Gift' : 'Sincronizar Beneficios VIP')
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
                ? 'Roblox Tycoon Ecosystem • /tycoon (100% independent from /roblox tools)'
                : 'Ecosistema Roblox Tycoon • /tycoon (100% independiente de /roblox)'
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

    // 2. Cambio de sección en el menú desplegable principal
    if (cid === 'tycoon_section_select' && interaction.isStringSelectMenu()) {
        const selectedSection = interaction.values[0] || 'sec_studio';
        const panel = await construirPanelTycoon(interaction.user, selectedSection, null);
        return await interaction.editReply(panel);
    }

    // 3. Botón Actualizar vista de cualquier sección
    if (cid.startsWith('tycoon_refresh:')) {
        const targetSec = cid.split(':')[1] || 'sec_studio';
        const msg = isEn
            ? '🔄 **Studio and Collector Pad synchronized in real time.**'
            : '🔄 **Estudio y Colector de Tix sincronizados en tiempo real.**';
        const panel = await construirPanelTycoon(interaction.user, targetSec, msg);
        return await interaction.editReply(panel);
    }

    // 4. SECCIÓN 1: Recolectar Pad, Comprar Pad, Hacer Rebirth
    if (cid === 'tycoon_collect_pad') {
        const res = await collectPadTix(userId);
        const msg = res.ok
            ? (isEn
                ? `🟢 **Collected \`+${res.collected.toLocaleString()} Tix\`** from your green Collector Pad! New wallet balance: \`${Number(res.state.profile.tix_balance).toLocaleString()} Tix\`.`
                : `🟢 **¡Recolectaste \`+${res.collected.toLocaleString()} Tix\`** de tu Colector Verde! Nuevo saldo en billetera: \`${Number(res.state.profile.tix_balance).toLocaleString()} Tix\`.`)
            : (isEn
                ? `ℹ️ Your Collector Pad is currently at \`0 Tix\`. Wait a moment while your Droppers generate more Tix!`
                : `ℹ️ Tu Colector Verde está en \`0 Tix\` ahora mismo. ¡Esperá unos instantes mientras tus Droppers fabrican más Tix!`);
        const panel = await construirPanelTycoon(interaction.user, 'sec_studio', msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_buy_next_pad') {
        const res = await buyNextStudioPad(userId);
        let msg;
        if (res.ok) {
            const pName = isEn ? res.pad.name_en : res.pad.name_es;
            msg = isEn
                ? `🎉 **Purchase Pad Built:** ${res.pad.emoji} **${pName}**! Your Studio is now **Stage ${res.state.profile.studio_stage}/6** (\`+${res.pad.tixPerMin} Tix/min\`).`
                : `🎉 **¡Pad Construido:** ${res.pad.emoji} **${pName}**! Tu Estudio subió a **Nivel ${res.state.profile.studio_stage}/6** (\`+${res.pad.tixPerMin} Tix/min\`).`;
        } else if (res.reason === 'insufficient_tix') {
            const pName = isEn ? res.pad.name_en : res.pad.name_es;
            msg = isEn
                ? `⚠️ You need \`${res.needed.toLocaleString()} Tix\` to build **${pName}** (you have \`${res.balance.toLocaleString()} Tix\`). Collect your green pad first!`
                : `⚠️ Necesitás \`${res.needed.toLocaleString()} Tix\` para construir **${pName}** (tenés \`${res.balance.toLocaleString()} Tix\`). ¡Recolectá tu placa verde primero!`;
        } else {
            msg = isEn
                ? `✅ All 6 Studio Pads are already built! Click **Rebirth** to ascend.`
                : `✅ ¡Ya construiste los 6 Pads del Estudio! Tocá **Hacer Rebirth** para ascender.`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_studio', msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_rebirth') {
        const res = await performRebirth(userId);
        const msg = res.ok
            ? (isEn
                ? `✨ **REBIRTH #${res.newRebirthCount} COMPLETED!** You gained a permanent **+35% production multiplier**, **+1,500 Collector Cap**, and **+1 Ascension Chest Key (\`🗝️\`)** for the Limited Vault!`
                : `✨ **¡REBIRTH #${res.newRebirthCount} COMPLETADO!** Ganaste **+35% de multiplicador permanente**, **+1,500 de capacidad en Colector** y **+1 Llave de Cofre de Ascensión (\`🗝️\`)** para la Bóveda Limited.`)
            : (isEn
                ? `⚠️ You must build all 6 Studio Pads (Stage 6) before performing a Rebirth.`
                : `⚠️ Necesitás construir los 6 Pads del Estudio (Nivel 6) antes de hacer Rebirth.`);
        const panel = await construirPanelTycoon(interaction.user, 'sec_studio', msg);
        return await interaction.editReply(panel);
    }

    // 5. SECCIÓN 2: Comprar en Tienda Normal y Equipar Ítem
    if (cid === 'tycoon_buy_normal_select' && interaction.isStringSelectMenu()) {
        const itemId = interaction.values[0];
        const res = await buyNormalShopItem(userId, itemId);
        let msg;
        if (res.ok) {
            const iName = isEn ? (res.item.name_en || res.item.name) : res.item.name;
            msg = isEn
                ? `🛒 **Purchased:** ${res.item.icon_emoji} **${iName}** (\`+${res.item.boost_pct}% Tix/min\`)! You can equip it anytime below.`
                : `🛒 **¡Compraste:** ${res.item.icon_emoji} **${iName}** (\`+${res.item.boost_pct}% Tix/min\`)! Podés equiparlo cuando quieras en el menú de abajo.`;
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

    // 6. SECCIÓN 3: Desbloquear Licencia UGC, Publicar UGC (Modal) y Comprar UGC
    if (cid === 'tycoon_unlock_ugc_license') {
        const res = await unlockUgcCreatorLicense(userId);
        let msg;
        if (res.ok) {
            msg = res.method === 'vip_free'
                ? (isEn
                    ? `🔓 **UGC Creator License Unlocked for FREE** thanks to your Community VIP status! You can now publish up to 2 custom UGC items.`
                    : `🔓 **¡Licencia de Creador UGC Desbloqueada GRATIS** gracias a tus beneficios VIP de Comunidad! Ya podés publicar hasta 2 ítems UGC.`)
                : (isEn
                    ? `🔓 **UGC Creator License Unlocked** for \`1,200 Tix\`! You can now design and publish up to 2 custom UGC items.`
                    : `🔓 **¡Licencia de Creador UGC Desbloqueada** por \`1,200 Tix\`! Ya podés diseñar y publicar hasta 2 ítems UGC.`);
        } else if (res.reason === 'requires_stage_6') {
            msg = isEn
                ? `🔒 To unlock the UGC License without VIP, reach **Studio Stage 6** (or 1 Rebirth) + \`1,200 Tix\`, or sync **Discord Nitro Boost / YouTube VIP** in Section 5 for instant free access!`
                : `🔒 Para desbloquear la Licencia UGC por progreso necesitás **Estudio Nivel 6** (o 1 Rebirth) + \`1,200 Tix\`, o sincronizar **Discord Nitro Boost / YouTube VIP** en la Sección 5 para desbloqueo gratuito.`;
        } else if (res.reason === 'insufficient_tix') {
            msg = isEn
                ? `⚠️ You need \`1,200 Tix\` to unlock the F2P UGC License (you have \`${res.balance.toLocaleString()} Tix\`).`
                : `⚠️ Necesitás \`1,200 Tix\` para abonar la Licencia UGC (tenés \`${res.balance.toLocaleString()} Tix\`).`;
        } else {
            msg = isEn ? `✅ Your UGC Creator License is already active.` : `✅ Tu Licencia de Creador UGC ya está activa.`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_ugc', msg);
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
                ? `🎨 **UGC Published to Marketplace:** ${res.item.icon_emoji} **${res.item.name}** for \`${Number(res.item.base_price).toLocaleString()} Tix\` (Deposit: \`250 Tix\`). You will earn **70% royalties** on every sale!`
                : `🎨 **¡UGC Publicado en el Mercado:** ${res.item.icon_emoji} **${res.item.name}** a \`${Number(res.item.base_price).toLocaleString()} Tix\` (Depósito: \`250 Tix\`). ¡Recibirás el **70% de regalías** por cada venta!`;
        } else if (res.reason === 'forbidden_words') {
            msg = isEn
                ? `🚫 **Anti-Impersonation Filter:** UGC names cannot contain reserved words like *"Limited"*, *"Limited U"*, *"Official"*, *"Admin"*, *"Staff"*, *"Dominus"*, or *"Valkyrie"*.`
                : `🚫 **Filtro Anti-Suplantación:** El nombre del UGC no puede incluir palabras reservadas como *"Limited"*, *"Limited U"*, *"Oficial"*, *"Admin"*, *"Staff"*, *"Dominus"* o *"Valkyrie"*.`;
        } else if (res.reason === 'invalid_price_range') {
            msg = isEn
                ? `⚠️ **Price Range Rule:** UGC items must be priced strictly between \`200\` and \`1,500 Tix\`.`
                : `⚠️ **Regla de Precio:** El precio de venta debe estar estrictamente entre \`200\` y \`1,500 Tix\`.`;
        } else if (res.reason === 'insufficient_deposit') {
            msg = isEn
                ? `⚠️ Publishing a UGC item requires a \`250 Tix\` creation deposit (you have \`${res.balance.toLocaleString()} Tix\`).`
                : `⚠️ Publicar un ítem UGC requiere un depósito de creación de \`250 Tix\` (tenés \`${res.balance.toLocaleString()} Tix\`).`;
        } else if (res.reason === 'max_ugc_reached') {
            msg = isEn
                ? `⚠️ You already reached the maximum of **2 active UGC items** per creator.`
                : `⚠️ Ya alcanzaste el límite máximo de **2 ítems UGC activos** por creador.`;
        } else {
            msg = isEn
                ? `⚠️ Could not publish UGC item. Please check the name length (3–30 chars) and your license.`
                : `⚠️ No se pudo publicar el ítem UGC. Verificá el largo del nombre (3 a 30 caracteres) y tu licencia.`;
        }

        const panel = await construirPanelTycoon(interaction.user, 'sec_ugc', msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_buy_ugc_select' && interaction.isStringSelectMenu()) {
        const itemId = interaction.values[0];
        const res = await buyCommunityUgcItem(userId, itemId);
        let msg;
        if (res.ok) {
            msg = isEn
                ? `🛍️ **Bought Community UGC:** ${res.item.icon_emoji} **${res.item.name}** for \`${res.price.toLocaleString()} Tix\`! (**70% (\`${res.royalty70} Tix\`)** sent to ${res.item.creator_name} • **30% (\`${res.burned30} Tix\`)** burned).`
                : `🛍️ **¡Compraste el UGC:** ${res.item.icon_emoji} **${res.item.name}** por \`${res.price.toLocaleString()} Tix\`! (**70% (\`${res.royalty70} Tix\`)** acreditado a ${res.item.creator_name} • **30% (\`${res.burned30} Tix\`)** quemado por impuesto).`;
        } else if (res.reason === 'self_purchase_forbidden') {
            msg = isEn
                ? `🚫 **Anti-Exploit Rule:** You cannot buy your own UGC item.`
                : `🚫 **Regla Anti-AutoCompra:** No podés comprar tu propio ítem UGC.`;
        } else if (res.reason === 'buyer_stage_too_low') {
            msg = isEn
                ? `🔒 **Anti-Alt Rule:** You must reach at least **Studio Stage 4** (or 1 Rebirth) to purchase community UGC items.`
                : `🔒 **Regla Anti-Multicuentas:** Necesitás alcanzar al menos el **Nivel 4 del Estudio** (o 1 Rebirth) para comprar en el Mercado UGC.`;
        } else if (res.reason === 'already_purchased_one_copy') {
            msg = isEn
                ? `ℹ️ You already own a copy of **${res.item.name}** (max 1 copy per buyer).`
                : `ℹ️ Ya tenés una copia de **${res.item.name}** (máximo 1 copia por comprador).`;
        } else if (res.reason === 'insufficient_tix') {
            msg = isEn
                ? `⚠️ You need \`${res.price.toLocaleString()} Tix\` to buy **${res.item.name}** (you have \`${res.balance.toLocaleString()} Tix\`).`
                : `⚠️ Necesitás \`${res.price.toLocaleString()} Tix\` para comprar **${res.item.name}** (tenés \`${res.balance.toLocaleString()} Tix\`).`;
        } else {
            msg = isEn ? `⚠️ Could not complete UGC purchase.` : `⚠️ No se pudo completar la compra del UGC.`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_ugc', msg);
        return await interaction.editReply(panel);
    }

    // 7. SECCIÓN 4: Cofres de Ascensión, Reclamo de Limited U y Trading P2P
    if (cid === 'tycoon_open_chest') {
        const res = await openAscensionChest(userId);
        let msg;
        if (res.ok) {
            const wName = isEn ? (res.wonItem.name_en || res.wonItem.name) : res.wonItem.name;
            const serialTxt = res.serialNumber
                ? ` **[#${String(res.serialNumber).padStart(2, '0')}/${res.wonItem.max_supply}]**`
                : '';
            msg = isEn
                ? `🎉 **ASCENSION CHEST UNBOXED!** You obtained ${res.wonItem.icon_emoji} **${wName}**${serialTxt} (\`${res.wonItem.category}\` • \`+${res.wonItem.boost_pct}% Tix/min\` • 💎 RAP: \`${Number(res.wonItem.current_rap).toLocaleString()}\`)!`
                : `🎉 **¡COFRE DE ASCENSIÓN ABIERTO!** Obtuviste ${res.wonItem.icon_emoji} **${wName}**${serialTxt} (\`${res.wonItem.category}\` • \`+${res.wonItem.boost_pct}% Tix/min\` • 💎 RAP: \`${Number(res.wonItem.current_rap).toLocaleString()}\`)!`;
        } else if (res.reason === 'requires_stage_3') {
            msg = isEn
                ? `🔒 Reach **Studio Stage 3** (or earn a Rebirth Key) to open Ascension Chests.`
                : `🔒 Alcanzá el **Nivel 3 del Estudio** (o ganá una Llave haciendo Rebirth) para abrir Cofres de Ascensión.`;
        } else if (res.reason === 'insufficient_tix') {
            msg = isEn
                ? `⚠️ Opening an Ascension Chest without a Rebirth Key costs \`3,500 Tix\` (you have \`${res.balance.toLocaleString()} Tix\`).`
                : `⚠️ Abrir un Cofre de Ascensión sin Llave de Rebirth cuesta \`3,500 Tix\` (tenés \`${res.balance.toLocaleString()} Tix\`).`;
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
                ? `👑 **SERIALIZED LIMITED U MINTED!** You claimed ${res.item.icon_emoji} **${dName} [#${String(res.serialNumber).padStart(2, '0')}/${res.maxSupply}]** (\`+${res.item.boost_pct}% Tix/min\` • 💎 RAP: \`${Number(res.item.current_rap).toLocaleString()}\`)!`
                : `👑 **¡LIMITED U NUMERADO ACUÑADO!** Reclamaste ${res.item.icon_emoji} **${dName} [#${String(res.serialNumber).padStart(2, '0')}/${res.maxSupply}]** (\`+${res.item.boost_pct}% Tix/min\` • 💎 RAP: \`${Number(res.item.current_rap).toLocaleString()}\`)!`;
        } else if (res.reason === 'sold_out') {
            msg = isEn
                ? `🔴 **SOLD OUT!** All global copies of that Limited U have been minted. You can only acquire it via P2P Trading now!`
                : `🔴 **¡AGOTADO (SOLD OUT)!** Todas las copias globales de ese Limited U ya fueron reclamadas. ¡Ahora solo puede conseguirse mediante Trading P2P!`;
        } else if (res.reason === 'insufficient_tix') {
            msg = isEn
                ? `⚠️ You need \`${res.cost.toLocaleString()} Tix\` to claim this Limited U Drop (you have \`${res.balance.toLocaleString()} Tix\`).`
                : `⚠️ Necesitás \`${res.cost.toLocaleString()} Tix\` para reclamar este Drop Limited U (tenés \`${res.balance.toLocaleString()} Tix\`).`;
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
                ? `⚠️ You don't own a Limited or Limited U item matching \`${rawOfferItem}\`.`
                : `⚠️ No tenés ningún ítem Limited o Limited U que coincida con \`${rawOfferItem}\`.`;
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
                ? `🤝 **P2P Trade Offer Created (\`${res.trade.trade_id}\`)!** Offering **${matchedInstance.catalog.icon_emoji} ${matchedInstance.catalog.name}** (${isDirect ? `Direct to <@${res.trade.receiver_id}>` : 'Public Trade Board'}).`
                : `🤝 **¡Oferta de Trading P2P Creada (\`${res.trade.trade_id}\`)!** Ofreciendo **${matchedInstance.catalog.icon_emoji} ${matchedInstance.catalog.name}** (${isDirect ? `Directa para <@${res.trade.receiver_id}>` : 'en el Tablero Público'}).`)
            : (isEn
                ? `⚠️ Could not create trade offer (${res.reason}). Check your Tix balance and target user.`
                : `⚠️ No se pudo crear la oferta de trade (${res.reason}). Verificá tu saldo de Tix y el destinatario.`);

        const panel = await construirPanelTycoon(interaction.user, 'sec_vault', msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_trade_action_select' && interaction.isStringSelectMenu()) {
        const val = interaction.values[0] || '';
        const [action, tradeId] = val.split(':');
        const res = await resolveTradeOffer(userId, tradeId, action);
        let msg;
        if (res.ok) {
            if (res.action === 'ACCEPTED') {
                msg = isEn
                    ? `🎉 **P2P Trade \`${tradeId}\` ACCEPTED!** Limited ownership and Tix transferred, and item **RAP** has been dynamically updated.`
                    : `🎉 **¡Trade P2P \`${tradeId}\` ACEPTADO!** Se transfirieron los ítems Limited y Tix, y se actualizó el **RAP** dinámico del catálogo.`;
            } else {
                msg = isEn
                    ? `🗑️ **Trade Offer \`${tradeId}\` ${res.action.toLowerCase()}.**`
                    : `🗑️ **Oferta de Trade \`${tradeId}\` cancelada/rechazada.**`;
            }
        } else if (res.reason === 'receiver_insufficient_tix') {
            msg = isEn
                ? `⚠️ You need \`${Number(res.needed || 0).toLocaleString()} Tix\` to accept this trade offer.`
                : `⚠️ Necesitás \`${Number(res.needed || 0).toLocaleString()} Tix\` para aceptar esta oferta de intercambio.`;
        } else if (res.reason === 'receiver_missing_requested_item') {
            msg = isEn
                ? `⚠️ You don't own the requested Limited item (\`${res.requestedItemId}\`) to complete this trade.`
                : `⚠️ No tenés en tu bóveda el ítem Limited solicitado (\`${res.requestedItemId}\`) para aceptar este intercambio.`;
        } else {
            msg = isEn
                ? `⚠️ Could not process trade (\`${res.reason}\`).`
                : `⚠️ No se pudo procesar el intercambio (\`${res.reason}\`).`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_vault', msg);
        return await interaction.editReply(panel);
    }

    // 8. SECCIÓN 5: Pociones Consumibles y Sincronización de Beneficios VIP de Comunidad
    if (cid === 'tycoon_buy_potion_speed' || cid === 'tycoon_buy_potion_mega') {
        const potionId = cid === 'tycoon_buy_potion_mega' ? 'mega_elixir' : 'speed_potion';
        const res = await buyAndActivatePotion(userId, potionId);
        let msg;
        if (res.ok) {
            const pName = isEn ? res.potion.name_en : res.potion.name_es;
            msg = isEn
                ? `🧪 **Potion Activated:** ${res.potion.emoji} **${pName}**! Your Studio production is now **+${res.state.metrics.effectiveTixPerMin} Tix/min** (\`${res.state.metrics.potionRemainingMin} min\` active).`
                : `🧪 **¡Poción Activada:** ${res.potion.emoji} **${pName}**! Tu producción ahora es de **+${res.state.metrics.effectiveTixPerMin} Tix/min** (\`${res.state.metrics.potionRemainingMin} min\` activos).`;
        } else {
            msg = isEn
                ? `⚠️ You need \`${res.cost.toLocaleString()} Tix\` to buy that potion (you have \`${res.balance.toLocaleString()} Tix\`).`
                : `⚠️ Necesitás \`${res.cost.toLocaleString()} Tix\` para comprar esa poción (tenés \`${res.balance.toLocaleString()} Tix\`).`;
        }
        const panel = await construirPanelTycoon(interaction.user, 'sec_perks', msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'tycoon_sync_vip') {
        const res = await syncCommunityPerks(interaction);
        const perksUnlocked = [];
        if (res.detectedNitro) perksUnlocked.push(isEn ? '💎 Discord Nitro Boost (+50%)' : '💎 Discord Nitro Boost (+50%)');
        if (res.detectedYt) perksUnlocked.push(isEn ? '▶️ YouTube VIP (+35%)' : '▶️ YouTube VIP (+35%)');
        if (res.grantedTopHat) perksUnlocked.push(isEn ? '🎩 Neon Booster Top Hat' : '🎩 Sombrero de Copa Neón Booster');
        if (res.grantedDailyPotion) perksUnlocked.push(isEn ? '🧪 Free Daily Speed Potion (30m)' : '🧪 Poción Diaria Gratis (30m)');

        const msg = isEn
            ? `🌟 **Community VIP Perks Synchronized!** Active rewards: ${perksUnlocked.join(' • ')} + **Free UGC Creator License**!`
            : `🌟 **¡Beneficios VIP de Comunidad Sincronizados!** Recompensas activas: ${perksUnlocked.join(' • ')} + **Licencia de Creador UGC Gratis**!`;

        const panel = await construirPanelTycoon(interaction.user, 'sec_perks', msg);
        return await interaction.editReply(panel);
    }
}

module.exports = {
    construirPanelTycoon,
    handleTycoonInteraction
};
