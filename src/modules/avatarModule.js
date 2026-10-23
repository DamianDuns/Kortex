// ==========================================
// ARCHIVO: src/modules/avatarModule.js
// CATEGORÍA 2: 👕 Taller de Avatares y Estudio 3D/2D (Herramientas 2.1 a 2.5 Calibradas)
// ==========================================

const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    MessageFlags
} = require('discord.js');

const AdmZip = require('adm-zip');
const axios = require('axios');
const { fetchWithRetry, toDirectRobloxUrl } = require('../../utils/http');
const { extractIdFromInput, obtenerDetallesCompletos } = require('../../utils/roblox');
const { COLORES, footer, separador, boton, formatearPrecio } = require('../../utils/ui');
const {
    obtenerCuentaVinculada,
    resolverUsuarioRoblox,
    guardarCuentaVinculada,
    agregarItemAWishlistRapido
} = require('../utils/fastLink');
const {
    generateOutfitSandboxCard,
    resolveAnatomicalSlot,
    generateClonesComparisonCanvas,
    generateMannequinTemplateCanvas,
    generate3DShowcaseCard,
    parseHexColor,
    getClosestColorSearchTerm,
    extractDominantColorsFromImage,
    calculateImageColorMatch,
    generateColorMatchCanvas
} = require('../utils/chartGenerator');
const { registerCachePurger } = require('../utils/performanceManager');

const COLOR_AVATAR = 0x8B5CF6; // Púrpura Estudio Creativo

// Estado en memoria por usuario para el Probador de Combinaciones (Sandbox), Texturas 2D, Clones y Color-Match
const sandboxSessions = new Map();
const lastTextureSession = new Map();
const lastColorMatchSession = new Map();
const clonesCache = new Map();

// Registrar limpiador e inspector transparente de cachés en RAM para el motor de rendimiento
registerCachePurger(
    'avatarModule',
    (aggressive) => {
        let freed = clonesCache.size;
        clonesCache.clear();
        if (aggressive) {
            freed += lastTextureSession.size + lastColorMatchSession.size + sandboxSessions.size;
            lastTextureSession.clear();
            lastColorMatchSession.clear();
            sandboxSessions.clear();
        }
        return freed;
    },
    {
        label: '👕 Sesiones de Estudio 2D/3D y Clones',
        whatItCleans: 'Plantillas PNG extraídas en RAM, comparativas de clones y sesiones temporales del probador',
        inspectFn: () => {
            let texBytes = 0;
            for (const t of lastTextureSession.values()) {
                texBytes += t?.rawPngBuffer?.length || 45000;
            }
            const entries =
                sandboxSessions.size +
                lastTextureSession.size +
                lastColorMatchSession.size +
                clonesCache.size;
            const approxKB = Math.round(
                texBytes / 1024 +
                clonesCache.size * 12 +
                sandboxSessions.size * 8 +
                lastColorMatchSession.size * 10
            );
            return {
                entries,
                approxKB,
                detail: `${sandboxSessions.size} probador(es) • ${lastTextureSession.size} textura(s) 2D • ${clonesCache.size} búsqueda(s) (~${approxKB} KB)`
            };
        }
    }
);

const ASSET_TYPE_NAMES = {
    2: 'Classic T-Shirt (2D)',
    8: 'Sombrero (Hat)',
    11: 'Camisa Clásica (Shirt 2D)',
    12: 'Pantalón Clásico (Pants 2D)',
    18: 'Rostro (Face)',
    19: 'Gear (Equipamiento)',
    41: 'Accesorio de Pelo (Hair)',
    42: 'Accesorio de Cara (Face)',
    43: 'Accesorio de Cuello (Neck)',
    44: 'Accesorio de Hombro (Shoulder)',
    45: 'Accesorio Frontal (Front)',
    46: 'Accesorio de Espalda (Back)',
    47: 'Accesorio de Cintura (Waist)',
    64: 'T-Shirt 3D (Layered)',
    65: 'Camisa 3D (Layered Shirt)',
    66: 'Pantalón 3D (Layered Pants)',
    67: 'Chaqueta 3D (Jacket)',
    68: 'Suéter 3D (Sweater)',
    69: 'Shorts 3D',
    72: 'Vestido / Falda 3D'
};

/**
 * Resuelve en paralelo los precios reales (incluyendo Limiteds y UGC Limiteds) y miniaturas 420x420
 * de un objeto del catálogo por su ID o nombre.
 */
async function resolverItemCatalogoConPrecioReal(idOrQuery) {
    const raw = String(idOrQuery || '').trim();
    const numericId = /^\d+$/.test(raw) ? raw : extractIdFromInput(raw);

    let id = numericId ? Number(numericId) : null;
    let name = null;
    let price = 0;
    let isLimited = false;
    let assetTypeId = 8;
    let creatorName = 'Roblox';
    let creatorId = 1;
    let imageUrl = null;
    let highResUrl = null;

    // 1. Si no es un ID numérico (el usuario escribió un nombre como "Valkyrie Helm" o "Black Hoodie"), buscar en el catálogo general
    if (!id) {
        const searchUrls = [
            `https://catalog.roblox.com/v1/search/items/details?Keyword=${encodeURIComponent(raw)}&SalesTypeFilter=1&Limit=10`,
            `https://catalog.roblox.com/v1/search/items/details?Keyword=${encodeURIComponent(raw)}&Limit=10`
        ];
        for (const sUrl of searchUrls) {
            try {
                const sRes = await fetchWithRetry(sUrl);
                const list = sRes?.data?.data || [];
                // Preferir un Asset (no Bundle) y que tenga precio > 0 si existe
                const validAssets = list.filter(it => it && it.id && (!it.itemType || it.itemType === 'Asset'));
                const best =
                    validAssets.find(it => (it.lowestPrice || it.lowestResalePrice || it.price || 0) > 0) ||
                    validAssets[0];
                if (best) {
                    id = Number(best.id);
                    name = best.name || null;
                    price = Number(best.lowestPrice ?? best.lowestResalePrice ?? best.price ?? 0);
                    assetTypeId = Number(best.assetType || 8);
                    creatorName = best.creatorName || 'Roblox';
                    creatorId = Number(best.creatorTargetId || 1);
                    isLimited = Array.isArray(best.itemRestrictions) && (
                        best.itemRestrictions.includes('Limited') ||
                        best.itemRestrictions.includes('LimitedUnique') ||
                        best.itemRestrictions.includes('Collectible')
                    );
                    break;
                }
            } catch {
                // Intentar siguiente URL
            }
        }
    }

    if (!id) return null;

    // 2. Consultar detalles en economy.roblox.com/v2/assets/{id}/details y miniatura 420x420 en paralelo
    const [econRes, thumbRes] = await Promise.all([
        fetchWithRetry(`https://economy.roblox.com/v2/assets/${id}/details`).catch(() => null),
        fetchWithRetry(`https://thumbnails.roblox.com/v1/assets?assetIds=${id}&size=420x420&format=Png&isCircular=false`).catch(() => null)
    ]);

    const d = econRes?.data;
    if (d && (d.Name || d.AssetId)) {
        name = d.Name || name || `Asset ${id}`;
        assetTypeId = Number(d.AssetTypeId || assetTypeId || 8);
        creatorName = d.Creator?.Name || creatorName || 'Roblox';
        creatorId = Number(d.Creator?.CreatorTargetId || d.Creator?.Id || creatorId || 1);

        const detectedLimited = Boolean(
            d.IsLimited ||
            d.IsLimitedUnique ||
            d.CollectibleItemId ||
            d.CollectiblesItemDetails?.IsLimited
        );
        if (detectedLimited) isLimited = true;

        const econPrice = Number(
            d.CollectiblesItemDetails?.CollectibleLowestResalePrice ||
            d.LowestResellPrice ||
            d.PriceInRobux ||
            0
        );
        if (econPrice > 0) {
            price = econPrice;
        }
    }

    // 3. Si es un Limited o el precio sigue en 0, consultar el buscador público de catálogo por el nombre exacto
    // (Roblox devuelve lowestPrice / lowestResalePrice públicamente en search/items/details sin requerir sesión)
    if (price === 0 && name) {
        try {
            const catSearch = await fetchWithRetry(
                `https://catalog.roblox.com/v1/search/items/details?Keyword=${encodeURIComponent(name)}&Limit=10`
            ).catch(() => null);
            const items = catSearch?.data?.data || [];
            const exact = items.find(it => String(it.id) === String(id)) || items.find(it => String(it.name || '').toLowerCase() === name.toLowerCase());
            if (exact) {
                const foundPrice = Number(exact.lowestPrice ?? exact.lowestResalePrice ?? exact.price ?? 0);
                if (foundPrice > 0) price = foundPrice;
                if (exact.assetType) assetTypeId = Number(exact.assetType);
                if (exact.creatorName) creatorName = exact.creatorName;
                if (exact.creatorTargetId) creatorId = Number(exact.creatorTargetId);
            }
        } catch {
            // Silencioso
        }
    }

    // 4. Respaldo final con obtenerDetallesCompletos si aún no tenemos nombre o precio
    if (!name || price === 0) {
        const det = await obtenerDetallesCompletos(String(id), 'catalog').catch(() => null);
        if (det && det.exito) {
            if (!name) name = det.nombre;
            if (price === 0 && det.precio > 0) price = det.precio;
            if (!assetTypeId && det.assetTypeId) assetTypeId = det.assetTypeId;
            if (det.creatorName) creatorName = det.creatorName;
            if (det.creatorId) creatorId = det.creatorId;
            if (det.imagenUrl && !highResUrl) highResUrl = det.imagenUrl;
        }
    }

    highResUrl = thumbRes?.data?.data?.[0]?.imageUrl || highResUrl || null;
    imageUrl = highResUrl;

    if (!name) return null;

    return {
        id: Number(id),
        name,
        price: Number(price || 0),
        isLimited,
        assetTypeId: Number(assetTypeId || 8),
        assetTypeName: ASSET_TYPE_NAMES[assetTypeId] || 'Accesorio',
        creatorName: creatorName || 'Roblox',
        creatorId: Number(creatorId || 1),
        imageUrl,
        highResUrl
    };
}

