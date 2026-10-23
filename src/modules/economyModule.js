// ==========================================
// ARCHIVO: src/modules/economyModule.js
// CATEGORÍA 1: 💰 Economía, Mercado y Precios (Herramientas Individuales)
// ==========================================

const {
    ContainerBuilder,
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

const supabase = require('../../db');
const { fetchWithRetry } = require('../../utils/http');
const { extractIdFromInput } = require('../../utils/roblox');
const { COLORES, footer, separador, boton, formatearPrecio } = require('../../utils/ui');
const { generatePriceFloorsChart } = require('../utils/chartGenerator');
const { registerCachePurger } = require('../utils/performanceManager');

// Caché de grupos inspeccionados por usuario para ordenar e inspeccionar prendas individualmente
const groupInspectCache = new Map();

registerCachePurger(
    'economyModule',
    (aggressive) => {
        let freed = groupInspectCache.size;
        groupInspectCache.clear();
        if (aggressive && floorsCacheMemory.data) {
            floorsCacheMemory = { timestamp: 0, data: null };
            freed += 1;
        }
        return freed;
    },
    {
        label: '💰 Caché de Mercado, Pisos UGC y Grupos',
        whatItCleans: 'Catálogos de grupos auditados y tabla temporal de pisos de precios UGC',
        inspectFn: () => {
            const entries = groupInspectCache.size + (floorsCacheMemory.data ? 1 : 0);
            const approxKB = groupInspectCache.size * 14 + (floorsCacheMemory.data ? 8 : 0);
            return {
                entries,
                approxKB,
                detail: `${groupInspectCache.size} grupo(s) en caché • Pisos UGC: ${floorsCacheMemory.data ? 'En RAM' : 'Vacío'} (~${approxKB} KB)`
            };
        }
    }
);

// Subcategorías oficiales de accesorios en el Catálogo de Roblox
const SUBCATEGORIAS_UGC = [
    { key: 'hat',       emoji: '🎩', name: 'Sombreros', shortName: 'Sombreros', keyword: 'Hat',      assetTypeId: 8,  subcategoryId: 9,  defaultFloor: 65, prevFloor: 85,  maxRef: 105 },
    { key: 'hair',     emoji: '💇', name: 'Pelo',      shortName: 'Pelo',      keyword: 'Hair',     assetTypeId: 41, subcategoryId: 20, defaultFloor: 65, prevFloor: 75,  maxRef: 95 },
    { key: 'face',     emoji: '😎', name: 'Cara',      shortName: 'Cara',      keyword: 'Face',     assetTypeId: 42, subcategoryId: 21, defaultFloor: 50, prevFloor: 65,  maxRef: 85 },
    { key: 'neck',     emoji: '🧣', name: 'Cuello',    shortName: 'Cuello',    keyword: 'Neck',     assetTypeId: 43, subcategoryId: 22, defaultFloor: 50, prevFloor: 60,  maxRef: 80 },
    { key: 'shoulder', emoji: '🛡️', name: 'Hombros',   shortName: 'Hombros',   keyword: 'Shoulder', assetTypeId: 44, subcategoryId: 23, defaultFloor: 50, prevFloor: 65,  maxRef: 85 },
    { key: 'front',    emoji: '🎽', name: 'Frente',    shortName: 'Frente',    keyword: 'Front',    assetTypeId: 45, subcategoryId: 24, defaultFloor: 55, prevFloor: 75,  maxRef: 95 },
    { key: 'back',     emoji: '🎒', name: 'Espalda',   shortName: 'Espalda',   keyword: 'Back',     assetTypeId: 46, subcategoryId: 25, defaultFloor: 85, prevFloor: 110, maxRef: 140 },
    { key: 'waist',    emoji: '⛓️', name: 'Cintura',   shortName: 'Cintura',   keyword: 'Waist',    assetTypeId: 47, subcategoryId: 26, defaultFloor: 60, prevFloor: 75,  maxRef: 95 }
];

const ORIGEN_LABELS = {
    cashback_40:   '👥 Cashback de Grupo (40%)',
    gamepass_sale: '🎟️ Venta de Gamepass',
    clothing_sale: '👕 Venta de Ropa 2D',
    limited_sale:  '💎 Venta de Limited UGC'
};

let floorsCacheMemory = { timestamp: 0, data: null };

// ==========================================
// HERRAMIENTA 1.3: 📉 Monitor de Pisos de Precio Dinámicos
// ==========================================
async function consultarPisosDinamicos(forzar = false) {
    if (!forzar && floorsCacheMemory.data && (Date.now() - floorsCacheMemory.timestamp < 120000)) {
        return floorsCacheMemory.data;
    }

    let dbRecords = [];
    try {
        const { data, error } = await supabase
            .from('price_floors_history')
            .select('*')
            .order('id', { ascending: true });
        if (!error && Array.isArray(data) && data.length > 0) {
            dbRecords = data;
        }
    } catch {
        // Fallback a memoria
    }

    if (dbRecords.length === 0) {
        const { data } = await supabase.memoryFrom('price_floors_history').select('*');
        dbRecords = data || [];
    }

    const dbMap = new Map(dbRecords.map(r => [r.subcategory_key, r]));
    const resultados = [];

    for (const cat of SUBCATEGORIAS_UGC) {
        const saved = dbMap.get(cat.key);
        let currentFloor = saved ? Number(saved.floor_price) : cat.defaultFloor;
        const previousFloor = saved ? Number(saved.previous_floor_price) : cat.prevFloor;
        const maxRef = saved ? Number(saved.reference_max_floor || cat.maxRef) : cat.maxRef;

        try {
            const url = `https://catalog.roblox.com/v2/search/items/details?Category=11&Subcategory=${cat.subcategoryId}&Keyword=${encodeURIComponent(cat.keyword)}&SortType=4&Limit=10`;
            const res = await fetchWithRetry(url, {}, 0);
            const items = (res.data?.data || [])
                .map(i => Number(i.lowestPrice ?? i.price ?? 0))
                .filter(p => p >= 15 && p <= 500);

            if (items.length > 0) {
                currentFloor = Math.min(...items);
            }
        } catch {
            // Conservar el último precio registrado si la tienda tarda en responder
        }

        const payload = {
            subcategory_key: cat.key,
            subcategory_name: cat.name,
            emoji: cat.emoji,
            shortName: cat.shortName,
            asset_type_id: cat.assetTypeId,
            subcategory_id: cat.subcategoryId,
            floor_price: currentFloor,
            previous_floor_price: previousFloor,
            reference_max_floor: maxRef,
            updated_at: new Date().toISOString()
        };

        try {
            await supabase.from('price_floors_history').upsert(payload, { onConflict: 'subcategory_key' });
        } catch {
            // Silencioso
        }

        resultados.push(payload);
    }

    floorsCacheMemory = { timestamp: Date.now(), data: resultados };
    return resultados;
}

async function construirPanelPisosPrecios(forzar = false) {
    const pisos = await consultarPisosDinamicos(forzar);
    const chartBuffer = await generatePriceFloorsChart(pisos);
    const attachment = new AttachmentBuilder(chartBuffer, { name: 'floors_chart.png' });

    const bloquesCategorias = pisos.map(p => {
        const actual = Number(p.floor_price);
        const previo = Number(p.previous_floor_price);
        const diff = actual - previo;
        const emojiCat = p.emoji || '🏷️';
        const nombreLimpio = String(p.shortName || p.subcategory_name).replace(/\s*\(.*?\)\s*/g, '');

        let variacionTexto = '';
        let recomendacion = '';

        if (diff < 0) {
            variacionTexto = `📉 **Bajó \`${Math.abs(diff)} R$\`** *(antes salía \`${previo} R$\`)*`;
            recomendacion = '🟢 **Está barato hoy**';
        } else if (diff === 0) {
            variacionTexto = `➖ **Sin cambios** *(se mantiene en \`${previo} R$\`)*`;
            recomendacion = '🟢 **Precio estable**';
        } else {
            variacionTexto = `📈 **Subió \`+${diff} R$\`** *(antes salía \`${previo} R$\`)*`;
            recomendacion = '⏳ **Conviene esperar a que baje**';
        }

        return (
            `${emojiCat} **${nombreLimpio}** — Mínimo actual: **\`${actual} R$\`**\n` +
            `-# ${variacionTexto}  •  ${recomendacion}`
        );
    });

    const mitad = Math.ceil(bloquesCategorias.length / 2);
    const bloqueSuperior = bloquesCategorias.slice(0, mitad).join('\n\n');
    const bloqueInferior = bloquesCategorias.slice(mitad).join('\n\n');

    const container = new ContainerBuilder()
        .setAccentColor(COLORES.sniper)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            '# 📉 Precios Mínimos de Accesorios en la Tienda\n' +
            '> 💡 **¿Cómo funciona?** Roblox cambia todos los días el precio mínimo al que se pueden vender los accesorios. Acá ves de forma clara cuánto cuesta como mínimo cada tipo de accesorio hoy y cuánto bajó respecto a la semana pasada.'
        ))
        .addSeparatorComponents(separador(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 🎩 Cabeza, Pelo, Cara y Cuello\n\n` +
            bloqueSuperior
        ))
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 🎒 Hombros, Frente, Espalda y Cintura\n\n` +
            bloqueInferior
        ))
        .addSeparatorComponents(separador(true))
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://floors_chart.png')
            )
        )
        .addSeparatorComponents(separador(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_econ_floors_refresh', 'Actualizar Precios en Vivo', '🔄', ButtonStyle.Primary),
                boton('btn_nav_cat:cat_economy', 'Volver a Economía', '⬅️')
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer('Comparativa de precios mínimos actuales frente a la semana anterior')
        ));

    return {
        components: [container],
        files: [attachment],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// HERRAMIENTA 1.4: ⏳ Agenda y Alerta de Robux Pendientes
// ==========================================
async function registrarRobuxPendientes(discordId, { sourceType = 'cashback_40', amountRobux, sourceLabel = null }) {
    const monto = Math.max(1, Math.round(Number(amountRobux || 0)));
    const ahora = Date.now();
    const minHoras = sourceType === 'limited_sale' ? 120 : 72;
    const maxHoras = 168;

    const minDate = new Date(ahora + minHoras * 3600 * 1000).toISOString();
    const maxDate = new Date(ahora + maxHoras * 3600 * 1000).toISOString();

    const row = {
        discord_id: String(discordId),
        source_type: sourceType,
        source_label: sourceLabel || ORIGEN_LABELS[sourceType] || 'Operación de Roblox',
        amount_robux: monto,
        created_at: new Date(ahora).toISOString(),
        estimated_release_min: minDate,
        estimated_release_max: maxDate,
        notified: false
    };

    try {
        const { error } = await supabase.from('pending_robux').insert([row]);
        if (error) {
            await supabase.memoryFrom('pending_robux').insert([row]);
        }
    } catch {
        await supabase.memoryFrom('pending_robux').insert([row]);
    }

    return row;
}

async function obtenerRobuxPendientesUsuario(discordId) {
    const uid = String(discordId);
    try {
        const { data, error } = await supabase
            .from('pending_robux')
            .select('*')
            .eq('discord_id', uid)
            .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
            return data;
        }
    } catch {
        // Fallback a memoria
    }
    const { data } = await supabase.memoryFrom('pending_robux')
        .select('*')
        .eq('discord_id', uid)
        .order('created_at', { ascending: false });
    return data || [];
}

