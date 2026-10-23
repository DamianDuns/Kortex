// ==========================================
// ARCHIVO: src/modules/gamesModule.js
// CATEGORÍA 3: 🎮 Utilidades de Juego y Servidores (100% Datos Reales de Roblox)
// ==========================================

const crypto = require('crypto');
const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');

const supabase = require('../../db');
const { fetchWithRetry } = require('../../utils/http');
const { extractIdFromInput } = require('../../utils/roblox');
const { COLORES, footer, separador, boton, formatearPrecio } = require('../../utils/ui');

const COLOR_GAMES = 0x10B981; // Verde Esmeralda para Juegos y Servidores

// Experiencias reales de referencia para acceso rápido
const JUEGOS_POPULARES = [
    { name: 'Blox Fruits',      placeId: 2753915549,  universeId: 994732206,  aliases: ['blox', 'bf', 'bloxfruit', 'blox fruits'] },
    { name: 'Pet Simulator 99', placeId: 8737899170,  universeId: 3317771874, aliases: ['pet sim', 'ps99', 'pet simulator', 'pet simulator 99', 'petsim99'] },
    { name: 'Da Hood',          placeId: 2788229376,  universeId: 1008451066, aliases: ['dahood', 'da hood', 'dh'] },
    { name: 'Brookhaven RP',    placeId: 4924922222,  universeId: 1686885941, aliases: ['brookhaven', 'brookhaven rp'] },
    { name: 'Anime Defenders',  placeId: 17017769292, universeId: 5846386835, aliases: ['anime defenders', 'ad'] }
];