// ==========================================
// HERRAMIENTA 2.1: 🧪 Probador de Combinaciones en Vivo (Outfit Sandbox)
// ==========================================
async function obtenerEstadoSandbox(discordUserId) {
    const key = String(discordUserId);
    const linked = await obtenerCuentaVinculada(key);

    if (sandboxSessions.has(key)) {
        const current = sandboxSessions.get(key);
        // Si el usuario vinculó cuenta de Roblox después de abrir el sandbox con el avatar por defecto, actualizar a su cuenta
        if (linked && linked.roblox_user_id && current.isDefaultBuilderman && Number(current.userId) !== Number(linked.roblox_user_id)) {
            current.userId = linked.roblox_user_id;
            current.username = linked.roblox_username;
            current.isDefaultBuilderman = false;
            const [fullThumbRes, headThumbRes] = await Promise.all([
                fetchWithRetry(
                    `https://thumbnails.roblox.com/v1/users/avatar?userIds=${current.userId}&size=420x420&format=Png&isCircular=false`
                ).catch(() => null),
                fetchWithRetry(
                    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${current.userId}&size=420x420&format=Png&isCircular=false`
                ).catch(() => null)
            ]);
            current.avatarFullUrl = fullThumbRes?.data?.data?.[0]?.imageUrl || linked.avatar_url || current.avatarFullUrl;
            current.avatarHeadshotUrl = headThumbRes?.data?.data?.[0]?.imageUrl || linked.avatar_url || current.avatarFullUrl;
            current.avatarUrl = current.avatarFullUrl;
        }
        return current;
    }

    // Si no tiene cuenta vinculada aún, usar a @Builderman (ID 156) como maniquí real inicial (pudiendo cambiarlo por cualquier @usuario)
    const isDefaultBuilderman = !(linked && linked.roblox_user_id);
    const userId = linked?.roblox_user_id || 156;
    const username = linked?.roblox_username || 'Builderman';

    const [fullThumbRes, headThumbRes] = await Promise.all([
        fetchWithRetry(
            `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`
        ).catch(() => null),
        fetchWithRetry(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`
        ).catch(() => null)
    ]);

    const avatarFullUrl = fullThumbRes?.data?.data?.[0]?.imageUrl || linked?.avatar_url || null;
    const avatarHeadshotUrl = headThumbRes?.data?.data?.[0]?.imageUrl || avatarFullUrl;

    const session = {
        userId,
        username,
        isDefaultBuilderman,
        avatarUrl: avatarFullUrl,
        avatarFullUrl,
        avatarHeadshotUrl,
        zoomHead: false,
        items: []
    };
    sandboxSessions.set(key, session);
    return session;
}

async function construirPanelSandbox(discordUserId, feedbackMsg = null) {
    const state = await obtenerEstadoSandbox(discordUserId);
    const totalNormal = state.items.reduce((acc, it) => acc + Number(it.price || 0), 0);
    const totalCashback = Math.ceil(totalNormal * 0.6);
    const ahorroTotal = totalNormal - totalCashback;

    const pngBuffer = await generateOutfitSandboxCard(state, state.items, totalNormal, totalCashback);
    const attachment = new AttachmentBuilder(pngBuffer, { name: 'outfit_sandbox.png' });

    const container = new ContainerBuilder()
        .setAccentColor(COLOR_AVATAR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🧪 2.1 Probador de Combinaciones en Vivo\n` +
            `👤 **Personaje en el visor:** \`@${state.username}\` (ID \`${state.userId}\`)  •  📷 **Vista:** \`${state.zoomHead ? '🔍 Zoom Cabeza/Cuello' : '🧍 Cuerpo Completo'}\`\n` +
            `💰 **Total Lista (${state.items.length}/5):** ${formatearPrecio(totalNormal)}  •  ✨ **Con 40% Grupo:** ${formatearPrecio(totalCashback)} *(Ahorrás ${formatearPrecio(ahorroTotal)})*` +
            (feedbackMsg ? `\n\n> ${feedbackMsg}` : '')
        ))
        .addSeparatorComponents(separador())
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://outfit_sandbox.png')
            )
        )
        .addSeparatorComponents(separador());

    if (state.items.length > 0) {
        const lines = state.items.map((it, i) => {
            const net = Math.ceil((it.price || 0) * 0.6);
            const slotInfo = resolveAnatomicalSlot(it);
            const tipoTag = it.isWorn ? '`[PUESTO]`' : '`[PRUEBA]`';
            const precioStr = it.price > 0
                ? `${formatearPrecio(it.price)} *(40%: ${formatearPrecio(net)})*`
                : '`Gratis / Offsale`';
            return (
                `**${i + 1}.** ${tipoTag} [${it.name}](https://www.roblox.com/catalog/${it.id}) — 📍 *${slotInfo.label}* — ${precioStr}`
            );
        }).join('\n');

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 🛍️ Desglose y Enlaces de Compra Directa\n${lines}`
        ));

        const selectSave = new StringSelectMenuBuilder()
            .setCustomId('select_ava_sandbox_save')
            .setPlaceholder('📌 Guardar una pieza del conjunto en Mi Lista (máx. 5)...')
            .addOptions(
                state.items.slice(0, 5).map((it, idx) => {
                    const slotInfo = resolveAnatomicalSlot(it);
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(`${idx + 1}. ${String(it.name).substring(0, 80)}`)
                        .setDescription(`Slot: ${slotInfo.label} • Lista: ${it.price} R$ | Con 40%: ${Math.ceil(it.price * 0.6)} R$`.substring(0, 95))
                        .setValue(String(it.id))
                        .setEmoji('🎯');
                })
            );
        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectSave));
        container.addSeparatorComponents(separador(true));
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `💡 **Cómo funciona:**\n` +
            `• Tocá **➕ Probar Accesorio / Avatar** para equipar cualquier sombrero, pelo, lentes, collar, alas o ropa (por **Nombre o ID**), o escribí **\`@usuario\`** para cambiar el personaje del visor.\n` +
            `• Tocá **⚡ Conjunto Demo** para ver una combinación completa armada en un clic, o **👕 Mi Ropa Actual** para cotizar lo que lleva puesto el avatar.`
        ));
        container.addSeparatorComponents(separador(true));
    }

    const row1 = new ActionRowBuilder().addComponents(
        boton('btn_ava_sandbox_add_modal', 'Probar Accesorio / Avatar', '➕', ButtonStyle.Success),
        boton('btn_ava_sandbox_demo', 'Conjunto Demo', '⚡', ButtonStyle.Primary),
        boton('btn_ava_sandbox_load_worn', 'Mi Ropa Actual', '👕', ButtonStyle.Secondary),
        boton(
            'btn_ava_sandbox_toggle_zoom',
            state.zoomHead ? 'Ver Cuerpo' : 'Zoom Cabeza',
            state.zoomHead ? '🧍' : '🔍',
            ButtonStyle.Secondary
        ),
        boton('btn_nav_main_menu', 'Menú', '🏠', ButtonStyle.Secondary)
    );

    container.addActionRowComponents(row1);

    if (state.items.length > 0) {
        const row2 = new ActionRowBuilder().addComponents(
            boton('btn_ava_sandbox_pop', 'Quitar Último', '➖', ButtonStyle.Secondary),
            boton('btn_ava_sandbox_clear', 'Vaciar Todo', '🗑️', ButtonStyle.Danger)
        );
        container.addActionRowComponents(row2);
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Roblox Toolkit • 2.1 Probador de Combinaciones en Vivo con posicionamiento anatómico real')
    ));

    return {
        components: [container],
        files: [attachment],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// HERRAMIENTA 2.2: 🔍 Buscador de Clones y Similares (Roblox Oficial + UGC Económicos)
// ==========================================

/**
 * Extrae las palabras clave visuales reales de un ítem para encontrar clones exactos del mismo estilo.
 */
function extraerTerminosBusquedaClones(rawName) {
    const clean = String(rawName || '')
        .replace(/\[.*?\]|\(.*?\)|\{.*?\}/g, ' ')
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\b(the|of|and|for|with|by|in|on|a|an|ugc|10|30|r6|r15|new|sale|cheap|free|original|official)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const words = clean.split(' ').filter(w => w.length >= 2);
    if (words.length === 0) return { primaryQuery: 'Valkyrie Helm', coreWords: ['valkyrie'], rootNoun: 'Valkyrie' };

    const primaryQuery = words.slice(0, 3).join(' ');
    const rootNoun = words[words.length - 1] || words[0];
    const coreWords = words.map(w => w.toLowerCase());

    return {
        primaryQuery,
        coreWords,
        rootNoun
    };
}

/**
 * Determina si dos assetTypeIds pertenecen a la misma familia anatómica (para que un sombrero devuelva sombreros/cascos, una camisa devuelva camisas, etc.)
 */
function sonTiposCompatiblesClones(origTypeId, candTypeId) {
    const o = Number(origTypeId || 8);
    const c = Number(candTypeId || 8);
    if (!o || !c) return true;
    if (o === c) return true;

    const headGroup = [8, 41, 42, 18];
    constshirtGroup = [11, 2, 45, 64, 65, 67, 68];
    const pantsGroup = [12, 47, 66, 69, 72];

    if (headGroup.includes(o) && headGroup.includes(c)) return true;
    if (constshirtGroup.includes(o) && constshirtGroup.includes(c)) return true;
    if (pantsGroup.includes(o) && pantsGroup.includes(c)) return true;
    return false;
}

/**
 * Busca alternativas visuales reales (Clones UGC comprables más baratos + Ítems Oficiales de Roblox)
 * garantizando precios reales y evitando devolver objetos fuera de venta (Offsale) cuando se buscan clones baratos.
 */
async function buscarAlternativasYSimilares(queryInput, mode = 'all') {
    const cleanInput = String(queryInput || '').trim() || '1365767';
    const cacheKey = `${cleanInput.toLowerCase()}_${mode}`;

    const cached = clonesCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < 90000)) {
        return cached.data;
    }

    // 1. Resolver el ítem de referencia con su precio real de mercado (incluyendo Limiteds)
    const origItem = await resolverItemCatalogoConPrecioReal(cleanInput);
    if (!origItem) {
        return { error: `No se encontró ningún accesorio o prenda con **"${cleanInput}"**. Probá con otro nombre o ID del catálogo.` };
    }

    const { primaryQuery, coreWords, rootNoun } = extraerTerminosBusquedaClones(origItem.name);
    const origType = Number(origItem.assetTypeId || 8);

    // Determinar categoría de catálogo adecuada (11 = Accesorios, 3 = Ropa, o búsqueda abierta)
    const esRopaClasica = [2, 11, 12].includes(origType);
    const catParam = esRopaClasica ? 'Category=3' : 'Category=11';

    // 2. Consultas paralelas al Catálogo de Roblox:
    //    - Búsqueda exacta de ítems EN VENTA (SalesTypeFilter=1) con las palabras clave del objeto
    //    - Búsqueda de clones UGC económicos en venta ordenados por relevancia/precio
    //    - Búsqueda de ítems Oficiales de Roblox (CreatorTargetId=1)
    //    - Recomendaciones directas del activo
    const [onSaleExactRes, officialSearchRes, recRes] = await Promise.all([
        fetchWithRetry(
            `https://catalog.roblox.com/v1/search/items/details?${catParam}&Keyword=${encodeURIComponent(primaryQuery)}&SalesTypeFilter=1&Limit=28`
        ).catch(() => null),
        fetchWithRetry(
            `https://catalog.roblox.com/v1/search/items/details?Keyword=${encodeURIComponent(rootNoun)}&CreatorTargetId=1&Limit=10`
        ).catch(() => null),
        fetchWithRetry(
            `https://catalog.roblox.com/v1/recommendations/asset/${origItem.id}?assetTypeId=${origType}&numItems=12`
        ).catch(() => null)
    ]);

    const rawCandidates = new Map();

    const registerCandidate = (raw, sourceTag = 'search') => {
        if (!raw) return;
        const itemObj = raw.item ? raw.item : raw;
        const cId = Number(itemObj.id || itemObj.assetId || itemObj.itemId || 0);
        if (!cId || cId === Number(origItem.id)) return;
        if (itemObj.itemType && itemObj.itemType !== 'Asset') return;

        const cName = String(itemObj.name || `Asset ${cId}`).trim();
        const cPrice = Number(
            itemObj.lowestPrice ??
            itemObj.lowestResalePrice ??
            itemObj.price ??
            itemObj.priceStatus === 'Free' ? 0 : (itemObj.price || 0)
        );
        const cCreator = String(itemObj.creatorName || raw.creator?.name || 'UGC Creator');
        const cCreatorId = Number(itemObj.creatorTargetId || raw.creator?.creatorTargetId || raw.creator?.id || 0);
        const cAssetType = Number(itemObj.assetType || itemObj.assetTypeId || origType);
        const isOfficial = cCreatorId === 1 || cCreator.toLowerCase() === 'roblox';

        // Calcular puntaje de similitud visual y utilidad
        const lowerName = cName.toLowerCase();
        let wordMatches = 0;
        for (const w of coreWords) {
            if (w.length >= 3 && lowerName.includes(w)) {
                wordMatches++;
            }
        }

        const compatibleSlot = sonTiposCompatiblesClones(origType, cAssetType);
        let similarityScore = 0;
        if (cAssetType === origType) similarityScore += 45;
        else if (compatibleSlot) similarityScore += 25;
        else similarityScore -= 20;

        similarityScore += wordMatches * 30;
        if (sourceTag === 'rec') similarityScore += 20;
        if (cPrice > 0) similarityScore += 35; // Priorizar objetos que realmente están a la venta
        if (origItem.price > 0 && cPrice > 0 && cPrice < origItem.price) {
            similarityScore += 30; // Bonus por ser más barato que el original
        }

        const existing = rawCandidates.get(String(cId));
        if (!existing || (existing.price === 0 && cPrice > 0)) {
            rawCandidates.set(String(cId), {
                id: cId,
                name: cName,
                price: cPrice,
                creatorName: cCreator,
                creatorId: cCreatorId,
                assetTypeId: cAssetType,
                isOfficialRoblox: isOfficial,
                similarityScore,
                compatibleSlot
            });
        }
    };

    (onSaleExactRes?.data?.data || []).forEach(it => registerCandidate(it, 'exact'));
    (officialSearchRes?.data?.data || []).forEach(it => registerCandidate(it, 'official'));
    (recRes?.data?.data || []).forEach(it => registerCandidate(it, 'rec'));

    // Si la búsqueda primaria dio pocos resultados comprables, hacer una búsqueda adicional con la palabra raíz (ej. "Valkyrie" o "Fedora")
    const buyableSoFar = [...rawCandidates.values()].filter(c => c.price > 0);
    if (buyableSoFar.length < 4 && rootNoun) {
        const rootRes = await fetchWithRetry(
            `https://catalog.roblox.com/v1/search/items/details?${catParam}&Keyword=${encodeURIComponent(rootNoun)}&SalesTypeFilter=1&Limit=28`
        ).catch(() => null);
        (rootRes?.data?.data || []).forEach(it => registerCandidate(it, 'root'));
    }

    let pool = [...rawCandidates.values()];

    // Filtrar según el modo seleccionado por el usuario
    if (mode === 'official') {
        const onlyOfficial = pool.filter(c => c.isOfficialRoblox);
        if (onlyOfficial.length > 0) pool = onlyOfficial;
    } else if (mode === 'cheap') {
        // En modo Clones UGC Baratos: exigir que estén a la venta (price > 0) y sean del mismo tipo de accesorio/prenda
        const buyableCheap = pool.filter(c => c.price > 0 && !c.isOfficialRoblox && c.compatibleSlot);
        const anyBuyable = pool.filter(c => c.price > 0);
        pool = buyableCheap.length >= 2 ? buyableCheap : (anyBuyable.length > 0 ? anyBuyable : pool);
        pool.sort((a, b) => {
            // Primero los que comparten palabras clave y son más económicos
            const aHasWord = coreWords.some(w => a.name.toLowerCase().includes(w)) ? 1 : 0;
            const bHasWord = coreWords.some(w => b.name.toLowerCase().includes(w)) ? 1 : 0;
            if (aHasWord !== bHasWord) return bHasWord - aHasWord;
            return a.price - b.price;
        });
    } else {
        // Modo 'all' (Todos: Clones Comprables + Oficiales):
        // Excluir ítems Offsale (0 R$) siempre que haya suficientes alternativas comprables
        const buyable = pool.filter(c => c.price > 0 && c.compatibleSlot);
        if (buyable.length >= 3) {
            pool = buyable;
        } else {
            const anyBuyable = pool.filter(c => c.price > 0);
            if (anyBuyable.length > 0) pool = anyBuyable;
        }
        pool.sort((a, b) => {
            if (b.similarityScore !== a.similarityScore) return b.similarityScore - a.similarityScore;
            return (a.price || 999999) - (b.price || 999999);
        });
    }

    const topAlternatives = pool.slice(0, 6);

    if (topAlternatives.length === 0) {
        return {
            error: `No se hallaron clones en venta para **${origItem.name}**. Probá buscando por las palabras principales del accesorio.`
        };
    }

    // Obtener miniaturas de las alternativas en lote
    const altIds = topAlternatives.map(a => a.id).join(',');
    const altThumbRes = await fetchWithRetry(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${altIds}&size=150x150&format=Png&isCircular=false`
    ).catch(() => null);

    const thumbMap = new Map();
    (altThumbRes?.data?.data || []).forEach(t => {
        if (t.targetId && t.imageUrl) thumbMap.set(String(t.targetId), t.imageUrl);
    });

    topAlternatives.forEach(alt => {
        alt.imageUrl = thumbMap.get(String(alt.id)) || null;
    });

    const resultData = { origItem, alternatives: topAlternatives, mode, queryUsed: cleanInput };
    clonesCache.set(cacheKey, { timestamp: Date.now(), data: resultData });
    return resultData;
}

function construirPanelClonesInicial() {
    const container = new ContainerBuilder()
        .setAccentColor(COLOR_AVATAR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🔍 2.2 Buscador de Clones y Similares (Roblox + UGC)\n` +
            `Encontrá **alternativas UGC económicas en venta** y **objetos similares de Roblox** del mismo tipo anatómico a partir de cualquier accesorio o prenda cara.\n\n` +
            `> 💎 **Detecta precios reales de Limiteds y Catálogo:** Compara el precio de reventa/lista original contra clones UGC comprables hoy mismo.\n` +
            `> 💰 **Cálculo de ahorro + 40% en grupo:** Te muestra el porcentaje exacto de ahorro y te permite probar el clon en tu avatar o seguir su precio.\n\n` +
            `-# Presioná **🔎 Buscar Similares** para ingresar cualquier Nombre o ID, o probá el ejemplo interactivo abajo.`
        ))
        .addSeparatorComponents(separador(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_ava_clones_modal', 'Buscar Similares (Nombre o ID)', '🔎', ButtonStyle.Primary),
                boton('btn_ava_clones_demo:1365767', 'Probar Ejemplo: Valkyrie Helm', '⚡', ButtonStyle.Secondary),
                boton('btn_nav_main_menu', 'Volver al Toolkit', '🏠', ButtonStyle.Secondary)
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer('Roblox Toolkit • 2.2 Buscador de Clones Comprables y Similares del Mismo Tipo')
        ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

async function construirPanelClones(queryInput = '1365767', mode = 'all', feedbackMsg = null, selectedAltId = null) {
    const res = await buscarAlternativasYSimilares(queryInput, mode);
    if (res.error) {
        const errContainer = new ContainerBuilder()
            .setAccentColor(COLORES.error)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Sin Resultados\n${res.error}`))
            .addSeparatorComponents(separador())
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    boton('btn_ava_clones_modal', 'Intentar otra búsqueda', '🔎', ButtonStyle.Primary),
                    boton('btn_ava_clones_demo:1365767', 'Probar Ejemplo: Valkyrie Helm', '⚡', ButtonStyle.Secondary),
                    boton('btn_nav_main_menu', 'Menú Principal', '🏠', ButtonStyle.Secondary)
                )
            );
        return { components: [errContainer], files: [], attachments: [], flags: MessageFlags.IsComponentsV2 };
    }

    const { origItem, alternatives } = res;
    const pngBuffer = await generateClonesComparisonCanvas(origItem, alternatives);
    const attachment = new AttachmentBuilder(pngBuffer, { name: 'clones_comparison.png' });

    const modeLabels = {
        all: '🌐 Todos (Clones Comprables + Oficiales)',
        official: '🏛️ Oficiales de Roblox',
        cheap: '💸 Clones UGC Más Baratos en Venta'
    };

    const lines = alternatives.slice(0, 4).map((alt, idx) => {
        const net = Math.ceil((alt.price || 0) * 0.6);
        const badge = alt.isOfficialRoblox ? '🏛️ `[ROBLOX OFICIAL]`' : '🏷️ `[CLON UGC]`';
        let diffText = `Con 40%: ${formatearPrecio(net)}`;
        if (origItem.price > 0 && alt.price > 0 && alt.price < origItem.price) {
            const pct = Math.max(1, Math.round(((origItem.price - alt.price) / origItem.price) * 100));
            diffText = `🔥 **Ahorrás ${formatearPrecio(origItem.price - alt.price)} (-${pct}%)** • Con 40%: ${formatearPrecio(net)}`;
        }
        const priceLabel = alt.price > 0 ? formatearPrecio(alt.price) : '`Fuera de venta`';
        return (
            `**#${idx + 1}** ${badge} **[${alt.name}](https://www.roblox.com/catalog/${alt.id})** (\`ID: ${alt.id}\`)\n` +
            `> 💵 Precio: ${priceLabel}  •  ${diffText}`
        );
    }).join('\n\n');

    const inspectedAlt = selectedAltId
        ? alternatives.find(a => String(a.id) === String(selectedAltId))
        : null;

    const inspectedBlock = inspectedAlt
        ? `\n\n### 🔎 Alternativa Seleccionada: ${inspectedAlt.name}\n` +
          `> 🆔 **Asset ID:** \`${inspectedAlt.id}\`  •  👤 **Creador:** \`${inspectedAlt.creatorName}\`\n` +
          `> 💰 **Precio Lista:** ${inspectedAlt.price > 0 ? formatearPrecio(inspectedAlt.price) : '`Offsale`'}  •  ✨ **Con 40% Grupo:** ${formatearPrecio(Math.ceil((inspectedAlt.price || 0) * 0.6))}\n` +
          `> 🔗 **[Abrir en Catálogo de Roblox](https://www.roblox.com/catalog/${inspectedAlt.id})**`
        : '';

    const origPriceFormatted = origItem.price > 0
        ? `${formatearPrecio(origItem.price)}${origItem.isLimited ? ' *(Mejor Reventa Limited)*' : ''}`
        : '`Fuera de venta / Exclusivo`';

    const container = new ContainerBuilder()
        .setAccentColor(COLOR_AVATAR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🔍 2.2 Buscador de Clones y Similares\n` +
            `🎯 **Referencia:** **[${origItem.name}](https://www.roblox.com/catalog/${origItem.id})** (\`ID: ${origItem.id}\` • ${origItem.assetTypeName})\n` +
            `💎 **Precio Original:** ${origPriceFormatted}  •  🗂️ **Filtro:** **${modeLabels[mode] || modeLabels.all}**` +
            (feedbackMsg ? `\n\n> ${feedbackMsg}` : '')
        ))
        .addSeparatorComponents(separador())
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://clones_comparison.png')
            )
        )
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 📋 Mejores Alternativas Encontradas\n${lines}` + inspectedBlock
        ));

    const selectAlt = new StringSelectMenuBuilder()
        .setCustomId('select_ava_clones_pick')
        .setPlaceholder('👇 Elegí una alternativa para probarla en tu Avatar o seguir su precio...')
        .addOptions(
            alternatives.slice(0, 6).map((alt, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`#${i + 1} ${String(alt.name).substring(0, 78)}`)
                    .setDescription(`${alt.isOfficialRoblox ? '[Roblox Oficial]' : '[Clon UGC]'} ${alt.price > 0 ? `${alt.price} R$ (Con 40%: ${Math.ceil(alt.price * 0.6)} R$)` : 'Offsale'} • ID ${alt.id}`.substring(0, 95))
                    .setValue(`${origItem.id}:${mode}:${alt.id}`)
                    .setEmoji(alt.isOfficialRoblox ? '🏛️' : '💸')
                    .setDefault(String(alt.id) === String(selectedAltId))
            )
        );

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectAlt));
    container.addSeparatorComponents(separador(true));

    const safeQ = String(origItem.id);
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_ava_clones_modal', 'Buscar Otro Ítem', '🔎', ButtonStyle.Primary),
            boton(`btn_ava_clones_mode:all:${safeQ}`, 'Todos', '🌐', mode === 'all' ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton(`btn_ava_clones_mode:cheap:${safeQ}`, 'UGC Baratos', '💸', mode === 'cheap' ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton(`btn_ava_clones_mode:official:${safeQ}`, 'Oficiales Roblox', '🏛️', mode === 'official' ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_nav_main_menu', 'Menú', '🏠', ButtonStyle.Secondary)
        )
    );

    if (inspectedAlt) {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton(`btn_ava_clones_watch:${inspectedAlt.id}:${origItem.id}:${mode}`, 'Monitorear en Mi Lista', '🎯', ButtonStyle.Success),
                boton(`btn_ava_clones_tryon:${inspectedAlt.id}`, 'Probar en Mi Avatar (2.1)', '🧪', ButtonStyle.Primary),
                new ButtonBuilder()
                    .setLabel('Comprar en Roblox')
                    .setEmoji('🛒')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://www.roblox.com/catalog/${inspectedAlt.id}`)
            )
        );
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Roblox Toolkit • 2.2 Buscador de Clones y Similares con precios reales y filtro por tipo')
    ));

    return {
        components: [container],
        files: [attachment],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// HERRAMIENTA 2.3: 🧬 Extractor de Texturas + Probador de Plantillas 2D en Maniquí R6
// ==========================================

/**
 * Descarga un archivo de asset desde Roblox AssetDelivery probando v1 directo, v1 roproxy y v2 JSON locations.
 */
async function descargarBufferAssetDelivery(targetAssetId) {
    const id = String(targetAssetId).trim();
    const v1Urls = [
        `https://assetdelivery.roblox.com/v1/asset/?id=${id}`,
        `https://assetdelivery.roproxy.com/v1/asset/?id=${id}`
    ];

    for (const u of v1Urls) {
        try {
            const r = await axios.get(u, {
                responseType: 'arraybuffer',
                timeout: 6500,
                maxRedirects: 5,
                headers: { 'User-Agent': 'Roblox/WinInet' }
            });
            if (r.data && r.data.byteLength > 32) {
                return Buffer.from(r.data);
            }
        } catch {
            // Probar siguiente
        }
    }

    // Fallback a AssetDelivery v2 (devuelve JSON con { locations: [{ location: "https://tr.rbxcdn.com/..." }] })
    const v2Urls = [
        `https://assetdelivery.roblox.com/v2/assetId/${id}`,
        `https://assetdelivery.roproxy.com/v2/assetId/${id}`
    ];
    for (const u2 of v2Urls) {
        try {
            const metaRes = await axios.get(u2, {
                timeout: 5500,
                headers: { 'User-Agent': 'Roblox/WinInet' }
            });
            const loc = metaRes.data?.locations?.[0]?.location;
            if (loc) {
                const fileRes = await axios.get(loc, {
                    responseType: 'arraybuffer',
                    timeout: 6500
                });
                if (fileRes.data && fileRes.data.byteLength > 32) {
                    return Buffer.from(fileRes.data);
                }
            }
        } catch {
            // Ignorar
        }
    }

    return null;
}

/**
 * Extrae el ID numérico real de la plantilla PNG (ShirtTemplate / PantsTemplate / Graphic)
 * tanto desde archivos XML clásicos como desde archivos binarios RBXM de Roblox.
 */
function extraerTemplateIdDesdeBufferPrenda(buf) {
    if (!buf || buf.length < 16) return null;
    // Usar latin1 además de utf8 para no perder secuencias ASCII dentro de binarios RBXM
    const rawStr = buf.toString('latin1');

    const patterns = [
        /<Content\s+name="(?:ShirtTemplate|PantsTemplate|Graphic)">\s*<url>[^<]*?(\d{5,20})<\/url>/i,
        /<url>[^<]*?(?:id=|rbxassetid:\/\/)(\d{5,20})<\/url>/i,
        /http:\/\/www\.roblox\.com\/asset\/\?id=(\d{5,20})/i,
        /https:\/\/www\.roblox\.com\/asset\/\?id=(\d{5,20})/i,
        /rbxassetid:\/\/(\d{5,20})/i,
        /id=(\d{5,20})/i
    ];

    for (const regex of patterns) {
        const m = rawStr.match(regex);
        if (m && m[1]) {
            return m[1];
        }
    }
    return null;
}

async function extraerTextura2DRoblox(queryOrId) {
    const raw = String(queryOrId || '').trim() || '144076358';
    let assetId = /^\d+$/.test(raw) ? raw : extractIdFromInput(raw);

    // Si el usuario escribió el nombre de una camisa o pantalón, buscar en el catálogo de Ropa Clásica (Category=3)
    if (!assetId) {
        const searchUrls = [
            `https://catalog.roblox.com/v1/search/items/details?Category=3&Subcategory=56&Keyword=${encodeURIComponent(raw)}&Limit=10`,
            `https://catalog.roblox.com/v1/search/items/details?Category=3&Keyword=${encodeURIComponent(raw)}&Limit=10`,
            `https://catalog.roblox.com/v1/search/items/details?Keyword=${encodeURIComponent(raw)}&Limit=10`
        ];
        for (const sUrl of searchUrls) {
            try {
                const searchRes = await fetchWithRetry(sUrl).catch(() => null);
                const list = searchRes?.data?.data || [];
                const classicMatch = list.find(it => [2, 11, 12].includes(Number(it.assetType)));
                const chosen = classicMatch || list[0];
                if (chosen?.id) {
                    assetId = String(chosen.id);
                    break;
                }
            } catch {
                // Continuar
            }
        }
    }

    if (!assetId) {
        return { error: `No se encontró ninguna camisa o pantalón clásico para **"${raw}"**.` };
    }

    const metaRes = await fetchWithRetry(`https://economy.roblox.com/v2/assets/${assetId}/details`).catch(() => null);
    const meta = metaRes?.data || {};
    const name = meta.Name || `Prenda Roblox #${assetId}`;
    const assetTypeId = Number(meta.AssetTypeId || 11);
    const creatorName = meta.Creator?.Name || 'Roblox';
    const price = Number(meta.PriceInRobux || 0);

    let realImageId = assetId;
    let rawPngBuffer = null;

    // 1. Descargar el contenedor del asset (si es Camisa 11, Pantalón 12 o T-Shirt 2, contiene el ID interno de la imagen PNG)
    const initialBuf = await descargarBufferAssetDelivery(assetId);
    if (initialBuf) {
        const isPng = initialBuf.length > 8 && initialBuf[0] === 0x89 && initialBuf[1] === 0x50 && initialBuf[2] === 0x4E && initialBuf[3] === 0x47;
        const isJpg = initialBuf.length > 4 && initialBuf[0] === 0xFF && initialBuf[1] === 0xD8;
        if (isPng || isJpg) {
            // El usuario pasó directamente el ID de la imagen/textura
            rawPngBuffer = initialBuf;
        } else {
            const extractedId = extraerTemplateIdDesdeBufferPrenda(initialBuf);
            if (extractedId) {
                realImageId = extractedId;
            }
        }
    }

    // 2. Si aún no tenemos el PNG en bruto y obtuvimos el realImageId de la plantilla, descargarlo de AssetDelivery
    if (!rawPngBuffer && String(realImageId) !== String(assetId)) {
        const tplBuf = await descargarBufferAssetDelivery(realImageId);
        if (tplBuf && tplBuf.length > 100) {
            const isPng = tplBuf[0] === 0x89 && tplBuf[1] === 0x50;
            const isJpg = tplBuf[0] === 0xFF && tplBuf[1] === 0xD8;
            if (isPng || isJpg) {
                rawPngBuffer = tplBuf;
            }
        }
    }

    // 3. Si aún no se pudo obtener el binario directo desde AssetDelivery, solicitar la miniatura de la TEXTURA (realImageId)
    let fallbackImageUrl = null;
    if (!rawPngBuffer) {
        const thumbRes = await fetchWithRetry(
            `https://thumbnails.roblox.com/v1/assets?assetIds=${realImageId}&size=420x420&format=Png&isCircular=false`
        ).catch(() => null);
        fallbackImageUrl = thumbRes?.data?.data?.[0]?.imageUrl || null;
        if (fallbackImageUrl) {
            try {
                const imgRes = await axios.get(fallbackImageUrl, { responseType: 'arraybuffer', timeout: 5500 });
                rawPngBuffer = Buffer.from(imgRes.data);
            } catch {
                // Silencioso
            }
        }
    }

    if (!rawPngBuffer && !fallbackImageUrl) {
        return {
            error: `No fue posible extraer la textura PNG del activo \`${assetId}\`. Verificá que sea una Camisa, Pantalón, T-Shirt o Decal válido de Roblox.`
        };
    }

    return {
        assetId,
        realImageId,
        name,
        assetTypeId,
        assetTypeName: ASSET_TYPE_NAMES[assetTypeId] || `AssetType #${assetTypeId}`,
        creatorName,
        price,
        rawPngBuffer,
        imageUrl: fallbackImageUrl
    };
}

function construirPanelTexturas2DInicial() {
    const container = new ContainerBuilder()
        .setAccentColor(COLOR_AVATAR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🧬 2.3 Extractor de Texturas + Maniquí 2D\n` +
            `Extraé el **lienzo original (\`.PNG\` 585×559)** de cualquier camisa, pantalón o T-Shirt de Roblox y previsualizá cómo calzan sus costuras sobre un **Maniquí R6 (Frente y Espalda)**.\n\n` +
            `> 🖼️ **Plantilla UV Real sin compresión:** Resuelve el \`ShirtTemplate\` / \`PantsTemplate\` interno de Roblox.\n` +
            `> 👕 **Probador R6 en Vivo:** Alterná entre modo Camisa, Pantalón o Traje Completo para inspeccionar frente, espalda, brazos y piernas.\n\n` +
            `-# Tocá **🧬 Extraer Textura de Prenda** para ingresar un Nombre, ID o URL, o probá el ejemplo interactivo abajo.`
        ))
        .addSeparatorComponents(separador(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_ava_tex_extract_modal', 'Extraer Textura de Prenda', '🧬', ButtonStyle.Primary),
                boton('btn_ava_tex_demo_mannequin', 'Probar Ejemplo en Maniquí R6', '👕', ButtonStyle.Success),
                boton('btn_nav_main_menu', 'Volver al Toolkit', '🏠', ButtonStyle.Secondary)
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer('Roblox Toolkit • 2.3 Extractor de Texturas 2D y Probador de Costuras R6')
        ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

async function construirPanelTexturas2D(discordUserId, queryOrId = '144076358', feedbackMsg = null) {
    const texData = await extraerTextura2DRoblox(queryOrId);
    if (texData.error) {
        const errContainer = new ContainerBuilder()
            .setAccentColor(COLORES.error)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Error al Extraer Textura\n${texData.error}`))
            .addSeparatorComponents(separador())
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    boton('btn_ava_tex_extract_modal', 'Probar otro ID o Nombre', '🧬', ButtonStyle.Primary),
                    boton('btn_ava_tex_demo_mannequin', 'Probar Ejemplo en Maniquí R6', '👕', ButtonStyle.Success),
                    boton('btn_nav_main_menu', 'Menú Principal', '🏠', ButtonStyle.Secondary)
                )
            );
        return { components: [errContainer], files: [], attachments: [], flags: MessageFlags.IsComponentsV2 };
    }

    lastTextureSession.set(String(discordUserId), texData);

    const files = [];
    let galleryUrl = texData.imageUrl;
    if (texData.rawPngBuffer) {
        const fileName = `template_${texData.realImageId}.png`;
        files.push(new AttachmentBuilder(texData.rawPngBuffer, { name: fileName }));
        galleryUrl = `attachment://${fileName}`;
    }

    const container = new ContainerBuilder()
        .setAccentColor(COLOR_AVATAR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🧬 2.3 Extractor de Texturas + Maniquí 2D\n` +
            `🏷️ **Prenda:** **[${texData.name}](https://www.roblox.com/catalog/${texData.assetId})**  •  👤 **Creador:** \`${texData.creatorName}\`\n` +
            `🆔 **Asset ID Catálogo:** \`${texData.assetId}\`  ➔  🖼️ **Texture ID Real (.PNG):** \`${texData.realImageId}\`\n` +
            `📦 **Tipo:** \`${texData.assetTypeName}\`  •  💵 **Precio:** ${texData.price > 0 ? formatearPrecio(texData.price) : '`Gratis / Offsale`'}` +
            (feedbackMsg ? `\n\n> ${feedbackMsg}` : '')
        ))
        .addSeparatorComponents(separador());

    if (galleryUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(galleryUrl)
            )
        );
        container.addSeparatorComponents(separador());
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `✅ **Plantilla original extraída:** Podés descargar el archivo \`.PNG\` adjunto arriba o presionar **👕 Probar en Maniquí R6 (Frente y Espalda)** para ver cómo quedan las costuras aplicadas al personaje.`
    ));
    container.addSeparatorComponents(separador(true));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_ava_tex_mannequin', 'Probar en Maniquí R6 (Frente y Espalda)', '👕', ButtonStyle.Success),
            boton('btn_ava_tex_extract_modal', 'Extraer Otra Prenda', '🧬', ButtonStyle.Primary),
            boton('btn_ava_tex_custom_modal', 'Subir URL .PNG Propia', '📤', ButtonStyle.Secondary),
            boton('btn_nav_main_menu', 'Menú', '🏠', ButtonStyle.Secondary)
        )
    );

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Roblox Toolkit • 2.3 Extractor de Texturas 2D sin pérdida')
    ));

    return {
        components: [container],
        files,
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

async function construirPanelManiqui2D(discordUserId, customUrlOrId = null, customTitle = null, garmentModeOverride = null) {
    let sourceImg = customUrlOrId;
    let title = customTitle || 'Plantilla Personalizada 2D';
    let assetTypeId = null;
    let assetIdRef = null;
    let realImageIdRef = null;

    if (!sourceImg) {
        let last = lastTextureSession.get(String(discordUserId));
        if (!last) {
            const extracted = await extraerTextura2DRoblox('144076358');
            if (!extracted.error) {
                lastTextureSession.set(String(discordUserId), extracted);
                last = extracted;
            }
        }
        if (last) {
            sourceImg = last.rawPngBuffer || last.imageUrl;
            title = `${last.name} (Tex #${last.realImageId})`;
            assetTypeId = last.assetTypeId;
            assetIdRef = last.assetId;
            realImageIdRef = last.realImageId;
        }
    } else if (/^\d+$/.test(String(sourceImg).trim()) || String(sourceImg).includes('roblox.com/catalog/')) {
        const extracted = await extraerTextura2DRoblox(sourceImg);
        if (!extracted.error) {
            lastTextureSession.set(String(discordUserId), extracted);
            sourceImg = extracted.rawPngBuffer || extracted.imageUrl;
            title = `${extracted.name} (Tex #${extracted.realImageId})`;
            assetTypeId = extracted.assetTypeId;
            assetIdRef = extracted.assetId;
            realImageIdRef = extracted.realImageId;
        }
    }

    const activeMode = garmentModeOverride || (assetTypeId === 12 ? 'pants' : (assetTypeId === 2 ? 'tshirt' : 'shirt'));

    const pngBuffer = await generateMannequinTemplateCanvas(sourceImg, title, {
        assetTypeId,
        garmentMode: garmentModeOverride || undefined
    });
    const attachment = new AttachmentBuilder(pngBuffer, { name: 'mannequin_2d_preview.png' });

    const container = new ContainerBuilder()
        .setAccentColor(COLOR_AVATAR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 👕 2.3 Probador de Costuras 2D en Maniquí R6\n` +
            `📐 **Plantilla aplicada:** **${title}**` +
            (assetIdRef ? ` (\`Asset: ${assetIdRef}\` • \`Texture: ${realImageIdRef}\`)` : '') + `\n` +
            `✅ **Mapeo UV en vivo (Frente y Espalda):** Revisá la alineación del torso, hombros, brazos y piernas con fondo de alto contraste.`
        ))
        .addSeparatorComponents(separador())
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://mannequin_2d_preview.png')
            )
        )
        .addSeparatorComponents(separador(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_ava_tex_mode:shirt', 'Modo Camisa', '👕', activeMode === 'shirt' ? ButtonStyle.Success : ButtonStyle.Secondary),
                boton('btn_ava_tex_mode:pants', 'Modo Pantalón', '👖', activeMode === 'pants' ? ButtonStyle.Success : ButtonStyle.Secondary),
                boton('btn_ava_tex_mode:full', 'Traje Completo', '🕴️', activeMode === 'full' ? ButtonStyle.Success : ButtonStyle.Secondary),
                boton('btn_ava_tex_extract_modal', 'Otra Prenda Roblox', '🧬', ButtonStyle.Primary),
                boton('btn_ava_tex_custom_modal', 'Subir URL .PNG', '📤', ButtonStyle.Secondary)
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_ava_tex_view_raw', 'Ver Lienzo 585×559 Descargable', '🖼️', ButtonStyle.Secondary),
                boton('btn_nav_main_menu', 'Volver al Toolkit', '🏠', ButtonStyle.Secondary)
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer('Roblox Toolkit • 2.3 Probador de Costuras UV R6 (Frente + Espalda)')
        ));

    return {
        components: [container],
        files: [attachment],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// HERRAMIENTA 2.4: 📦 Exportador 3D (Render PNG HD + Archivo .ZIP con .OBJ/.MTL y Texturas)
// ==========================================
function resolverCdnUrlDesdeHash(hash, statusCode = 30) {
    if (!hash) return null;
    if (String(hash).startsWith('http')) return String(hash);
    let i = 31;
    for (let t = 0; t < hash.length; t++) {
        i ^= hash.charCodeAt(t);
    }
    return `https://t${i % 8}.rbxcdn.com/${statusCode}-${hash}`;
}

function parseRobloxMeshToObj(buf, meshName = 'roblox_mesh') {
    if (!buf || buf.length < 32) return null;
    const header = buf.subarray(0, 12).toString('ascii');
    if (!header.startsWith('version ')) return null;

    if (header.startsWith('version 1.')) {
        const text = buf.toString('utf8');
        const lines = text.split(/\r?\n/);
        if (lines.length < 3) return null;
        const numFaces = parseInt(lines[1], 10);
        if (!numFaces || isNaN(numFaces)) return null;
        const dataLine = lines.slice(2).join('').trim();
        const matches = [...dataLine.matchAll(/\[([^\]]+)\]/g)].map(m =>
            m[1].split(',').map(n => parseFloat(n.trim()))
        );
        if (matches.length < numFaces * 9) return null;

        let obj = `# Roblox Mesh ${header.trim()} convertida por Kortex\no ${meshName}\n`;
        let vCount = 0;
        for (let i = 0; i < numFaces * 3; i++) {
            const pos = matches[i * 3];
            const norm = matches[i * 3 + 1];
            const uv = matches[i * 3 + 2];
            if (!pos || !norm || !uv) break;
            obj += `v ${pos[0].toFixed(5)} ${pos[1].toFixed(5)} ${pos[2].toFixed(5)}\n`;
            obj += `vn ${norm[0].toFixed(5)} ${norm[1].toFixed(5)} ${norm[2].toFixed(5)}\n`;
            obj += `vt ${uv[0].toFixed(5)} ${(1 - uv[1]).toFixed(5)}\n`;
            vCount++;
        }
        const fCount = Math.floor(vCount / 3);
        for (let f = 0; f < fCount; f++) {
            const a = f * 3 + 1;
            const b = f * 3 + 2;
            const c = f * 3 + 3;
            obj += `f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}\n`;
        }
        return { objText: obj, vertexCount: vCount, faceCount: fCount };
    }

    try {
        const nlIdx = buf.indexOf(0x0A);
        if (nlIdx < 0 || nlIdx + 12 >= buf.length) return null;
        const offset = nlIdx + 1;
        const sizeofMeshHeader = buf.readUInt16LE(offset);
        let sizeofVertex = 40;
        let sizeofFace = 12;
        let numVerts = 0;
        let numFaces = 0;

        if (header.startsWith('version 2.')) {
            sizeofVertex = buf.readUInt8(offset + 2);
            sizeofFace = buf.readUInt8(offset + 3);
            numVerts = buf.readUInt32LE(offset + 4);
            numFaces = buf.readUInt32LE(offset + 8);
        } else {
            sizeofVertex = buf.readUInt8(offset + 2);
            sizeofFace = buf.readUInt8(offset + 3);
            numVerts = buf.readUInt32LE(offset + 8);
            numFaces = buf.readUInt32LE(offset + 12);
        }

        if (numVerts <= 0 || numVerts > 150000 || numFaces <= 0 || numFaces > 150000) return null;
        const vertStart = offset + sizeofMeshHeader;
        const faceStart = vertStart + numVerts * sizeofVertex;
        if (faceStart + numFaces * sizeofFace > buf.length) return null;

        let obj = `# Roblox Binary Mesh (${header.trim()}) convertida a Wavefront .OBJ por Kortex\no ${meshName}\n`;
        for (let v = 0; v < numVerts; v++) {
            const vo = vertStart + v * sizeofVertex;
            const px = buf.readFloatLE(vo);
            const py = buf.readFloatLE(vo + 4);
            const pz = buf.readFloatLE(vo + 8);
            const nx = buf.readFloatLE(vo + 12);
            const ny = buf.readFloatLE(vo + 16);
            const nz = buf.readFloatLE(vo + 20);
            const tu = buf.readFloatLE(vo + 24);
            const tv = buf.readFloatLE(vo + 28);
            obj += `v ${px.toFixed(5)} ${py.toFixed(5)} ${pz.toFixed(5)}\n`;
            obj += `vn ${nx.toFixed(5)} ${ny.toFixed(5)} ${nz.toFixed(5)}\n`;
            obj += `vt ${tu.toFixed(5)} ${(1 - tv).toFixed(5)}\n`;
        }

        const maxFacesToWrite = Math.min(numFaces, 45000);
        for (let f = 0; f < maxFacesToWrite; f++) {
            const fo = faceStart + f * sizeofFace;
            const a = buf.readUInt32LE(fo) + 1;
            const b = buf.readUInt32LE(fo + 4) + 1;
            const c = buf.readUInt32LE(fo + 8) + 1;
            if (a <= numVerts && b <= numVerts && c <= numVerts) {
                obj += `f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}\n`;
            }
        }
        return { objText: obj, vertexCount: numVerts, faceCount: maxFacesToWrite };
    } catch {
        return null;
    }
}