async function construirPanelRobuxPendientes(discordId, mensajeAviso = null) {
    const registros = await obtenerRobuxPendientesUsuario(discordId);
    const totalAcumulado = registros.reduce((acc, r) => acc + Number(r.amount_robux || 0), 0);

    const container = new ContainerBuilder()
        .setAccentColor(COLORES.calc)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            '# ⏳ Agenda y Alerta de Robux Pendientes\n' +
            'Controlá la fecha y hora estimada de liberación de tus ventas de pases, ropa, artículos limitados y retornos de grupo. Recibirás un aviso automático por mensaje directo cuando tus Robux entren en ventana de acreditación.' +
            (mensajeAviso ? `\n\n> ✅ ${mensajeAviso}` : '')
        ))
        .addSeparatorComponents(separador());

    if (registros.length === 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            '### 📭 No tenés lotes de Robux pendientes activos\n' +
            '> Presioná **➕ Registrar Operación** abajo para agendar tus Robux en retención (de 3 a 7 días según el tipo de operación).'
        ));
    } else {
        const lineas = registros.slice(0, 8).map((r, i) => {
            const tsMin = Math.floor(new Date(r.estimated_release_min).getTime() / 1000);
            const tsMax = Math.floor(new Date(r.estimated_release_max).getTime() / 1000);
            const liberado = Date.now() >= new Date(r.estimated_release_min).getTime();
            const etiquetaOrigen = ORIGEN_LABELS[r.source_type] || r.source_label || r.source_type;
            const estadoIcon = liberado ? '🟢 **En ventana de acreditación**' : `⏳ **Se libera:** <t:${tsMin}:R> *(máx. <t:${tsMax}:R>)*`;
            return (
                `**${i + 1}. ${etiquetaOrigen}** — ${formatearPrecio(r.amount_robux, false)}\n` +
                `-# ${estadoIcon}`
            );
        });

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 💰 Total Acumulado por Cobrar: ${formatearPrecio(totalAcumulado, false)}  (\`${registros.length}\` lote/s)\n\n` +
            lineas.join('\n\n')
        ));
    }

    container.addSeparatorComponents(separador(true));

    const botones = [
        boton('btn_econ_pending_add_modal', 'Registrar Operación', '➕', ButtonStyle.Primary),
        boton('btn_econ_pending', 'Actualizar Estado', '🔄', ButtonStyle.Secondary)
    ];
    if (registros.length > 0) {
        botones.push(boton('btn_econ_pending_clear', 'Limpiar Agenda', '🧹', ButtonStyle.Secondary));
    }
    botones.push(boton('btn_nav_cat:cat_economy', 'Volver a Economía', '⬅️'));

    container.addActionRowComponents(new ActionRowBuilder().addComponents(botones));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Avisos automáticos por mensaje directo al liberarse tus Robux')
    ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