// Pases y Paquetes de Tienda Interna (Exclusive Shop / GUI dentro del juego) que Roblox no muestra en la pestaña web
const PASES_INTERNOS_POR_UNIVERSO = {
    // Pet Simulator 99 (UniverseId: 3317771874)
    '3317771874': [
        { id: 1694421401, name: 'Starter Pack! (Paquete de Inicio)', price: 79,  source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Exclusive Shop)', note: 'Incluye Exclusive Egg x2, Pociones, Libro y Hoverboard (79–80 R$)' },
        { id: 1694421899, name: 'Limited-Time Pack! (Paquete Temporal)', price: 799, source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Exclusive Shop)', note: 'Paquete especial de temporada en Exclusive Shop' },
        { id: 1694421415, name: 'Forever Pack! (Tramo Inicial)',     price: 100, source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Exclusive Shop)', note: 'Cadena de recompensas progresivas dentro del juego' },
        { id: 1694421910, name: 'Exclusive Eggx1 (Huevo Exclusivo)', price: 400, source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Exclusive Shop)', note: 'Compra directa en la tienda interna del juego' },
        { id: 1694421925, name: 'Exclusive Egg x3 Pack',             price: 1200, source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Exclusive Shop)', note: 'Pack de 3 huevos exclusivos en tienda interna' }
    ],
    // Blox Fruits (UniverseId: 994732206)
    '994732206': [
        { id: 558649112, name: '+1 Fruit Storage (Almacenamiento de Fruta)', price: 400,  source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Aumenta en +1 la capacidad de frutas en tu inventario' },
        { id: 558649205, name: '2x EXP (15 Minutos)',                        price: 25,   source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Bono de doble experiencia desde la tienda del juego' },
        { id: 558649310, name: 'Stat Refund (Reembolso de Estadísticas)',    price: 75,   source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Reinicia tus puntos de estadísticas dentro de la partida' },
        { id: 558649418, name: 'Race Reroll (Cambio de Raza)',               price: 90,   source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Cambia tu raza actual desde la tienda interna' },
        { id: 558650100, name: 'Permanent Rocket (Fruta Permanente)',        price: 50,   source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Fruta permanente comprable en el menú interno' },
        { id: 558650750, name: 'Permanent Ice (Hielo Permanente)',           price: 750,  source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Fruta permanente comprable en el menú interno' },
        { id: 558651100, name: 'Permanent Light (Luz Permanente)',           price: 1100, source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Fruta permanente comprable en el menú interno' },
        { id: 558651650, name: 'Permanent Buddha (Buda Permanente)',         price: 1650, source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Fruta permanente comprable en el menú interno' },
        { id: 558652000, name: 'Permanent Portal (Portal Permanente)',       price: 2000, source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Fruta permanente comprable en el menú interno' },
        { id: 558652400, name: 'Permanent Dough (Masa Permanente)',          price: 2400, source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Fruta permanente comprable en el menú interno' },
        { id: 558654000, name: 'Permanent Kitsune (Kitsune Permanente)',     price: 4000, source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Fruta permanente comprable en el menú interno' }
    ],
    // Da Hood (UniverseId: 1008451066)
    '1008451066': [
        { id: 539480101, name: 'Starter Cash Pack (Paquete de Inicio)', price: 80,  source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Paquete inicial de dinero dentro de la partida' },
        { id: 539480250, name: 'Weapon Skins Crate x5 (Cajas de Skins)', price: 250, source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Compra directa en la tienda interna del juego' }
    ],
    // Brookhaven RP (UniverseId: 1686885941)
    '1686885941': [
        { id: 975960110, name: 'On Demand Fire (Fuego en Casa)', price: 50, source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Pase interno activable desde el menú de casa' },
        { id: 975960220, name: 'House Disaster Pack (Eventos)',  price: 99, source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Tienda Interna)', note: 'Pase interno de eventos en Brookhaven' }
    ],
    // Anime Defenders (UniverseId: 5846386835)
    '5846386835': [
        { id: 584639001, name: 'Starter Pack! (Paquete de Inicio)', price: 99,  source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Exclusive Shop)', note: 'Paquete inicial de gemas y traits en la tienda del juego' },
        { id: 584639050, name: 'Trait Crystals Pack (Cristales)',   price: 199, source: 'ingame_shop', sourceLabel: '🕹️ Dentro del Juego (Exclusive Shop)', note: 'Paquete interno de la tienda del lobby' }
    ]
};

// Diccionario bilingüe Español <-> Inglés para encontrar pases aunque el usuario busque en español
const SINONIMOS_BUSQUEDA_PASES = [
    ['paquete de inicio', 'starter pack', 'starter', 'inicio', 'pack inicial', 'bundle'],
    ['paquete temporal', 'limited-time pack', 'limited', 'temporal', 'exclusive'],
    ['almacenamiento', 'storage', 'fruit storage', ' espacio', 'inventario'],
    ['barcos', 'fast boats', 'boats', 'lanchas', 'bote'],
    ['doble dinero', '2x money', 'money', 'double cash', 'cash', 'dinero'],
    ['doble maestria', '2x mastery', 'mastery', 'maestria'],
    ['notificador', 'fruit notifier', 'notifier', 'radar'],
    ['espada oscura', 'dark blade', 'yoru', 'espada'],
    ['jefe', 'boss drops', '2x boss', 'drops'],
    ['suerte', 'lucky', 'ultra lucky', 'luck'],
    ['huevos', 'eggs', '+15 eggs', 'magic eggs', 'egg'],
    ['mascotas', 'pets', '+15 pets', 'huge hunter', 'huge'],
    ['automatico', 'auto farm', 'auto tap', 'auto collect', 'farm'],
    [' musica', 'boombox', 'radio', 'music'],
    ['vehiculos', 'vehicle', 'car', 'autos', 'coches'],
    ['casas', 'estates', 'house', 'mansiones'],
    ['permanente', 'permanent', 'perm']
];

const gamepassCache = new Map();
const codesFilterState = new Map();

function barraProgresoTexto(actual, total, largo = 12) {
    const pct = total > 0 ? Math.min(1, Math.max(0, actual / total)) : 0;
    const llenos = Math.round(pct * largo);
    return '▰'.repeat(llenos) + '▱'.repeat(largo - llenos);
}

/**
 * Resuelve cualquier experiencia de Roblox en tiempo real por nombre, PlaceId, UniverseId o URL,
 * incluyendo su icono oficial 512x512 para mostrarlo al costado del panel.
 */
async function resolverJuegoRoblox(queryInput) {
    if (!queryInput) return resolverJuegoRoblox('2753915549');
    const raw = String(queryInput).trim();
    const lower = raw.toLowerCase();

    // 1. Coincidencia en accesos directos o alias comunes
    const preset = JUEGOS_POPULARES.find(
        g =>
            g.name.toLowerCase() === lower ||
            String(g.placeId) === raw ||
            String(g.universeId) === raw ||
            (Array.isArray(g.aliases) && g.aliases.some(a => lower === a || lower.includes(a)))
    );

    let placeId = preset ? preset.placeId : null;
    let universeId = preset ? preset.universeId : null;
    let gameName = preset ? preset.name : null;

    if (!placeId && (/^\d+$/.test(raw) || raw.includes('roblox.com/games/'))) {
        placeId = Number(extractIdFromInput(raw));
    }

    // 2. Si el usuario ingresó el nombre de un juego, consultar el buscador oficial omni-search
    if (!placeId && !universeId) {
        try {
            const sessionUuid = crypto.randomUUID();
            const omniUrl = `https://apis.roblox.com/search-api/omni-search?verticalType=game&searchQuery=${encodeURIComponent(raw)}&pageToken=&globalSessionId=${sessionUuid}&sessionId=${sessionUuid}`;
            const omniRes = await fetchWithRetry(omniUrl);
            const contents = omniRes.data?.searchResults?.[0]?.contents;
            const firstContent = Array.isArray(contents) ? contents[0] : null;
            if (firstContent) {
                universeId = Number(firstContent.universeId) || null;
                placeId = Number(firstContent.rootPlaceId) || null;
                gameName = firstContent.name || null;
            }
        } catch {
            // Silencioso
        }
    }

    // 3. Si tenemos placeId pero aún no universeId, consultar la API oficial de universos
    if (placeId && !universeId) {
        try {
            const uRes = await fetchWithRetry(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
            if (uRes.data?.universeId) {
                universeId = Number(uRes.data.universeId);
            }
        } catch {
            universeId = Number(placeId);
        }
    }

    if (!universeId) return null;

    // 4. Consultar en paralelo los metadatos del juego y su icono oficial 512x512
    const [gRes, iconRes] = await Promise.all([
        fetchWithRetry(`https://games.roblox.com/v1/games?universeIds=${universeId}`).catch(() => null),
        fetchWithRetry(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`).catch(() => null)
    ]);

    const iconUrl = iconRes?.data?.data?.[0]?.imageUrl || null;
    const gData = gRes?.data?.data?.[0];

    if (gData && gData.id) {
        return {
            placeId: Number(gData.rootPlaceId || placeId || 0),
            universeId: Number(gData.id),
            name: gData.name || gameName || `Experiencia ${universeId}`,
            creatorName: gData.creator?.name || 'Roblox Developer',
            creatorId: Number(gData.creator?.id || 0),
            creatorType: gData.creator?.type || 'User',
            playing: Number(gData.playing || 0),
            visits: Number(gData.visits || 0),
            maxPlayers: Number(gData.maxPlayers || 20),
            updated: gData.updated || new Date().toISOString(),
            iconUrl
        };
    }

    if (!placeId) return null;

    return {
        placeId: Number(placeId),
        universeId: Number(universeId),
        name: gameName || `Experiencia ${placeId}`,
        creatorName: 'Roblox Developer',
        creatorId: 0,
        creatorType: 'User',
        playing: 0,
        visits: 0,
        maxPlayers: 20,
        updated: new Date().toISOString(),
        iconUrl
    };
}

// ==========================================
// HERRAMIENTA 3.1: 👻 Buscador de Servidores Vacíos con "Direct Launch"
// ==========================================
async function buscarServidoresVacios(gameQuery) {
    const game = await resolverJuegoRoblox(gameQuery);
    if (!game) return { game: null, servers: [] };

    let servers = [];
    try {
        const url = `https://games.roblox.com/v1/games/${game.placeId}/servers/Public?sortOrder=Asc&excludeFullGames=true&limit=25`;
        const res = await fetchWithRetry(url);
        servers = (res.data?.data || [])
            .filter(s => s && s.id && typeof s.playing === 'number' && s.playing >= 1 && s.playing < Number(s.maxPlayers || game.maxPlayers || 20))
            .sort((a, b) => {
                if (a.playing !== b.playing) return a.playing - b.playing;
                return (a.ping || 999) - (b.ping || 999);
            })
            .slice(0, 4);
    } catch {
        servers = [];
    }

    return { game, servers };
}

async function construirPanelServidoresVacios(gameQuery = 'Blox Fruits') {
    const { game, servers } = await buscarServidoresVacios(gameQuery);

    if (!game) {
        const errContainer = new ContainerBuilder()
            .setAccentColor(COLOR_GAMES)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# 👻 Buscador de Servidores Vacíos\n` +
                `> ⚠️ No se encontró ninguna experiencia de Roblox que coincida con \`${gameQuery}\`. Verificá el nombre o PlaceId.`
            ))
            .addSeparatorComponents(separador(true))
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    boton('btn_games_servers_modal', 'Buscar Otro Juego / PlaceId', '🔍', ButtonStyle.Primary),
                    boton('btn_games_servers_q:2753915549', 'Ver Blox Fruits', '🏴‍☠️', ButtonStyle.Secondary),
                    boton('btn_nav_cat:cat_games', 'Volver a Juegos', '⬅️')
                )
            );
        return { components: [errContainer], files: [], attachments: [], flags: MessageFlags.IsComponentsV2 };
    }

    const lineas = servers.length > 0
        ? servers.map((s, idx) => {
            const fpsVal = Number(s.fps || 60).toFixed(1);
            const pingVal = Math.round(Number(s.ping || 0));
            return (
                `### 👻 Servidor Público Real #${idx + 1} — \`${s.playing}/${s.maxPlayers || game.maxPlayers}\` Jugadores\n` +
                `> 📡 **Ping del nodo:** \`${pingVal}ms\`  •  ⚡ **FPS:** \`${fpsVal}\`  •  🆔 **JobId:** \`${s.id}\``
            );
        }).join('\n\n')
        : `> 📭 **No hay servidores públicos parcialmente vacíos disponibles en este instante para \`${game.name}\`** (o todos los servidores activos están llenos/cerrados). Presioná **Re-escanear** o probá otro juego.`;

    const container = new ContainerBuilder()
        .setAccentColor(COLOR_GAMES)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 👻 Buscador de Servidores Vacíos — ${game.name}\n` +
            `📍 **PlaceId:** \`${game.placeId}\`  •  🌌 **UniverseId:** \`${game.universeId}\`  •  🌐 **Jugadores activos ahora:** \`${game.playing.toLocaleString('es-AR')}\`\n` +
            `Servidores públicos reales con menor cantidad de jugadores y menor ping en \`games.roblox.com\`:`
        ))
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lineas));

    if (servers.length > 0) {
        const launchButtons = servers.slice(0, 4).map((s, idx) =>
            new ButtonBuilder()
                .setLabel(`Unirse #${idx + 1} (${s.playing}/${s.maxPlayers || game.maxPlayers})`)
                .setEmoji('🚀')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://www.roblox.com/games/start?placeId=${game.placeId}&gameInstanceId=${s.id}`)
        );
        container.addSeparatorComponents(separador());
        container.addActionRowComponents(new ActionRowBuilder().addComponents(launchButtons));
    }

    container
        .addSeparatorComponents(separador(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_games_servers_modal', 'Buscar Cualquier Juego', '🔍', ButtonStyle.Primary),
                boton(`btn_games_servers_q:${game.placeId}`, 'Re-escanear en Vivo', '🔄', ButtonStyle.Success),
                new ButtonBuilder()
                    .setLabel('Página del Juego')
                    .setEmoji('🌐')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://www.roblox.com/games/${game.placeId}`),
                boton('btn_nav_cat:cat_games', 'Volver', '⬅️')
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer('Datos 100% reales en vivo desde games.roblox.com/v1/games/{placeId}/servers/Public')
        ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// HERRAMIENTA 3.2: 🎟️ Extractor Completo de Gamepasses (Tienda Web + Dentro del Juego)
// ==========================================
async function inspeccionarGamepassPorId(passIdInput) {
    const cleanId = extractIdFromInput(passIdInput);
    if (!cleanId) return null;

    try {
        const [res, thumbRes] = await Promise.all([
            fetchWithRetry(`https://apis.roblox.com/game-passes/v1/game-passes/${cleanId}/product-info`),
            fetchWithRetry(`https://thumbnails.roblox.com/v1/game-passes?gamePassIds=${cleanId}&size=150x150&format=Png&isCircular=false`).catch(() => null)
        ]);
        const d = res.data;
        if (d && (d.TargetId || d.ProductId || d.Name)) {
            const price = typeof d.PriceInRobux === 'number' ? d.PriceInRobux : 0;
            return {
                id: Number(d.TargetId || cleanId),
                productId: Number(d.ProductId || 0),
                name: d.Name || `Gamepass ${cleanId}`,
                description: d.Description || '',
                price,
                isForSale: Boolean(d.IsForSale ?? (price > 0)),
                creatorName: d.Creator?.Name || 'Developer',
                creatorId: d.Creator?.Id || 0,
                iconUrl: thumbRes?.data?.data?.[0]?.imageUrl || null,
                isWebPass: true,
                source: 'manual_ingame',
                sourceLabel: '🕹️ Pase Consultado por ID'
            };
        }
    } catch {
        // Fallback por si el usuario ingresó un AssetId
    }

    try {
        const resAsset = await fetchWithRetry(`https://economy.roblox.com/v2/assets/${cleanId}/details`);
        const d = resAsset.data;
        if (d && d.Name) {
            const price = typeof d.PriceInRobux === 'number' ? d.PriceInRobux : 0;
            return {
                id: Number(d.AssetId || cleanId),
                productId: Number(d.ProductId || 0),
                name: d.Name,
                description: d.Description || '',
                price,
                isForSale: Boolean(d.IsForSale ?? (price > 0)),
                creatorName: d.Creator?.Name || 'Developer',
                creatorId: d.Creator?.CreatorTargetId || 0,
                iconUrl: null,
                isWebPass: false,
                source: 'manual_ingame',
                sourceLabel: '🕹️ Pase Interno Consultado por ID'
            };
        }
    } catch {
        // Silencioso
    }

    return null;
}

/**
 * Verifica si un pase coincide con la búsqueda del usuario (soporta Español/Inglés, precio en Robux o ID).
 */
function coincideBusquedaPase(passObj, rawQuery) {
    if (!rawQuery) return true;
    const q = String(rawQuery).trim().toLowerCase();
    if (!q) return true;

    const nameLower = String(passObj.name || '').toLowerCase();
    const noteLower = String(passObj.note || '').toLowerCase();
    const idStr = String(passObj.id || '');
    const prodIdStr = String(passObj.productId || '');

    // 1. Coincidencia directa por nombre, nota o ID
    if (nameLower.includes(q) || noteLower.includes(q) || idStr === q || prodIdStr === q) {
        return true;
    }

    // 2. Si el usuario escribió un monto en Robux (ej. "80", "79", "80 robux", "400 r$")
    const priceMatch = q.match(/^(\d{1,6})\s*(?:r\$|robux|rbx)?$/i);
    if (priceMatch) {
        const targetPrice = Number(priceMatch[1]);
        const passPrice = Number(passObj.price || 0);
        if (passPrice > 0 && Math.abs(passPrice - targetPrice) <= 5) {
            return true;
        }
    }

    // 3. Coincidencia bilingüe Español <-> Inglés (ej. "paquete de inicio" <-> "starter pack")
    for (const grupo of SINONIMOS_BUSQUEDA_PASES) {
        const usuarioUsaTerminoDelGrupo = grupo.some(term => q.includes(term.trim()) || term.trim().includes(q));
        if (usuarioUsaTerminoDelGrupo) {
            const paseContieneAlgunSinonimo = grupo.some(term => nameLower.includes(term.trim()) || noteLower.includes(term.trim()));
            if (paseContieneAlgunSinonimo) return true;
        }
    }

    return false;
}

async function extraerGamepassesJuego(gameQuery) {
    const game = await resolverJuegoRoblox(gameQuery);
    if (!game) return { game: null, passes: [] };

    const passMap = new Map();

    // 1. Pases oficiales de la Tienda Web del Universo (apis.roblox.com/game-passes/v1/universes)
    try {
        let pageToken = '';
        let pageCount = 0;

        do {
            const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
            const url = `https://apis.roblox.com/game-passes/v1/universes/${game.universeId}/game-passes?passView=Full&pageSize=100${tokenParam}`;
            const res = await fetchWithRetry(url);
            const list = res.data?.gamePasses || res.data?.data || [];

            for (const p of list) {
                if (!p || !p.id) continue;
                const price = typeof p.price === 'number' ? p.price : (p.productInfo?.priceInRobux ?? 0);
                const isForSale = Boolean(p.isForSale ?? (typeof p.price === 'number' && p.price > 0));
                passMap.set(String(p.id), {
                    id: Number(p.id),
                    productId: Number(p.productId || p.productInfo?.productId || 0),
                    name: p.name || `Gamepass ${p.id}`,
                    price,
                    isForSale,
                    iconUrl: null,
                    isWebPass: true,
                    source: 'web_store',
                    sourceLabel: '🏪 Tienda de Roblox (Web)'
                });
            }

            pageToken = res.data?.nextPageToken || '';
            pageCount++;
        } while (pageToken && pageCount < 3);
    } catch {
        // Silencioso
    }

    // 2. Incorporar Pases y Paquetes de la Tienda Interna dentro del Juego (Exclusive Shop / GUI In-Game)
    const internosConocidos = PASES_INTERNOS_POR_UNIVERSO[String(game.universeId)] || [];
    for (const intPass of internosConocidos) {
        if (!passMap.has(String(intPass.id))) {
            passMap.set(String(intPass.id), {
                id: Number(intPass.id),
                productId: Number(intPass.id),
                name: intPass.name,
                price: intPass.price,
                isForSale: true,
                iconUrl: game.iconUrl || null,
                isWebPass: false,
                note: intPass.note || null,
                source: intPass.source || 'ingame_shop',
                sourceLabel: intPass.sourceLabel || '🕹️ Dentro del Juego (Tienda Interna)'
            });
        }
    }

    // 3. Escaneo de Universos Conectados y Pases del Creador/Dueño del Grupo
    try {
        let creatorType = game.creatorType;
        let creatorId = game.creatorId;

        if (creatorId) {
            const gamesEndpoint = String(creatorType).toLowerCase() === 'group'
                ? `https://games.roblox.com/v2/groups/${creatorId}/games?accessFilter=1&limit=8`
                : `https://games.roblox.com/v2/users/${creatorId}/games?accessFilter=2&limit=8`;

            const sibRes = await fetchWithRetry(gamesEndpoint).catch(() => null);
            const sibGames = (sibRes?.data?.data || [])
                .filter(g => g && g.id && Number(g.id) !== Number(game.universeId))
                .slice(0, 3);

            const sibPassesArrays = await Promise.all(
                sibGames.map(async sib => {
                    try {
                        const r = await fetchWithRetry(
                            `https://apis.roblox.com/game-passes/v1/universes/${sib.id}/game-passes?passView=Full&pageSize=30`
                        );
                        const list = r.data?.gamePasses || r.data?.data || [];
                        return list.map(p => ({ raw: p, sibName: sib.name || `Univ ${sib.id}` }));
                    } catch {
                        return [];
                    }
                })
            );

            for (const groupList of sibPassesArrays) {
                for (const item of groupList) {
                    const p = item.raw;
                    const pid = p?.id || p?.gamePassId;
                    if (!pid || passMap.has(String(pid))) continue;
                    const price = typeof p.price === 'number' ? p.price : (p.productInfo?.priceInRobux ?? 0);
                    const isForSale = Boolean(p.isForSale ?? (typeof p.price === 'number' && p.price > 0));
                    passMap.set(String(pid), {
                        id: Number(pid),
                        productId: Number(p.productId || p.productInfo?.productId || 0),
                        name: p.name || `Gamepass ${pid}`,
                        price,
                        isForSale,
                        iconUrl: null,
                        isWebPass: true,
                        source: 'sub_universe',
                        sourceLabel: `🕹️ Universo Conectado (${String(item.sibName).substring(0, 16)})`
                    });
                }
            }
        }
    } catch {
        // Silencioso
    }

    // 4. Obtener los iconos reales 150x150 de los Gamepasses web para mostrarlos al seleccionar un pase
    const webPassIds = [...passMap.values()]
        .filter(p => p.isWebPass && p.id)
        .slice(0, 30)
        .map(p => p.id);

    if (webPassIds.length > 0) {
        try {
            const thumbRes = await fetchWithRetry(
                `https://thumbnails.roblox.com/v1/game-passes?gamePassIds=${webPassIds.join(',')}&size=150x150&format=Png&isCircular=false`
            );
            const thumbData = thumbRes.data?.data || [];
            for (const t of thumbData) {
                if (t && t.targetId && t.imageUrl && passMap.has(String(t.targetId))) {
                    passMap.get(String(t.targetId)).iconUrl = t.imageUrl;
                }
            }
        } catch {
            // Silencioso
        }
    }

    const passes = [...passMap.values()];
    return { game, passes };
}

async function construirPanelExtractorGamepasses(discordId, gameQuery = 'Pet Simulator 99', feedback = null, options = {}) {
    const uid = String(discordId);
    const cached = gamepassCache.get(uid);
    const reuseCache = Boolean(options.reuseCache && cached && cached.game);

    let game = null;
    let passes = [];
    let sortOrder = 'default';
    let filterMode = 'all';
    let searchKeyword = '';
    let selectedPassId = null;
    let page = 0;

    if (reuseCache) {
        game = cached.game;
        passes = [...cached.allPasses];
        sortOrder = options.sortOrder !== undefined ? options.sortOrder : (cached.sortOrder || 'default');
        filterMode = options.filterMode !== undefined ? options.filterMode : (cached.filterMode || 'all');
        searchKeyword = options.searchKeyword !== undefined ? options.searchKeyword : (cached.searchKeyword || '');
        selectedPassId = options.selectedPassId !== undefined ? options.selectedPassId : (cached.selectedPassId || null);
        page = options.page !== undefined ? Number(options.page) : (cached.page || 0);
    } else {
        // Nueva carga de juego: siempre limpiar filtros previos para que nunca quede trabado
        const extracted = await extraerGamepassesJuego(gameQuery);
        game = extracted.game;
        passes = extracted.passes;
        sortOrder = options.sortOrder || 'default';
        filterMode = options.filterMode || 'all';
        searchKeyword = options.searchKeyword || '';
        selectedPassId = options.selectedPassId || null;
        page = 0;
    }

    if (!game) {
        const errContainer = new ContainerBuilder()
            .setAccentColor(COLOR_GAMES)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# 🎟️ Extractor de Pases de Juego\n` +
                `> ⚠️ No se encontró ningún juego con \`${gameQuery}\`. Verificá el nombre o PlaceId.`
            ))
            .addSeparatorComponents(separador(true))
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    boton('btn_games_passes_modal', 'Buscar Otro Juego', '🎮', ButtonStyle.Primary),
                    boton('btn_nav_cat:cat_games', 'Volver a Juegos', '⬅️')
                )
            );
        return { components: [errContainer], files: [], attachments: [], flags: MessageFlags.IsComponentsV2 };
    }

    // Filtrar según pestaña (Todos / Tienda Web / Dentro del Juego) y búsqueda bilingüe o por precio
    let filtered = [...passes];
    if (filterMode === 'web') {
        filtered = filtered.filter(p => p.source === 'web_store');
    } else if (filterMode === 'ingame') {
        filtered = filtered.filter(p => p.source !== 'web_store');
    }

    if (searchKeyword) {
        filtered = filtered.filter(p => coincideBusquedaPase(p, searchKeyword));
        // Si hay resultados en la búsqueda y aún no había un pase seleccionado, destacar automáticamente el primero
        if (filtered.length > 0 && !selectedPassId) {
            selectedPassId = String(filtered[0].id);
        }
    }

    if (sortOrder === 'asc') {
        filtered.sort((a, b) => (a.price || 999999) - (b.price || 999999));
    } else if (sortOrder === 'desc') {
        filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
    }

    const pageSize = 8;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;

    const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize);

    // Guardar estado limpio
    gamepassCache.set(uid, {
        game,
        allPasses: [...passes],
        sortOrder,
        filterMode,
        searchKeyword,
        selectedPassId,
        page
    });

    const webPassesCount = passes.filter(p => p.source === 'web_store').length;
    const inGamePassesCount = passes.filter(p => p.source !== 'web_store').length;

    const container = new ContainerBuilder().setAccentColor(COLOR_GAMES);

    // =========================================================================
    // 1. CABECERA DEL JUEGO CON SU IMAGEN AL COSTADO DERECHO (SectionBuilder)
    // =========================================================================
    const headerText = new TextDisplayBuilder().setContent(
        `# 🎟️ Pases del Juego — ${game.name}\n` +
        `👤 **Creador:** \`${game.creatorName}\`  •  🌐 **Jugando ahora:** \`${game.playing.toLocaleString('es-AR')}\`\n` +
        `🏪 **En Tienda Web:** \`${webPassesCount}\` pases  •  🕹️ **Dentro del Juego (Tienda Interna):** \`${inGamePassesCount}\` pases\n` +
        `-# 📍 PlaceId: \`${game.placeId}\`  •  🌌 UniverseId: \`${game.universeId}\`` +
        (searchKeyword ? `\n🔎 **Búsqueda activa:** \`${searchKeyword}\` (\`${filtered.length}\` resultado/s)` : '') +
        (feedback ? `\n> ${feedback}` : '')
    );

    if (game.iconUrl) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(headerText)
                .setThumbnailAccessory(thumb => thumb.setURL(game.iconUrl))
        );
    } else {
        container.addTextDisplayComponents(headerText);
    }

    // =========================================================================
    // 2. TARJETA DESTACADA DEL PASE SELECCIONADO (Con su Imagen al Costado)
    // =========================================================================
    const selectedPass = selectedPassId
        ? passes.find(p => String(p.id) === String(selectedPassId))
        : null;

    if (selectedPass) {
        container.addSeparatorComponents(separador(true));

        const cobroTxt = (selectedPass.isForSale && selectedPass.price > 0)
            ? formatearPrecio(selectedPass.price, false)
            : '`Fuera de venta / Offsale`';

        const linkLinea = selectedPass.isWebPass
            ? `🔗 **Enlace directo:** [Abrir en la Tienda de Roblox](https://www.roblox.com/game-pass/${selectedPass.id})`
            : `🕹️ **Compra interna:** Disponible directamente dentro de la tienda interna de **${game.name}**`;

        const notaExtra = selectedPass.note ? `\n📝 **Detalle:** *${selectedPass.note}*` : '';

        const destacadaText = new TextDisplayBuilder().setContent(
            `## 🌟 PASE SELECCIONADO: __**${selectedPass.name}**__\n` +
            `💵 **Cuánto cobra:** ${cobroTxt}\n` +
            `🆔 **ID del Pase:** \`${selectedPass.id}\`${selectedPass.productId && selectedPass.productId !== selectedPass.id ? `  •  ⚙️ **Product ID:** \`${selectedPass.productId}\`` : ''}\n` +
            `📍 **Ubicación:** ${selectedPass.sourceLabel || '🏪 Tienda'}\n` +
            `${linkLinea}${notaExtra}`
        );

        const passThumb = selectedPass.iconUrl || game.iconUrl;
        if (passThumb) {
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(destacadaText)
                    .setThumbnailAccessory(thumb => thumb.setURL(passThumb))
            );
        } else {
            container.addTextDisplayComponents(destacadaText);
        }
    }

    container.addSeparatorComponents(separador(true));

    // =========================================================================
    // 3. LISTA CLARA Y SIMPLIFICADA DE PASES (Solo Cobro en Robux, ID y Ubicación)
    // =========================================================================
    const lineas = pageItems.length > 0
        ? pageItems.map((p, idx) => {
            const num = page * pageSize + idx + 1;
            const isSelected = selectedPass && String(selectedPass.id) === String(p.id);
            const prefix = isSelected ? '🟢 👉 ' : '';
            const hasPrice = p.isForSale && typeof p.price === 'number' && p.price > 0;
            const cobroRobux = hasPrice ? formatearPrecio(p.price, false) : '`Fuera de venta`';
            const titleLink = p.isWebPass
                ? `[${p.name}](https://www.roblox.com/game-pass/${p.id})`
                : `**${p.name}**`;

            return (
                `${prefix}**${num}. ${titleLink}** — 💵 **Cobra:** ${cobroRobux}\n` +
                `-# 🆔 ID: \`${p.id}\`  •  ${p.sourceLabel || '🏪 Tienda'}${p.note ? `  •  ${p.note}` : ''}`
            );
        }).join('\n\n')
        : (
            `> 📭 No se encontraron pases con el filtro actual en **${game.name}**.\n` +
            `> 💡 Presioná **🌐 Todos** abajo para volver a ver la lista completa o buscá otro nombre/precio.`
        );

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lineas));

    // =========================================================================
    // 4. MENÚ DESPLEGABLE PARA DESTACAR CUALQUIER PASE DE LA LISTA
    // =========================================================================
    if (pageItems.length > 0) {
        const selectPass = new StringSelectMenuBuilder()
            .setCustomId('select_games_pass_inspect')
            .setPlaceholder('🌟 Elegí un pase de la lista para destacarlo arriba con su imagen...')
            .addOptions(
                pageItems.slice(0, 15).map((p, i) => {
                    const num = page * pageSize + i + 1;
                    const hasPrice = p.isForSale && p.price > 0;
                    const isSel = selectedPass && String(selectedPass.id) === String(p.id);
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(`${num}. ${p.name}`.substring(0, 95))
                        .setDescription(
                            `${hasPrice ? `Cobra: ${p.price.toLocaleString('es-AR')} Robux` : 'Fuera de venta'} • ID: ${p.id} • ${p.isWebPass ? 'Tienda Web' : 'Dentro del Juego'}`.substring(0, 95)
                        )
                        .setValue(String(p.id))
                        .setEmoji(isSel ? '🌟' : (p.isWebPass ? '🏪' : '🕹️'))
                        .setDefault(Boolean(isSel));
                })
            );
        container.addSeparatorComponents(separador());
        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectPass));
    }

    // =========================================================================
    // 5. SECCIÓN DE FILTROS (Separada visualmente de la navegación)
    // =========================================================================
    container.addSeparatorComponents(separador(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# 🎛️ **Filtros de Ubicación y Orden por Precio:**`
    ));
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_games_passes_filter:all', `Todos (${passes.length})`, '🌐', filterMode === 'all' && !searchKeyword ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_games_passes_filter:web', `Tienda Web (${webPassesCount})`, '🏪', filterMode === 'web' ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_games_passes_filter:ingame', `Dentro del Juego (${inGamePassesCount})`, '🕹️', filterMode === 'ingame' ? ButtonStyle.Success : ButtonStyle.Secondary),
            boton('btn_games_passes_sort:asc', 'Menor R$', '⬆️', sortOrder === 'asc' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            boton('btn_games_passes_sort:desc', 'Mayor R$', '⬇️', sortOrder === 'desc' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        )
    );

    // =========================================================================
    // 6. SECCIÓN DE BÚSQUEDA Y NAVEGACIÓN (Separada al pie)
    // =========================================================================
    container.addSeparatorComponents(separador());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# 🧭 **Búsqueda y Navegación (Página ${page + 1} de ${totalPages}):**`
    ));

    const navRow = new ActionRowBuilder().addComponents(
        boton('btn_games_passes_modal', 'Cambiar Juego', '🎮', ButtonStyle.Primary),
        boton('btn_games_passes_custom_modal', 'Buscar Pase (Nombre / R$)', '🔎', ButtonStyle.Success),
        boton('btn_games_passes_page:prev', 'Anterior', '◀️', ButtonStyle.Secondary).setDisabled(page <= 0),
        boton('btn_games_passes_page:next', 'Siguiente', '▶️', ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
        boton('btn_nav_cat:cat_games', 'Volver', '⬅️', ButtonStyle.Secondary)
    );

    container
        .addActionRowComponents(navRow)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer(`${game.name} • Pág. ${page + 1}/${totalPages} • Tienda de Roblox + Tienda Interna del Juego`)
        ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// HERRAMIENTA 3.3: 🎁 Bóveda de Códigos Activos con Checklist Personal
// ==========================================
async function obtenerEstadoCodigosUsuario(discordId, universeId = 994732206) {
    let allCodes = [];
    try {
        const { data, error } = await supabase
            .from('roblox_game_codes')
            .select('*')
            .eq('is_active', true);
        if (!error && Array.isArray(data) && data.length > 0) {
            allCodes = data;
        }
    } catch {
        // Fallback
    }

    if (allCodes.length === 0) {
        const { data } = await supabase.memoryFrom('roblox_game_codes').select('*').eq('is_active', true);
        allCodes = data || [];
    }

    let redeemedRows = [];
    try {
        const { data, error } = await supabase
            .from('user_redeemed_codes')
            .select('*')
            .eq('discord_id', String(discordId));
        if (!error && Array.isArray(data)) {
            redeemedRows = data;
        }
    } catch {
        // Fallback
    }

    if (redeemedRows.length === 0) {
        const { data } = await supabase.memoryFrom('user_redeemed_codes').select('*').eq('discord_id', String(discordId));
        redeemedRows = data || [];
    }

    const redeemedSet = new Set(redeemedRows.map(r => String(r.code_id)));
    const gameCodes = allCodes.filter(c => String(c.universe_id) === String(universeId));

    // Construir lista única de juegos disponibles en la bóveda
    const gamesMap = new Map();
    JUEGOS_POPULARES.forEach(g => gamesMap.set(String(g.universeId), g.name));
    allCodes.forEach(c => {
        if (c.universe_id && c.game_name) {
            gamesMap.set(String(c.universe_id), c.game_name);
        }
    });

    return {
        allCodes,
        gameCodes,
        redeemedSet,
        availableGames: [...gamesMap.entries()].map(([uId, name]) => ({ universeId: Number(uId), name }))
    };
}

async function construirPanelBovedaCodigos(discordId, { universeId = null, soloFaltantes = null, customGameName = null, feedback = null } = {}) {
    const key = String(discordId);
    const savedState = codesFilterState.get(key) || { universeId: 994732206, soloFaltantes: false, gameName: 'Blox Fruits' };
    if (universeId !== null) savedState.universeId = Number(universeId);
    if (soloFaltantes !== null) savedState.soloFaltantes = Boolean(soloFaltantes);
    if (customGameName) savedState.gameName = customGameName;
    codesFilterState.set(key, savedState);

    const { gameCodes, redeemedSet, availableGames } = await obtenerEstadoCodigosUsuario(discordId, savedState.universeId);
    const gameName = gameCodes[0]?.game_name || availableGames.find(g => g.universeId === savedState.universeId)?.name || savedState.gameName || `Universe ${savedState.universeId}`;

    const totalActivos = gameCodes.length;
    const totalCanjeados = gameCodes.filter(c => redeemedSet.has(String(c.id))).length;
    const pct = totalActivos > 0 ? Math.round((totalCanjeados / totalActivos) * 100) : 0;

    const visibles = savedState.soloFaltantes
        ? gameCodes.filter(c => !redeemedSet.has(String(c.id)))
        : gameCodes;

    const listado = gameCodes.length === 0
        ? `> 📭 Aún no hay códigos registrados para **${gameName}**. Usá el botón **➕ Registrar Código** abajo para añadir un código promocional de este juego.`
        : (visibles.length === 0
            ? '> 🎉 **¡Ya canjeaste todos los códigos activos registrados para este juego!**'
            : visibles.map(c => {
                const yaUsado = redeemedSet.has(String(c.id));
                return `${yaUsado ? '✅' : '🎁'} **\`${c.code}\`** — ${c.reward_description} ${yaUsado ? '*(Canjeado)*' : '*(Disponible)*'}`;
            }).join('\n'));

    const selectOptions = availableGames.slice(0, 15).map(g =>
        new StringSelectMenuOptionBuilder()
            .setLabel(String(g.name).substring(0, 95))
            .setValue(String(g.universeId))
            .setEmoji('🎮')
            .setDefault(Number(savedState.universeId) === Number(g.universeId))
    );

    const container = new ContainerBuilder()
        .setAccentColor(COLOR_GAMES)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🎁 Bóveda de Códigos Activos — ${gameName}\n` +
            `📊 **Progreso personal:** \`${barraProgresoTexto(totalCanjeados, totalActivos)}\` **Canjeaste ${totalCanjeados} de ${totalActivos} códigos (${pct}%)**\n` +
            `-# Marcá los códigos que ya usaste o registrá nuevos códigos para cualquier experiencia de Roblox.` +
            (feedback ? `\n\n> ${feedback}` : '')
        ))
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(listado))
        .addSeparatorComponents(separador());

    if (selectOptions.length > 0) {
        const selectGame = new StringSelectMenuBuilder()
            .setCustomId('select_games_codes_game')
            .setPlaceholder('🎮 Cambiar de experiencia en la Bóveda...')
            .addOptions(selectOptions);
        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectGame));
    }

    if (gameCodes.length > 0) {
        const selectToggle = new StringSelectMenuBuilder()
            .setCustomId('select_games_codes_toggle')
            .setPlaceholder('✅ Marcá o desmarcá códigos como Canjeados...')
            .setMinValues(1)
            .setMaxValues(Math.min(25, gameCodes.length))
            .addOptions(
                gameCodes.slice(0, 25).map(c => {
                    const usado = redeemedSet.has(String(c.id));
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(`${usado ? '✅' : '⬜'} ${c.code}`.substring(0, 95))
                        .setDescription(String(c.reward_description).substring(0, 95))
                        .setValue(String(c.id));
                })
            );
        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectToggle));
    }

    const filtroBtnLabel = savedState.soloFaltantes ? 'Ver Todos los Códigos' : 'Ver Solo Faltantes';
    container.addSeparatorComponents(separador(true));
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton(`btn_games_codes_filter:${savedState.soloFaltantes ? '0' : '1'}`, filtroBtnLabel, '🔎', ButtonStyle.Primary),
            boton('btn_games_codes_add_modal', 'Registrar Código / Juego', '➕', ButtonStyle.Success),
            boton('btn_nav_cat:cat_games', 'Volver a Juegos', '⬅️')
        )
    );
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Marcá los códigos que ya usaste para llevar el control de tu progreso')
    ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// HERRAMIENTA 3.4: 🔔 Suscriptor de Parches y Actualizaciones Silenciosas