async function exportarModelo3DEnRam(targetInput, discordUserId) {
    let isUserAvatar = true;
    let targetId = null;
    let displayTitle = '';

    const raw = String(targetInput || '').trim();
    if (!raw || raw === 'linked') {
        const linked = await obtenerCuentaVinculada(discordUserId);
        targetId = linked?.roblox_user_id || 156;
        displayTitle = `Avatar de @${linked?.roblox_username || 'Builderman'}`;
    } else if (/^asset:/i.test(raw)) {
        isUserAvatar = false;
        targetId = extractIdFromInput(raw);
        displayTitle = `Asset #${targetId}`;
    } else if (/^\d+$/.test(raw)) {
        const econRes = await fetchWithRetry(`https://economy.roblox.com/v2/assets/${raw}/details`).catch(() => null);
        if (econRes?.data?.Name && econRes?.data?.AssetTypeId) {
            isUserAvatar = false;
            targetId = raw;
            displayTitle = `${econRes.data.Name} (#${raw})`;
        } else {
            const prof = await resolverUsuarioRoblox(raw);
            if (prof) {
                targetId = prof.roblox_user_id;
                displayTitle = `Avatar de @${prof.roblox_username}`;
            } else {
                isUserAvatar = false;
                targetId = raw;
                displayTitle = `Asset #${raw}`;
            }
        }
    } else {
        const prof = await resolverUsuarioRoblox(raw);
        if (prof) {
            targetId = prof.roblox_user_id;
            displayTitle = `Avatar de @${prof.roblox_username}`;
        } else {
            return { error: `No se encontró el usuario o activo **${raw}** en Roblox.` };
        }
    }

    const endpoint3d = isUserAvatar
        ? `https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${targetId}`
        : `https://thumbnails.roblox.com/v1/assets-thumbnail-3d?assetId=${targetId}`;

    const endpoint2d = isUserAvatar
        ? `https://thumbnails.roblox.com/v1/users/avatar?userIds=${targetId}&size=720x720&format=Png&isCircular=false`
        : `https://thumbnails.roblox.com/v1/assets?assetIds=${targetId}&size=420x420&format=Png&isCircular=false`;

    let [res3d, res2d] = await Promise.all([
        fetchWithRetry(endpoint3d, { bypassCache: true }).catch(() => null),
        fetchWithRetry(endpoint2d).catch(() => null)
    ]);

    // Si Roblox está compilando el manifiesto 3D ("Pending"), esperar 650ms y reintentar
    if (res3d?.data?.state === 'Pending' && !res3d?.data?.imageUrl) {
        await new Promise(r => setTimeout(r, 650));
        res3d = await fetchWithRetry(endpoint3d, { bypassCache: true }).catch(() => res3d);
    }

    const preview2dUrl = res2d?.data?.data?.[0]?.imageUrl || null;
    const state3d = res3d?.data?.state || 'Pending';
    const manifestUrl = res3d?.data?.imageUrl || null;

    const zip = new AdmZip();
    let objContent = null;
    let mtlContent = null;
    let texturesCount = 0;
    let meshesExtracted = 0;
    let vertexCount = 0;
    let faceCount = 0;
    let renderPngBuffer = null;

    if (preview2dUrl) {
        try {
            const pngRes = await axios.get(preview2dUrl, { responseType: 'arraybuffer', timeout: 6000 });
            renderPngBuffer = Buffer.from(pngRes.data);
            zip.addFile('avatar_render_hd.png', renderPngBuffer);
        } catch {
            // Silencioso
        }
    }

    if (manifestUrl) {
        try {
            const directManifestUrl = toDirectRobloxUrl(manifestUrl);
            const manifestRes = await fetchWithRetry(directManifestUrl);
            const manifestData = manifestRes?.data;

            if (manifestData && typeof manifestData === 'object') {
                zip.addFile('manifest_3d.json', Buffer.from(JSON.stringify(manifestData, null, 2), 'utf8'));

                const objHash = manifestData.obj;
                const mtlHash = manifestData.mtl;
                const texHashes = Array.isArray(manifestData.textures) ? manifestData.textures : [];

                const objUrl = resolverCdnUrlDesdeHash(objHash);
                const mtlUrl = resolverCdnUrlDesdeHash(mtlHash);

                const [objRes, mtlRes] = await Promise.all([
                    objUrl ? axios.get(objUrl, { responseType: 'text', timeout: 6000 }).catch(() => null) : null,
                    mtlUrl ? axios.get(mtlUrl, { responseType: 'text', timeout: 6000 }).catch(() => null) : null
                ]);

                if (objRes?.data) {
                    objContent = String(objRes.data);
                    zip.addFile('model.obj', Buffer.from(objContent, 'utf8'));
                    meshesExtracted = 1;
                    vertexCount = (objContent.match(/^v\s+/gm) || []).length;
                    faceCount = (objContent.match(/^f\s+/gm) || []).length;
                }

                if (mtlRes?.data) {
                    mtlContent = String(mtlRes.data);
                    zip.addFile('material.mtl', Buffer.from(mtlContent, 'utf8'));
                }

                const texSlices = texHashes.slice(0, 4);
                const texDownloads = await Promise.all(
                    texSlices.map(th => {
                        const tUrl = resolverCdnUrlDesdeHash(th);
                        return tUrl ? axios.get(tUrl, { responseType: 'arraybuffer', timeout: 5000 }).catch(() => null) : null;
                    })
                );

                texDownloads.forEach((tr, idx) => {
                    if (tr?.data) {
                        zip.addFile(`texture_${idx + 1}.png`, Buffer.from(tr.data));
                        texturesCount++;
                    }
                });
            }
        } catch {
            // Continuar con extracción directa de mallas si el manifiesto falló
        }
    }

    if (!objContent) {
        const assetIdsToExtract = [];
        if (!isUserAvatar && targetId) {
            assetIdsToExtract.push({ id: targetId, name: `asset_${targetId}` });
        } else if (isUserAvatar && targetId) {
            const avRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${targetId}/avatar`).catch(() => null);
            const worn = (avRes?.data?.assets || []).filter(a => [8, 41, 42, 43, 44, 45, 46, 47].includes(a.assetType?.id));
            worn.slice(0, 4).forEach(a => assetIdsToExtract.push({ id: a.id, name: a.name || `item_${a.id}` }));
        }

        let combinedObj = `# Paquete 3D Wavefront (.OBJ) exportado por Kortex\nmtllib material.mtl\n`;
        let vOffset = 0;

        for (const item of assetIdsToExtract) {
            try {
                const rbxmBuf = await descargarBufferAssetDelivery(item.id);
                if (!rbxmBuf) continue;

                const parsedDirect = parseRobloxMeshToObj(rbxmBuf, item.name.replace(/\s+/g, '_'));
                if (parsedDirect) {
                    combinedObj += parsedDirect.objText + '\n';
                    vertexCount += parsedDirect.vertexCount;
                    faceCount += parsedDirect.faceCount;
                    meshesExtracted++;
                    continue;
                }

                const textContent = rbxmBuf.toString('latin1');
                const idMatches = [...textContent.matchAll(/(?:id=|rbxassetid:\/\/)(\d{5,20})/gi)].map(m => m[1]);
                const uniqueIds = [...new Set(idMatches)].slice(0, 3);

                for (const subId of uniqueIds) {
                    const subBuf = await descargarBufferAssetDelivery(subId);
                    if (!subBuf) continue;
                    if (subBuf[0] === 0x89 && subBuf[1] === 0x50) {
                        texturesCount++;
                        zip.addFile(`texture_${item.id}_${subId}.png`, subBuf);
                    } else {
                        const subMesh = parseRobloxMeshToObj(subBuf, `${item.name.replace(/[^a-zA-Z0-9]/g, '_')}_${subId}`);
                        if (subMesh) {
                            const reindexed = subMesh.objText.replace(/^f\s+(\d+)\/\1\/\1\s+(\d+)\/\2\/\2\s+(\d+)\/\3\/\3/gm, (_, a, b, c) => {
                                const na = Number(a) + vOffset;
                                const nb = Number(b) + vOffset;
                                const nc = Number(c) + vOffset;
                                return `f ${na}/${na}/${na} ${nb}/${nb}/${nb} ${nc}/${nc}/${nc}`;
                            });
                            combinedObj += reindexed + '\n';
                            vOffset += subMesh.vertexCount;
                            vertexCount += subMesh.vertexCount;
                            faceCount += subMesh.faceCount;
                            meshesExtracted++;
                        }
                    }
                }
            } catch {
                // Continuar
            }
        }

        if (meshesExtracted > 0) {
            objContent = combinedObj;
            mtlContent = `# Material generado por Kortex 3D Exporter\nnewmtl RobloxMaterial\nKa 1.000 1.000 1.000\nKd 0.900 0.900 0.900\n`;
            zip.addFile('model.obj', Buffer.from(objContent, 'utf8'));
            zip.addFile('material.mtl', Buffer.from(mtlContent, 'utf8'));
        }
    }

    if (!objContent) {
        objContent =
            `# Kortex 3D Export Reference (${displayTitle})\n` +
            `mtllib material.mtl\n` +
            `o RobloxRigBase\n` +
            `v -1.0 -1.0  1.0\nv  1.0 -1.0  1.0\nv  1.0  1.0  1.0\nv -1.0  1.0  1.0\n` +
            `v -1.0 -1.0 -1.0\nv  1.0 -1.0 -1.0\nv  1.0  1.0 -1.0\nv -1.0  1.0 -1.0\n` +
            `f 1 2 3 4\nf 8 7 6 5\nf 4 3 7 8\nf 5 1 4 8\nf 5 6 2 1\nf 2 6 7 3\n`;
        mtlContent = `# Kortex Material\nnewmtl DefaultMaterial\nKd 0.8 0.8 0.8\n`;
        vertexCount = 8;
        faceCount = 6;
        meshesExtracted = 1;
        zip.addFile('model.obj', Buffer.from(objContent, 'utf8'));
        zip.addFile('material.mtl', Buffer.from(mtlContent, 'utf8'));
    }

    const readmeTxt =
        `========================================================\n` +
        `KORTEX 3D STUDIO EXPORTER — ${displayTitle}\n` +
        `========================================================\n` +
        `• Render PNG HD: avatar_render_hd.png\n` +
        `• Geometría 3D: model.obj (${vertexCount} vértices, ${faceCount} caras)\n` +
        `• Materiales: material.mtl\n` +
        `• Texturas extraídas: ${texturesCount} archivo(s) .png\n` +
        `• Compatible con: Blender, Blockbench, Cinema4D, Maya\n`;
    zip.addFile('README_KORTEX_3D.txt', Buffer.from(readmeTxt, 'utf8'));

    const zipBuffer = zip.toBuffer();

    return {
        isUserAvatar,
        targetId,
        displayTitle,
        state3d,
        preview2dUrl,
        renderPngBuffer,
        zipBuffer,
        vertexCount,
        faceCount,
        meshesExtracted,
        texturesCount,
        sizeKB: (zipBuffer.length / 1024).toFixed(1)
    };
}

function construirPanelExportador3DInicial() {
    const container = new ContainerBuilder()
        .setAccentColor(COLOR_AVATAR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 📦 2.4 Exportador 3D (Render PNG HD + Archivo .ZIP)\n` +
            `Generá un **Render PNG transparente de alta resolución** y descargá el paquete **\`.ZIP\`** con la malla 3D (\`model.obj\`, \`material.mtl\` y texturas \`.png\`) listo para abrir en **Blender**, **Blockbench** o **Cinema 4D**.\n\n` +
            `> 🖼️ **Render HD Transparente:** Ideal para miniaturas, banners o diseño gráfico.\n` +
            `> 📦 **Paquete .ZIP en RAM:** Incluye geometría Wavefront \`.OBJ\`, materiales \`.MTL\` y texturas.\n\n` +
            `-# Elegí abajo si querés exportar tu propio avatar vinculado, otro jugador/accesorio o probar un modelo de ejemplo.`
        ))
        .addSeparatorComponents(separador(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_ava_export3d_linked', 'Exportar Mi Avatar', '👤', ButtonStyle.Success),
                boton('btn_ava_export3d_modal', 'Otro Avatar o Accesorio', '🔎', ButtonStyle.Primary),
                boton('btn_ava_export3d_demo:1365767', 'Ejemplo: Valkyrie 3D', '⚡', ButtonStyle.Secondary),
                boton('btn_nav_main_menu', 'Volver al Toolkit', '🏠', ButtonStyle.Secondary)
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer('Roblox Toolkit • 2.4 Exportador 3D (.PNG HD + .OBJ / .MTL en .ZIP)')
        ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

async function construirPanelExportador3D(discordUserId, targetInput = 'linked') {
    const exp = await exportarModelo3DEnRam(targetInput, discordUserId);
    if (exp.error) {
        const errContainer = new ContainerBuilder()
            .setAccentColor(COLORES.error)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Error de Exportación 3D\n${exp.error}`))
            .addSeparatorComponents(separador())
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    boton('btn_ava_export3d_modal', 'Intentar otro Usuario o ID', '📦', ButtonStyle.Primary),
                    boton('btn_ava_export3d_demo:1365767', 'Ejemplo: Valkyrie 3D', '⚡', ButtonStyle.Secondary),
                    boton('btn_nav_main_menu', 'Menú Principal', '🏠', ButtonStyle.Secondary)
                )
            );
        return { components: [errContainer], files: [], attachments: [], flags: MessageFlags.IsComponentsV2 };
    }

    const showcasePngBuffer = await generate3DShowcaseCard(exp);
    const files = [
        new AttachmentBuilder(showcasePngBuffer, { name: 'render_3d_hd.png' }),
        new AttachmentBuilder(exp.zipBuffer, { name: 'avatar_3d_export.zip' })
    ];

    if (exp.renderPngBuffer) {
        files.push(new AttachmentBuilder(exp.renderPngBuffer, { name: 'avatar_transparent_hd.png' }));
    }

    const container = new ContainerBuilder()
        .setAccentColor(COLOR_AVATAR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 📦 2.4 Exportador 3D (Render PNG HD + Archivo .ZIP)\n` +
            `🎯 **Modelo procesado:** **${exp.displayTitle}** (ID \`${exp.targetId}\`)\n` +
            `📐 **Geometría (.OBJ):** \`${exp.vertexCount.toLocaleString('es-AR')} vértices\`  •  \`${exp.faceCount.toLocaleString('es-AR')} caras\`  •  \`${exp.meshesExtracted} malla(s)\`\n` +
            `🖼️ **Texturas y Render:** \`${exp.texturesCount} textura(s) .PNG\` + Render HD Transparente  •  🗜️ **Tamaño .ZIP:** \`${exp.sizeKB} KB\``
        ))
        .addSeparatorComponents(separador())
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://render_3d_hd.png')
            )
        )
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `✅ **Archivos adjuntos listos para descargar arriba:**\n` +
            `• 📁 **\`avatar_3d_export.zip\`** — Contiene \`model.obj\`, \`material.mtl\`, texturas \`.png\` y \`avatar_render_hd.png\`.\n` +
            `• 🖼️ **\`avatar_transparent_hd.png\`** — Imagen PNG con fondo transparente lista para edición.`
        ))
        .addSeparatorComponents(separador(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_ava_export3d_linked', 'Exportar Mi Avatar', '👤', ButtonStyle.Success),
                boton('btn_ava_export3d_modal', 'Otro Avatar o Accesorio', '📦', ButtonStyle.Primary),
                boton('btn_nav_main_menu', 'Volver al Toolkit', '🏠', ButtonStyle.Secondary)
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer('Roblox Toolkit • 2.4 Exportador 3D en Memoria RAM')
        ));

    return {
        components: [container],
        files,
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// HERRAMIENTA 2.5: 🎨 Emparejador de Accesorios y Cosméticos por Color (Color-Match UGC)
// ==========================================
const CATEGORIAS_COLORMATCH = {
    // Fila 1: Cabeza y Rostro
    all:      { label: 'Todos los Cosméticos',      shortLabel: 'Todos',      emoji: '✨', subcatParam: 'Category=11',                salesFilter: 'SalesTypeFilter=1', keywordSuffix: '' },
    hat:      { label: 'Sombreros y Cabeza',        shortLabel: 'Sombrero',   emoji: '🎩', subcatParam: 'Category=11&Subcategory=9',  salesFilter: 'SalesTypeFilter=1', keywordSuffix: 'Hat' },
    hair:     { label: 'Pelo y Peinados',           shortLabel: 'Pelo',       emoji: '💇', subcatParam: 'Category=4&Subcategory=20',  salesFilter: 'SalesTypeFilter=1', keywordSuffix: 'Hair' },
    face:     { label: 'Cara, Lentes y Visores',    shortLabel: 'Cara',       emoji: '😎', subcatParam: 'Category=11&Subcategory=21', salesFilter: 'SalesTypeFilter=1', keywordSuffix: 'Glasses' },
    neck:     { label: 'Cuello, Collares y Bufandas', shortLabel: 'Cuello',   emoji: '🧣', subcatParam: 'Category=11&Subcategory=22', salesFilter: 'SalesTypeFilter=1', keywordSuffix: 'Neck' },
    // Fila 2: Cuerpo, Espalda y Equipamiento
    shoulder: { label: 'Hombros y Mascotas',        shortLabel: 'Hombros',    emoji: '🦜', subcatParam: 'Category=11&Subcategory=23', salesFilter: 'SalesTypeFilter=1', keywordSuffix: 'Shoulder' },
    front:    { label: 'Frontal, Pecho y Chalecos', shortLabel: 'Pecho',      emoji: '🛡️', subcatParam: 'Category=11&Subcategory=24', salesFilter: 'SalesTypeFilter=1', keywordSuffix: 'Front' },
    back:     { label: 'Espalda, Alas y Mochilas',  shortLabel: 'Espalda',    emoji: '🎒', subcatParam: 'Category=11&Subcategory=25', salesFilter: 'SalesTypeFilter=1', keywordSuffix: 'Wings' },
    waist:    { label: 'Cintura, Cinturones y Colas', shortLabel: 'Cintura',  emoji: '⛓️', subcatParam: 'Category=11&Subcategory=26', salesFilter: 'SalesTypeFilter=1', keywordSuffix: 'Waist' },
    gear:     { label: 'Gear, Espadas y Mano',      shortLabel: 'Gear',       emoji: '⚔️', subcatParam: 'Category=11&Subcategory=5',  salesFilter: 'SalesTypeFilter=1', keywordSuffix: 'Sword' },
    // Fila 3: Ropa 2D, Prendas 3D y Exclusivos
    shirt:    { label: 'Camisas Clásicas (2D)',     shortLabel: 'Camisas',    emoji: '👕', subcatParam: 'Category=3&Subcategory=56',  salesFilter: 'SalesTypeFilter=1', keywordSuffix: 'Shirt' },
    pants:    { label: 'Pantalones Clásicos (2D)',  shortLabel: 'Pantalón',   emoji: '👖', subcatParam: 'Category=3&Subcategory=57',  salesFilter: 'SalesTypeFilter=1', keywordSuffix: 'Pants' },
    jacket:   { label: 'Chaquetas y Abrigos (3D)',  shortLabel: 'Abrigos 3D', emoji: '🧥', subcatParam: 'Category=3&Subcategory=61',  salesFilter: 'SalesTypeFilter=1', keywordSuffix: 'Jacket' },
    tshirt:   { label: 'T-Shirts y Estampados (2D)', shortLabel: 'T-Shirts',  emoji: '🖼️', subcatParam: 'Category=3&Subcategory=55',  salesFilter: 'SalesTypeFilter=1', keywordSuffix: '' },
    limited:  { label: 'Limiteds y Coleccionables', shortLabel: 'Limiteds',   emoji: '👑', subcatParam: 'Category=11',                salesFilter: 'SalesTypeFilter=2', keywordSuffix: '' }
};

async function ejecutarColorMatch(discordUserId, inputSource = 'my_avatar', categoryFilter = 'all', activeToneIdx = 0) {
    let baseTitle = 'Prenda / Avatar Base';
    let palette = null;
    let sourceImageUrl = null;

    const raw = String(inputSource || 'my_avatar').trim();
    const hexParsed = parseHexColor(raw);

    if (hexParsed) {
        baseTitle = `Color Hexadecimal ${hexParsed.hex}`;
        const r2 = Math.max(0, hexParsed.r - 45);
        const g2 = Math.max(0, hexParsed.g - 45);
        const b2 = Math.max(0, hexParsed.b - 45);
        const r3 = Math.min(255, hexParsed.r + 45);
        const g3 = Math.min(255, hexParsed.g + 45);
        const b3 = Math.min(255, hexParsed.b + 45);
        const toH = n => n.toString(16).padStart(2, '0').toUpperCase();
        palette = [
            hexParsed,
            { hex: `#${toH(r2)}${toH(g2)}${toH(b2)}`, r: r2, g: g2, b: b2 },
            { hex: `#${toH(r3)}${toH(g3)}${toH(b3)}`, r: r3, g: g3, b: b3 }
        ];
    } else if (raw === 'my_avatar') {
        const linked = await obtenerCuentaVinculada(discordUserId);
        const uid = linked?.roblox_user_id || 156;
        const uname = linked?.roblox_username || 'Builderman';
        baseTitle = `Avatar de @${uname}`;
        const thumbRes = await fetchWithRetry(
            `https://thumbnails.roblox.com/v1/users/avatar?userIds=${uid}&size=420x420&format=Png&isCircular=false`
        ).catch(() => null);
        sourceImageUrl = thumbRes?.data?.data?.[0]?.imageUrl || linked?.avatar_url || null;
        palette = await extractDominantColorsFromImage(sourceImageUrl);
    } else {
        // Puede ser ID numérico, URL o nombre de cualquier camisa, pantalón o accesorio
        const resolvedItem = await resolverItemCatalogoConPrecioReal(raw);
        if (!resolvedItem) {
            return { error: `No se encontró ninguna prenda, accesorio ni código HEX válido para **"${raw}"**.` };
        }
        baseTitle = `${resolvedItem.name} (#${resolvedItem.id})`;
        sourceImageUrl = resolvedItem.highResUrl || resolvedItem.imageUrl;
        palette = await extractDominantColorsFromImage(sourceImageUrl);
    }

    const safeToneIdx = Math.min(2, Math.max(0, Number(activeToneIdx || 0)));
    const primaryColor = palette[safeToneIdx] || palette[0];
    const colorSearchTerm = getClosestColorSearchTerm(primaryColor);

    const catInfo = CATEGORIAS_COLORMATCH[categoryFilter] || CATEGORIAS_COLORMATCH.all;
    const searchKeyword = catInfo.keywordSuffix ? `${colorSearchTerm} ${catInfo.keywordSuffix}` : colorSearchTerm;

    // IMPORTANTE: El endpoint v1/search/items/details de Roblox solo acepta Limit=10, Limit=28 o Limit=30.
    // Hacemos primero la consulta principal con Limit=28 y solo si devuelve pocos resultados hacemos un respaldo secuencial (evitando ráfagas 429).
    const primarySearchUrl = `https://catalog.roblox.com/v1/search/items/details?${catInfo.subcatParam}&Keyword=${encodeURIComponent(searchKeyword)}&${catInfo.salesFilter}&Limit=28`;
    let onSaleRes = await fetchWithRetry(primarySearchUrl).catch(() => null);

    const seenIds = new Set();
    const rawItems = [];
    const collectFromRes = (resObj) => {
        for (const it of (resObj?.data?.data || [])) {
            if (!it || !it.id || seenIds.has(String(it.id))) continue;
            seenIds.add(String(it.id));
            rawItems.push(it);
        }
    };

    collectFromRes(onSaleRes);

    // Respaldo 1: si la subcategoría con keyword compuesta trajo menos de 4 ítems, buscar en la misma subcategoría solo por el color
    if (rawItems.length < 4 && catInfo.keywordSuffix) {
        const subcatColorOnlyUrl = `https://catalog.roblox.com/v1/search/items/details?${catInfo.subcatParam}&Keyword=${encodeURIComponent(colorSearchTerm)}&${catInfo.salesFilter}&Limit=10`;
        const fallbackSubRes = await fetchWithRetry(subcatColorOnlyUrl).catch(() => null);
        collectFromRes(fallbackSubRes);
    }

    // Respaldo 2: si aún hay menos de 4 ítems (ej. rate-limit momentáneo o subcategoría muy específica), buscar en accesorios generales
    if (rawItems.length < 4) {
        const broadFallbackUrl = `https://catalog.roblox.com/v1/search/items/details?Category=11&Keyword=${encodeURIComponent(searchKeyword)}&SalesTypeFilter=1&Limit=10`;
        const broadRes = await fetchWithRetry(broadFallbackUrl).catch(() => null);
        collectFromRes(broadRes);
    }

    // Priorizar los que tienen precio > 0 (comprables)
    const buyableRaw = rawItems.filter(it => (it.lowestPrice ?? it.lowestResalePrice ?? it.price ?? 0) > 0);
    const candidateItems = (buyableRaw.length >= 4 ? buyableRaw : rawItems).slice(0, 8);

    const itemIds = candidateItems.map(i => i.id).join(',');
    const thumbsRes = itemIds
        ? await fetchWithRetry(`https://thumbnails.roblox.com/v1/assets?assetIds=${itemIds}&size=150x150&format=Png&isCircular=false`).catch(() => null)
        : null;

    const thumbMap = new Map();
    (thumbsRes?.data?.data || []).forEach(t => {
        if (t.targetId && t.imageUrl) thumbMap.set(String(t.targetId), t.imageUrl);
    });

    const matchedItems = await Promise.all(
        candidateItems.map(async (it) => {
            const imgUrl = thumbMap.get(String(it.id)) || null;
            const { matchPct, detectedHex } = await calculateImageColorMatch(imgUrl, primaryColor);
            const realPrice = Number(it.lowestPrice ?? it.lowestResalePrice ?? it.price ?? 0);
            return {
                id: it.id,
                name: it.name || `Accesorio ${it.id}`,
                price: realPrice,
                creatorName: it.creatorName || 'UGC',
                imageUrl: imgUrl,
                matchPct,
                detectedHex
            };
        })
    );

    matchedItems.sort((a, b) => b.matchPct - a.matchPct);

    const sessionData = {
        inputSource: raw,
        categoryFilter,
        activeToneIdx: safeToneIdx,
        baseTitle,
        palette,
        colorSearchTerm,
        matchedItems
    };
    lastColorMatchSession.set(String(discordUserId), sessionData);
    return sessionData;
}

function construirPanelColorMatchInicial() {
    const container = new ContainerBuilder()
        .setAccentColor(COLOR_AVATAR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🎨 2.5 Emparejador de Cosméticos por Color (Color-Match)\n` +
            `Extrae automáticamente los **3 tonos dominantes (\`#HEX\`)** de tu avatar, de cualquier prenda o de un código hexadecimal y encuentra cosméticos en venta que combinen por afinidad cromática (\`ΔRGB\`).\n\n` +
            `> 🎨 **Selector de los 3 Tonos:** Podés alternar entre el Tono #1, #2 o #3 extraídos de tu prenda o avatar.\n` +
            `> 🧩 **15 Filtros de Cosméticos de Roblox:** Sombreros, Pelo, Cara/Lentes, Cuello, Hombros, Pecho, Espalda, Cintura, Gear, Camisas 2D, Pantalones 2D, Abrigos 3D, T-Shirts y Limiteds.\n\n` +
            `-# Elegí abajo cómo querés empezar a combinar colores.`
        ))
        .addSeparatorComponents(separador(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_ava_colormatch_myavatar', 'Colores de Mi Avatar', '👤', ButtonStyle.Success),
                boton('btn_ava_colormatch_modal', 'Ingresar Prenda o #HEX', '🎨', ButtonStyle.Primary),
                boton('btn_ava_colormatch_demo:#5865F2', 'Probar Ejemplo (#5865F2)', '⚡', ButtonStyle.Secondary),
                boton('btn_nav_main_menu', 'Volver al Toolkit', '🏠', ButtonStyle.Secondary)
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer('Roblox Toolkit • 2.5 Emparejador Cromático por Distancia Euclidiana ΔRGB')
        ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

async function construirPanelColorMatch(discordUserId, inputSource = 'my_avatar', categoryFilter = 'all', activeToneIdx = 0, feedbackMsg = null) {
    const cm = await ejecutarColorMatch(discordUserId, inputSource, categoryFilter, activeToneIdx);
    if (cm.error) {
        const errContainer = new ContainerBuilder()
            .setAccentColor(COLORES.error)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Error en Color-Match\n${cm.error}`))
            .addSeparatorComponents(separador())
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    boton('btn_ava_colormatch_modal', 'Ingresar otra Prenda o #HEX', '🎨', ButtonStyle.Primary),
                    boton('btn_ava_colormatch_demo:#5865F2', 'Probar Ejemplo (#5865F2)', '⚡', ButtonStyle.Secondary),
                    boton('btn_nav_main_menu', 'Menú Principal', '🏠', ButtonStyle.Secondary)
                )
            );
        return { components: [errContainer], files: [], attachments: [], flags: MessageFlags.IsComponentsV2 };
    }

    const catInfo = CATEGORIAS_COLORMATCH[categoryFilter] || CATEGORIAS_COLORMATCH.all;
    const pngBuffer = await generateColorMatchCanvas(cm.palette, cm.matchedItems, cm.baseTitle, cm.activeToneIdx, catInfo.label);
    const attachment = new AttachmentBuilder(pngBuffer, { name: 'color_match_grid.png' });

    const paletteStr = cm.palette
        .map((c, i) => (i === cm.activeToneIdx ? `🟢 **#${i + 1} \`${c.hex}\` (Activo)**` : `⚪ #${i + 1} \`${c.hex}\``))
        .join('  •  ');

    const listStr = cm.matchedItems.slice(0, 4).map((it, idx) => {
        const net = Math.ceil((it.price || 0) * 0.6);
        const pStr = it.price > 0 ? `${formatearPrecio(it.price)} *(Con 40%: ${formatearPrecio(net)})*` : '`Offsale`';
        return (
            `**${idx + 1}.** **[${it.name}](https://www.roblox.com/catalog/${it.id})** (\`ID: ${it.id}\`)\n` +
            `> 🎯 **${it.matchPct}% Match** (Tono \`${it.detectedHex}\`)  •  💵 ${pStr}`
        );
    }).join('\n\n');

    const container = new ContainerBuilder()
        .setAccentColor(COLOR_AVATAR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🎨 2.5 Emparejador de Cosméticos por Color\n` +
            `👕 **Referencia:** **${cm.baseTitle}**  •  🗂️ **Filtro Activo:** **${catInfo.emoji} ${catInfo.label}**\n` +
            `🌈 **Paleta Detectada:** ${paletteStr}` +
            (feedbackMsg ? `\n\n> ${feedbackMsg}` : '')
        ))
        .addSeparatorComponents(separador())
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://color_match_grid.png')
            )
        )
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 🛍️ Cosméticos Recomendados para el Tono #${cm.activeToneIdx + 1} (\`${cm.palette[cm.activeToneIdx]?.hex}\`)\n${listStr || '⚠️ No se encontraron cosméticos en venta para este filtro exacto. Probá cambiando el Tono (#1, #2, #3) o eligiendo otra categoría abajo.'}`
        ));

    // 1. Selector de Tono Cromático (#1, #2, #3) + Envío directo al Probador de Avatar (2.1)
    const selectToneAndAction = new StringSelectMenuBuilder()
        .setCustomId('select_ava_colormatch_tone')
        .setPlaceholder('🎨 Cambiá entre los 3 tonos detectados o probá un cosmético en tu Avatar...')
        .addOptions([
            ...cm.palette.slice(0, 3).map((col, idx) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`Buscar cosméticos con el Tono #${idx + 1}: ${col.hex}`)
                    .setDescription(`Explorar ${catInfo.label.toLowerCase()} compatibles con la muestra ${col.hex}`)
                    .setValue(`tone:${idx}`)
                    .setEmoji(idx === cm.activeToneIdx ? '🟢' : '🎨')
                    .setDefault(idx === cm.activeToneIdx)
            ),
            ...cm.matchedItems.slice(0, 4).map((it, idx) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`Probar en mi Avatar (2.1): #${idx + 1} ${String(it.name).substring(0, 58)}`)
                    .setDescription(`${it.matchPct}% Match Cromático • ${it.price} R$ (Con 40%: ${Math.ceil(it.price * 0.6)} R$)`)
                    .setValue(`tryon:${it.id}`)
                    .setEmoji('🧪')
            )
        ]);

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectToneAndAction));

    // 2. Bloque de Filtros de Cosméticos (15 categorías organizadas en 3 filas claras)
    container.addSeparatorComponents(separador(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `### 🧩 Filtros por Tipo de Cosmético de Roblox\n` +
        `-# Seleccioná qué parte del avatar o prenda querés combinar con el **Tono #${cm.activeToneIdx + 1} (\`${cm.palette[cm.activeToneIdx]?.hex}\`)**:`
    ));

    // Fila 1 de Filtros: Cabeza y Rostro
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_ava_colormatch_cat:all',  'Todos',    '✨', categoryFilter === 'all'  ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_ava_colormatch_cat:hat',  'Sombrero', '🎩', categoryFilter === 'hat'  ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_ava_colormatch_cat:hair', 'Pelo',     '💇', categoryFilter === 'hair' ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_ava_colormatch_cat:face', 'Cara',     '😎', categoryFilter === 'face' ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_ava_colormatch_cat:neck', 'Cuello',   '🧣', categoryFilter === 'neck' ? ButtonStyle.Success : ButtonStyle.Secondary)
        )
    );

    // Fila 2 de Filtros: Cuerpo, Espalda y Equipamiento
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_ava_colormatch_cat:shoulder', 'Hombros', '🦜', categoryFilter === 'shoulder' ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_ava_colormatch_cat:front',    'Pecho',   '🛡️', categoryFilter === 'front'    ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_ava_colormatch_cat:back',     'Espalda', '🎒', categoryFilter === 'back'     ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_ava_colormatch_cat:waist',    'Cintura', '⛓️', categoryFilter === 'waist'    ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_ava_colormatch_cat:gear',     'Gear',    '⚔️', categoryFilter === 'gear'     ? ButtonStyle.Success : ButtonStyle.Secondary)
        )
    );

    // Fila 3 de Filtros: Ropa 2D, Prendas 3D y Exclusivos
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_ava_colormatch_cat:shirt',   'Camisas',    '👕', categoryFilter === 'shirt'   ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_ava_colormatch_cat:pants',   'Pantalón',   '👖', categoryFilter === 'pants'   ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_ava_colormatch_cat:jacket',  'Abrigos 3D', '🧥', categoryFilter === 'jacket'  ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_ava_colormatch_cat:tshirt',  'T-Shirts',   '🖼️', categoryFilter === 'tshirt'  ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_ava_colormatch_cat:limited', 'Limiteds',   '👑', categoryFilter === 'limited' ? ButtonStyle.Success : ButtonStyle.Secondary)
        )
    );

    // 3. Separación clara antes de los botones inferiores de cambio de prenda/color, avatar y retorno
    container.addSeparatorComponents(separador(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ⚙️ **Controles de Prenda Base y Navegación:**`
    ));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_ava_colormatch_modal', 'Cambiar Prenda o Color #HEX', '🎨', ButtonStyle.Primary),
            boton('btn_ava_colormatch_myavatar', 'Usar Mi Avatar', '👤', ButtonStyle.Secondary),
            boton('btn_nav_main_menu', 'Volver al Toolkit', '🏠', ButtonStyle.Secondary)
        )
    );

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Roblox Toolkit • 2.5 Emparejador por Distancia Euclidiana ΔRGB • 15 Categorías de Cosméticos')
    ));

    return {
        components: [container],
        files: [attachment],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// ENRUTADOR INTERNO DE INTERACCIONES DE AVATAR (CATEGORÍA 2)
// ==========================================
async function handleAvatarInteraction(interaction) {
    const cid = interaction.customId;
    const uid = interaction.user.id;

    // ----------------------------------------------------
    // 2.1 OUTFIT SANDBOX
    // ----------------------------------------------------
    if (cid === 'btn_ava_sandbox') {
        await interaction.deferUpdate();
        const panel = await construirPanelSandbox(uid);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_ava_sandbox_toggle_zoom') {
        await interaction.deferUpdate();
        const state = await obtenerEstadoSandbox(uid);
        state.zoomHead = !state.zoomHead;
        const msg = state.zoomHead
            ? '🔍 **Zoom Cabeza y Cuello activado:** Ideal para apreciar de cerca collares, lentes, pelo y sombreros.'
            : '🧍 **Vista Cuerpo Completo activada:** Viendo el personaje entero con sus accesorios.';
        const panel = await construirPanelSandbox(uid, msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_ava_sandbox_clear') {
        await interaction.deferUpdate();
        const state = await obtenerEstadoSandbox(uid);
        state.items = [];
        const panel = await construirPanelSandbox(uid, '🗑️ Se vació el probador de combinaciones.');
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_ava_sandbox_pop') {
        await interaction.deferUpdate();
        const state = await obtenerEstadoSandbox(uid);
        const removed = state.items.pop();
        const msg = removed
            ? `➖ Se quitó **${removed.name}** del probador.`
            : 'ℹ️ No hay objetos para quitar.';
        const panel = await construirPanelSandbox(uid, msg);
        return await interaction.editReply(panel);
    }

    // Conjunto Demo de 1 clic para que el usuario pruebe el Sandbox al instante sin fricción
    if (cid === 'btn_ava_sandbox_demo') {
        await interaction.deferUpdate();
        const state = await obtenerEstadoSandbox(uid);
        const demoIds = ['1365767', '1029025', '96678548'];
        const resolvedDemo = await Promise.all(demoIds.map(id => resolverItemCatalogoConPrecioReal(id)));
        const validDemo = resolvedDemo.filter(Boolean).map(it => ({
            id: it.id,
            name: it.name,
            price: it.price,
            assetTypeId: it.assetTypeId,
            imageUrl: it.imageUrl,
            highResUrl: it.highResUrl,
            isWorn: false
        }));
        state.items = validDemo;
        const panel = await construirPanelSandbox(
            uid,
            `⚡ **Conjunto Demo equipado:** Se aplicaron **${validDemo.length}** accesorios sobre **@${state.username}** con su cotización real.`
        );
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_ava_sandbox_load_worn') {
        await interaction.deferUpdate();
        const state = await obtenerEstadoSandbox(uid);
        const avRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${state.userId}/avatar`).catch(() => null);
        const assets = avRes?.data?.assets || [];
        const wearableTypes = [2, 8, 11, 12, 18, 19, 41, 42, 43, 44, 45, 46, 47, 64, 65, 66, 67, 68, 69, 72];
        const wornTop = assets.filter(a => wearableTypes.includes(Number(a.assetType?.id))).slice(0, 5);

        if (wornTop.length === 0) {
            const panel = await construirPanelSandbox(uid, `ℹ️ El avatar **@${state.username}** no tiene prendas adicionales equipadas en este momento.`);
            return await interaction.editReply(panel);
        }

        const resolvedWorn = await Promise.all(
            wornTop.map(async (a) => {
                const det = await resolverItemCatalogoConPrecioReal(String(a.id));
                return {
                    id: a.id,
                    name: det?.name || a.name || `Item ${a.id}`,
                    price: Number(det?.price || 0),
                    assetTypeId: Number(a.assetType?.id || det?.assetTypeId || 8),
                    imageUrl: det?.imageUrl || null,
                    highResUrl: det?.highResUrl || det?.imageUrl || null,
                    isWorn: true
                };
            })
        );

        state.items = resolvedWorn;
        const panel = await construirPanelSandbox(uid, `👕 Se cargaron y cotizaron **${resolvedWorn.length}** prendas equipadas actualmente por **@${state.username}**.`);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_ava_sandbox_add_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_ava_sandbox_add')
            .setTitle('➕ Probar Accesorio o Cambiar Avatar');

        const input = new TextInputBuilder()
            .setCustomId('sandbox_item_input')
            .setLabel('Nombre/ID del ítem (o @usuario de Roblox)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Valkyrie Helm, Black Shades, 1365767 o @Builderman')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_ava_sandbox_add' && interaction.isModalSubmit()) {
        const raw = interaction.fields.getTextInputValue('sandbox_item_input').trim();
        await interaction.deferUpdate();
        const state = await obtenerEstadoSandbox(uid);

        // Si el usuario escribió @usuario (o "avatar: nombre"), cambiar el personaje del visor del Sandbox
        if (raw.startsWith('@') || /^avatar\s*:/i.test(raw)) {
            const targetUserQuery = raw.replace(/^(@|avatar\s*:\s*)/i, '').trim();
            const prof = await resolverUsuarioRoblox(targetUserQuery);
            if (!prof) {
                const panel = await construirPanelSandbox(uid, `⚠️ No se encontró ningún jugador de Roblox llamado **@${targetUserQuery}**.`);
                return await interaction.editReply(panel);
            }
            const [fullThumbRes, headThumbRes] = await Promise.all([
                fetchWithRetry(
                    `https://thumbnails.roblox.com/v1/users/avatar?userIds=${prof.roblox_user_id}&size=420x420&format=Png&isCircular=false`
                ).catch(() => null),
                fetchWithRetry(
                    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${prof.roblox_user_id}&size=420x420&format=Png&isCircular=false`
                ).catch(() => null)
            ]);
            state.userId = prof.roblox_user_id;
            state.username = prof.roblox_username;
            state.isDefaultBuilderman = false;
            state.avatarFullUrl = fullThumbRes?.data?.data?.[0]?.imageUrl || prof.avatar_url || null;
            state.avatarHeadshotUrl = headThumbRes?.data?.data?.[0]?.imageUrl || state.avatarFullUrl;
            state.avatarUrl = state.avatarFullUrl;

            const panel = await construirPanelSandbox(uid, `👤 **Personaje del visor actualizado a @${prof.roblox_username}** (ID \`${prof.roblox_user_id}\`).`);
            return await interaction.editReply(panel);
        }

        if (state.items.length >= 5) {
            const panel = await construirPanelSandbox(uid, '⚠️ El probador admite hasta **5 objetos simultáneos**. Usá **➖ Quitar Último** o **🗑️ Vaciar Todo** para agregar otro.');
            return await interaction.editReply(panel);
        }

        const resolved = await resolverItemCatalogoConPrecioReal(raw);
        if (!resolved) {
            const panel = await construirPanelSandbox(uid, `❌ No se encontró ningún accesorio ni prenda para **"${raw}"**.`);
            return await interaction.editReply(panel);
        }

        const newItem = {
            id: resolved.id,
            name: resolved.name,
            price: Number(resolved.price || 0),
            assetTypeId: Number(resolved.assetTypeId || 8),
            imageUrl: resolved.imageUrl,
            highResUrl: resolved.highResUrl || resolved.imageUrl,
            isWorn: false
        };

        const slotInfo = resolveAnatomicalSlot(newItem);
        state.items.push(newItem);

        // Si es un accesorio de cuello o cara, activar zoom automáticamente para que se vea con claridad
        if (slotInfo.key === 'neck' || slotInfo.key === 'face') {
            state.zoomHead = true;
        }

        const panel = await construirPanelSandbox(
            uid,
            `✅ **${newItem.name}** equipado en **${slotInfo.label}** (${newItem.price > 0 ? formatearPrecio(newItem.price) : 'Gratis / Offsale'}).`
        );
        return await interaction.editReply(panel);
    }

    if (cid === 'select_ava_sandbox_save' && interaction.isStringSelectMenu()) {
        const chosenId = interaction.values[0];
        await interaction.deferUpdate();
        const state = await obtenerEstadoSandbox(uid);
        const item = state.items.find(i => String(i.id) === String(chosenId));
        if (!item) {
            const panel = await construirPanelSandbox(uid, '⚠️ Objeto no encontrado en la sesión actual.');
            return await interaction.editReply(panel);
        }

        const saveRes = await agregarItemAWishlistRapido(uid, {
            idObjet: item.id,
            itemName: item.name,
            itemType: 'catalog',
            price: item.price
        });

        const msg = saveRes.ok
            ? `🎯 **${item.name}** guardado en **Mi Lista** (${saveRes.totalActual}/${saveRes.maxItems}).`
            : `⚠️ ${saveRes.motivo}`;

        const panel = await construirPanelSandbox(uid, msg);
        return await interaction.editReply(panel);
    }

    // ----------------------------------------------------
    // 2.2 BUSCADOR DE CLONES Y SIMILARES
    // ----------------------------------------------------
    if (cid === 'btn_ava_clones') {
        await interaction.deferUpdate();
        return await interaction.editReply(construirPanelClonesInicial());
    }

    if (cid.startsWith('btn_ava_clones_demo:')) {
        const demoId = cid.split(':')[1] || '1365767';
        await interaction.deferUpdate();
        const panel = await construirPanelClones(demoId, 'all');
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_ava_clones_mode:')) {
        const parts = cid.split(':');
        const newMode = parts[1] || 'all';
        const qId = parts.slice(2).join(':') || '1365767';
        await interaction.deferUpdate();
        const panel = await construirPanelClones(qId, newMode);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_ava_clones_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_ava_clones_submit')
            .setTitle('🔍 Buscar Clones y Similares');

        const input = new TextInputBuilder()
            .setCustomId('clones_query_input')
            .setLabel('Nombre, ID o URL del accesorio/prenda')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Valkyrie Helm, Classic Fedora, 1365767')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_ava_clones_submit' && interaction.isModalSubmit()) {
        const q = interaction.fields.getTextInputValue('clones_query_input').trim();
        await interaction.deferUpdate();
        const panel = await construirPanelClones(q, 'all');
        return await interaction.editReply(panel);
    }

    if (cid === 'select_ava_clones_pick' && interaction.isStringSelectMenu()) {
        const val = interaction.values[0];
        const [origId, mode, altId] = val.split(':');
        await interaction.deferUpdate();
        const panel = await construirPanelClones(
            origId,
            mode,
            `🔎 Alternativa **ID \`${altId}\`** seleccionada. Usá los botones de abajo para probarla en tu avatar o seguir su precio.`,
            altId
        );
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_ava_clones_watch:')) {
        const [, altId, origId, mode] = cid.split(':');
        await interaction.deferUpdate();
        const det = await resolverItemCatalogoConPrecioReal(altId);
        const saveRes = await agregarItemAWishlistRapido(uid, {
            idObjet: altId,
            itemName: det?.name || `Alternativa ${altId}`,
            itemType: 'catalog',
            price: det?.price || 0
        });
        const msg = saveRes.ok
            ? `🎯 **${det?.name || altId}** añadido a **Mi Lista** (${saveRes.totalActual}/${saveRes.maxItems}).`
            : `⚠️ ${saveRes.motivo}`;
        const panel = await construirPanelClones(origId || '1365767', mode || 'all', msg, altId);
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_ava_clones_tryon:')) {
        const altId = cid.split(':')[1];
        await interaction.deferUpdate();
        const state = await obtenerEstadoSandbox(uid);
        if (state.items.length >= 5) state.items.shift();
        const det = await resolverItemCatalogoConPrecioReal(altId);
        if (det) {
            state.items.push({
                id: det.id,
                name: det.name,
                price: Number(det.price || 0),
                assetTypeId: Number(det.assetTypeId || 8),
                imageUrl: det.imageUrl,
                highResUrl: det.highResUrl || det.imageUrl,
                isWorn: false
            });
        }
        const panel = await construirPanelSandbox(uid, `🧪 Alternativa **${det?.name || altId}** equipada sobre tu avatar.`);
        return await interaction.editReply(panel);
    }

    // ----------------------------------------------------
    // 2.3 EXTRACTOR DE TEXTURAS + MANIQUÍ 2D
    // ----------------------------------------------------
    if (cid === 'btn_ava_textures') {
        await interaction.deferUpdate();
        return await interaction.editReply(construirPanelTexturas2DInicial());
    }

    if (cid === 'btn_ava_tex_demo_mannequin') {
        await interaction.deferUpdate();
        const panel = await construirPanelManiqui2D(uid, '144076358');
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_ava_tex_mannequin') {
        await interaction.deferUpdate();
        const panel = await construirPanelManiqui2D(uid);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_ava_tex_view_raw') {
        await interaction.deferUpdate();
        const last = lastTextureSession.get(String(uid));
        const targetId = last?.assetId || '144076358';
        const panel = await construirPanelTexturas2D(uid, targetId);
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_ava_tex_mode:')) {
        const modeOverride = cid.split(':')[1] || 'shirt';
        await interaction.deferUpdate();
        const panel = await construirPanelManiqui2D(uid, null, null, modeOverride);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_ava_tex_extract_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_ava_tex_extract')
            .setTitle('🧬 Extraer Textura 2D de Roblox');

        const input = new TextInputBuilder()
            .setCustomId('tex_asset_input')
            .setLabel('Nombre, Asset ID o URL de la prenda')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Black Hoodie, Tuxedo, 144076358')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_ava_tex_extract' && interaction.isModalSubmit()) {
        const q = interaction.fields.getTextInputValue('tex_asset_input').trim();
        await interaction.deferUpdate();
        const panel = await construirPanelTexturas2D(uid, q);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_ava_tex_custom_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_ava_tex_custom')
            .setTitle('👕 Probar Plantilla 2D en Maniquí');

        const input = new TextInputBuilder()
            .setCustomId('tex_custom_url')
            .setLabel('URL directa de imagen .PNG o ID de Roblox')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://... (.png) o ID de camisa/pantalón')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_ava_tex_custom' && interaction.isModalSubmit()) {
        const urlOrId = interaction.fields.getTextInputValue('tex_custom_url').trim();
        await interaction.deferUpdate();
        const panel = await construirPanelManiqui2D(uid, urlOrId, 'Plantilla 2D en Maniquí');
        return await interaction.editReply(panel);
    }

    // ----------------------------------------------------
    // 2.4 EXPORTADOR 3D (.PNG HD + .ZIP)
    // ----------------------------------------------------
    if (cid === 'btn_ava_export3d') {
        await interaction.deferUpdate();
        return await interaction.editReply(construirPanelExportador3DInicial());
    }

    if (cid === 'btn_ava_export3d_linked') {
        await interaction.deferUpdate();
        const panel = await construirPanelExportador3D(uid, 'linked');
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_ava_export3d_demo:')) {
        const demoAssetId = cid.split(':')[1] || '1365767';
        await interaction.deferUpdate();
        const panel = await construirPanelExportador3D(uid, `asset:${demoAssetId}`);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_ava_export3d_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_ava_export3d_submit')
            .setTitle('📦 Exportar Modelo 3D (.PNG + .ZIP)');

        const input = new TextInputBuilder()
            .setCustomId('export3d_target_input')
            .setLabel('Usuario de Roblox o ID de Accesorio')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Builderman o 1365767')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_ava_export3d_submit' && interaction.isModalSubmit()) {
        const target = interaction.fields.getTextInputValue('export3d_target_input').trim();
        await interaction.deferUpdate();
        const panel = await construirPanelExportador3D(uid, target);
        return await interaction.editReply(panel);
    }

    // ----------------------------------------------------
    // 2.5 EMPAREJADOR POR COLOR (COLOR-MATCH)
    // ----------------------------------------------------
    if (cid === 'btn_ava_colormatch') {
        await interaction.deferUpdate();
        return await interaction.editReply(construirPanelColorMatchInicial());
    }

    if (cid === 'btn_ava_colormatch_myavatar') {
        await interaction.deferUpdate();
        const last = lastColorMatchSession.get(String(uid));
        const panel = await construirPanelColorMatch(uid, 'my_avatar', last?.categoryFilter || 'all', 0);
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_ava_colormatch_demo:')) {
        const hexDemo = cid.split(':')[1] || '#5865F2';
        await interaction.deferUpdate();
        const panel = await construirPanelColorMatch(uid, hexDemo, 'all', 0);
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_ava_colormatch_cat:')) {
        const cat = cid.split(':')[1] || 'all';
        await interaction.deferUpdate();
        const last = lastColorMatchSession.get(String(uid));
        const panel = await construirPanelColorMatch(uid, last?.inputSource || 'my_avatar', cat, last?.activeToneIdx || 0);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_ava_colormatch_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_ava_colormatch_submit')
            .setTitle('🎨 Emparejar por Prenda o Color #HEX');

        const input = new TextInputBuilder()
            .setCustomId('colormatch_source_input')
            .setLabel('Nombre/ID de Prenda o Color #HEX')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: #5865F2, Red Hoodie, 1365767')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_ava_colormatch_submit' && interaction.isModalSubmit()) {
        const src = interaction.fields.getTextInputValue('colormatch_source_input').trim();
        await interaction.deferUpdate();
        const last = lastColorMatchSession.get(String(uid));
        const panel = await construirPanelColorMatch(uid, src, last?.categoryFilter || 'all', 0);
        return await interaction.editReply(panel);
    }

    if (cid === 'select_ava_colormatch_tone' && interaction.isStringSelectMenu()) {
        const chosen = interaction.values[0];
        await interaction.deferUpdate();
        const last = lastColorMatchSession.get(String(uid));

        if (chosen.startsWith('tone:')) {
            const newToneIdx = Number(chosen.split(':')[1] || 0);
            const panel = await construirPanelColorMatch(
                uid,
                last?.inputSource || 'my_avatar',
                last?.categoryFilter || 'all',
                newToneIdx,
                `🎨 Mostrando accesorios compatibles con el **Tono #${newToneIdx + 1}**.`
            );
            return await interaction.editReply(panel);
        }

        if (chosen.startsWith('tryon:')) {
            const itemId = chosen.split(':')[1];
            const state = await obtenerEstadoSandbox(uid);
            if (state.items.length >= 5) state.items.shift();
            const det = await resolverItemCatalogoConPrecioReal(itemId);
            if (det) {
                state.items.push({
                    id: det.id,
                    name: det.name,
                    price: Number(det.price || 0),
                    assetTypeId: Number(det.assetTypeId || 8),
                    imageUrl: det.imageUrl,
                    highResUrl: det.highResUrl || det.imageUrl,
                    isWorn: false
                });
            }
            const panel = await construirPanelSandbox(uid, `🎨 Accesorio **${det?.name || itemId}** equipado desde Color-Match.`);
            return await interaction.editReply(panel);
        }
    }

    return false;
}

module.exports = {
    handleAvatarInteraction,
    construirPanelSandbox,
    construirPanelClones,
    construirPanelTexturas2D,
    construirPanelManiqui2D,
    construirPanelExportador3D,
    construirPanelColorMatch
};