/**
 * Worker periódico (cada 15 minutos) para alertar de Robux pendientes cumplidos.
 */
async function revisarRobuxPendientesWorker(client) {
    if (!client || !client.isReady()) return;
    const ahoraIso = new Date().toISOString();

    let pendientesListos = [];
    try {
        const { data, error } = await supabase
            .from('pending_robux')
            .select('*')
            .eq('notified', false)
            .lte('estimated_release_min', ahoraIso);
        if (!error && Array.isArray(data)) {
            pendientesListos = data;
        }
    } catch {
        // Ignorar
    }

    for (const item of pendientesListos) {
        try {
            const user = await client.users.fetch(item.discord_id);
            if (user) {
                const alertContainer = new ContainerBuilder()
                    .setAccentColor(COLORES.exito)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        '# 💸 ¡Robux Pendientes Listos para Acreditarse!\n' +
                        `Tu lote de **${ORIGEN_LABELS[item.source_type] || item.source_type}** ya entró en ventana de liberación en Roblox.\n\n` +
                        `> 💰 **Monto liberado:** ${formatearPrecio(item.amount_robux, false)}\n` +
                        `> 📅 **Registrado:** <t:${Math.floor(new Date(item.created_at).getTime() / 1000)}:R>`
                    ))
                    .addSeparatorComponents(separador())
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        footer('Kortex Pending Robux Tracker • Alerta automática')
                    ));

                await user.send({
                    components: [alertContainer],
                    flags: MessageFlags.IsComponentsV2
                });
            }
            await supabase.from('pending_robux').update({ notified: true }).eq('id', item.id);
        } catch {
            // Usuario con DMs cerrados
        }
    }
}