// ==========================================
async function obtenerSuscripcionesParches(discordId) {
    const uid = String(discordId);
    try {
        const { data, error } = await supabase
            .from('game_update_subscriptions')
            .select('*')
            .eq('discord_id', uid)
            .order('id', { ascending: true });
        if (!error && Array.isArray(data)) return data;
    } catch {
        // Fallback
    }
    const { data } = await supabase.memoryFrom('game_update_subscriptions').select('*').eq('discord_id', uid);
    return data || [];
}

async function construirPanelSuscriptorParches(discordId, aviso = null) {
    const subs = await obtenerSuscripcionesParches(discordId);

    // Consultar datos en vivo de los juegos suscriptos para mostrar jugadores activos reales y el último timestamp updated real
    const liveGamesMap = new Map();
    if (subs.length > 0) {
        try {
            const uIds = [...new Set(subs.map(s => s.universe_id))].join(',');
            const gRes = await fetchWithRetry(`https://games.roblox.com/v1/games?universeIds=${uIds}`);
            (gRes.data?.data || []).forEach(g => liveGamesMap.set(String(g.id), g));
        } catch {
            // Silencioso
        }
    }

    const container = new ContainerBuilder()
        .setAccentColor(COLOR_GAMES)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🔔 Avisos de Parches y Actualizaciones de Juegos (\`${subs.length}/3\`)\n` +
            `Seguí tus experiencias favoritas y recibí un aviso automático apenas los creadores publiquen una nueva actualización en el juego.` +
            (aviso ? `\n\n> ${aviso}` : '')
        ))
        .addSeparatorComponents(separador());

    if (subs.length === 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            '### 📭 No estás suscripto a ningún radar de parches aún\n' +
            '> Podés suscribir hasta **3 juegos de Roblox** presionando **➕ Suscribir Juego** abajo.'
        ));
    } else {
        const lineas = subs.map((s, idx) => {
            const live = liveGamesMap.get(String(s.universe_id));
            const currentUpdatedIso = live?.updated || s.last_updated_iso || new Date().toISOString();
            const ts = Math.floor(new Date(currentUpdatedIso).getTime() / 1000);
            const playingNow = live ? Number(live.playing || 0).toLocaleString('es-AR') : 'N/A';
            const estado = s.is_paused ? '⏸️ En pausa' : '🟢 Monitoreo activo';
            return (
                `**${idx + 1}. [${s.game_name}](https://www.roblox.com/games/${s.place_id})** *(Universe \`${s.universe_id}\`)*\n` +
                `> 🕒 **Último parche en Roblox:** <t:${ts}:R> (<t:${ts}:f>)\n` +
                `> 👥 **Jugando ahora:** \`${playingNow}\`  •  ${estado}`
            );
        }).join('\n\n');

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lineas));
    }

    container.addSeparatorComponents(separador(true));
    const botones = [];
    if (subs.length < 3) {
        botones.push(boton('btn_games_patch_add_modal', 'Suscribir Juego (máx 3)', '➕', ButtonStyle.Primary));
    }
    if (subs.length > 0) {
        const algunoPausado = subs.some(s => s.is_paused);
        botones.push(
            boton('btn_games_patch_check_now', 'Verificar Ahora en Vivo', '🔄', ButtonStyle.Success),
            boton(
                `btn_games_patch_toggle:${algunoPausado ? 'resume' : 'pause'}`,
                algunoPausado ? 'Reanudar' : 'Pausar',
                algunoPausado ? '▶️' : '⏸️',
                ButtonStyle.Secondary
            ),
            boton('btn_games_patch_clear', 'Vaciar', '🗑️', ButtonStyle.Secondary)
        );
    }
    botones.push(boton('btn_nav_cat:cat_games', 'Volver', '⬅️'));

    container.addActionRowComponents(new ActionRowBuilder().addComponents(botones));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Seguimiento automático de nuevas actualizaciones en tus juegos favoritos')
    ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