// ==========================================
// HERRAMIENTA 1.5: 🏛️ Auditor y Catálogo de Grupos
// ==========================================
async function auditarGrupoRoblox(groupInput, sortType = '2') {
    const groupId = extractIdFromInput(groupInput);
    if (!groupId) return null;

    let groupInfo = null;
    let catalogItems = [];

    try {
        const groupRes = await fetchWithRetry(`https://groups.roblox.com/v1/groups/${groupId}`);
        groupInfo = groupRes.data;
    } catch {
        return null;
    }

    if (!groupInfo || !groupInfo.id) return null;

    try {
        const catUrl = `https://catalog.roblox.com/v2/search/items/details?Category=3&CreatorType=2&CreatorTargetId=${groupId}&SortType=${sortType}&Limit=30`;
        const catRes = await fetchWithRetry(catUrl);
        catalogItems = (catRes.data?.data || []).filter(i => i && i.id);
    } catch {
        catalogItems = [];
    }

    return {
        id: groupInfo.id,
        name: groupInfo.name || `Grupo ${groupId}`,
        description: groupInfo.description || '',
        ownerName: groupInfo.owner?.username || groupInfo.owner?.displayName || 'Sin dueño público',
        memberCount: Number(groupInfo.memberCount || 0),
        hasVerifiedBadge: Boolean(groupInfo.hasVerifiedBadge),
        sortType: String(sortType),
        items: catalogItems.map(item => {
            const listPrice = Number(item.price || item.lowestPrice || 5);
            const cashback = Math.floor(listPrice * 0.40);
            const netPrice = Math.max(0, listPrice - cashback);
            return {
                id: item.id,
                name: item.name || `Prenda ${item.id}`,
                listPrice,
                cashback,
                netPrice,
                favoriteCount: Number(item.favoriteCount || 0)
            };
        })
    };
}

function construirPanelAuditorGrupoInicial(aviso = null) {
    const container = new ContainerBuilder()
        .setAccentColor(COLORES.calc)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            '# 🏛️ Auditor y Catálogo de Grupos (Cashback 40%)\n' +
            'Inspeccioná cualquier grupo de Roblox por ID o enlace, consultá sus prendas más vendidas o más recientes, calculá el carrito neto aplicando el **40% de retorno** e inspeccioná cualquier prenda en detalle.' +
            (aviso ? `\n\n> ⚠️ ${aviso}` : '')
        ))
        .addSeparatorComponents(separador(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_econ_group_modal', 'Inspeccionar Grupo de Roblox', '🔍', ButtonStyle.Primary),
                boton('btn_econ_group_demo:7', 'Probar con Grupo Oficial Roblox', '🏛️', ButtonStyle.Secondary),
                boton('btn_nav_cat:cat_economy', 'Volver a Economía', '⬅️')
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer('Soporta IDs numéricos o enlaces de roblox.com/groups/...')
        ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

function construirPanelResultadoGrupo(userId, auditData, feedbackMsg = null) {
    groupInspectCache.set(String(userId), auditData);

    const topItems = auditData.items.slice(0, 8);
    const sumaLista = topItems.reduce((acc, i) => acc + i.listPrice, 0);
    const sumaCashback = topItems.reduce((acc, i) => acc + i.cashback, 0);
    const sumaNeta = Math.max(0, sumaLista - sumaCashback);
    const sortTitle = auditData.sortType === '3' ? 'Recién Actualizadas' : 'Más Vendidas';

    const container = new ContainerBuilder()
        .setAccentColor(COLORES.calc)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🏛️ ${auditData.name} ${auditData.hasVerifiedBadge ? '☑️' : ''}\n` +
            `👑 **Dueño:** \`@${auditData.ownerName}\`  •  👥 **Miembros:** \`${auditData.memberCount.toLocaleString('es-AR')}\`  •  👕 **Prendas en catálogo:** \`${auditData.items.length}\`` +
            (feedbackMsg ? `\n\n${feedbackMsg}` : '')
        ))
        .addSeparatorComponents(separador());

    if (topItems.length === 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            '> 📭 Este grupo no tiene prendas públicas en venta dentro del catálogo actual.'
        ));
    } else {
        const listado = topItems.map((it, idx) =>
            `**${idx + 1}. [${it.name}](https://www.roblox.com/catalog/${it.id})**\n` +
            `-# 🏷️ Lista: ${formatearPrecio(it.listPrice, false)}  ➔  ✨ **Neto (40% Cashback):** ${formatearPrecio(it.netPrice, false)} *(Recuperás \`+${it.cashback}\` R$ • ⭐ ${it.favoriteCount.toLocaleString('es-AR')} favs)*`
        ).join('\n\n');

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### 🛒 Carrito Rápido (Top ${topItems.length} Prendas ${sortTitle})\n` +
            `> 💵 **Costo de Lista Lote:** ${formatearPrecio(sumaLista, false)}  •  ♻️ **Retorno 40%:** \`+${sumaCashback.toLocaleString('es-AR')} R$\`  •  ✅ **Costo Neto Final:** ${formatearPrecio(sumaNeta, false)}\n\n` +
            listado
        ));

        const selectInspect = new StringSelectMenuBuilder()
            .setCustomId('select_econ_group_inspect')
            .setPlaceholder('👕 Seleccioná una prenda del grupo para ver su desglose individual...')
            .addOptions(
                topItems.map((it, idx) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${idx + 1}. ${it.name}`.substring(0, 95))
                        .setDescription(`Lista: ${it.listPrice} R$ • Neto 40%: ${it.netPrice} R$ • ⭐ ${it.favoriteCount} favs`.substring(0, 95))
                        .setValue(String(it.id))
                        .setEmoji('👕')
                )
            );

        container.addSeparatorComponents(separador());
        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectInspect));
    }

    container.addSeparatorComponents(separador(true));
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_econ_group_modal', 'Buscar Otro Grupo', '🔍', ButtonStyle.Primary),
            boton('btn_econ_group_sort:2', 'Más Vendidas', '🔥', auditData.sortType !== '3' ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_econ_group_sort:3', 'Más Recientes', '🆕', auditData.sortType === '3' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setLabel('Abrir Grupo')
                .setEmoji('🌐')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://www.roblox.com/groups/${auditData.id}`),
            boton('btn_nav_cat:cat_economy', 'Volver', '⬅️')
        )
    );
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer(`Grupo ID ${auditData.id} • Auditoría en vivo con desglose de 40% Cashback`)
    ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// DESPACHADOR DE INTERACCIONES DEL MÓDULO ECONOMÍA