async function revisarParchesJuegosWorker(client) {
    if (!client || !client.isReady()) return;

    let subs = [];
    try {
        const { data, error } = await supabase
            .from('game_update_subscriptions')
            .select('*')
            .eq('is_paused', false);
        if (!error && Array.isArray(data)) subs = data;
    } catch {
        return;
    }

    if (subs.length === 0) return;

    const universeIds = [...new Set(subs.map(s => s.universe_id))];
    try {
        const res = await fetchWithRetry(`https://games.roblox.com/v1/games?universeIds=${universeIds.join(',')}`);
        const gamesMap = new Map((res.data?.data || []).map(g => [String(g.id), g]));

        for (const sub of subs) {
            const live = gamesMap.get(String(sub.universe_id));
            if (live && live.updated && sub.last_updated_iso && live.updated !== sub.last_updated_iso) {
                await supabase
                    .from('game_update_subscriptions')
                    .update({ last_updated_iso: live.updated })
                    .eq('id', sub.id);

                try {
                    const user = await client.users.fetch(sub.discord_id);
                    const ts = Math.floor(new Date(live.updated).getTime() / 1000);
                    const alertContainer = new ContainerBuilder()
                        .setAccentColor(COLOR_GAMES)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `# 🔔 ¡Parche Silencioso Detectado en ${sub.game_name}!\n` +
                            `Los desarrolladores acaban de actualizar el servidor en Roblox.\n\n` +
                            `> 🕒 **Hora del parche:** <t:${ts}:R> (<t:${ts}:f>)\n` +
                            `> 👥 **Jugadores activos:** \`${Number(live.playing || 0).toLocaleString('es-AR')}\``
                        ))
                        .addSeparatorComponents(separador())
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            footer('Kortex Silent Patch Radar • Alerta en tiempo real')
                        ));

                    await user.send({
                        components: [alertContainer],
                        flags: MessageFlags.IsComponentsV2
                    });
                } catch {
                    // Silencioso
                }
            }
        }
    } catch {
        // Silencioso
    }
}