// ==========================================
async function handleEconomyInteraction(interaction) {
    const cid = interaction.customId;

    // 1.3 Monitor de Pisos de Precio Dinámicos
    if (cid === 'btn_econ_floors' || cid === 'btn_econ_floors_refresh') {
        await interaction.deferUpdate();
        const panel = await construirPanelPisosPrecios(cid === 'btn_econ_floors_refresh', 'all');
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_econ_floors_filter:')) {
        const mode = cid.split(':')[1] || 'all';
        await interaction.deferUpdate();
        const panel = await construirPanelPisosPrecios(false, mode);
        return await interaction.editReply(panel);
    }

    // 1.4 Agenda de Robux Pendientes
    if (cid === 'btn_econ_pending') {
        await interaction.deferUpdate();
        const panel = await construirPanelRobuxPendientes(interaction.user.id);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_econ_pending_add_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_econ_pending_submit')
            .setTitle('Registrar Robux Pendientes');

        const inputAmount = new TextInputBuilder()
            .setCustomId('pending_amount')
            .setLabel('Cantidad de Robux pendientes (R$)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: 400')
            .setRequired(true);

        const inputType = new TextInputBuilder()
            .setCustomId('pending_type')
            .setLabel('Origen (cashback/gamepass/ropa/limited)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('cashback, gamepass, ropa o limited')
            .setValue('cashback')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(inputAmount),
            new ActionRowBuilder().addComponents(inputType)
        );
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_econ_pending_submit') {
        const rawAmount = interaction.fields.getTextInputValue('pending_amount').replace(/[^\d]/g, '');
        const rawType = (interaction.fields.getTextInputValue('pending_type') || '').toLowerCase();
        const amount = parseInt(rawAmount, 10);

        if (isNaN(amount) || amount <= 0) {
            return await interaction.reply({
                content: '⚠️ Ingresá un monto válido mayor a 0 Robux.',
                flags: MessageFlags.Ephemeral
            });
        }

        let sourceType = 'cashback_40';
        if (rawType.includes('gamepass') || rawType.includes('pase')) sourceType = 'gamepass_sale';
        else if (rawType.includes('ropa') || rawType.includes('shirt') || rawType.includes('cloth')) sourceType = 'clothing_sale';
        else if (rawType.includes('limited') || rawType.includes('ugc')) sourceType = 'limited_sale';

        await interaction.deferUpdate();
        await registrarRobuxPendientes(interaction.user.id, { sourceType, amountRobux: amount });
        const panel = await construirPanelRobuxPendientes(
            interaction.user.id,
            `Lote de **${amount.toLocaleString('es-AR')} R$** registrado correctamente.`
        );
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_econ_pending_clear') {
        await interaction.deferUpdate();
        try {
            await supabase.from('pending_robux').delete().eq('discord_id', String(interaction.user.id));
            await supabase.memoryFrom('pending_robux').delete().eq('discord_id', String(interaction.user.id));
        } catch {
            // Silencioso
        }
        const panel = await construirPanelRobuxPendientes(interaction.user.id, 'Tu agenda de Robux pendientes fue vaciada.');
        return await interaction.editReply(panel);
    }

    // 1.5 Auditor y Catálogo de Grupos
    if (cid === 'btn_econ_group') {
        await interaction.deferUpdate();
        return await interaction.editReply(construirPanelAuditorGrupoInicial());
    }

    if (cid.startsWith('btn_econ_group_demo:')) {
        const demoId = cid.split(':')[1];
        await interaction.deferUpdate();
        const audit = await auditarGrupoRoblox(demoId);
        if (!audit) {
            return await interaction.editReply(construirPanelAuditorGrupoInicial('No se pudo cargar el grupo de demostración en este momento.'));
        }
        return await interaction.editReply(construirPanelResultadoGrupo(interaction.user.id, audit));
    }

    if (cid.startsWith('btn_econ_group_sort:')) {
        const sortType = cid.split(':')[1] || '2';
        await interaction.deferUpdate();
        const cached = groupInspectCache.get(String(interaction.user.id));
        const targetGroupId = cached?.id || '7';
        const audit = await auditarGrupoRoblox(targetGroupId, sortType);
        if (!audit) {
            return await interaction.editReply(construirPanelAuditorGrupoInicial('No se pudo reordenar el catálogo del grupo.'));
        }
        return await interaction.editReply(construirPanelResultadoGrupo(interaction.user.id, audit));
    }

    if (cid === 'btn_econ_group_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_econ_group_submit')
            .setTitle('Auditor y Catálogo de Grupos');

        const inputGroup = new TextInputBuilder()
            .setCustomId('group_input')
            .setLabel('ID o enlace del Grupo de Roblox')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: 7 o https://www.roblox.com/groups/7')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputGroup));
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_econ_group_submit') {
        const groupInput = interaction.fields.getTextInputValue('group_input').trim();
        await interaction.deferUpdate();
        const audit = await auditarGrupoRoblox(groupInput);
        if (!audit) {
            return await interaction.editReply(
                construirPanelAuditorGrupoInicial(`No se encontró ningún grupo válido con \`${groupInput}\`. Verificá el ID o enlace.`)
            );
        }
        return await interaction.editReply(construirPanelResultadoGrupo(interaction.user.id, audit));
    }

    if (cid === 'select_econ_group_inspect') {
        const selectedAssetId = interaction.values[0];
        await interaction.deferUpdate();
        const audit = groupInspectCache.get(String(interaction.user.id));
        const itemObj = audit?.items?.find(i => String(i.id) === String(selectedAssetId));

        if (!audit || !itemObj) {
            return await interaction.editReply(construirPanelAuditorGrupoInicial('Seleccioná un grupo para inspeccionar sus prendas.'));
        }

        const fichaPrenda =
            `> 👕 **Ficha de Prenda Inspeccionada:** **[${itemObj.name}](https://www.roblox.com/catalog/${itemObj.id})** (ID \`${itemObj.id}\`)\n` +
            `> 🏷️ **Precio de Lista:** ${formatearPrecio(itemObj.listPrice, false)}  •  ♻️ **Retorno al Grupo (40%):** \`+${itemObj.cashback} R$\`  •  ✅ **Costo Neto Real:** ${formatearPrecio(itemObj.netPrice, false)}  •  ⭐ **Favoritos:** \`${itemObj.favoriteCount.toLocaleString('es-AR')}\``;

        return await interaction.editReply(construirPanelResultadoGrupo(interaction.user.id, audit, fichaPrenda));
    }
}

module.exports = {
    handleEconomyInteraction,
    construirPanelPisosPrecios,
    construirPanelRobuxPendientes,
    registrarRobuxPendientes,
    revisarRobuxPendientesWorker,
    construirPanelAuditorGrupoInicial
};