// ==========================================
// HERRAMIENTA 3.5: 🗺️ Escáner de Sub-Lugares y Mapas Ocultos del Universo
// ==========================================
async function escanearSubLugaresUniverso(gameQuery) {
    const game = await resolverJuegoRoblox(gameQuery);
    if (!game) return { game: null, places: [] };

    let places = [];
    try {
        const url = `https://develop.roblox.com/v1/universes/${game.universeId}/places?isUniverseCreation=false&limit=50&sortOrder=Asc`;
        const res = await fetchWithRetry(url);
        places = (res.data?.data || []).filter(p => p && p.id);
    } catch {
        places = [];
    }

    if (places.length === 0 && game.placeId) {
        places = [{ id: game.placeId, name: game.name, isRootPlace: true }];
    }

    return { game, places: places.slice(0, 15) };
}

async function construirPanelUniverseMapper(gameQuery = 'Blox Fruits') {
    const { game, places } = await escanearSubLugaresUniverso(gameQuery);

    if (!game) {
        const errContainer = new ContainerBuilder()
            .setAccentColor(COLOR_GAMES)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# 🗺️ Escáner de Sub-Lugares y Mapas Ocultos\n` +
                `> ⚠️ No se encontró ninguna experiencia con \`${gameQuery}\`. Verificá el nombre o PlaceId.`
            ))
            .addSeparatorComponents(separador(true))
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    boton('btn_games_mapper_modal', 'Escanear Otro Juego', '🔍', ButtonStyle.Primary),
                    boton('btn_nav_cat:cat_games', 'Volver a Juegos', '⬅️')
                )
            );
        return { components: [errContainer], files: [], attachments: [], flags: MessageFlags.IsComponentsV2 };
    }

    const tsUpdate = Math.floor(new Date(game.updated || Date.now()).getTime() / 1000);

    const lineas = places.map((p, i) => {
        const esRoot = String(p.id) === String(game.placeId) || p.isRootPlace;
        const badge = esRoot ? '🏠 **[RootPlace Principal]**' : '🗺️ **[Sub-Lugar / Mapa Conectado]**';
        return (
            `**${i + 1}. [${p.name || `Place ${p.id}`}](https://www.roblox.com/games/${p.id})** — \`PlaceId: ${p.id}\`\n` +
            `-# ${badge}  •  Última act. del universo: <t:${tsUpdate}:R>`
        );
    }).join('\n\n');

    const container = new ContainerBuilder()
        .setAccentColor(COLOR_GAMES)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🗺️ Explorador de Sub-Lugares y Mapas Conectados — ${game.name}\n` +
            `🌌 **UniverseId:** \`${game.universeId}\`  •  🏠 **Mapa Principal:** \`${game.placeId}\`  •  🗺️ **Mapas encontrados:** \`${places.length}\`\n` +
            `Mundos secundarios, lobbies, servidores de intercambio y arenas conectadas dentro de este juego:`
        ))
        .addSeparatorComponents(separador())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lineas))
        .addSeparatorComponents(separador(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_games_mapper_modal', 'Escanear Otro Juego / Universo', '🔍', ButtonStyle.Primary),
                new ButtonBuilder()
                    .setLabel('Abrir Juego en Roblox')
                    .setEmoji('🌐')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://www.roblox.com/games/${game.placeId}`),
                boton('btn_nav_cat:cat_games', 'Volver a Juegos', '⬅️')
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            footer('Explorador de mapas principales y mundos secundarios conectados')
        ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// DESPACHADOR DE INTERACCIONES DEL MÓDULO JUEGOS
// ==========================================
async function handleGamesInteraction(interaction) {
    const cid = interaction.customId;

    // 3.1 Servidores Vacíos
    if (cid === 'btn_games_servers') {
        await interaction.deferUpdate();
        const panel = await construirPanelServidoresVacios('Blox Fruits');
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_games_servers_q:')) {
        const q = cid.split(':')[1];
        await interaction.deferUpdate();
        const panel = await construirPanelServidoresVacios(q);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_games_servers_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_games_servers_submit')
            .setTitle('Buscador de Servidores Vacíos');

        const input = new TextInputBuilder()
            .setCustomId('servers_game_query')
            .setLabel('Nombre del Juego, PlaceId o enlace')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Blox Fruits, Da Hood, Brookhaven o 2753915549')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_games_servers_submit') {
        const q = interaction.fields.getTextInputValue('servers_game_query').trim();
        await interaction.deferUpdate();
        const panel = await construirPanelServidoresVacios(q);
        return await interaction.editReply(panel);
    }

    // 3.2 Extractor de Gamepasses
    if (cid === 'btn_games_passes') {
        await interaction.deferUpdate();
        const cached = gamepassCache.get(String(interaction.user.id));
        const defaultGame = cached?.game?.placeId || 'Blox Fruits';
        const panel = await construirPanelExtractorGamepasses(interaction.user.id, defaultGame, null, {
            reuseCache: false
        });
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_games_passes_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_games_passes_submit')
            .setTitle('Cambiar Juego a Analizar');

        const input = new TextInputBuilder()
            .setCustomId('passes_game_query')
            .setLabel('Nombre del Juego, PlaceId o enlace')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Pet Simulator 99, Blox Fruits, Brookhaven, Da Hood')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_games_passes_submit') {
        const q = interaction.fields.getTextInputValue('passes_game_query').trim();
        await interaction.deferUpdate();
        const panel = await construirPanelExtractorGamepasses(interaction.user.id, q, null, {
            reuseCache: false
        });
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_games_passes_sort:')) {
        const sortOrder = cid.split(':')[1] || 'asc';
        await interaction.deferUpdate();
        const cached = gamepassCache.get(String(interaction.user.id));
        const panel = await construirPanelExtractorGamepasses(
            interaction.user.id,
            cached?.game?.placeId || 'Blox Fruits',
            null,
            { reuseCache: true, sortOrder, page: 0 }
        );
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_games_passes_filter:')) {
        const filterMode = cid.split(':')[1] || 'all';
        await interaction.deferUpdate();
        const cached = gamepassCache.get(String(interaction.user.id));
        const msgMap = {
            all: '🌐 Mostrando **todos los pases** del juego (Tienda Web + Dentro del Juego).',
            web: '🏪 Mostrando pases publicados en la **Tienda Web de Roblox**.',
            ingame: '🕹️ Mostrando pases y paquetes exclusivos de la **Tienda Interna dentro del Juego**.'
        };
        const panel = await construirPanelExtractorGamepasses(
            interaction.user.id,
            cached?.game?.placeId || 'Blox Fruits',
            msgMap[filterMode] || null,
            {
                reuseCache: true,
                filterMode,
                searchKeyword: filterMode === 'all' ? '' : cached?.searchKeyword,
                page: 0
            }
        );
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_games_passes_reset') {
        await interaction.deferUpdate();
        const cached = gamepassCache.get(String(interaction.user.id));
        const panel = await construirPanelExtractorGamepasses(
            interaction.user.id,
            cached?.game?.placeId || 'Blox Fruits',
            '🔄 Vista restablecida a todos los pases.',
            { reuseCache: true, filterMode: 'all', sortOrder: 'default', searchKeyword: '', selectedPassId: null, page: 0 }
        );
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_games_passes_page:')) {
        const dirOrPage = cid.split(':')[1];
        await interaction.deferUpdate();
        const cached = gamepassCache.get(String(interaction.user.id));
        const currentPage = cached?.page || 0;
        let targetPage = 0;
        if (dirOrPage === 'prev') targetPage = Math.max(0, currentPage - 1);
        else if (dirOrPage === 'next') targetPage = currentPage + 1;
        else targetPage = parseInt(dirOrPage, 10) || 0;

        const panel = await construirPanelExtractorGamepasses(
            interaction.user.id,
            cached?.game?.placeId || 'Blox Fruits',
            null,
            { reuseCache: true, page: targetPage }
        );
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_games_passes_custom_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_games_passes_custom')
            .setTitle('Buscar Pase en este Juego');

        const input = new TextInputBuilder()
            .setCustomId('custom_pass_query')
            .setLabel('Nombre (Español/Inglés), Precio en R$ o ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Paquete de inicio, Starter Pack, 80, VIP, Storage')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_games_passes_custom') {
        const q = interaction.fields.getTextInputValue('custom_pass_query').trim();
        await interaction.deferUpdate();
        const uid = String(interaction.user.id);
        let cached = gamepassCache.get(uid);
        if (!cached || !cached.game) {
            await construirPanelExtractorGamepasses(uid, 'Blox Fruits');
            cached = gamepassCache.get(uid);
        }

        // Solo tratar como ID directo de Roblox si tiene al menos 6 dígitos o es una URL de roblox.com
        const cleanDigits = extractIdFromInput(q);
        const isDirectRobloxId = cleanDigits && (q.includes('roblox.com') || (/^\d{6,20}$/.test(q)));

        if (isDirectRobloxId) {
            const inspected = await inspeccionarGamepassPorId(cleanDigits);
            if (inspected) {
                const exists = cached.allPasses.some(p => String(p.id) === String(inspected.id));
                if (!exists) {
                    cached.allPasses.unshift(inspected);
                }
                const panel = await construirPanelExtractorGamepasses(
                    uid,
                    cached.game.placeId,
                    `🌟 Pase **${inspected.name}** encontrado por ID y destacado arriba.`,
                    {
                        reuseCache: true,
                        filterMode: 'all',
                        searchKeyword: '',
                        selectedPassId: String(inspected.id),
                        page: 0
                    }
                );
                return await interaction.editReply(panel);
            }
        }

        // Búsqueda inteligente por nombre (Español/Inglés) o por precio en Robux (ej. "80" o "paquete de inicio")
        const matches = (cached?.allPasses || []).filter(p => coincideBusquedaPase(p, q));
        const firstMatch = matches[0] || null;

        const panel = await construirPanelExtractorGamepasses(
            uid,
            cached?.game?.placeId || 'Blox Fruits',
            firstMatch
                ? `🔎 Se encontró **${firstMatch.name}** para tu búsqueda \`${q}\` y se destacó arriba.`
                : `⚠️ No se encontró ningún pase con \`${q}\` en **${cached?.game?.name || 'este juego'}**.`,
            {
                reuseCache: true,
                filterMode: 'all',
                searchKeyword: matches.length > 0 ? q : '',
                selectedPassId: firstMatch ? String(firstMatch.id) : cached?.selectedPassId,
                page: 0
            }
        );
        return await interaction.editReply(panel);
    }

    if (cid === 'select_games_pass_inspect') {
        const passId = interaction.values[0];
        await interaction.deferUpdate();
        const cached = gamepassCache.get(String(interaction.user.id));
        const passObj = cached?.allPasses?.find(p => String(p.id) === String(passId));

        if (!cached || !passObj) {
            const panel = await construirPanelExtractorGamepasses(interaction.user.id, 'Blox Fruits');
            return await interaction.editReply(panel);
        }

        const panel = await construirPanelExtractorGamepasses(
            interaction.user.id,
            cached.game.placeId,
            `🌟 Destacando el pase **${passObj.name}** arriba con toda su información.`,
            {
                reuseCache: true,
                selectedPassId: String(passObj.id)
            }
        );
        return await interaction.editReply(panel);
    }

    // 3.3 Bóveda de Códigos Activos con Checklist
    if (cid === 'btn_games_codes') {
        await interaction.deferUpdate();
        const panel = await construirPanelBovedaCodigos(interaction.user.id);
        return await interaction.editReply(panel);
    }

    if (cid === 'select_games_codes_game') {
        const universeId = interaction.values[0];
        await interaction.deferUpdate();
        const panel = await construirPanelBovedaCodigos(interaction.user.id, { universeId });
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_games_codes_filter:')) {
        const soloFaltantes = cid.split(':')[1] === '1';
        await interaction.deferUpdate();
        const panel = await construirPanelBovedaCodigos(interaction.user.id, { soloFaltantes });
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_games_codes_add_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_games_codes_add')
            .setTitle('Registrar Código Activo en la Bóveda');

        const inputGame = new TextInputBuilder()
            .setCustomId('code_game_query')
            .setLabel('Nombre del Juego o PlaceId')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Blox Fruits, King Legacy, Jujutsu Infinite...')
            .setRequired(true);

        const inputCode = new TextInputBuilder()
            .setCustomId('code_string')
            .setLabel('Código Promocional Exacto')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: KITT_RESET o SUB2GAMERROBOT_EXP1')
            .setRequired(true);

        const inputReward = new TextInputBuilder()
            .setCustomId('code_reward')
            .setLabel('Recompensa del Código')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: 20 minutos de 2x EXP o Reset de Stats')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(inputGame),
            new ActionRowBuilder().addComponents(inputCode),
            new ActionRowBuilder().addComponents(inputReward)
        );
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_games_codes_add') {
        const gameQ = interaction.fields.getTextInputValue('code_game_query').trim();
        const codeStr = interaction.fields.getTextInputValue('code_string').trim().toUpperCase();
        const rewardStr = interaction.fields.getTextInputValue('code_reward').trim();

        await interaction.deferUpdate();
        const resolvedGame = await resolverJuegoRoblox(gameQ);
        const targetUniverseId = resolvedGame ? resolvedGame.universeId : 994732206;
        const targetGameName = resolvedGame ? resolvedGame.name : gameQ;

        const newCodeRow = {
            universe_id: targetUniverseId,
            game_name: targetGameName,
            code: codeStr,
            reward_description: rewardStr,
            is_active: true,
            created_at: new Date().toISOString()
        };

        try {
            const { error } = await supabase.from('roblox_game_codes').upsert(newCodeRow, { onConflict: 'universe_id,code' });
            if (error) {
                await supabase.memoryFrom('roblox_game_codes').insert([newCodeRow]);
            }
        } catch {
            await supabase.memoryFrom('roblox_game_codes').insert([newCodeRow]);
        }

        const panel = await construirPanelBovedaCodigos(interaction.user.id, {
            universeId: targetUniverseId,
            customGameName: targetGameName,
            feedback: `✅ Código **\`${codeStr}\`** guardado en la bóveda de **${targetGameName}**.`
        });
        return await interaction.editReply(panel);
    }

    if (cid === 'select_games_codes_toggle') {
        const selectedIds = interaction.values;
        await interaction.deferUpdate();
        const uid = String(interaction.user.id);
        const savedState = codesFilterState.get(uid) || { universeId: 994732206, soloFaltantes: false };
        const { redeemedSet } = await obtenerEstadoCodigosUsuario(uid, savedState.universeId);

        for (const cidVal of selectedIds) {
            const numId = Number(cidVal);
            if (redeemedSet.has(String(cidVal))) {
                try {
                    await supabase.from('user_redeemed_codes').delete().eq('discord_id', uid).eq('code_id', numId);
                    await supabase.memoryFrom('user_redeemed_codes').delete().eq('discord_id', uid).eq('code_id', numId);
                } catch {
                    // Silencioso
                }
            } else {
                const payload = { discord_id: uid, code_id: numId, redeemed_at: new Date().toISOString() };
                try {
                    const { error } = await supabase.from('user_redeemed_codes').upsert(payload, { onConflict: 'discord_id,code_id' });
                    if (error) {
                        await supabase.memoryFrom('user_redeemed_codes').upsert(payload, { onConflict: 'discord_id,code_id' });
                    }
                } catch {
                    await supabase.memoryFrom('user_redeemed_codes').upsert(payload, { onConflict: 'discord_id,code_id' });
                }
            }
        }

        const panel = await construirPanelBovedaCodigos(uid);
        return await interaction.editReply(panel);
    }

    // 3.4 Suscriptor de Parches y Actualizaciones Silenciosas
    if (cid === 'btn_games_patches') {
        await interaction.deferUpdate();
        const panel = await construirPanelSuscriptorParches(interaction.user.id);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_games_patch_check_now') {
        await interaction.deferUpdate();
        const subs = await obtenerSuscripcionesParches(interaction.user.id);
        let cambios = 0;

        if (subs.length > 0) {
            try {
                const uIds = [...new Set(subs.map(s => s.universe_id))].join(',');
                const res = await fetchWithRetry(`https://games.roblox.com/v1/games?universeIds=${uIds}`);
                const map = new Map((res.data?.data || []).map(g => [String(g.id), g]));
                for (const s of subs) {
                    const live = map.get(String(s.universe_id));
                    if (live && live.updated && live.updated !== s.last_updated_iso) {
                        cambios++;
                        await supabase.from('game_update_subscriptions').update({ last_updated_iso: live.updated }).eq('id', s.id);
                    }
                }
            } catch {
                // Silencioso
            }
        }

        const msg = cambios > 0
            ? `🔔 ¡Se detectaron **${cambios} actualización(es) nueva(s)** y se actualizaron los registros!`
            : `✅ Verificado en vivo contra \`games.roblox.com\`: los timestamps de tus juegos están al día.`;
        const panel = await construirPanelSuscriptorParches(interaction.user.id, msg);
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_games_patch_add_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_games_patch_add')
            .setTitle('Suscribir Juego a Alertas de Parches');

        const input = new TextInputBuilder()
            .setCustomId('patch_game_query')
            .setLabel('Nombre del Juego o PlaceId')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Blox Fruits, Pet Simulator 99 o 2753915549')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_games_patch_add') {
        const q = interaction.fields.getTextInputValue('patch_game_query').trim();
        await interaction.deferUpdate();

        const subs = await obtenerSuscripcionesParches(interaction.user.id);
        if (subs.length >= 3) {
            const panel = await construirPanelSuscriptorParches(interaction.user.id, '⚠️ Ya alcanzaste el máximo de 3 juegos suscriptos.');
            return await interaction.editReply(panel);
        }

        const game = await resolverJuegoRoblox(q);
        if (!game) {
            const panel = await construirPanelSuscriptorParches(interaction.user.id, `⚠️ No se encontró ningún juego en Roblox con \`${q}\`.`);
            return await interaction.editReply(panel);
        }

        const row = {
            discord_id: String(interaction.user.id),
            channel_id: interaction.channelId || null,
            universe_id: game.universeId,
            place_id: game.placeId,
            game_name: game.name,
            last_updated_iso: game.updated || new Date().toISOString(),
            is_paused: false
        };

        try {
            const { error } = await supabase.from('game_update_subscriptions').upsert(row, { onConflict: 'discord_id,universe_id' });
            if (error) {
                await supabase.memoryFrom('game_update_subscriptions').upsert(row, { onConflict: 'discord_id,universe_id' });
            }
        } catch {
            await supabase.memoryFrom('game_update_subscriptions').upsert(row, { onConflict: 'discord_id,universe_id' });
        }

        const panel = await construirPanelSuscriptorParches(
            interaction.user.id,
            `✅ Suscripto a los parches silenciosos de **${game.name}** (Universe \`${game.universeId}\`).`
        );
        return await interaction.editReply(panel);
    }

    if (cid.startsWith('btn_games_patch_toggle:')) {
        const mode = cid.split(':')[1];
        const isPaused = mode === 'pause';
        await interaction.deferUpdate();
        try {
            await supabase.from('game_update_subscriptions').update({ is_paused: isPaused }).eq('discord_id', String(interaction.user.id));
            await supabase.memoryFrom('game_update_subscriptions').update({ is_paused: isPaused }).eq('discord_id', String(interaction.user.id));
        } catch {
            // Silencioso
        }
        const panel = await construirPanelSuscriptorParches(
            interaction.user.id,
            isPaused ? '⏸️ Alertas de parches pausadas.' : '▶️ Alertas de parches reanudadas.'
        );
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_games_patch_clear') {
        await interaction.deferUpdate();
        try {
            await supabase.from('game_update_subscriptions').delete().eq('discord_id', String(interaction.user.id));
            await supabase.memoryFrom('game_update_subscriptions').delete().eq('discord_id', String(interaction.user.id));
        } catch {
            // Silencioso
        }
        const panel = await construirPanelSuscriptorParches(interaction.user.id, '🗑️ Suscripciones eliminadas.');
        return await interaction.editReply(panel);
    }

    // 3.5 Escáner de Sub-Lugares y Mapas Ocultos (Universe Mapper)
    if (cid === 'btn_games_mapper') {
        await interaction.deferUpdate();
        const panel = await construirPanelUniverseMapper('Blox Fruits');
        return await interaction.editReply(panel);
    }

    if (cid === 'btn_games_mapper_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_games_mapper_submit')
            .setTitle('Escáner de Sub-Lugares del Universo');

        const input = new TextInputBuilder()
            .setCustomId('mapper_game_query')
            .setLabel('Nombre del Juego, PlaceId o UniverseId')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ej: Blox Fruits, Doors, BedWars o 2753915549')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await interaction.showModal(modal);
    }

    if (cid === 'modal_games_mapper_submit') {
        const q = interaction.fields.getTextInputValue('mapper_game_query').trim();
        await interaction.deferUpdate();
        const panel = await construirPanelUniverseMapper(q);
        return await interaction.editReply(panel);
    }
}

module.exports = {
    handleGamesInteraction,
    resolverJuegoRoblox,
    construirPanelServidoresVacios,
    construirPanelExtractorGamepasses,
    construirPanelBovedaCodigos,
    construirPanelSuscriptorParches,
    revisarParchesJuegosWorker,
    construirPanelUniverseMapper
};
