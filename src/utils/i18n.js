// ==========================================
// ARCHIVO: src/utils/i18n.js
// Sistema Bilingüe Completo (Español / English) y Preferencias de Usuario
// Nota: Exclusivamente Español ('es') e Inglés ('en').
// Los nombres de los comandos (/roblox, /config, /ping, /help) se mantienen siempre en inglés.
// ==========================================

const { AsyncLocalStorage } = require('node:async_hooks');
const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const { COLORES, footer, separador } = require('../../utils/ui');

const SUPPORTED_LANGUAGES = ['es', 'en'];
const langContextStorage = new AsyncLocalStorage();

const TIER_LABELS = {
    es: {
        TIER_100: '🌐 Tier 100% — EE.UU., España, Global (Sin descuento regional)',
        TIER_80: '🇲🇽 Tier 80% — México, Chile, Uruguay (20% descuento regional)',
        TIER_60: '🇦🇷 Tier 60% — Argentina, Brasil, Colombia, Perú (40% descuento regional)',
        TIER_40: '🇻🇪 Tier 40% — Venezuela, Bolivia, Paraguay (60% descuento regional)'
    },
    en: {
        TIER_100: '🌐 Tier 100% — US, Spain, Global (Standard pricing)',
        TIER_80: '🇲🇽 Tier 80% — Mexico, Chile, Uruguay (20% regional discount)',
        TIER_60: '🇦🇷 Tier 60% — Argentina, Brazil, Colombia, Peru (40% regional discount)',
        TIER_40: '🇻🇪 Tier 40% — Venezuela, Bolivia, Paraguay (60% regional discount)'
    }
};

function getFastLinkStore() {
    return require('./fastLink');
}

/**
 * Obtiene las preferencias completas del usuario (idioma y región de precios predeterminada).
 */
function obtenerPreferenciasUsuario(userId) {
    const key = String(userId || 'default_session').trim();
    const { obtenerConfigDiscord } = getFastLinkStore();
    const cfg = obtenerConfigDiscord(key) || {};
    const lang = cfg.lang === 'en' ? 'en' : 'es';
    const validTiers = ['TIER_100', 'TIER_80', 'TIER_60', 'TIER_40'];
    const defaultTier = validTiers.includes(cfg.default_tier) ? cfg.default_tier : 'TIER_100';

    return {
        discord_id: key,
        lang,
        language_selected: Boolean(cfg.language_selected),
        default_tier: defaultTier
    };
}

/**
 * Verifica si el usuario ya eligió su idioma por primera vez.
 */
function haSeleccionadoIdioma(userId) {
    if (!userId) return true;
    const prefs = obtenerPreferenciasUsuario(userId);
    return Boolean(prefs.language_selected);
}

/**
 * Obtiene el idioma actual del usuario ('es' o 'en').
 */
function obtenerIdiomaUsuario(userId) {
    if (!userId) return obtenerIdiomaActual();
    return obtenerPreferenciasUsuario(userId).lang;
}

/**
 * Obtiene el idioma activo en el contexto asíncrono actual (útil para Canvas/chartGenerator y helpers sin userId explícito).
 */
function obtenerIdiomaActual() {
    const store = langContextStorage.getStore();
    if (store && store.userId) {
        return obtenerPreferenciasUsuario(store.userId).lang;
    }
    if (store && (store.lang === 'en' || store.lang === 'es')) {
        return store.lang;
    }
    return 'es';
}

/**
 * Ejecuta una función dentro del contexto de idioma del usuario actual.
 */
function ejecutarConContextoIdioma(userId, fn) {
    const lang = userId ? obtenerPreferenciasUsuario(userId).lang : 'es';
    return langContextStorage.run({ userId: String(userId || ''), lang }, fn);
}

/**
 * Guarda el idioma elegido por el usuario ('es' o 'en' únicamente).
 */
function guardarIdiomaUsuario(userId, lang) {
    const cleanLang = String(lang || '').toLowerCase() === 'en' ? 'en' : 'es';
    const store = langContextStorage.getStore();
    if (store) {
        store.lang = cleanLang;
    }
    return guardarPreferenciasUsuario(userId, {
        lang: cleanLang,
        language_selected: true
    });
}

/**
 * Guarda preferencias de usuario en la configuración persistente.
 */
function guardarPreferenciasUsuario(userId, partial = {}) {
    const key = String(userId || 'default_session').trim();
    const { guardarConfigDiscord } = getFastLinkStore();
    const current = obtenerPreferenciasUsuario(key);

    const nextLang = partial.lang !== undefined
        ? (String(partial.lang).toLowerCase() === 'en' ? 'en' : 'es')
        : current.lang;

    const validTiers = ['TIER_100', 'TIER_80', 'TIER_60', 'TIER_40'];
    const nextTier = partial.default_tier && validTiers.includes(partial.default_tier)
        ? partial.default_tier
        : current.default_tier;

    const updated = guardarConfigDiscord(key, {
        lang: nextLang,
        language_selected: partial.language_selected !== undefined ? Boolean(partial.language_selected) : true,
        default_tier: nextTier
    });

    return {
        discord_id: key,
        lang: updated.lang || nextLang,
        language_selected: Boolean(updated.language_selected),
        default_tier: updated.default_tier || nextTier
    };
}

/**
 * Construye el panel interactivo bilingüe que se muestra cuando un usuario ejecuta
 * un comando por primera vez para que elija Español o Inglés (solo esos dos idiomas).
 */
function construirPanelSeleccionIdiomaInicial(userId, targetCommand = 'roblox') {
    const safeCmd = ['roblox', 'config', 'ping', 'help'].includes(targetCommand)
        ? targetCommand
        : 'roblox';

    const container = new ContainerBuilder()
        .setAccentColor(COLORES.primario)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# 🌐 Seleccioná tu Idioma / Select your Language\n` +
                `¡Bienvenido a **Kortex**! Antes de abrir \`/${safeCmd}\`, elegí en qué idioma preferís usar el bot.\n` +
                `Welcome to **Kortex**! Before opening \`/${safeCmd}\`, choose your preferred language.`
            )
        )
        .addSeparatorComponents(separador(true))
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### 🇪🇸 Español (Latinoamérica y España)\n` +
                        `> Todos los paneles, herramientas, gráficas, calculadoras y alertas se mostrarán en **Español**.\n` +
                        `> -# Podés cambiarlo cuando quieras en \`/config\` → **Idioma y Preferencias**.`
                    )
                )
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setCustomId(`btn_lang_first_pick:es:${safeCmd}`)
                        .setLabel('Español')
                        .setEmoji('🇪🇸')
                        .setStyle(ButtonStyle.Primary)
                )
        )
        .addSeparatorComponents(separador())
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### 🇺🇸 English (United States & Global)\n` +
                        `> All panels, tools, charts, calculators, and alerts will be displayed in **English**.\n` +
                        `> -# You can switch languages anytime in \`/config\` → **Language & Preferences**.`
                    )
                )
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setCustomId(`btn_lang_first_pick:en:${safeCmd}`)
                        .setLabel('English')
                        .setEmoji('🇺🇸')
                        .setStyle(ButtonStyle.Success)
                )
        )
        .addSeparatorComponents(separador(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                footer('Kortex • Idiomas / Languages: Español & English • Commands: /roblox • /config • /ping')
            )
        );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// LIMPIEZA DE TÉRMINOS EN INGLÉS CUANDO EL USUARIO ESTÁ EN ESPAÑOL ('es')
// ==========================================
const SPANISH_POLISH_REPLACEMENTS = [
    ['Price Sniper', 'Seguimiento de Precios'],
    ['Ir al Sniper', 'Seguimiento de Precios'],
    ['Outfit Sandbox', 'Probador de Ropa'],
    ['Gratis / Offsale', 'Gratis / Fuera de venta'],
    ['Offsale / N/A', 'Fuera de venta'],
    ['Offsale', 'Fuera de venta'],
    ['Slot:', 'Ranura:'],
    ['• Slot:', '• Ranura:'],
    ['Gear, Espadas y Mano', 'Equipamiento, Espadas y Mano'],
    ['Gear', 'Equipamiento'],
    ['T-Shirts y Estampados (2D)', 'Camisetas y Estampados (2D)'],
    ['T-Shirts', 'Camisetas'],
    ['T-Shirt (Estampado Frontal)', 'Camiseta (Estampado Frontal)'],
    ['Camisa Clásica (Shirt 2D)', 'Camisa Clásica (2D)'],
    ['Pantalón Clásico (Pants 2D)', 'Pantalón Clásico (2D)'],
    ['Sombrero (Hat)', 'Sombrero'],
    ['Pelo (Hair)', 'Pelo'],
    ['Cara (Face)', 'Cara'],
    ['Cuello (Neck)', 'Cuello'],
    ['Hombros (Shoulder)', 'Hombros'],
    ['Frente (Front)', 'Frente'],
    ['Espalda (Back)', 'Espalda'],
    ['Cintura (Waist)', 'Cintura'],
    ['Chaqueta (Jacket 3D)', 'Chaqueta (3D)'],
    ['Suéter (Sweater 3D)', 'Suéter (3D)'],
    ['Pantalón 3D (Pants 3D)', 'Pantalón (3D)'],
    ['Nombre, Asset ID o URL de la prenda', 'Nombre, ID o enlace de la prenda'],
    ['Asset ID:', 'ID del objeto:'],
    ['PlaceId o UniverseId', 'ID del lugar o universo'],
    ['PlaceId', 'ID del lugar'],
    ['Dentro del Juego (Exclusive Shop)', 'Dentro del Juego (Tienda Interna)'],
    ['Pases de Juego (Gamepasses)', 'Pases de Juego'],
    ['Pase de Juego (Gamepass)', 'Pase de Juego'],
    ['Acceso Pago (Paid Access)', 'Acceso Pago']
];

function pulirTextoEspanol(text) {
    if (!text || typeof text !== 'string') return text;
    let out = text;
    for (const [badStr, goodStr] of SPANISH_POLISH_REPLACEMENTS) {
        if (out.includes(badStr)) {
            out = out.split(badStr).join(goodStr);
        }
    }
    return out;
}

// ==========================================
// DICCIONARIO EXACTO ESPAÑOL -> INGLÉS
// ==========================================
const EXACT_MAP = new Map([
    // Botones de navegación y acciones frecuentes
    ['Abrir', 'Open'],
    ['Volver Atrás', 'Go Back'],
    ['⬅️ Volver Atrás', '⬅️ Go Back'],
    ['Volver', 'Go Back'],
    ['Menú Principal', 'Main Menu'],
    ['Actualizar', 'Refresh'],
    ['Calcular', 'Calculate'],
    ['Nuevo Cálculo', 'New Calculation'],
    ['Ver Mi Lista', 'View Watchlist'],
    ['Mi Lista', 'My Watchlist'],
    ['Añadir Objeto', 'Add Item'],
    ['Buscar / Añadir Objeto', 'Search / Add Item'],
    ['Configurar', 'Configure'],
    ['Ver Gráfica', 'View Chart'],
    ['Pausar', 'Pause'],
    ['Reanudar', 'Resume'],
    ['Pausar Alerta', 'Pause Alert'],
    ['Reanudar Alerta', 'Resume Alert'],
    ['Editar Meta', 'Edit Target'],
    ['Fijar Meta', 'Set Target'],
    ['Fijar Meta de Precio', 'Set Target Price'],
    ['Monitorear Sin Meta', 'Track Without Target'],
    ['Cambiar Meta', 'Set Target'],
    ['Cambiar Meta (R$)', 'Set Target (R$)'],
    ['Quitar Meta', 'Clear Target'],
    ['Probar Alerta', 'Test Alert'],
    ['Seguimiento de Precios', 'Price Tracker'],
    ['Ir al Sniper', 'Price Tracker'],
    ['Ingresar ID de Canal', 'Enter Channel ID'],
    ['Eliminar', 'Delete'],
    ['Eliminar de Mi Lista', 'Remove from Watchlist'],
    ['Todo', 'All'],
    ['Todos', 'All'],
    ['24 Horas', '24 Hours'],
    ['7 Días', '7 Days'],
    ['30 Días', '30 Days'],
    ['Histórico Total', 'All-Time'],
    ['24 horas', '24 hours'],
    ['7 días', '7 days'],
    ['30 días', '30 days'],
    ['Histórico total', 'All-Time'],
    ['Catálogo', 'Catalog'],
    ['Pase de Juego', 'Gamepass'],
    ['Plugin', 'Plugin'],
    ['Acceso Pago', 'Paid Access'],
    ['Comprobar Estado de Cuentas', 'Check Account Status'],
    ['Comprobar Autorización', 'Verify Authorization'],
    ['Abrir Panel Web', 'Open Web Dashboard'],
    ['Ver Perfil en Roblox', 'View Profile on Roblox'],
    ['Ver en Roblox', 'View on Roblox'],
    ['Ver Objeto en Roblox', 'View Item on Roblox'],
    ['Ver Grupo en Roblox', 'View Group on Roblox'],
    ['Ver Juego en Roblox', 'View Game on Roblox'],
    ['Ver Pase en Roblox', 'View Gamepass on Roblox'],
    ['Revalidar en Roblox', 'Revalidate on Roblox'],
    ['Autorizar con Roblox OAuth 2.0', 'Authorize with Roblox OAuth 2.0'],
    ['Revalidar Discord OAuth2', 'Revalidate Discord OAuth2'],
    ['Conectar con Discord OAuth2', 'Connect with Discord OAuth2'],
    ['Cambiar Cuenta de Roblox', 'Switch Roblox Account'],
    ['Conectar con Roblox OAuth2', 'Connect with Roblox OAuth2'],
    ['Iniciar Sesión con Discord', 'Sign in with Discord'],
    ['Iniciar Sesión con Roblox (OAuth 2.0)', 'Sign in with Roblox (OAuth 2.0)'],
    ['Ir al Centro de Cuenta Roblox', 'Open Roblox Account Center'],
    ['Elegir Cantidad (R$)', 'Enter Amount (R$)'],
    ['Todas On / Off', 'Toggle All On / Off'],
    ['Purgar RAM y Caché', 'Purge RAM & Cache'],
    ['Mantenimiento', 'Maintenance'],
    ['Salir Mantenimiento', 'Exit Maintenance'],

    // Botones y etiquetas de herramientas 1.1 a 3.5
    ['Actualizar Pisos Ahora', 'Refresh Floors Now'],
    ['Registrar Robux Pendientes', 'Add Pending Robux'],
    ['Probar Alerta Ahora', 'Test Alert Now'],
    ['Limpiar Liberados', 'Clear Released'],
    ['Buscar / Auditar Grupo', 'Search / Audit Group'],
    ['Probar en mi Avatar (2.1)', 'Try on My Avatar (2.1)'],
    ['Probar en Mi Avatar (2.1)', 'Try on My Avatar (2.1)'],
    ['Ver en Catálogo Roblox', 'View in Roblox Catalog'],
    ['+ Probar Accesorio (ID/Nombre)', '+ Try Accessory (ID/Name)'],
    ['Probar Accesorio / Avatar', 'Try Accessory / Avatar'],
    ['Mi Ropa Actual', 'My Worn Outfit'],
    ['Ver Cuerpo', 'Full Body'],
    ['Zoom Cabeza', 'Head Zoom'],
    ['Quitar Último', 'Remove Last'],
    ['Vaciar Todo', 'Clear All'],
    ['Cambiar Personaje (@usuario)', 'Switch Character (@user)'],
    ['Cotizar Mi Ropa Actual', 'Price My Worn Outfit'],
    ['Conjunto Demo', 'Demo Outfit'],
    ['Zoom Cabeza: ON', 'Head Zoom: ON'],
    ['Zoom Cabeza: OFF', 'Head Zoom: OFF'],
    ['Vaciar Probador', 'Clear Sandbox'],
    ['Buscar Clones / Similares', 'Find Clones / Similar'],
    ['Extraer Plantilla (.PNG)', 'Extract Template (.PNG)'],
    ['Modo: Camisa (Shirt)', 'Mode: Shirt'],
    ['Modo: Pantalón (Pants)', 'Mode: Pants'],
    ['Modo: Traje Completo', 'Mode: Full Suit'],
    ['Abrir Textura Original HD', 'Open Original HD Texture'],
    ['Exportar Otro Avatar / Ítem', 'Export Another Avatar / Item'],
    ['Exportar Mi Avatar Vinculado', 'Export My Linked Avatar'],
    ['Analizar Ítem o #HEX', 'Analyze Item or #HEX'],
    ['Analizar Mi Avatar', 'Analyze My Avatar'],
    ['Tono #1', 'Tone #1'],
    ['Tono #2', 'Tone #2'],
    ['Tono #3', 'Tone #3'],
    ['Buscar otro Juego', 'Search Another Game'],
    ['Re-escanear Servidores', 'Rescan Servers'],
    ['Abrir Página de Servidores', 'Open Servers Page'],
    ['Examinar otro Juego', 'Inspect Another Game'],
    ['Orden: Mayor Precio', 'Sort: Highest Price'],
    ['Orden: Menor Precio', 'Sort: Lowest Price'],
    ['Orden: Original', 'Sort: Default'],
    ['Menor R$', 'Lowest R$'],
    ['Mayor R$', 'Highest R$'],
    ['Ver Todos los Pases', 'View All Gamepasses'],
    ['Ver Todos los Códigos', 'View All Codes'],
    ['Ver Solo Faltantes', 'View Unredeemed Only'],
    ['Registrar Código / Juego', 'Submit Code / Game'],
    ['Elegir otro Juego', 'Choose Another Game'],
    ['Aportar Código Nuevo', 'Submit New Code'],
    ['Seguir Juego (Máx. 3)', 'Follow Game (Max 3)'],
    ['Verificar Parches Ahora', 'Check Patches Now'],
    ['Explorar otro Universo', 'Explore Another Universe'],
    ['Abrir Lugar en Roblox', 'Open Place on Roblox'],
    ['Volver a Todos los Mapas', 'Back to All Maps'],
    ['Actualizar Precios', 'Refresh Prices'],
    ['Registrar Operación', 'Add Pending Robux'],
    ['Actualizar Estado', 'Refresh Status'],
    ['Limpiar Agenda', 'Clear Schedule'],
    ['Inspeccionar Grupo de Roblox', 'Inspect Roblox Group'],
    ['Probar Grupo de Ejemplo', 'Try Sample Group'],
    ['Buscar Otro Grupo', 'Search Another Group'],
    ['Más Vendidas', 'Best Selling'],
    ['Más Recientes', 'Recently Updated'],
    ['Abrir Grupo', 'Open Group'],
    ['Extraer Textura de Prenda', 'Extract Garment Texture'],
    ['Probar Ejemplo en Maniquí', 'Try Sample on Mannequin'],
    ['Probar en Maniquí', 'Preview on Mannequin'],
    ['Extraer Otra Prenda', 'Extract Another Garment'],
    ['Subir URL .PNG', 'Upload .PNG URL'],
    ['Modo Camisa', 'Shirt Mode'],
    ['Modo Pantalón', 'Pants Mode'],
    ['Traje Completo', 'Full Suit'],
    ['Otra Prenda', 'Another Garment'],
    ['Ver Plantilla .PNG', 'View .PNG Template'],
    ['Exportar Mi Avatar', 'Export My Avatar'],
    ['Otro Avatar o Accesorio', 'Another Avatar or Item'],
    ['Ejemplo: Valkyrie 3D', 'Sample: Valkyrie 3D'],
    ['Colores de Mi Avatar', 'My Avatar Colors'],
    ['Ingresar Prenda o #HEX', 'Enter Garment or #HEX'],
    ['Probar Ejemplo (#5865F2)', 'Try Sample (#5865F2)'],
    ['Cambiar Prenda o Color #HEX', 'Change Garment or #HEX'],
    ['Usar Mi Avatar', 'Use My Avatar'],
    ['Buscar Similares (Nombre o ID)', 'Find Similar (Name or ID)'],
    ['Probar Ejemplo: Valkyrie Helm', 'Try Sample: Valkyrie Helm'],
    ['Buscar Otro Ítem', 'Search Another Item'],
    ['UGC Baratos', 'Cheap UGC'],
    ['Oficiales Roblox', 'Official Roblox'],
    ['Monitorear en Mi Lista', 'Track in Watchlist'],
    ['Comprar en Roblox', 'Buy on Roblox'],
    ['Buscar Cualquier Juego', 'Search Any Game'],
    ['Re-escanear', 'Rescan'],
    ['Página del Juego', 'Game Page'],
    ['Cambiar Juego', 'Change Game'],
    ['Buscar Pase (Nombre / R$)', 'Search Pass (Name / R$)'],
    ['Anterior', 'Previous'],
    ['Siguiente', 'Next'],
    ['Suscribir Juego (máx 3)', 'Subscribe Game (max 3)'],
    ['Verificar Ahora', 'Check Now'],
    ['Vaciar', 'Clear All'],
    ['Escanear Otro Juego', 'Scan Another Game'],
    ['Abrir Juego en Roblox', 'Open Game on Roblox'],
    ['Limpiar Caché', 'Clear Cache'],
    ['Cambiar Cuenta', 'Switch Account'],
    ['Conectar Roblox', 'Connect Roblox'],
    ['Conectar Discord', 'Connect Discord'],
    ['Reconectar Discord', 'Reconnect Discord'],
    ['Mi Cuenta Roblox', 'My Roblox Account'],
    ['Panel Web', 'Web Dashboard'],
    ['Perfil de Roblox', 'Roblox Profile'],

    // Títulos y campos de Modals en todas las herramientas
    ['Añadir Objeto al Monitoreo', 'Add Item to Watchlist'],
    ['ID o Enlace del Objeto', 'Item ID or URL'],
    ['Ejemplo: 10159610478 o enlace de Roblox', 'Example: 10159610478 or Roblox URL'],
    ['Configurar Meta de Precio', 'Set Target Price'],
    ['Meta en Robux — 0 para quitar', 'Target in Robux — 0 to clear'],
    ['Meta en Dólares ($ USD) — 0 para quitar', 'Target in Dollars ($ USD) — 0 to clear'],
    ['Ej: 100 (o 0 para monitorear sin meta)', 'E.g.: 100 (or 0 to track without target)'],
    ['Ej: 1.99 (o 0 para monitorear sin meta)', 'E.g.: 1.99 (or 0 to track without target)'],
    ['Establecer Meta de Precio', 'Set Target Price'],
    ['Precio Objetivo en Robux', 'Target Price in Robux'],
    ['Precio Objetivo en Dólares ($ USD)', 'Target Price in Dollars ($ USD)'],
    ['Ejemplo: 100', 'Example: 100'],
    ['Ejemplo: 4.99', 'Example: 4.99'],
    ['Vincular Canal por ID', 'Link Channel by ID'],
    ['ID del Canal de Discord', 'Discord Channel ID'],
    ['Ejemplo: 123456789012345678', 'Example: 123456789012345678'],
    ['Configurar Webhook de Alerta', 'Configure Alert Webhook'],
    ['URL del Webhook de Discord', 'Discord Webhook URL'],
    ['Calculadora de Economía', 'Economy Calculator'],
    ['Precio base en Robux', 'Base price in Robux'],
    ['Ejemplo: 50', 'Example: 50'],
    ['20% de descuento', '20% discount'],
    ['40% de descuento', '40% discount'],
    ['60% de descuento', '60% discount'],
    ['Cantidad de Robux pendientes (R$)', 'Pending Robux amount (R$)'],
    ['Origen (grupo/gamepass/ropa/limited)', 'Source (group/gamepass/clothing/limited)'],
    ['grupo, gamepass, ropa o limited', 'group, gamepass, clothing, or limited'],
    ['Ejemplo: 1500', 'Example: 1500'],
    ['ID, Nombre o enlace del Grupo de Roblox', 'Roblox Group ID, Name, or URL'],
    ['Ej: 7, Roblox, Rush_X o link del grupo', 'E.g.: 7, Roblox, Rush_X, or group link'],
    ['➕ Probar Accesorio o Cambiar Avatar', '➕ Try Accessory or Switch Avatar'],
    ['Nombre/ID del ítem (o @usuario de Roblox)', 'Item Name/ID (or @RobloxUser)'],
    ['Ej: Valkyrie Helm, 1365767 o @Builderman', 'E.g.: Valkyrie Helm, 1365767, or @Builderman'],
    ['🔍 Buscar Clones y Similares', '🔍 Find Clones & Similar Items'],
    ['Nombre, ID o URL del accesorio/prenda', 'Accessory/Garment Name, ID, or URL'],
    ['Ej: Valkyrie Helm, Dominus, 1365767...', 'E.g.: Valkyrie Helm, Dominus, 1365767...'],
    ['🧬 Extraer Textura 2D de Roblox', '🧬 Extract 2D Roblox Texture'],
    ['Nombre, Asset ID o URL de la prenda', 'Garment Name, Asset ID, or URL'],
    ['Nombre, ID o enlace de la prenda', 'Garment Name, ID, or URL'],
    ['Ej: 144076358, Tuxedo o enlace de Roblox', 'E.g.: 144076358, Tuxedo, or Roblox URL'],
    ['👕 Probar Plantilla 2D en Maniquí', '👕 Preview 2D Template on Mannequin'],
    ['URL directa de imagen .PNG o ID de Roblox', 'Direct .PNG Image URL or Roblox ID'],
    ['https://...png o Asset ID de Roblox', 'https://...png or Roblox Asset ID'],
    ['📦 Exportar Modelo 3D (.PNG + .ZIP)', '📦 Export 3D Model (.PNG + .ZIP)'],
    ['Usuario de Roblox o ID de Accesorio', 'Roblox Username or Accessory ID'],
    ['Ej: Builderman, @usuario o ID de accesorio', 'E.g.: Builderman, @username, or accessory ID'],
    ['🎨 Emparejar por Prenda o Color #HEX', '🎨 Color-Match by Garment or #HEX'],
    ['Nombre/ID de Prenda o Color #HEX', 'Garment Name/ID or #HEX Color'],
    ['Ej: Valkyrie Helm, 1365767 o #5865F2', 'E.g.: Valkyrie Helm, 1365767, or #5865F2'],
    ['Buscador de Servidores Vacíos', 'Empty Servers Finder'],
    ['Nombre del Juego, PlaceId o enlace', 'Game Name, Place ID, or URL'],
    ['Nombre del Juego, ID del lugar o enlace', 'Game Name, Place ID, or URL'],
    ['Ej: Blox Fruits, Brookhaven, 2753915549', 'E.g.: Blox Fruits, Brookhaven, 2753915549'],
    ['Cambiar Juego a Analizar', 'Switch Game to Analyze'],
    ['Ej: Blox Fruits, Adopt Me, Doors, 2753915549', 'E.g.: Blox Fruits, Adopt Me, Doors, 2753915549'],
    ['Buscar Pase en este Juego', 'Search Gamepass in This Game'],
    ['Nombre (Español/Inglés), Precio en R$ o ID', 'Name, Price in R$, or ID'],
    ['Ej: VIP, 2x, Dinero, Barco, 399, 450...', 'E.g.: VIP, 2x, Money, Fast Boats, 399, 450...'],
    ['Registrar Código Activo en la Bóveda', 'Submit Active Code to Vault'],
    ['Nombre del Juego o PlaceId', 'Game Name or Place ID'],
    ['Nombre del Juego o ID del lugar', 'Game Name or Place ID'],
    ['Ej: Blox Fruits, 2753915549', 'E.g.: Blox Fruits, 2753915549'],
    ['Código Promocional Exacto', 'Exact Promo Code'],
    ['Ej: KITT_RESET', 'E.g.: KITT_RESET'],
    ['Recompensa del Código', 'Code Reward'],
    ['Ej: Reinicio de estadísticas gratis', 'E.g.: Free Stat Reset'],
    ['Suscribir Juego a Alertas de Parches', 'Subscribe Game to Patch Alerts'],
    ['Ej: Blox Fruits, Dress To Impress, 2753915549', 'E.g.: Blox Fruits, Dress To Impress, 2753915549'],
    ['Escáner de Sub-Lugares del Universo', 'Universe Sub-Places Scanner'],
    ['Nombre del Juego, PlaceId o UniverseId', 'Game Name, Place ID, or Universe ID'],
    ['Nombre del Juego, ID del lugar o universo', 'Game Name, Place ID, or Universe ID'],
    ['Ej: Blox Fruits, Doors, 2753915549', 'E.g.: Blox Fruits, Doors, 2753915549'],

    // Categorías cortas y etiquetas de 2.5 Color-Match y 1.3 Pisos
    ['Sombrero', 'Hat'],
    ['Pelo', 'Hair'],
    ['Cara', 'Face'],
    ['Cuello', 'Neck'],
    ['Hombros', 'Shoulders'],
    ['Frente', 'Front'],
    ['Pecho', 'Front'],
    ['Espalda', 'Back'],
    ['Cintura', 'Waist'],
    ['Gear', 'Gear'],
    ['Equipamiento', 'Gear'],
    ['Camisas', 'Shirts'],
    ['Pantalón', 'Pants'],
    ['Abrigos 3D', '3D Jackets'],
    ['T-Shirts', 'T-Shirts'],
    ['Camisetas', 'T-Shirts'],
    ['Limiteds', 'Limiteds'],
    ['Todos los Cosméticos', 'All Cosmetics'],
    ['Sombreros y Cabeza', 'Hats & Head'],
    ['Pelo y Peinados', 'Hair & Hairstyles'],
    ['Cara, Lentes y Visores', 'Face, Glasses & Visors'],
    ['Cuello, Collares y Bufandas', 'Neck, Collars & Scarves'],
    ['Hombros y Mascotas', 'Shoulders & Pets'],
    ['Frontal, Pecho y Chalecos', 'Front, Chest & Vests'],
    ['Espalda, Alas y Mochilas', 'Back, Wings & Backpacks'],
    ['Cintura, Cinturones y Colas', 'Waist, Belts & Tails'],
    ['Gear, Espadas y Mano', 'Gear, Swords & Handhelds'],
    ['Equipamiento, Espadas y Mano', 'Gear, Swords & Handhelds'],
    ['Camisas Clásicas (2D)', 'Classic Shirts (2D)'],
    ['Pantalones Clásicos (2D)', 'Classic Pants (2D)'],
    ['Chaquetas y Abrigos (3D)', 'Jackets & Coats (3D)'],
    ['T-Shirts y Estampados (2D)', 'T-Shirts & Decals (2D)'],
    ['Camisetas y Estampados (2D)', 'T-Shirts & Decals (2D)'],
    ['Limiteds y Coleccionables', 'Limiteds & Collectibles']
]);

// ==========================================
// FRASES Y BLOQUES ESPAÑOL -> INGLÉS
// ==========================================
const PHRASE_REPLACEMENTS = [
    // Hub Principal (/roblox)
    ['# ⚡ Roblox Toolkit — Kortex', '# ⚡ Roblox Toolkit — Kortex'],
    ['# ⚡ Herramientas de Roblox — Kortex', '# ⚡ Roblox Toolkit — Kortex'],
    ['# ⚡ Centro de Herramientas Roblox — Kortex', '# ⚡ Roblox Toolkit — Kortex'],
    ['💰 Categoría 1: Economía y Precios', '💰 Category 1: Economy & Pricing'],
    ['💰 Categoría 1: Economía, Mercado y Precios', '💰 Category 1: Economy & Pricing'],
    ['Seguimiento de precios, calculadoras, pisos de mercado, Robux pendientes y grupos.', 'Price tracking, calculators, market floors, pending Robux, and groups.'],
    ['Monitoreo inteligente de precios, pisos dinámicos UGC, Robux pendientes y auditoría de grupos.', 'Smart price tracking, dynamic UGC price floors, pending Robux schedule, and group auditing.'],
    ['### 🎯 1.1 Seguimiento de Precios y Mi Lista (máx. 5)', '### 🎯 1.1 Price Tracker & Watchlist'],
    ['### 🎯 1.1 Seguimiento de Precios y Mi Lista', '### 🎯 1.1 Price Tracker & Watchlist'],
    ['### 🎯 1.1 Price Sniper y Mi Lista (máx. 5)', '### 🎯 1.1 Price Tracker & Watchlist'],
    ['Monitoreá ítems del catálogo, pases y plugins con gráficas y alertas.', 'Track catalog items, passes, and plugins with charts and alerts.'],
    ['Monitoreá Catálogo, Limiteds, Pases de Juego y Plugins con gráficas históricas y alertas en vivo.', 'Monitor Catalog items, Limiteds, Gamepasses, and Plugins with historical charts and live alerts.'],
    ['Monitoreá Catálogo, Limiteds, Gamepasses y Plugins con gráficas históricas y alertas en vivo.', 'Monitor Catalog items, Limiteds, Gamepasses, and Plugins with historical charts and live alerts.'],
    ['### 🧮 1.2 Calculadora de Economía', '### 🧮 1.2 Economy Calculator'],
    ['### 🧮 1.2 Calculadoras Financieras (+40% Cashback)', '### 🧮 1.2 Economy Calculator'],
    ['Calculá descuentos de grupo, Roblox Plus y precios regionales.', 'Calculate group discounts, Roblox Plus, and regional pricing.'],
    ['Calculá descuentos de Cashback de grupo (40%), Roblox Plus (10%/20%) y precios regionales por país.', 'Calculate group Cashback discounts (40%), Roblox Plus (10%/20%), and regional pricing by country.'],
    ['# 📉 1.3 Pisos de Precio del Catálogo', '# 📉 1.3 Catalog Price Floors'],
    ['### 📉 1.3 Pisos de Precio del Catálogo', '### 📉 1.3 Catalog Price Floors'],
    ['### 📉 1.3 Monitor de Pisos de Precio Dinámicos (UGC)', '### 📉 1.3 Catalog Price Floors'],
    ['Precios mínimos actuales por categoría de accesorios comparados con la semana anterior.', 'Current minimum prices across accessory categories compared to last week.'],
    ['Pisos de Precio del Catálogo', 'Catalog Price Floors'],
    ['Detectá en qué categorías de accesorios acaba de bajar el precio mínimo oficial de Roblox.', 'Detect which accessory categories just had an official Roblox minimum price drop.'],
    ['# ⏳ 1.4 Agenda de Robux Pendientes', '# ⏳ 1.4 Pending Robux Schedule'],
    ['### ⏳ 1.4 Agenda de Robux Pendientes', '### ⏳ 1.4 Pending Robux Schedule'],
    ['### ⏳ 1.4 Agenda y Alerta de Robux Pendientes', '### ⏳ 1.4 Pending Robux Schedule'],
    ['Registrá tus ventas o pases para recibir un aviso cuando tus Robux se liberen.', 'Log your sales or passes to get notified when your Robux are released.'],
    ['Agenda de Robux Pendientes', 'Pending Robux Schedule'],
    ['### 📭 No tenés Robux pendientes registrados', '### 📭 No pending Robux scheduled'],
    ['> Presioná **➕ Registrar Operación** abajo para agendar tus Robux.', '> Click **➕ Add Pending Robux** below to schedule your Robux.'],
    ['Registrá tus ventas o pases y recibí una alerta exacta cuando Roblox libere tus Robux.', 'Log your sales or gamepasses and receive an exact alert when Roblox releases your Robux.'],
    ['Registrá tus ventas o cashbacks y recibí una alerta exacta cuando Roblox libere tus Robux.', 'Log your sales or gamepasses and receive an exact alert when Roblox releases your Robux.'],
    ['# 🏛️ 1.5 Auditor y Catálogo de Grupos', '# 🏛️ 1.5 Group Auditor & Catalog'],
    ['### 🏛️ 1.5 Auditor y Catálogo de Grupos', '### 🏛️ 1.5 Group Auditor & Catalog'],
    ['Explorá cualquier grupo de Roblox por nombre, ID o enlace y consultá las prendas de su tienda.', 'Explore any Roblox group by name, ID, or URL and browse its clothing store.'],
    ['Auditor y Catálogo de Grupos', 'Group Auditor & Catalog'],
    ['Inspeccioná cualquier grupo de Roblox, ordená su catálogo de ropa y consultá cada prenda en detalle.', 'Inspect any Roblox group, sort its clothing catalog, and view or try on each garment in detail.'],

    ['👕 Categoría 2: Avatares y Estudio 3D/2D', '👕 Category 2: Avatars & 3D/2D Studio'],
    ['👕 Categoría 2: Taller de Avatares y Estudio 3D/2D', '👕 Category 2: Avatars & 3D/2D Studio'],
    ['Probador de ropa, buscador de similares, plantillas 2D, modelos 3D y combinación por color.', 'Outfit try-on, similar items finder, 2D templates, 3D models, and color matching.'],
    ['Prueba de conjuntos en vivo, ítems similares y alternativos, descarga de plantillas de ropa, modelos 3D y combinación por color.', 'Live outfit try-on, similar & cheaper items finder, 2D clothing templates, 3D model export, and color matching.'],
    ['# 🧪 2.1 Probador de Ropa en Vivo', '# 🧪 2.1 Live Outfit Sandbox'],
    ['### 🧪 2.1 Probador de Ropa en Vivo', '### 🧪 2.1 Live Outfit Sandbox'],
    ['### 🧪 2.1 Probador de Combinaciones en Vivo (Outfit Sandbox)', '### 🧪 2.1 Live Outfit Sandbox'],
    ['### 🧪 2.1 Probador de Combinaciones en Vivo', '### 🧪 2.1 Live Outfit Sandbox'],
    ['Probador de Ropa en Vivo', 'Live Outfit Sandbox'],
    ['Probate hasta 5 objetos del catálogo sobre tu personaje o cotizá tu ropa equipada actual con desglose de precios.', 'Try up to 5 catalog items on your character or price your currently worn outfit with full breakdown.'],
    ['# 🔍 2.2 Buscador de Clones y Similares', '# 🔍 2.2 Clones & Similar Items Finder'],
    ['### 🔍 2.2 Buscador de Clones y Similares', '### 🔍 2.2 Clones & Similar Items Finder'],
    ['### 🔍 2.2 Buscador de Clones y Similares (Roblox + UGC)', '### 🔍 2.2 Clones & Similar Items Finder'],
    ['Encontrá alternativas más baratas y objetos similares en el catálogo a partir de cualquier accesorio o prenda.', 'Find cheaper alternatives and similar catalog items from any accessory or garment.'],
    ['Buscador de Clones y Similares', 'Clones & Similar Items Finder'],
    ['Encontrá tanto ítems oficiales de Roblox parecidos como alternativas UGC económicas con su porcentaje de ahorro.', 'Find both similar official Roblox items and affordable UGC alternatives with their savings percentage.'],
    ['# 🧬 2.3 Extractor de Texturas y Maniquí 2D', '# 🧬 2.3 Texture Extractor & 2D Mannequin'],
    ['### 🧬 2.3 Extractor de Texturas y Maniquí 2D', '### 🧬 2.3 Texture Extractor & 2D Mannequin'],
    ['### 🧬 2.3 Extractor de Texturas + Maniquí 2D', '### 🧬 2.3 Texture Extractor & 2D Mannequin'],
    ['Descargá la plantilla .PNG de cualquier camisa o pantalón de Roblox y probala sobre un maniquí frente y espalda.', 'Download the .PNG template of any Roblox shirt or pants and preview it on a front & back mannequin.'],
    ['Extractor de Texturas y Maniquí 2D', 'Texture Extractor & 2D Mannequin'],
    ['Extractor de Texturas 2D', '2D Texture Extractor'],
    ['# 👕 2.3 Maniquí 2D', '# 👕 2.3 2D Mannequin'],
    ['📐 **Plantilla:**', '📐 **Template:**'],
    ['Maniquí 2D', '2D Mannequin'],
    ['Descargá la plantilla original .PNG de cualquier camisa o pantalón y probala sobre un maniquí frente y espalda.', 'Download the original .PNG template of any shirt or pants and preview it on a front & back mannequin.'],
    ['# 📦 2.4 Exportador de Modelos 3D', '# 📦 2.4 3D Model Exporter'],
    ['### 📦 2.4 Exportador de Modelos 3D', '### 📦 2.4 3D Model Exporter'],
    ['### 📦 2.4 Exportador 3D (Render PNG HD + Archivo .ZIP)', '### 📦 2.4 3D Model Exporter'],
    ['Descargá el render PNG y el archivo .ZIP con el modelo 3D y las texturas de tu avatar o de cualquier accesorio.', 'Download the PNG render and .ZIP file with the 3D model and textures of your avatar or any accessory.'],
    ['Exportador de Modelos 3D', '3D Model Exporter'],
    ['🎯 **Modelo:**', '🎯 **Model:**'],
    ['🗜️ **Paquete .ZIP:**', '🗜️ **.ZIP Package:**'],
    ['Obtené el render PNG de alta resolución y el paquete .ZIP con el modelo 3D y sus texturas listo para usar.', 'Get the high-resolution PNG render and the .ZIP package with the 3D mesh and textures ready to use.'],
    ['# 🎨 2.5 Combinador por Color', '# 🎨 2.5 Color-Match Finder'],
    ['### 🎨 2.5 Combinador por Color', '### 🎨 2.5 Color-Match Finder'],
    ['### 🎨 2.5 Emparejador de Accesorios por Color (Color-Match)', '### 🎨 2.5 Color-Match Finder'],
    ['### 🎨 2.5 Emparejador de Accesorios por Color', '### 🎨 2.5 Color-Match Finder'],
    ['Extraé los colores principales de tu avatar, de una prenda o de un código #HEX y buscá accesorios que combinen.', 'Extract the main colors from your avatar, a garment, or a #HEX code and find matching accessories.'],
    ['Combinador por Color', 'Color-Match Finder'],
    ['Detecta los 3 colores principales de tu prenda o avatar y busca accesorios del catálogo que combinen.', 'Detects the 3 dominant colors of your garment or avatar and finds matching catalog accessories.'],

    ['🎮 Categoría 3: Juegos y Servidores', '🎮 Category 3: Games & Servers'],
    ['🎮 Categoría 3: Utilidades de Juego y Servidores', '🎮 Category 3: Games & Servers'],
    ['Servidores vacíos, pases de juego, códigos promocionales, alertas de parches y mapas.', 'Empty servers, gamepasses, promo codes, patch alerts, and maps.'],
    ['Servidores vacíos con unión rápida, pases de juego, códigos promocionales, avisos de actualizaciones y mapas conectados.', 'Empty servers with quick join, gamepasses, promo codes, update notifications, and connected sub-places.'],
    ['### 👻 3.1 Buscador de Servidores Vacíos', '### 👻 3.1 Empty Servers Finder'],
    ['### 👻 3.1 Buscador de Servidores Vacíos con Unión Directa', '### 👻 3.1 Empty Servers Finder'],
    ['# 👻 3.1 Servidores Vacíos —', '# 👻 3.1 Empty Servers —'],
    ['🌐 **Jugadores activos:**', '🌐 **Active players:**'],
    ['Servidores públicos con menos jugadores listos para unirse:', 'Public servers with the fewest players ready to join:'],
    ['Servidores Vacíos •', 'Empty Servers •'],
    ['Encontrá los servidores públicos con menos jugadores y mejor conexión listos para entrar en un clic.', 'Find public servers with the fewest players and best ping ready to join in one click.'],
    ['### 🎟️ 3.2 Buscador de Pases de Juego', '### 🎟️ 3.2 Gamepass Finder'],
    ['### 🎟️ 3.2 Extractor Completo de Pases de un Juego', '### 🎟️ 3.2 Gamepass Finder'],
    ['# 🎟️ 3.2 Pases del Juego —', '# 🎟️ 3.2 Gamepasses —'],
    ['Consultá, buscá y ordená por precio todos los pases de tienda y paquetes internos de cualquier juego.', 'Browse, search, and sort by price all store gamepasses and bundles of any experience.'],
    ['### 🎁 3.3 Bóveda de Códigos Activos', '### 🎁 3.3 Active Promo Codes Vault'],
    ['### 🎁 3.3 Bóveda de Códigos Activos con Checklist Personal', '### 🎁 3.3 Active Promo Codes Vault'],
    ['Consultá o agregá códigos promocionales y marcá cuáles ya canjeaste para llevar tu progreso.', 'View or add verified promo codes and check off the ones you already redeemed to track progress.'],
    ['# 🔔 3.4 Alertas de Actualizaciones', '# 🔔 3.4 Game Update Alerts'],
    ['### 🔔 3.4 Alertas de Actualizaciones', '### 🔔 3.4 Game Update Alerts'],
    ['### 🔔 3.4 Avisos de Parches y Actualizaciones de Juegos', '### 🔔 3.4 Game Update Alerts'],
    ['Seguí tus juegos favoritos y recibí un aviso cuando se actualicen.', 'Follow your favorite games and get notified when they update.'],
    ['Alertas de Actualizaciones', 'Game Update Alerts'],
    ['Seguí tus juegos favoritos y recibí un aviso apenas los creadores publiquen una nueva actualización.', 'Follow your favorite games and receive an alert as soon as developers publish a new update.'],
    ['# 🗺️ 3.5 Mapas Conectados —', '# 🗺️ 3.5 Connected Maps —'],
    ['### 🗺️ 3.5 Explorador de Mapas Conectados', '### 🗺️ 3.5 Connected Maps Explorer'],
    ['### 🗺️ 3.5 Explorador de Sub-Lugares y Mapas Conectados', '### 🗺️ 3.5 Connected Maps Explorer'],
    ['🗺️ **Mapas encontrados:**', '🗺️ **Maps found:**'],
    ['Mundos secundarios y servidores conectados dentro de este juego:', 'Secondary worlds and connected places inside this game:'],
    ['Mapas Conectados •', 'Connected Maps •'],
    ['Descubrí todos los mapas secundarios, lobbies de intercambio y mundos dentro de cualquier experiencia.', 'Discover all secondary maps, trading lobbies, and worlds connected inside any experience.'],

    ['📂 Seleccioná una categoría...', '📂 Select a category...'],
    ['📂 Cambiá entre las 3 categorías de herramientas...', '📂 Switch between the 3 tool categories...'],
    ['Categoría 1: Economía y Precios', 'Category 1: Economy & Pricing'],
    ['Categoría 1: Economía, Mercado y Precios (5 herramientas)', 'Category 1: Economy, Market & Pricing (5 tools)'],
    ['Price Sniper, Calculadoras, Pisos de Precio, Robux Pendientes y Grupos', 'Price Tracker, Calculators, Price Floors, Pending Robux & Groups'],
    ['Seguimiento de Precios, Calculadoras, Pisos de Precio, Robux Pendientes y Grupos', 'Price Tracker, Calculators, Price Floors, Pending Robux & Groups'],
    ['Categoría 2: Avatares y Estudio 3D/2D', 'Category 2: Avatars & 3D/2D Studio'],
    ['Categoría 2: Taller de Avatares y Estudio 3D/2D (5 herramientas)', 'Category 2: Avatar Workshop & 3D/2D Studio (5 tools)'],
    ['Probador de Ropa, Similares, Plantillas 2D, Exportador 3D y Color-Match', 'Outfit Sandbox, Similar Items, 2D Templates, 3D Exporter & Color-Match'],
    ['Probador de Ropa, Similares, Plantillas 2D, Exportador 3D y Combinación por Color', 'Outfit Sandbox, Similar Items, 2D Templates, 3D Exporter & Color-Match'],
    ['Categoría 3: Juegos y Servidores', 'Category 3: Games & Servers'],
    ['Categoría 3: Utilidades de Juego y Servidores (5 herramientas)', 'Category 3: Game & Server Utilities (5 tools)'],
    ['Servidores Vacíos, Pases de Juego, Códigos, Actualizaciones y Mapas', 'Empty Servers, Gamepasses, Promo Codes, Update Alerts & Maps'],
    ['Configuración e Idioma: /config', 'Settings & Language: /config'],
    ['Configuración • /config', 'Settings • /config'],
    ['Administración • /config', 'Administration • /config'],
    ['Cuenta de Roblox', 'Roblox Account'],
    ['También disponible en /config', 'Also available in /config'],
    ['-# 🎮 *Sin cuenta de Roblox vinculada*', '-# 🎮 *No linked Roblox account*'],
    ['**Cuenta:**', '**Account:**'],
    ['**Cuenta de Roblox:**', '**Roblox Account:**'],

    // 1.1 Seguimiento de Precios y Mi Lista (navigation.js, manageActions.js, chartView.js, sniperAdd.js, targetSubmit.js)
    ['## 🎯 Seguimiento de Precios', '## 🎯 Price Tracker & Alerts'],
    ['## 🎯 Price Sniper', '## 🎯 Price Tracker & Alerts'],
    ['Añadí un objeto nuevo en 3 pasos:', 'Add a new item in 3 steps:'],
    ['> **1.** Elegí la categoría en el menú desplegable.', '> **1.** Choose the item category in the dropdown menu.'],
    ['> **2.** Pegá el **ID** o el **enlace** de Roblox.', '> **2.** Paste the Roblox **ID** or **URL**.'],
    ['> **3.** Definí una meta de precio *(opcional)* y dónde recibir las alertas.', '> **3.** Set a target price *(optional)* and where to receive alerts.'],
    ['➕ Elegí una categoría para añadir un objeto...', '➕ Choose a category to add an item...'],
    ['Catálogo / UGC / Limiteds', 'Catalog / UGC / Limiteds'],
    ['Ropa, accesorios y coleccionables (Robux)', 'Clothing, accessories, and collectibles (Robux)'],
    ['Pase de Juego (Gamepass)', 'Gamepass'],
    ['Pases de experiencias (Robux)', 'Experience passes (Robux)'],
    ['Plugin de Studio', 'Studio Plugin'],
    ['Herramientas del Creator Store (USD)', 'Creator Store tools (USD)'],
    ['Herramientas de la tienda de creadores (USD)', 'Creator Store tools (USD)'],
    ['Acceso Pago (Paid Access)', 'Paid Access Experience'],
    ['Acceso Pago a Experiencia', 'Paid Access Experience'],
    ['Experiencias con entrada paga', 'Games with paid entry (Robux)'],
    ['### 📋 Mi Lista de Monitoreo', '### 📋 My Watchlist'],
    ['Revisá tus objetos en seguimiento (máx. 5), consultá sus **gráficas de precios** o configurá tus alertas.', 'Review your tracked items (max 5), check their **price charts**, or configure your alerts.'],
    ['## 📋 Tu Lista de Monitoreo', '## 📋 Your Watchlist'],
    ['Todavía no estás siguiendo ningún objeto.', 'You are not tracking any items yet.'],
    ['> Volvé atrás al **Price Sniper** y elegí una categoría arriba para añadir tu primer objeto. 🎯', '> Go back to **Price Tracker** and choose a category above to add your first item. 🎯'],
    ['> Volvé atrás a **Seguimiento de Precios** y elegí una categoría arriba para añadir tu primer objeto. 🎯', '> Go back to **Price Tracker** and choose a category above to add your first item. 🎯'],
    ['# 📋 Tu Lista de Monitoreo', '# 📋 Your Watchlist'],
    ['`Sin meta (avisa todo cambio)`', '`No target (alerts on any change)`'],
    ['`Sin meta (notifica todo cambio)`', '`No target (alerts on any change)`'],
    ['`Sin revendedores activos`', '`No active resellers`'],
    ['`Sin meta`', '`No target`'],
    ['⏸️ En pausa', '⏸️ Paused'],
    ['🟢 Activo', '🟢 Active'],
    ['📈 Elegí un objeto para ver su gráfica o configurar alertas...', '📈 Select an item to view its price chart or configure alerts...'],
    ['📈 Elegí otro objeto de tu lista...', '📈 Select another item from your watchlist...'],
    ['### 📊 Vista actual: Gráfica de Precios', '### 📊 Current view: Price History Chart'],
    ['### ⚙️ Vista actual: Configuración de Alertas', '### ⚙️ Current view: Alert Configuration'],
    ['Usá los botones de abajo para cambiar el período o pasar a **Configurar**.', 'Use the buttons below to switch the time range or open **Configure**.'],
    ['Ajustá el estado del monitoreo, tu meta de precio o eliminá el objeto de tu lista.', 'Adjust tracking status, set your target price, or remove the item from your watchlist.'],
    ['# ⚙️ Configuración —', '# ⚙️ Settings —'],
    ['🏷️ **Precio Actual:**', '🏷️ **Current Price:**'],
    ['🏷️ **Precio actual:**', '🏷️ **Current price:**'],
    ['🏷️ **Precio inicial:**', '🏷️ **Initial price:**'],
    ['🎯 **Meta objetivo:**', '🎯 **Target price:**'],
    ['🎯 **Meta de alerta:**', '🎯 **Target alert:**'],
    ['🎯 **Meta:**', '🎯 **Target:**'],
    ['🔔 **Destino de alerta:**', '🔔 **Alert destination:**'],
    ['🔔 **Destino actual:**', '🔔 **Current destination:**'],
    ['💬 Privado (DM)', '💬 Direct Message (DM)'],
    ['📡 **Estado:**', '📡 **Status:**'],
    ['⏸️ **En pausa**', '⏸️ **Paused**'],
    ['🟢 **Monitoreando**', '🟢 **Monitoring**'],
    ['🔔 Cambiar destino de alerta...', '🔔 Change alert destination...'],
    ['Mensaje Directo (DM)', 'Direct Message (DM)'],
    ['Recibir alertas por mensaje privado', 'Receive alerts via Direct Message'],
    ['Canal de Servidor', 'Server Channel'],
    ['Elegir un canal de este servidor o por ID', 'Select a channel in this server or by ID'],
    ['Enviar alertas a una URL de Webhook', 'Send alerts to a Webhook URL'],
    ['Configuración del objeto', 'Item settings'],
    ['Objeto eliminado del monitoreo', 'Item removed from watchlist'],
    ['El objeto fue quitado de tu lista de monitoreo correctamente.', 'The item was removed from your watchlist.'],
    ['🎯 **Meta eliminada:** Ahora recibirás alertas ante cualquier cambio de precio.', '🎯 **Target cleared:** You will now receive alerts on any price change.'],
    ['-# 🎯 Meta actualizada:', '-# 🎯 Target updated:'],
    ['-# 🗑️ Meta eliminada — vas a recibir alertas ante cualquier cambio de precio.', '-# 🗑️ Target cleared — you will receive alerts on any price change.'],
    ['### 🗑️ Objeto eliminado', '### 🗑️ Item Removed'],
    ['fue quitado de tu lista de monitoreo.', 'was removed from your watchlist.'],
    ['❌ No se encontró el objeto en tu lista de monitoreo.', '❌ Item not found in your watchlist.'],
    ['❌ No se encontró el objeto en tu lista.', '❌ Item not found in your watchlist.'],
    ['❌ Este objeto ya no está en tu lista.', '❌ This item is no longer in your watchlist.'],
    ['❌ Este objeto ya no existe en tu lista de monitoreo.', '❌ This item no longer exists in your watchlist.'],
    ['❌ No se pudo actualizar el objeto.', '❌ Could not update the item.'],
    ['❌ No se pudo eliminar el objeto.', '❌ Could not remove the item.'],
    ['❌ Ese objeto ya no está en tu lista.', '❌ That item is no longer in your watchlist.'],
    ['❌ No se pudo quitar la meta.', '❌ Could not clear the target price.'],
    ['Elegí si querés fijar un **precio objetivo** o monitorear **cualquier cambio de precio**:', 'Choose whether to set a **target price** or track **any price change**:'],
    ['Verificación completada', 'Verification complete'],
    ['# 🎯 Meta Actualizada', '# 🎯 Target Updated'],
    ['# 🎯 ¡Monitoreo Activado!', '# 🎯 Tracking Activated!'],
    ['# ✅ ¡Monitoreo Activado!', '# ✅ Tracking Activated!'],
    ['-# 💡 Podés cambiar dónde recibir las alertas en el menú de abajo.', '-# 💡 You can change where to receive alerts in the menu below.'],
    ['Configuración de alertas', 'Alert settings'],
    ['❌ **ID o Enlace inválido:** Ingresá un ID numérico válido o un enlace oficial de Roblox.', '❌ **Invalid ID or URL:** Please enter a valid numeric ID or official Roblox link.'],
    ['❌ **Límite alcanzado:** Ya tenés **5/5** objetos en tu lista de monitoreo. Eliminá uno desde **Mi Lista** para añadir otro.', '❌ **Limit reached:** You already have **5/5** items in your watchlist. Remove one from **My Watchlist** to add another.'],
    ['❌ **No se encontró el objeto:** Verificá que el ID exista y corresponda a la categoría elegida.', '❌ **Item not found:** Verify that the ID exists and matches the selected category.'],
    ['❌ **Precio inválido:** Ingresá un número válido (podés escribir `0` para quitar la meta).', '❌ **Invalid price:** Enter a valid number (you can enter `0` to clear the target).'],
    ['❌ **ID inválido:** Ingresá un ID de canal numérico válido de Discord (17 a 20 dígitos).', '❌ **Invalid ID:** Please enter a valid numeric Discord channel ID (17 to 20 digits).'],
    ['❌ **Sin acceso al canal:** El bot no encuentra ese canal o no tiene permisos para ver y enviar mensajes allí.', '❌ **No channel access:** The bot cannot find that channel or lacks permission to view and send messages there.'],
    ['❌ **URL inválida:** Ingresá una URL de Webhook oficial de Discord (`https://discord.com/api/webhooks/...`).', '❌ **Invalid URL:** Enter an official Discord Webhook URL (`https://discord.com/api/webhooks/...`).'],
    ['✅ **Destino actualizado:** Las alertas de este objeto ahora se enviarán por **Mensaje Directo (DM)**.', '✅ **Destination updated:** Alerts for this item will now be sent via **Direct Message (DM)**.'],
    ['✅ **Webhook vinculado:** Las alertas de este objeto ahora se enviarán mediante tu **Webhook**.', '✅ **Webhook linked:** Alerts for this item will now be sent via your **Webhook**.'],
    ['### 📢 Seleccionar Canal de Alerta', '### 📢 Select Alert Channel'],
    ['Elegí un canal de este servidor en el menú desplegable o ingresá el ID de cualquier canal manualmente:', 'Select a channel from this server in the dropdown menu or enter any channel ID manually:'],
    ['📢 Elegí un canal de este servidor...', '📢 Select a channel in this server...'],
    ['Selección de canal', 'Channel selection'],
    ['✅ Objeto reanudado en el monitoreo.', '✅ Item tracking resumed.'],
    ['⏸️ Objeto pausado.', '⏸️ Item tracking paused.'],
    ['❌ No se encontró el objeto para pausar/reanudar.', '❌ Item not found to pause/resume.'],
    ['❌ No se pudo actualizar el estado del objeto.', '❌ Could not update item status.'],

    // Modal y Flujo de Añadir Objeto a Mi Lista (sniperTypeSelect.js, sniperAdd.js, alertDestinationSelect.js, targetModalBtn.js, targetSubmit.js)
    ['ID o enlace de Roblox', 'Roblox ID or URL'],
    ['Pegá el ID numérico o la URL completa del objeto...', 'Paste the numeric ID or full URL of the item...'],
    ['Meta de precio (opcional, solo números)', 'Target price (optional, numbers only)'],
    ['Dejalo vacío para avisar ante cualquier cambio', 'Leave blank to alert on any price change'],
    ['🔍 No encontramos un objeto válido o público con ese ID en la categoría', '🔍 We could not find a valid public item with that ID in category'],
    ['Reintentar con otro ID', 'Retry with another ID'],
    ['Elegí dónde querés recibir las notificaciones de este objeto:', 'Choose where you want to receive price notifications for this item:'],
    ['📍 Elegí dónde recibir las alertas...', '📍 Choose where to receive alerts...'],
    ['📩 Mensaje Directo (MD)', '📩 Direct Message (DM)'],
    ['El bot te avisa por privado', 'The bot notifies you via DM'],
    ['📢 Canal de este servidor', '📢 Channel in this server'],
    ['Elegí un canal de texto del servidor', 'Select a text channel in this server'],
    ['📢 Elegí el canal donde enviar las alertas...', '📢 Select the channel where alerts will be sent...'],
    ['Elegí el canal de texto donde querés recibir las alertas de este objeto:', 'Select the text channel where you want to receive alerts for this item:'],
    ['✅ **¡Listo!** Ahora estás siguiendo', '✅ **Done!** You are now tracking'],
    ['Las alertas llegarán a', 'Alerts will be sent to'],
    ['tu **Mensaje Directo**', 'your **Direct Messages (DM)**'],
    ['⚠️ La sesión expiró. Volvé a añadir el objeto desde **Seguimiento de Precios**.', '⚠️ Session expired. Please add the item again from **Price Tracker**.'],
    ['⚠️ La sesión expiró. Volvé a añadir el objeto desde **Price Sniper**.', '⚠️ Session expired. Please add the item again from **Price Tracker**.'],
    ['⚠️ Alcanzaste el límite de', '⚠️ You reached the limit of'],
    ['objetos en tu lista. Eliminá alguno desde **Mi Lista** para añadir otro.', 'items in your watchlist. Remove one from **My Watchlist** to add another.'],
    ['⚠️ Ya estás siguiendo este objeto en tu lista.', '⚠️ You are already tracking this item in your watchlist.'],
    ['🎯 Cambiar Meta de Alerta', '🎯 Set Target Price Alert'],
    ['Nuevo precio meta (solo números)', 'New target price (numbers only)'],
    ['Ej: 500 (recibirás alerta cuando baje a este valor)', 'E.g., 500 (you will be alerted when it drops to this price)'],
    ['⚠️ Ingresá un número válido mayor o igual a 0.', '⚠️ Please enter a valid number greater than or equal to 0.'],

    // 1.2 Calculadora de Economía (calcHelpers.js, calcModalBtn.js, calcSelects.js, calcSubmit.js)
    ['## 🧮 Calculadora de Economía', '## 🧮 Economy Calculator'],
    ['Elegí los beneficios en el menú y presioná **Calcular**.', 'Select the benefits in the menu below and click **Calculate**.'],
    ['### ⚙️ Configuración actual', '### ⚙️ Current Configuration'],
    ['Cashback de Grupo (40%)', 'Group Cashback (40%)'],
    ['Comprás desde tu grupo y recuperás el 40%', 'Buy through your group and recover 40%'],
    ['Roblox Plus (10%)', 'Roblox Plus (10%)'],
    ['Descuento de suscriptor', 'Subscriber discount'],
    ['Roblox Plus 2+ meses (20%)', 'Roblox Plus 2+ months (20%)'],
    ['Reemplaza al 10% si elegís ambos', 'Replaces the 10% discount if both are selected'],
    ['Precio Regional', 'Regional Pricing'],
    ['Te pregunto tu región después de ingresar el precio', 'Asks for your region after entering the price'],
    ['✨ Elegí los beneficios a aplicar...', '✨ Choose the benefits to apply...'],
    ['## 🌎 Elegí tu región', '## 🌎 Choose Your Region'],
    ['🏷️ Precio base:', '🏷️ Base price:'],
    ['🌎 Elegí la región o país...', '🌎 Select region or country...'],
    ['❌ **Precio inválido:** Ingresá un número entero mayor a 0 en Robux.', '❌ **Invalid price:** Please enter a whole number greater than 0 in Robux.'],
    ['## 📊 Resultado del Cálculo', '## 📊 Calculation Result'],
    ['🏷️ **Precio base:**', '🏷️ **Base price:**'],
    ['🌎 **Precio regional:**', '🌎 **Regional price:**'],
    ['👥 **Cashback de grupo (40%):**', '👥 **Group Cashback (40%):**'],
    ['⭐ **Roblox Plus (10%):**', '⭐ **Roblox Plus (10%):**'],
    ['🌟 **Roblox Plus 2+ meses (20%):**', '🌟 **Roblox Plus 2+ months (20%):**'],
    ['### ✨ Precio final efectivo:', '### ✨ Final effective price:'],
    ['Valores estimados • Roblox redondea hacia abajo', 'Estimated values • Roblox rounds down'],
    ['🧮 Ingresar Precio en Robux', '🧮 Enter Robux Price'],
    ['Precio del objeto en Robux (R$)', 'Item price in Robux (R$)'],
    ['Ej: 1000', 'E.g., 1000'],
    ['Tier 100% (Global / EE.UU. / España / Europa)', 'Tier 100% (Global / US / Spain / Europe)'],
    ['Tier 80% (México / Chile / Uruguay / Rusia)', 'Tier 80% (Mexico / Chile / Uruguay / Russia)'],
    ['Tier 60% (Argentina / Brasil / Colombia / Perú)', 'Tier 60% (Argentina / Brazil / Colombia / Peru)'],
    ['Tier 40% (Venezuela / Bolivia / Paraguay / Filipinas)', 'Tier 40% (Venezuela / Bolivia / Paraguay / Philippines)'],
    ['Sin descuento regional', 'No regional discount'],
    ['20% de descuento regional', '20% regional discount'],
    ['40% de descuento regional', '40% regional discount'],
    ['60% de descuento regional', '60% regional discount'],

    // 1.3 Monitor de Pisos de Precio Dinámicos (economyModule.js)
    ['# 📉 1.3 Monitor de Pisos de Precio Dinámicos (UGC)', '# 📉 1.3 Dynamic UGC Price Floors Monitor'],
    ['Comparativa en tiempo real entre el **piso mínimo oficial actual** de Roblox y los valores de referencia previos por categoría.', 'Real-time comparison between the **current official Roblox minimum price floor** and previous reference values by category.'],
    ['### 📋 Desglose por Categoría de Accesorio', '### 📋 Breakdown by Accessory Category'],
    ['### 🎩 Cabeza, Pelo, Cara y Cuello', '### 🎩 Head, Hair, Face & Neck'],
    ['### 🎒 Hombros, Frente, Espalda y Cintura', '### 🎒 Shoulders, Front, Back & Waist'],
    ['Mínimo actual:', 'Current minimum:'],
    ['🟢 **Está barato hoy**', '🟢 **Low price today**'],
    ['🟢 **Precio estable**', '🟢 **Stable price**'],
    ['⏳ **Conviene esperar a que baje**', '⏳ **Wait for a price drop**'],
    ['Sombreros (Hats)', 'Hats'],
    ['Cabello (Hair)', 'Hair'],
    ['Rostro (Face)', 'Face Accessories'],
    ['Cuello (Neck)', 'Neck Accessories'],
    ['Hombros (Shoulder)', 'Shoulder Accessories'],
    ['Frente (Front)', 'Front Accessories'],
    ['Espalda (Back)', 'Back Accessories'],
    ['Cintura (Waist)', 'Waist Accessories'],
    ['Camisas 3D (Shirts)', '3D Shirts'],
    ['Pantalones 3D (Pants)', '3D Pants'],
    ['Estable', 'Stable'],
    ['Piso actual:', 'Current floor:'],
    ['Ant:', 'Prev:'],
    ['Muestra catálogo:', 'Catalog sample:'],
    ['Categoría 1: Economía y Mercado • Datos sincronizados con catalog.roblox.com', 'Category 1: Economy & Market • Data synced with catalog.roblox.com'],

    // 1.4 Agenda y Alerta de Robux Pendientes (economyModule.js)
    ['# ⏳ 1.4 Agenda y Alerta de Robux Pendientes', '# ⏳ 1.4 Pending Robux Schedule & Alerts'],
    ['Registrá tus ventas de ropa, pases o comisiones de grupo y recibí una notificación automática en Discord cuando Roblox libere tus Robux.', 'Log your clothing sales, gamepasses, or group payouts and receive an automatic Discord alert when Roblox releases your Robux.'],
    ['No tenés cobros de Robux pendientes registrados actualmente.', 'You have no pending Robux payouts scheduled right now.'],
    ['Tocá **Registrar Robux Pendientes** abajo para iniciar un temporizador con alerta.', 'Click **Add Pending Robux** below to start a release countdown timer with alert.'],
    ['👥 Fondos de Grupo', '👥 Group Funds'],
    ['🎟️ Venta de Gamepass', '🎟️ Gamepass Sale'],
    ['👕 Venta de Ropa 2D', '👕 2D Clothing Sale'],
    ['💎 Venta de Limited UGC', '💎 Limited UGC Sale'],
    ['🟢 **En ventana de acreditación**', '🟢 **In release window**'],
    ['⏳ **Se libera:**', '⏳ **Releases:**'],
    ['Liberación:', 'Release:'],
    ['Alerta enviada', 'Alert sent'],
    ['En retención', 'In escrow'],
    ['Categoría 1: Economía y Mercado • Verificación automática cada 5 minutos', 'Category 1: Economy & Market • Automatic check every 5 minutes'],
    ['⏳ Registrar Robux Pendientes', '⏳ Add Pending Robux'],
    ['Cantidad de Robux (R$) en retención', 'Amount of Pending Robux (R$)'],
    ['Días estimados de retención (1 a 30)', 'Estimated escrow days (1 to 30)'],
    ['Origen (Ej: Venta de camisa, Gamepass, Grupo)', 'Source (E.g., Shirt sale, Gamepass, Group)'],
    ['Venta de catálogo / Pase', 'Catalog sale / Gamepass'],
    ['❌ Ingresá una cantidad válida de Robux mayor a 0.', '❌ Please enter a valid Robux amount greater than 0.'],
    ['🗑️ Agenda de Robux pendientes vaciada.', '🗑️ Pending Robux schedule cleared.'],

    // 1.5 Auditor y Catálogo de Grupos (economyModule.js)
    ['👑 **Dueño:**', '👑 **Owner:**'],
    ['👥 **Miembros:**', '👥 **Members:**'],
    ['👕 **Artículos:**', '👕 **Items:**'],
    ['> 📭 Este grupo no tiene prendas públicas en venta.', '> 📭 This group has no public garments on sale.'],
    ['### 🛍️ Catálogo (Más Vendidas)', '### 🛍️ Catalog (Best Selling)'],
    ['### 🛍️ Catálogo (Recién Actualizadas)', '### 🛍️ Catalog (Recently Updated)'],
    ['> 👕 **Ficha de Prenda Inspeccionada:**', '> 👕 **Inspected Garment Details:**'],
    ['🏷️ **Precio en Tienda:**', '🏷️ **Store Price:**'],
    ['⭐ **Favoritos:**', '⭐ **Favorites:**'],
    ['👕 Seleccioná una prenda para ver sus detalles...', '👕 Select a garment to inspect its details...'],
    ['Elegí uno de los grupos verificados del menú, presioná **Buscar / Auditar Grupo** para escribir cualquier **nombre o ID**, o seleccioná una prenda abajo para inspeccionarla.', 'Select a verified group from the menu, click **Search / Audit Group** to enter any **name or ID**, or pick a garment below to inspect it.'],
    ['Propietario:', 'Owner:'],
    ['Miembros:', 'Members:'],
    ['Prendas analizadas:', 'Analyzed garments:'],
    ['Valor suma del lote:', 'Total batch value:'],
    ['Precio promedio:', 'Average price:'],
    ['Prenda más cara:', 'Most expensive item:'],
    ['### 🏆 Top Prendas del Catálogo del Grupo', '### 🏆 Top Garments in Group Catalog'],
    ['Este grupo no tiene prendas públicas en venta o el catálogo tardó en responder.', 'This group has no public garments on sale or the catalog timed out.'],
    ['🏛️ Cambiar rápido a otro Grupo Popular...', '🏛️ Quick-switch to another Popular Group...'],
    ['👕 Inspeccionar una prenda del grupo en detalle...', '👕 Inspect a group garment in detail...'],
    ['### 👕 Prenda Seleccionada del Grupo:', '### 👕 Selected Group Garment:'],
    ['Podés abrir esta prenda directamente en el **Probador de Ropa (2.1)** para ver cómo le queda a tu personaje.', 'You can open this garment directly in the **Outfit Sandbox (2.1)** to see how it looks on your character.'],
    ['Categoría 1: Economía y Mercado • Auditor de Grupos en Vivo', 'Category 1: Economy & Market • Live Group Auditor'],
    ['🏛️ Buscar o Auditar Grupo de Roblox', '🏛️ Search or Audit Roblox Group'],
    ['Nombre del Grupo, ID o URL de Roblox', 'Roblox Group Name, ID, or URL'],
    ['Ej: Paradoxum Games, 3297367 o link del grupo', 'E.g., Paradoxum Games, 3297367, or group URL'],
    ['❌ No se encontró ningún grupo en Roblox para', '❌ No Roblox group found for'],

    // Categoría 2: Taller de Avatares y Estudio 3D/2D (avatarModule.js)
    ['# 🧪 2.1 Probador de Combinaciones en Vivo (Outfit Sandbox)', '# 🧪 2.1 Live Outfit Sandbox'],
    ['# 🧪 2.1 Probador de Combinaciones en Vivo', '# 🧪 2.1 Live Outfit Sandbox'],
    ['🔍 Zoom Cabeza/Cuello', '🔍 Head/Neck Zoom'],
    ['🧍 Cuerpo Completo', '🧍 Full Body'],
    ['### 🛍️ Objetos Equipados', '### 🛍️ Equipped Items'],
    ['`[PUESTO]`', '`[WORN]`'],
    ['`[PRUEBA]`', '`[TRY-ON]`'],
    ['> 👕 *No hay accesorios cargados. Presioná **➕ Probar Accesorio** o **👔 Mi Ropa Actual** abajo.*', '> 👕 *No accessories loaded. Click **➕ Try Accessory** or **👔 My Worn Outfit** below.*'],
    ['📌 Guardar un objeto en Mi Lista...', '📌 Save an item to My Watchlist...'],
    ['Personaje activo:', 'Active character:'],
    ['Modo de Cámara:', 'Camera Mode:'],
    ['🔍 Zoom Rostro, Cuello y Cabeza', '🔍 Face, Neck & Head Zoom'],
    ['Piezas activas:', 'Active items:'],
    ['Total del Conjunto:', 'Total Outfit Cost:'],
    ['Aún no hay objetos cargados. Tocá **+ Probar Accesorio (ID/Nombre)** o **⚡ Conjunto Demo** abajo para equipar piezas sobre el avatar.', 'No items loaded yet. Click **+ Try Accessory (ID/Name)** or **⚡ Demo Outfit** below to equip items on the avatar.'],
    ['🗑️ Quitar una pieza específica del probador...', '🗑️ Remove a specific item from the sandbox...'],
    ['Categoría 2: Taller de Avatares • Posicionamiento anatómico inteligente en RAM', 'Category 2: Avatar Workshop • Smart anatomical positioning in RAM'],
    ['🧪 Probar Accesorio o Prenda en Vivo', '🧪 Try On Accessory or Garment Live'],
    ['ID de Roblox, URL o Nombre del Accesorio', 'Roblox ID, URL, or Accessory Name'],
    ['Ej: Valkyrie Helm, Black Scarf o 1365767', 'E.g., Valkyrie Helm, Black Scarf, or 1365767'],
    ['👤 Cambiar Personaje del Probador', '👤 Switch Sandbox Character'],
    ['Usuario de Roblox (@nombre, ID o URL)', 'Roblox User (@username, ID, or URL)'],
    ['❌ Tu avatar no tiene accesorios públicos equipados o el inventario está privado.', '❌ Your avatar has no public accessories equipped or your inventory is private.'],
    ['🔍 **Zoom de Cabeza y Cuello activado.**', '🔍 **Head & Neck Zoom enabled.**'],
    ['🧍 **Vista de Cuerpo Completo activada.**', '🧍 **Full Body view enabled.**'],
    ['🗑️ Probador vaciado.', '🗑️ Sandbox cleared.'],
    ['❌ No se encontró ningún usuario de Roblox llamado', '❌ No Roblox user found named'],
    ['❌ No se encontró ningún accesorio en el catálogo para', '❌ No accessory found in the catalog for'],

    // 2.2 Clones y Similares (avatarModule.js)
    ['# 🔍 2.2 Buscador de Clones y Similares (Roblox + UGC)', '# 🔍 2.2 Cheap Clones & Similar Items Finder (Roblox + UGC)'],
    ['🎯 **Referencia:**', '🎯 **Reference:**'],
    ['💎 **Precio Original:**', '💎 **Original Price:**'],
    ['🗂️ **Filtro:**', '🗂️ **Filter:**'],
    ['🌐 Todos (Clones Comprables + Oficiales)', '🌐 All (Buyable Clones + Official)'],
    ['🏛️ Oficiales de Roblox', '🏛️ Official Roblox'],
    ['💸 Clones UGC Más Baratos en Venta', '💸 Cheaper UGC Clones on Sale'],
    ['> 📭 No se encontraron alternativas en esta categoría.', '> 📭 No alternatives found in this category.'],
    ['👤 Por:', '👤 By:'],
    ['*(Mejor Reventa Limited)*', '*(Best Limited Resale)*'],
    ['`Fuera de venta / Exclusivo`', '`Off-sale / Exclusive`'],
    ['### 🔎 Alternativa Seleccionada:', '### 🔎 Selected Alternative:'],
    ['💰 **Precio Lista:**', '💰 **List Price:**'],
    ['[Abrir en Catálogo de Roblox]', '[Open in Roblox Catalog]'],
    ['Ítem de Referencia:', 'Reference Item:'],
    ['Precio Original:', 'Original Price:'],
    ['Creador:', 'Creator:'],
    ['### 📋 Alternativas Encontradas (Roblox Oficial + Clones UGC)', '### 📋 Alternatives Found (Official Roblox + UGC Clones)'],
    ['### 📋 Mejores Alternativas Encontradas', '### 📋 Best Alternatives Found'],
    ['👇 Elegí una alternativa para probarla en tu Avatar o seguir su precio...', '👇 Choose an alternative to try on your Avatar or track its price...'],
    ['ROBLOX OFICIAL', 'OFFICIAL ROBLOX'],
    ['CLON UGC', 'UGC CLONE'],
    ['de ahorro', 'saved'],
    ['Precio de catálogo', 'Catalog price'],
    ['Fuera de venta', 'Off-sale'],
    ['🔍 Elegí un ítem clásico o Limited de muestra para comparar...', '🔍 Choose a sample classic or Limited item to compare...'],
    ['🎯 Guardar una de las alternativas en Mi Lista (Seguimiento de Precios)...', '🎯 Save one of the alternatives to My Watchlist (Price Tracker)...'],
    ['Categoría 2: Taller de Avatares • Comparador Roblox Oficial + Clones UGC', 'Category 2: Avatar Workshop • Official Roblox + UGC Clones Comparator'],
    ['🔍 Buscar Clones o Similares', '🔍 Find Clones or Similar Items'],
    ['Nombre o ID del Accesorio / Limited', 'Accessory / Limited Name or ID'],
    ['❌ No se encontró esa alternativa en la lista actual.', '❌ That alternative was not found in the current list.'],
    ['❌ Ya tenés 5/5 objetos en tu lista de monitoreo.', '❌ You already have 5/5 items in your watchlist.'],
    ['❌ No se encontraron alternativas para', '❌ No alternatives found for'],

    // 2.3 Extractor de Texturas + Maniquí 2D (avatarModule.js)
    ['# 🧬 2.3 Extractor de Texturas + Maniquí 2D', '# 🧬 2.3 Texture Extractor + 2D Mannequin'],
    ['🏷️ **Prenda:**', '🏷️ **Garment:**'],
    ['👤 **Creador:**', '👤 **Creator:**'],
    ['📦 **Tipo:**', '📦 **Type:**'],
    ['💵 **Precio:**', '💵 **Price:**'],
    ['Plantilla Personalizada 2D', 'Custom 2D Template'],
    ['Camisa Clásica (Shirt 2D)', 'Classic Shirt (2D)'],
    ['Camisa Clásica (2D)', 'Classic Shirt (2D)'],
    ['Pantalón Clásico (Pants 2D)', 'Classic Pants (2D)'],
    ['Pantalón Clásico (2D)', 'Classic Pants (2D)'],
    ['T-Shirt (Estampado Frontal)', 'Classic T-Shirt (Front Decal)'],
    ['Camiseta (Estampado Frontal)', 'Classic T-Shirt (Front Decal)'],
    ['Sombrero (Hat)', 'Hat'],
    ['Pelo (Hair)', 'Hair'],
    ['Cara (Face)', 'Face Accessory'],
    ['Cuello (Neck)', 'Neck Accessory'],
    ['Hombros (Shoulder)', 'Shoulder Accessory'],
    ['Frente (Front)', 'Front Accessory'],
    ['Espalda (Back)', 'Back Accessory'],
    ['Cintura (Waist)', 'Waist Accessory'],
    ['Chaqueta (Jacket 3D)', '3D Jacket'],
    ['Chaqueta (3D)', '3D Jacket'],
    ['Suéter (Sweater 3D)', '3D Sweater'],
    ['Suéter (3D)', '3D Sweater'],
    ['Pantalón 3D (Pants 3D)', '3D Pants'],
    ['Pantalón (3D)', '3D Pants'],
    ['Prenda Analizada:', 'Analyzed Garment:'],
    ['Textura Fuente (.PNG):', 'Source Texture (.PNG):'],
    ['Modo de Mapeo R6:', 'R6 Mapping Mode:'],
    ['👕 Camisa (Torso + Brazos)', '👕 Shirt (Torso + Arms)'],
    ['👖 Pantalón (Cintura + Piernas)', '👖 Pants (Waist + Legs)'],
    ['🧥 Traje Completo', '🧥 Full Suit'],
    ['Descargá la imagen de arriba o tocá **🔗 Abrir Textura Original HD** para guardar el archivo `.PNG` crudo (585×559) listo para editar o resubir.', 'Download the image above or click **🔗 Open Original HD Texture** to save the raw `.PNG` file (585×559) ready to edit or re-upload.'],
    ['👕 Elegí una Camisa o Pantalón de muestra para extraer su plantilla...', '👕 Choose a sample Shirt or Pants to extract its template...'],
    ['Categoría 2: Taller de Avatares • Descompresor XML de AssetDelivery en RAM', 'Category 2: Avatar Workshop • In-RAM AssetDelivery XML Unpacker'],
    ['🧬 Extraer Plantilla 2D (.PNG)', '🧬 Extract 2D Template (.PNG)'],
    ['ID, URL o Nombre de Camisa / Pantalón', 'Shirt / Pants ID, URL, or Name'],
    ['❌ No se encontró ninguna prenda para', '❌ No garment found for'],
    ['❌ No se pudo extraer una textura 2D para', '❌ Could not extract a 2D texture for'],
    ['❌ No se pudo cargar una imagen PNG válida desde', '❌ Could not load a valid PNG image from'],

    // 2.4 Exportador 3D (avatarModule.js)
    ['# 📦 2.4 Exportador 3D (Render PNG HD + Archivo .ZIP)', '# 📦 2.4 3D Exporter (HD PNG Render + .ZIP Archive)'],
    ['Modelo Exportado:', 'Exported Model:'],
    ['Geometría Wavefront (.OBJ):', 'Wavefront Geometry (.OBJ):'],
    ['vértices', 'vertices'],
    ['caras trianguladas', 'triangulated faces'],
    ['Materiales y Texturas (.MTL):', 'Materials & Textures (.MTL):'],
    ['malla(s) 3D', '3D mesh(es)'],
    ['textura(s) PNG', 'PNG texture(s)'],
    ['Tamaño del Paquete:', 'Package Size:'],
    ['El archivo **`avatar_3d_export.zip`** adjunto arriba contiene el modelo `.OBJ`, `.MTL`, texturas `.PNG` y el render HD listo para abrir en **Blender**, **Cinema4D** o **Roblox Studio**.', 'The **`avatar_3d_export.zip`** file attached above contains the `.OBJ` model, `.MTL`, `.PNG` textures, and HD render ready to open in **Blender**, **Cinema4D**, or **Roblox Studio**.'],
    ['Categoría 2: Taller de Avatares • Conversor Binario Mesh a Wavefront .OBJ en RAM', 'Category 2: Avatar Workshop • In-RAM Binary Mesh to Wavefront .OBJ Converter'],
    ['📦 Exportar Modelo 3D (.PNG + .ZIP)', '📦 Export 3D Model (.PNG + .ZIP)'],
    ['Usuario (@nombre) o ID de Usuario / Accesorio', 'Username (@name) or User / Accessory ID'],
    ['❌ No se pudo exportar el modelo 3D para', '❌ Could not export the 3D model for'],

    // 2.5 Color-Match (avatarModule.js)
    ['# 🎨 2.5 Emparejador de Cosméticos por Color', '# 🎨 2.5 Accessory Color-Match Finder'],
    ['# 🎨 2.5 Emparejador de Accesorios por Color (Color-Match)', '# 🎨 2.5 Accessory Color-Match Finder'],
    ['# 🎨 2.5 Emparejador de Accesorios por Color', '# 🎨 2.5 Accessory Color-Match Finder'],
    ['👕 **Referencia:**', '👕 **Reference:**'],
    ['🗂️ **Filtro Activo:**', '🗂️ **Active Filter:**'],
    ['🌈 **Paleta Detectada:**', '🌈 **Detected Palette:**'],
    ['Color Hexadecimal', 'Hexadecimal Color'],
    ['(Activo)', '(Active)'],
    ['> 📭 No se encontraron cosméticos en esta categoría para este tono.', '> 📭 No cosmetics found in this category for this tone.'],
    ['### 🧩 Filtros por Tipo de Cosmético de Roblox', '### 🧩 Filters by Roblox Cosmetic Type'],
    ['-# ⚙️ **Controles de Prenda Base y Navegación:**', '-# ⚙️ **Base Garment & Navigation Controls:**'],
    ['🎨 Cambiá entre los 3 tonos detectados o probá un cosmético en tu Avatar...', '🎨 Switch between the 3 detected tones or try a cosmetic on your Avatar...'],
    ['Fuente Analizada:', 'Analyzed Source:'],
    ['Paleta Dominante Extraída:', 'Extracted Dominant Palette:'],
    ['Tono Activo de Búsqueda:', 'Active Search Tone:'],
    ['Filtro de Categoría:', 'Category Filter:'],
    ['### 🎯 Cosméticos que Combinan con este Tono', '### 🎯 Cosmetics Matching This Tone'],
    ['Match Cromático', 'Color Match'],
    ['Afinidad de Color', 'Color Match'],
    ['🎨 Filtrar por tipo de cosmético (Sombreros, Pelo, Rostro, Espalda...)', '🎨 Filter by cosmetic type (Hats, Hair, Face, Back...)'],
    ['Todos los Cosméticos', 'All Cosmetics'],
    ['Sombreros', 'Hats'],
    ['Cabello / Pelo', 'Hair'],
    ['Rostro / Lentes', 'Face / Glasses'],
    ['Ropa Clásica', 'Classic Clothing'],
    ['🧪 Probar uno de estos cosméticos en tu Avatar (Probador 2.1)...', '🧪 Try one of these cosmetics on your Avatar (Sandbox 2.1)...'],
    ['Categoría 2: Taller de Avatares • Cuantización RGB en RAM + Búsqueda Cromática', 'Category 2: Avatar Workshop • In-RAM RGB Quantization + Chromatic Search'],
    ['🎨 Analizar Prenda o Color #HEX', '🎨 Analyze Garment or #HEX Color'],
    ['Código #HEX, ID de Prenda o Nombre', '#HEX Code, Garment ID, or Name'],
    ['❌ No se pudo extraer la paleta de colores de tu avatar.', '❌ Could not extract the color palette from your avatar.'],
    ['❌ No se encontró ninguna prenda ni código #HEX válido para', '❌ No valid garment or #HEX color found for'],

    // Categoría 3: Utilidades de Juego y Servidores (gamesModule.js)
    ['# 👻 3.1 Buscador de Servidores Vacíos con Unión Directa', '# 👻 3.1 Empty Servers Finder with Direct Join'],
    ['Experiencia:', 'Experience:'],
    ['Jugadores Totales Activos:', 'Total Active Players:'],
    ['Capacidad por Servidor:', 'Server Capacity:'],
    ['jugadores máx.', 'max players'],
    ['### 🟢 Servidores Públicos con Menos Jugadores', '### 🟢 Public Servers with Fewest Players'],
    ['Jugadores:', 'Players:'],
    ['Ping estimado:', 'Estimated ping:'],
    ['FPS del Servidor:', 'Server FPS:'],
    ['Unirse a este Servidor', 'Join This Server'],
    ['🎮 Elegí un juego popular para buscar servidores vacíos al instante...', '🎮 Choose a popular game to find empty servers instantly...'],
    ['Categoría 3: Utilidades de Juego • Escáner de Instancias Públicas en Vivo', 'Category 3: Game Utilities • Live Public Server Instance Scanner'],
    ['👻 Buscar Servidores Vacíos', '👻 Find Empty Servers'],
    ['Nombre del Juego, Place ID o URL de Roblox', 'Game Name, Place ID, or Roblox URL'],
    ['❌ No se encontró ningún juego en Roblox para', '❌ No Roblox game found for'],

    // 3.2 Extractor de Pases de un Juego (gamesModule.js)
    ['# 🎟️ 3.2 Extractor Completo de Pases de un Juego', '# 🎟️ 3.2 Full Gamepass Extractor'],
    ['🌐 **Jugando ahora:**', '🌐 **Playing now:**'],
    ['🏪 **En Tienda Web:**', '🏪 **Web Store:**'],
    ['🕹️ **Dentro del Juego:**', '🕹️ **In-Game:**'],
    ['🏪 Tienda de Roblox (Web)', '🏪 Roblox Web Store'],
    ['🕹️ Dentro del Juego (Tienda Interna)', '🕹️ In-Game (Internal Shop)'],
    ['🕹️ Dentro del Juego (Exclusive Shop)', '🕹️ In-Game (Exclusive Shop)'],
    ['🕹️ Pase Consultado por ID', '🕹️ Gamepass Queried by ID'],
    ['## 🌟 PASE SELECCIONADO:', '## 🌟 SELECTED GAMEPASS:'],
    ['📍 **Ubicación:**', '📍 **Location:**'],
    ['🔗 **Enlace:** [Abrir en Roblox]', '🔗 **Link:** [Open on Roblox]'],
    ['🕹️ **Compra interna:** Disponible dentro de', '🕹️ **In-game purchase:** Available inside'],
    ['📝 **Detalle:**', '📝 **Detail:**'],
    ['💵 **Cobra:**', '💵 **Price:**'],
    ['> 📭 No se encontraron pases que coincidan con el filtro o búsqueda actual.', '> 📭 No gamepasses found matching the current filter or search.'],
    ['🌟 Elegí un pase de la lista para destacarlo arriba con su imagen...', '🌟 Select a gamepass from the list to highlight it above with its icon...'],
    ['-# 🎛️ **Filtros de Ubicación y Orden por Precio:**', '-# 🎛️ **Location Filters & Price Sorting:**'],
    ['-# 🧭 **Búsqueda y Navegación (Página', '-# 🧭 **Search & Navigation (Page'],
    ['Pases Encontrados:', 'Gamepasses Found:'],
    ['Valor Total de todos los Pases:', 'Total Value of All Gamepasses:'],
    ['Ingreso Neto del Creador (70%):', 'Creator Net Earnings (70%):'],
    ['### 🎫 Catálogo de Pases de Juego (Gamepasses)', '### 🎫 Experience Gamepasses Catalog'],
    ['Comisión creador (70%):', 'Creator payout (70%):'],
    ['🎟️ Elegí otro juego popular para extraer sus pases...', '🎟️ Choose another popular game to extract its gamepasses...'],
    ['🎯 Añadir uno de estos Gamepasses a Mi Lista (Seguimiento de Precios)...', '🎯 Add one of these Gamepasses to My Watchlist (Price Tracker)...'],
    ['Categoría 3: Utilidades de Juego • Extractor Oficial de Gamepasses y Economía', 'Category 3: Game Utilities • Official Gamepass & Economy Extractor'],
    ['🎟️ Extraer Pases de un Juego', '🎟️ Extract Gamepasses of a Game'],
    ['Pase permanente dentro del juego (Shop)', 'Permanent in-game pass (Shop)'],
    ['Fruta Permanente en la tienda interna del juego', 'Permanent Fruit in the in-game shop'],
    ['Pase de la tienda interna de Brookhaven', 'Brookhaven in-game shop pass'],
    ['Pase permanente de vestidor dentro del juego', 'Permanent in-game dressing room pass'],
    ['Pase VIP permanente dentro del juego', 'Permanent in-game VIP pass'],
    ['Pase de tienda interna (Exclusive Shop)', 'In-game shop pass (Exclusive Shop)'],
    ['Pase interno de mascota y casa en Adopt Me', 'Adopt Me in-game pet & house pass'],
    ['Pase de la tienda interna de rivales', 'Rivals in-game shop pass'],

    // 3.3 Bóveda de Códigos Activos (gamesModule.js)
    ['# 🎁 3.3 Bóveda de Códigos Activos con Checklist Personal', '# 🎁 3.3 Active Codes Vault & Personal Checklist'],
    ['# 🎁 Bóveda de Códigos Activos —', '# 🎁 Active Promo Codes Vault —'],
    ['📊 **Progreso personal:**', '📊 **Personal progress:**'],
    ['-# Marcá los códigos que ya usaste o registrá nuevos códigos para cualquier experiencia de Roblox.', '-# Check off the codes you already used or submit new promo codes for any Roblox game.'],
    ['> 🎉 **¡Ya canjeaste todos los códigos activos registrados para este juego!**', '> 🎉 **You have already redeemed all active promo codes registered for this game!**'],
    ['🎮 Cambiar de experiencia en la Bóveda...', '🎮 Switch game in the Vault...'],
    ['✅ Marcá o desmarcá códigos como Canjeados...', '✅ Check or uncheck codes as Redeemed...'],
    ['Marcá los códigos que ya usaste para llevar el control de tu progreso', 'Check off the codes you already used to track your progress'],
    ['Progreso de tu Checklist:', 'Your Checklist Progress:'],
    ['códigos marcados como canjeados', 'codes marked as redeemed'],
    ['### 📋 Códigos Promocionales Verificados', '### 📋 Verified Promo Codes'],
    ['CANJEADO', 'REDEEMED'],
    ['PENDIENTE', 'AVAILABLE'],
    ['*(Canjeado)*', '*(Redeemed)*'],
    ['*(Disponible)*', '*(Available)*'],
    ['🎁 Cambiar de juego en la Bóveda de Códigos...', '🎁 Switch game in the Promo Codes Vault...'],
    ['✅ Marcar o desmarcar códigos que ya canjeaste en tu cuenta...', '✅ Check or uncheck codes you already redeemed on your account...'],
    ['Categoría 3: Utilidades de Juego • Bóveda Colaborativa con Checklist Persistente', 'Category 3: Game Utilities • Collaborative Vault with Persistent Checklist'],
    ['🎁 Aportar Nuevo Código Promocional', '🎁 Submit New Promo Code'],
    ['Código Promocional (Ej: UPDATE2026)', 'Promo Code (E.g., UPDATE2026)'],
    ['Recompensa que otorga el código', 'Reward granted by the code'],
    ['20 minutos de 2x Experiencia', '20 minutes of 2x Experience'],
    ['Reinicio de estadísticas gratis (Stat Reset)', 'Free Stat Reset'],
    ['Título exclusivo Big News', 'Exclusive Big News Title'],
    ['$1 Beli simbólico', '$1 symbolic Beli'],
    ['Vestido exclusivo de diseñador', 'Exclusive designer dress'],
    ['Botas y corona exclusiva', 'Exclusive boots & crown'],
    ['Set de pestañas y accesorios', 'Eyelashes & accessories set'],
    ['Vestido brillante de gala', 'Sparkling gala dress'],
    ['100 Knobs + 1 Revive + 1 Boost', '100 Knobs + 1 Revive + 1 Boost'],
    ['50 Knobs + 1 Revive gratis', '50 Knobs + 1 free Revive'],
    ['1 Revive + Knobs de bonificación', '1 Revive + bonus Knobs'],
    ['Envoltorio de arma exclusivo + 3 llaves', 'Exclusive weapon wrap + 3 keys'],
    ['3 llaves de caja de armas (Keys)', '3 weapon crate keys'],
    ['Amuleto comunitario exclusivo', 'Exclusive community charm'],
    ['3 Lucky Spins + 3 Style Spins', '3 Lucky Spins + 3 Style Spins'],
    ['5 Lucky Spins + Dinero gratis', '5 Lucky Spins + free Cash'],
    ['20,000 Cash + 5 Spins', '20,000 Cash + 5 Spins'],
    ['150 Gemas + 1 Trait Reroll', '150 Gems + 1 Trait Reroll'],
    ['250 Gemas + Poción de Suerte', '250 Gems + Luck Potion'],
    ['100 Gemas gratis', '100 free Gems'],
    ['✅ Checklist de códigos actualizado.', '✅ Promo codes checklist updated.'],

    // 3.4 Avisos de Parches y Actualizaciones (gamesModule.js)
    ['# 🔔 3.4 Avisos de Parches y Actualizaciones de Juegos', '# 🔔 3.4 Game Patch & Update Alerts'],
    ['### 📭 No tenés juegos suscriptos', '### 📭 No subscribed games yet'],
    ['> Podés suscribir hasta **3 juegos** presionando **➕ Suscribir Juego** abajo.', '> You can subscribe up to **3 games** by clicking **➕ Subscribe Game** below.'],
    ['🕒 **Última actualización:**', '🕒 **Last update:**'],
    ['👥 **Jugando:**', '👥 **Playing:**'],
    ['Suscribite a tus experiencias favoritas (máx. 3) para recibir un aviso automático por Mensaje Directo apenas los desarrolladores publiquen una nueva actualización.', 'Subscribe to your favorite experiences (max 3) to receive an automatic Direct Message alert as soon as developers publish a new update.'],
    ['Todavía no estás siguiendo actualizaciones de ningún juego.', 'You are not following updates for any game yet.'],
    ['Elegí un juego del menú desplegable o tocá **Seguir Juego (Máx. 3)** para activar el radar.', 'Select a game from the dropdown menu or click **Follow Game (Max 3)** to enable the radar.'],
    ['Última actualización detectada:', 'Last detected update:'],
    ['Jugadores activos:', 'Active players:'],
    ['🔔 Suscribirse rápido a un Juego Popular...', '🔔 Quick-subscribe to a Popular Game...'],
    ['🗑️ Dejar de seguir un juego de tu lista...', '🗑️ Unfollow a game from your list...'],
    ['Categoría 3: Utilidades de Juego • Radar de Parches en Tiempo Real', 'Category 3: Game Utilities • Real-Time Patch Radar'],
    ['🔔 Seguir Actualizaciones de un Juego', '🔔 Follow Game Updates'],
    ['❌ Ya tenés el máximo de **3/3 juegos** suscriptos. Vacía o quitá uno primero.', '❌ You already have the maximum of **3/3 games** subscribed. Clear or remove one first.'],
    ['✅ No se detectaron parches nuevos desde la última revisión.', '✅ No new patches detected since the last check.'],
    ['🗑️ Suscripciones de parches eliminadas.', '🗑️ Patch alert subscriptions cleared.'],
    ['❌ No se encontró ese juego en Roblox.', '❌ Game not found on Roblox.'],

    // 3.5 Explorador de Sub-Lugares y Mapas (gamesModule.js)
    ['# 🗺️ 3.5 Explorador de Sub-Lugares y Mapas Conectados', '# 🗺️ 3.5 Sub-Places & Connected Maps Explorer'],
    ['🏠 **[Mapa Principal]**', '🏠 **[Root Place]**'],
    ['🗺️ **[Sub-Lugar]**', '🗺️ **[Sub-Place]**'],
    ['Actualizado:', 'Updated:'],
    ['Universo ID:', 'Universe ID:'],
    ['Lugar Principal (Root Place):', 'Root Place:'],
    ['Sub-lugares detectados:', 'Detected sub-places:'],
    ['### 🧭 Mapas y Sub-Lugares del Universo', '### 🧭 Universe Maps & Sub-Places'],
    ['LUGAR PRINCIPAL', 'ROOT PLACE'],
    ['SUB-LUGAR', 'SUB-PLACE'],
    ['🗺️ Explorar otro Universo Popular...', '🗺️ Explore another Popular Universe...'],
    ['🔍 Inspeccionar un Sub-Lugar específico en detalle...', '🔍 Inspect a specific Sub-Place in detail...'],
    ['Categoría 3: Utilidades de Juego • Escáner de Topología de Universos Roblox', 'Category 3: Game Utilities • Roblox Universe Topology Scanner'],
    ['🗺️ Explorar Sub-Lugares de un Juego', '🗺️ Explore Game Sub-Places'],

    // Paneles de desbloqueo, cuentas y administración (/config y cuenta Roblox)
    ['# 🎮 Mi Cuenta de Roblox', '# 🎮 My Roblox Account'],
    ['# 🎮 Vincular Cuenta de Roblox', '# 🎮 Link Roblox Account'],
    ['# 🎮 Autorizar Cuenta de Roblox', '# 🎮 Link Roblox Account'],
    ['👤 **Jugador:**', '👤 **Player:**'],
    ['🟢 **Estado:** Cuenta vinculada', '🟢 **Status:** Account linked'],
    ['⚪ **Estado:** Sin cuenta vinculada', '⚪ **Status:** No account linked'],
    ['-# Conectá tu cuenta de Roblox para cargar tu avatar automáticamente.', '-# Connect your Roblox account to load your avatar automatically.'],
    ['### 🔗 Conexión con Roblox', '### 🔗 Roblox Connection'],
    ['Iniciá sesión en Roblox para vincular o cambiar tu perfil.', 'Sign in on Roblox to link or switch your profile.'],
    ['### 📋 Actividad Reciente', '### 📋 Recent Activity'],
    ['# 🔓 Cuenta Requerida:', '# 🔓 Account Required:'],
    ['### 🎮 Vincular Cuenta de Roblox', '### 🎮 Link Roblox Account'],
    ['Conectá tu perfil para usar esta función.', 'Connect your profile to use this feature.'],
    ['### 💬 Conectar Cuenta de Discord', '### 💬 Connect Discord Account'],
    ['Conectá tu cuenta para habilitar el guardado y las alertas.', 'Connect your account to enable saving and alerts.'],
    ['Para cargar los datos de tu propio personaje necesitás vincular tu cuenta de Roblox.', 'To load your own character data, you need to link your Roblox account.'],
    ['Para guardar tus datos y enviarte alertas necesitás conectar tu cuenta de Discord.', 'To save your data and receive alerts, you need to connect your Discord account.'],
    ['# 🔒 Acceso Exclusivo del Propietario', '# 🔒 Owner Exclusive Access'],
    ['Esta sección está reservada para el propietario del bot.', 'This section is reserved for the bot owner.'],
    ['# 🛡️ Administración del Bot', '# 🛡️ Bot Administration'],
    ['**👑 Propietario:**', '**👑 Owner:**'],
    ['### ⚡ Estado y Recursos', '### ⚡ Status & Resources'],
    ['• **Modo:**', '• **Mode:**'],
    ['• **Memoria en uso:**', '• **Memory usage:**'],
    ['• **Mantenimiento:**', '• **Maintenance:**'],
    ['• **Alertas en 2do plano:**', '• **Background alerts:**'],
    ['• **Renderizado 2D/3D:**', '• **2D/3D Rendering:**'],
    ['🟢 Desactivado', '🟢 Disabled'],
    ['🔴 Pausado', '🔴 Paused'],
    ['🟠 Activo', '🟠 Active'],
    ['🍃 Ahorro Estricto de RAM/GPU', '🍃 Strict RAM/GPU Saver'],
    ['🚀 Alto Rendimiento', '🚀 High Performance'],
    ['🤖 Automático Calibrado', '🤖 Calibrated Auto'],
    ['⚙️ Opciones de administración...', '⚙️ Administration options...'],
    ['Alternar entre Automático, Ahorro y Alto Rendimiento', 'Switch between Auto, Saver, and High Performance'],
    ['Restringir temporalmente el bot solo al propietario', 'Temporarily restrict the bot to the owner only'],
    ['Escaneo automático de precios, Robux y parches', 'Automatic price, Robux, and patch scanning'],
    ['Generación de imágenes y paquetes 3D', 'Image generation and 3D package rendering'],
    ['🛡️ **Estado:** 🟢 **Autorizada con Roblox OAuth 2.0 (Persistente)**', '🛡️ **Status:** 🟢 **Account linked**'],
    ['-# Tu historial se guarda mientras tengas la cuenta activa y se limpia automáticamente si la quitás.', '-# Your history is saved while your account is active and cleared automatically if removed.'],
    ['⚪ **Estado actual:** *Sin cuenta de Roblox autorizada*', '⚪ **Current status:** *No linked Roblox account*'],
    ['-# Iniciá sesión con la autorización oficial de Roblox OAuth 2.0 para conectar tu perfil.', '-# Sign in with Roblox to connect your profile.'],
    ['### 🔐 Conexión Oficial con Roblox OAuth 2.0', '### 🔐 Roblox Connection'],
    ['Autorizá tu perfil directamente desde la página oficial de **Roblox**. Tu sesión queda guardada de forma segura y persistente.', 'Authorize your profile directly from the official **Roblox** website.'],
    ['### 📋 Historial de tu Cuenta Activa', '### 📋 Recent Activity'],
    ['Centro de Cuenta de Roblox • Autorización Oficial con Roblox OAuth 2.0', 'Roblox Account'],
    ['# 🔓 Desbloquear Función:', '# 🔓 Account Required:'],
    ['### 🔐 Iniciar Sesión con Roblox OAuth 2.0', '### 🔐 Sign In with Roblox'],
    ['Autorizá tu perfil oficialmente en Roblox para desbloquear al instante tu personaje.', 'Authorize your profile on Roblox to unlock your character.'],
    ['### 💬 Iniciar Sesión con Discord OAuth 2.0', '### 💬 Sign In with Discord'],
    ['Conectá tu cuenta una sola vez (también disponible desde `/config` → *Cuentas y Conexión*) para habilitar el guardado y las notificaciones automáticas.', 'Connect your account once (also available in `/config`) to enable saving and automatic alerts.'],
    ['Requisito funcional de avatar • Autorización Oficial con Roblox OAuth 2.0', 'Also available in /config'],
    ['Requisito funcional de alertas y guardado • También gestionable en /config', 'Also available in /config'],
    ['-# Podés seguir usando libremente todas las herramientas generales sin registrarte, o autorizar tu cuenta con Roblox OAuth 2.0 abajo para desbloquear las funciones de tu avatar.', '-# Connect your Roblox account below to unlock your avatar features.'],
    ['-# Todas las herramientas de consulta siguen abiertas sin registrarse. Si querés usar esta mecánica personal, iniciá sesión abajo para desbloquearla.', '-# Sign in below to unlock this personal feature.'],
    ['2.1 Cotizar Mi Ropa Actual (Probador en Vivo)', '2.1 Price My Worn Outfit (Live Sandbox)'],
    ['Para leer e importar las prendas que llevás equipadas actualmente en tu propio avatar, es necesario vincular tu **Cuenta de Roblox**.', 'To read and import the garments currently equipped on your own avatar, you need to link your **Roblox Account**.'],
    ['2.4 Exportar Mi Avatar en 3D (.PNG + .ZIP)', '2.4 Export My Avatar in 3D (.PNG + .ZIP)'],
    ['Para exportar el modelo 3D y las texturas de tu propio personaje (en lugar de otro jugador o accesorio), necesitás tener vinculada tu **Cuenta de Roblox**.', 'To export the 3D model and textures of your own character (instead of another player or accessory), you need to link your **Roblox Account**.'],
    ['2.5 Analizar Colores de Mi Avatar (Color-Match)', '2.5 Analyze My Avatar Colors (Color-Match)'],
    ['Para detectar automáticamente la paleta de colores de tu propio personaje, necesitás vincular primero tu **Cuenta de Roblox**.', 'To automatically detect the color palette of your own character, you need to link your **Roblox Account** first.'],
    ['1.1 Seguimiento y Alertas de Precios', '1.1 Price Tracker & Alerts'],
    ['Para guardar objetos en tu lista personal y enviarte alertas automáticas en Discord cuando bajen de precio, es necesario que inicies sesión con tu **Cuenta de Discord**.', 'To save items to your personal watchlist and send you automatic Discord alerts when prices drop, please sign in with your **Discord Account**.'],
    ['1.1 Mi Lista Personal de Seguimiento', '1.1 My Personal Watchlist'],
    ['Para gestionar tu lista personal de hasta 5 objetos en seguimiento y recibir avisos de bajada de precio, iniciá sesión con tu **Cuenta de Discord**.', 'To manage your personal watchlist of up to 5 tracked items and receive price drop alerts, please sign in with your **Discord Account**.'],
    ['1.4 Agenda y Alerta de Robux Pendientes', '1.4 Pending Robux Schedule & Alerts'],
    ['Para registrar tus cobros en retención y enviarte un mensaje directo automático cuando tus Robux se acrediten, es necesario conectar tu **Cuenta de Discord**.', 'To log your pending payouts and receive an automatic DM when your Robux are released, please connect your **Discord Account**.'],
    ['3.3 Checklist Personal de Códigos Canjeados', '3.3 Personal Redeemed Codes Checklist'],
    ['Podés consultar todos los códigos libremente sin registrarte, pero para guardar qué códigos ya canjeaste en tu perfil necesitás iniciar sesión con tu **Cuenta de Discord**.', 'You can browse all codes freely without signing in, but to save which codes you already redeemed on your profile you need to sign in with your **Discord Account**.'],
    ['3.3 Registrar Código en la Bóveda', '3.3 Submit Code to the Vault'],
    ['Para aportar y guardar nuevos códigos promocionales verificados en la bóveda, necesitás tener iniciada tu sesión de **Discord**.', 'To submit and save new verified promo codes in the vault, you need to sign in with **Discord**.'],
    ['3.4 Suscripción a Avisos de Actualizaciones', '3.4 Game Update Alerts Subscription'],
    ['Para suscribir tus juegos favoritos y enviarte avisos automáticos por Discord apenas salga un parche nuevo, es necesario conectar tu **Cuenta de Discord**.', 'To subscribe to your favorite games and receive automatic Discord alerts when a new patch drops, please connect your **Discord Account**.'],
    ['Guardar en Mi Lista de Seguimiento', 'Save to My Watchlist'],
    ['Para guardar este artículo en tu lista de seguimiento y recibir alertas de precio en Discord, iniciá sesión con tu **Cuenta de Discord**.', 'To save this item to your watchlist and receive price alerts on Discord, please sign in with your **Discord Account**.'],

    // Textos comunes en tarjetas y paneles
    ['Prendas en catálogo:', 'Catalog items:'],
    ['Valor total del catálogo:', 'Total catalog value:'],
    ['Comisión neta creador (70%):', 'Creator net payout (70%):'],
    ['Prendas Destacadas del Grupo:', 'Featured Group Apparel:'],
    ['Tipo:', 'Type:'],
    ['Precio:', 'Price:'],
    ['Precio de venta:', 'Sale price:'],
    ['Favoritos:', 'Favorites:'],
    ['Ingreso neto del grupo (70%):', 'Group net payout (70%):'],
    ['Categoría:', 'Category:'],
    ['Ahorro:', 'Savings:'],
    ['Gratis', 'Free'],
    ['Sin propietario público', 'No public owner'],
    ['Sin dueño público', 'No public owner'],
    ['Camisa Clásica', 'Classic Shirt'],
    ['Pantalón Clásico', 'Classic Pants'],
    ['Camiseta Clásica', 'Classic T-Shirt'],
    ['Prenda / Accesorio', 'Apparel / Accessory'],
    ['Seleccioná una prenda del catálogo para ver su ficha o probarla en tu avatar...', 'Select an item from the catalog to inspect its details or try it on your avatar...'],
    ['Volver a la vista general del grupo', 'Return to group overview'],

    // Sistema de carga por filas (performanceManager.js)
    ['⚡ **Sistema Dinámico de Ejecución:**', '⚡ **Dynamic Execution Engine:**'],
    ['### 📋 Estado de los Procedimientos por Filas', '### 📋 Step-by-Step Procedure Status'],
    ['### 🖥️ Terminal de Ejecución en Vivo', '### 🖥️ Live Execution Terminal'],
    ['Sistema de Ejecución por Filas y Terminal en Vivo • Reemplaza automáticamente al finalizar', 'Step-by-Step Execution & Live Terminal • Automatically updates upon completion'],
    ['CARGANDO FILA', 'LOADING ROW'],
    ['Tiempo activo:', 'Elapsed time:'],
    ['EJECUTANDO AHORA...', 'RUNNING NOW...'],
    ['COMPLETADO', 'COMPLETED'],
    ['EN ESPERA DE TURNO', 'QUEUED'],
    ['En proceso:', 'In progress:'],
    ['Fila 1 —', 'Row 1 —'],
    ['Fila 2 —', 'Row 2 —'],
    ['Fila 3 —', 'Row 3 —'],
    ['Fila 4 —', 'Row 4 —'],
    ['Obteniendo perfil y prendas equipadas', 'Fetching profile and equipped items'],
    ['Consultando avatar y accesorios activos en Roblox...', 'Querying avatar and active accessories on Roblox...'],
    ['Descargando miniaturas y precios', 'Downloading thumbnails and prices'],
    ['Resolviendo iconos en caché y valores de mercado...', 'Resolving cached icons and market values...'],
    ['Componiendo lienzo del probador 2D', 'Composing 2D sandbox canvas'],
    ['Dibujando capas de accesorios y tarjeta visual...', 'Drawing accessory layers and visual card...'],
    ['Preparando controles interactivos', 'Preparing interactive controls'],
    ['Empaquetando botones de cámara y selector de prendas...', 'Packaging camera buttons and item selector...'],
    ['Identificando ítem de referencia', 'Identifying reference item'],
    ['Extrayendo metadatos y palabras clave del objeto...', 'Extracting item metadata and keywords...'],
    ['Escaneando catálogo oficial y UGC', 'Scanning official & UGC catalog'],
    ['Buscando alternativas similares y clones económicos...', 'Searching for similar alternatives and cheaper clones...'],
    ['Calculando porcentajes de ahorro', 'Calculating savings percentages'],
    ['Comparando precios de venta y reventa Limited...', 'Comparing sale prices and Limited resale values...'],
    ['Generando panel comparativo', 'Generating comparison panel'],
    ['Ordenando resultados y menús de acción rápida...', 'Sorting results and quick action menus...'],
    ['Localizando activo 2D en Roblox', 'Locating 2D asset on Roblox'],
    ['Resolviendo plantilla XML desde AssetDelivery...', 'Resolving XML template from AssetDelivery...'],
    ['Extrayendo textura PNG original', 'Extracting original PNG texture'],
    ['Descargando mapa UV crudo de alta resolución...', 'Downloading high-resolution raw UV map...'],
    ['Renderizando maniquí R6 (Frente/Espalda)', 'Rendering R6 mannequin (Front/Back)'],
    ['Proyectando mangas, torso y piernas en Canvas...', 'Projecting sleeves, torso, and legs on Canvas...'],
    ['Construyendo vista de descarga', 'Building download view'],
    ['Adjuntando plantilla original y vista previa...', 'Attaching original template and preview...'],
    ['Resolviendo geometría 3D en Roblox', 'Resolving 3D geometry on Roblox'],
    ['Consultando manifiesto 3D y mallas del objetivo...', 'Querying target 3D manifest and meshes...'],
    ['Convirtiendo mallas a Wavefront .OBJ', 'Converting meshes to Wavefront .OBJ'],
    ['Procesando vértices, normales, UVs y materiales .MTL...', 'Processing vertices, normals, UVs, and .MTL materials...'],
    ['Renderizando vista previa 3D', 'Rendering 3D preview'],
    ['Generando imagen de presentación de alta calidad...', 'Generating high-quality preview image...'],
    ['Comprimiendo paquete .ZIP en memoria', 'Compressing .ZIP package in memory'],
    ['Empaquetando .OBJ, .MTL, texturas .PNG y README...', 'Packaging .OBJ, .MTL, .PNG textures, and README...'],
    ['Analizando imagen de referencia', 'Analyzing reference image'],
    ['Descargando textura para muestreo cromático...', 'Downloading texture for color sampling...'],
    ['Extrayendo paleta de 3 tonos dominantes', 'Extracting 3-tone dominant palette'],
    ['Cuantizando píxeles RGB y generando códigos #HEX...', 'Quantizing RGB pixels and generating #HEX codes...'],
    ['Buscando cosméticos compatibles en Roblox', 'Searching matching cosmetics on Roblox'],
    ['Filtrando accesorios por afinidad de color y categoría...', 'Filtering accessories by color affinity and category...'],
    ['Renderizando muestrario de paleta', 'Rendering palette swatch card'],
    ['Dibujando tarjeta de tonos y selector de categorías...', 'Drawing tone card and category selector...'],
    ['Consultando catálogo oficial de Roblox', 'Querying official Roblox catalog'],
    ['Muestreando pisos mínimos de venta por categoría...', 'Sampling minimum price floors by category...'],
    ['Comparando variaciones históricas', 'Comparing historical variations'],
    ['Calculando diferencias contra los pisos anteriores...', 'Calculating differences against previous floors...'],
    ['Generando gráfica comparativa', 'Generating comparison chart'],
    ['Renderizando barras de precios actuales vs previos...', 'Rendering current vs previous price bars...'],
    ['Armando reporte de mercado', 'Building market report'],
    ['Publicando desglose completo de categorías UGC...', 'Publishing full UGC category breakdown...'],
    ['Localizando grupo en Roblox', 'Locating group on Roblox'],
    ['Resolviendo ID, propietario y total de miembros...', 'Resolving ID, owner, and total members...'],
    ['Escaneando catálogo de ropa del grupo', 'Scanning group clothing catalog'],
    ['Obteniendo prendas más vendidas y recientes...', 'Fetching best-selling and recent garments...'],
    ['Calculando métricas y comisiones', 'Calculating metrics and payouts'],
    ['Sumando valor del lote y retención neta (70%)...', 'Summing batch value and net payout (70%)...'],
    ['Construyendo escaparate interactivo', 'Building interactive showcase'],
    ['Preparando selector de prendas e inspector visual...', 'Preparing garment selector and visual inspector...'],
    ['Localizando experiencia en Roblox', 'Locating experience on Roblox'],
    ['Resolviendo UniverseId y PlaceId principal...', 'Resolving UniverseId and root PlaceId...'],
    ['Escaneando servidores públicos activos', 'Scanning active public servers'],
    ['Filtrando instancias con menor cantidad de jugadores...', 'Filtering instances with the fewest players...'],
    ['Verificando latencia y disponibilidad', 'Checking latency and availability'],
    ['Ordenando servidores por cupos libres y ping...', 'Sorting servers by open slots and ping...'],
    ['Generando enlaces de unión directa', 'Generating direct join links'],
    ['Preparando botones de acceso rápido...', 'Preparing quick join buttons...'],
    ['Identificando universo del juego', 'Identifying game universe'],
    ['Consultando datos oficiales de la experiencia...', 'Querying official experience data...'],
    ['Extrayendo pases de tienda y pases internos', 'Extracting web store and in-game passes'],
    ['Recopilando Gamepasses web y catálogo interno...', 'Gathering web Gamepasses and in-game catalog...'],
    ['Calculando precios y comisiones (70%)', 'Calculating prices and creator payouts (70%)'],
    ['Ordenando pases y resolviendo iconos oficiales...', 'Sorting passes and resolving official icons...'],
    ['Preparando buscador y paginación', 'Preparing search and pagination'],
    ['Habilitando filtros por ubicación y precio...', 'Enabling location and price filters...'],
    ['Consultando topología del universo', 'Querying universe topology'],
    ['Obteniendo mapa principal y sub-lugares conectados...', 'Fetching root place and connected sub-places...'],
    ['Descargando miniaturas de cada mapa', 'Downloading map thumbnails'],
    ['Resolviendo iconos y fechas de actualización...', 'Resolving icons and update timestamps...'],
    ['Organizando árbol de mundos', 'Organizing worlds tree'],
    ['Clasificando Root Place y servidores secundarios...', 'Classifying Root Place and secondary servers...'],
    ['Publicando explorador de mapas', 'Publishing maps explorer'],
    ['Armando tarjeta de inspección con enlaces directos...', 'Building inspection card with direct links...']
];

/**
 * Traduce una cadena de texto según el idioma elegido ('es' o 'en').
 */
function traducirTexto(text, lang = 'es') {
    if (!text || typeof text !== 'string') return text;

    if (lang !== 'en') {
        return pulirTextoEspanol(text);
    }

    const trimmed = text.trim();
    if (EXACT_MAP.has(trimmed)) {
        return EXACT_MAP.get(trimmed);
    }

    let out = text;
    for (const [esStr, enStr] of PHRASE_REPLACEMENTS) {
        if (out.includes(esStr)) {
            out = out.split(esStr).join(enStr);
        }
    }

    // Reemplazos dinámicos por expresiones regulares frecuentes
    out = out
        .replace(/Cuenta Roblox: @/g, 'Roblox Account: @')
        .replace(/➕ Añadir Objeto — /g, '➕ Add Item — ')
        .replace(/Ahorrás \*\*`([^`]+)`\*\* (<:Robux:\d+>) \((\d+)%\)/g, 'You save **`$1`** $2 ($3%)')
        .replace(/🔥 \*\*Ahorrás ([^*]+) \(-(\d+)%\)\*\*/g, '🔥 **You save $1 (-$2%)**')
        .replace(/⚡ \*\*(\d+)\*\* activo\(s\)  •  ⏸️ \*\*(\d+)\*\* en pausa/g, '⚡ **$1** active  •  ⏸️ **$2** paused')
        .replace(/•  En pausa$/g, '•  Paused')
        .replace(/•  Activo$/g, '•  Active')
        .replace(/Variaciones en historial: (\d+)\/(\d+)(\s*•\s*Renderizado en RAM)?/g, 'History records: $1/$2')
        .replace(/Categoría: \*\*([^*]+)\*\*/g, 'Category: **$1**')
        .replace(/✅ \*\*Alerta de prueba enviada\*\* con éxito a ([^.]+)\./g, '✅ **Test alert sent** successfully to $1.')
        .replace(/❌ \*\*No se pudo enviar la alerta de prueba \(([^)]+)\):\*\* /g, '❌ **Could not send test alert ($1):** ')
        .replace(/✅ \*\*Canal vinculado:\*\* Las alertas de este objeto ahora se enviarán a /g, '✅ **Channel linked:** Alerts for this item will now be sent to ')
        .replace(/✅ \*\*¡Monitoreo activado!\*\* \*\*([^*]+)\*\* se añadió a tu lista de monitoreo\./g, '✅ **Tracking activated!** **$1** was added to your watchlist.')
        .replace(/📉 \*\*Bajó `([^`]+)`\*\* \*\(antes salía `([^`]+)`\)\*/g, '📉 **Dropped `$1`** *(was `$2`)*')
        .replace(/➖ \*\*Sin cambios\*\* \*\(se mantiene en `([^`]+)`\)\*/g, '➖ **Unchanged** *(stays at `$1`)*')
        .replace(/📈 \*\*Subió `\+([^`]+)`\*\* \*\(antes salía `([^`]+)`\)\*/g, '📈 **Rose `+$1`** *(was `$2`)*')
        .replace(/### 💰 Total Acumulado: ([^\n]+)\(`(\d+)` lote\/s\)/g, '### 💰 Total Pending: $1(`$2` batch/es)')
        .replace(/\*\(máx\. (<t:\d+:R>)\)\*/g, '*(max $1)*')
        .replace(/✅ Se registraron \*\*`([^`]+)`\*\* en tu agenda\. Te avisaremos por DM cuando estén listos\./g, '✅ Logged **`$1`** in your schedule. We will DM you when they are released.')
        .replace(/🔔 Se envió una alerta de prueba por DM para \*\*`([^`]+)`\*\*\./g, '🔔 Sent a test DM alert for **`$1`**.')
        .replace(/⚠️ No se pudo enviar el DM\. Verificá tener los mensajes directos abiertos\./g, '⚠️ Could not send DM. Please make sure your Direct Messages are open.')
        .replace(/> 💵 \*\*Valor del lote \((\d+) artículos\):\*\*/g, '> 💵 **Batch value ($1 items):**')
        .replace(/Precio: ([^•]+)• ⭐ ([^\s]+) favs/g, 'Price: $1• ⭐ $2 favs')
        .replace(/Grupo: /g, 'Group: ')
        .replace(/👤 \*\*Avatar:\*\* ([^•]+)• 📷 \*\*Vista:\*\* ([^•]+)• 💰 \*\*Total \((\d+\/\d+)\):\*\*/g, '👤 **Avatar:** $1• 📷 **View:** $2• 💰 **Total ($3):**')
        .replace(/• Slot: /g, '• Slot: ')
        .replace(/• Ranura: /g, '• Slot: ')
        .replace(/✅ \*\*([^*]+)\*\* añadido a tu Lista de Monitoreo \(Seguimiento de Precios\)\./g, '✅ **$1** added to your Watchlist (Price Tracker).')
        .replace(/✅ Cargadas \*\*(\d+)\*\* prendas equipadas de \*\*@([^*]+)\*\*\./g, '✅ Loaded **$1** equipped items from **@$2**.')
        .replace(/➖ Quitaste \*\*([^*]+)\*\* del probador\./g, '➖ Removed **$1** from the sandbox.')
        .replace(/👤 Avatar base cambiado a \*\*@([^*]+)\*\*\./g, '👤 Base avatar switched to **@$1**.')
        .replace(/✅ Equipado \*\*([^*]+)\*\* en el probador\./g, '✅ Equipped **$1** in the sandbox.')
        .replace(/Probar en mi Avatar \(2\.1\): #(\d+)/g, 'Try on My Avatar (2.1): #$1')
        .replace(/Probar en Mi Avatar \(2\.1\): #(\d+)/g, 'Try on My Avatar (2.1): #$1')
        .replace(/Avatar de @/g, 'Avatar of @')
        .replace(/### 🛍️ Cosméticos Recomendados para el Tono #(1|2|3)/g, '### 🛍️ Recommended Cosmetics for Tone #$1')
        .replace(/Buscar cosméticos con el Tono #(1|2|3)/g, 'Find cosmetics matching Tone #$1')
        .replace(/Explorar ([^c]+) compatibles con la muestra (`#[0-9A-Fa-f]+`)/g, 'Explore $1 matching sample $2')
        .replace(/-# Seleccioná qué parte del avatar o prenda querés combinar con el \*\*Tono #(1|2|3)\*\* (`#[0-9A-Fa-f]+`):/g, '-# Select which avatar part or garment you want to match with **Tone #$1** ($2):')
        .replace(/### 👻 Servidor #(\d+) — `([^`]+)` Jugadores/g, '### 👻 Server #$1 — `$2` Players')
        .replace(/Unirse #(\d+) \(([^)]+)\)/g, 'Join #$1 ($2)')
        .replace(/> 📭 \*\*No hay servidores parcialmente vacíos disponibles ahora para ([^*]+)\.\*\*/g, '> 📭 **No partially empty servers available right now for $1.**')
        .replace(/`(\d+)` pases/g, '`$1` passes')
        .replace(/🔎 \*\*Búsqueda activa:\*\* `"([^"]+)"` \(`(\d+)` resultado\/s\)/g, '🔎 **Active search:** `"$1"` (`$2` result/s)')
        .replace(/Todos \((\d+)\)/g, 'All ($1)')
        .replace(/Tienda Web \((\d+)\)/g, 'Web Store ($1)')
        .replace(/Dentro del Juego \((\d+)\)/g, 'In-Game ($1)')
        .replace(/Pág\. (\d+)\/(\d+)/g, 'Page $1/$2')
        .replace(/Cobra: ([^\s]+) Robux/g, 'Payout: $1 Robux')
        .replace(/\*\*Canjeaste (\d+) de (\d+) códigos \((\d+)%\)\*\*/g, '**You redeemed $1 of $2 codes ($3%)**')
        .replace(/✅ Código \*\*`([^`]+)`\*\* registrado y marcado como activo para \*\*([^*]+)\*\*\./g, '✅ Code **`$1`** registered and marked active for **$2**.')
        .replace(/# 🔔 3\.4 Alertas de Actualizaciones \(`(\d+\/\d+)`\)/g, '# 🔔 3.4 Game Update Alerts (`$1`)')
        .replace(/🔔 Enviada alerta de parche para \*\*(\d+)\*\* juego\(s\) actualizado\(s\)\./g, '🔔 Sent patch alert for **$1** updated game(s).')
        .replace(/✅ Suscripto a las alertas de parches de \*\*([^*]+)\*\*\./g, '✅ Subscribed to patch alerts for **$1**.')
        .replace(/Modo de Rendimiento \(([^)]+)\)/g, 'Performance Mode ($1)')
        .replace(/Modo Mantenimiento \(Desactivar\)/g, 'Maintenance Mode (Disable)')
        .replace(/Modo Mantenimiento \(Activar\)/g, 'Maintenance Mode (Enable)')
        .replace(/Editar Límites por Usuario \(([^)]+)\)/g, 'Edit User Limits ($1)')
        .replace(/Editar Intervalos de Escaneo \(([^)]+)\)/g, 'Edit Scan Intervals ($1)')
        .replace(/Login Web Discord \(Permitir Guardado Directo\)/g, 'Discord Web Login (Switch to Direct Save)')
        .replace(/Login Web Discord \(Exigir Login Web\)/g, 'Discord Web Login (Require Web OAuth)')
        .replace(/Pantalla de Carga por Filas \(Desactivar\)/g, 'Step-by-Step Loading Screen (Disable)')
        .replace(/Pantalla de Carga por Filas \(Activar\)/g, 'Step-by-Step Loading Screen (Enable)')
        .replace(/Suscribir Juego \(máx (\d+)\)/g, 'Subscribe Game (max $1)')
        .replace(/> Podés suscribir hasta \*\*(\d+) juegos\*\* presionando \*\*➕ Suscribir Juego\*\* abajo\./g, '> You can subscribe up to **$1 games** by pressing **➕ Subscribe Game** below.')
        .replace(/⚠️ Ya alcanzaste el máximo de (\d+) juegos suscriptos\./g, '⚠️ You have already reached the maximum of $1 subscribed games.')
        .replace(/⚠️ Alcanzaste el límite de (\d+) objetos en seguimiento\./g, '⚠️ You have reached the limit of $1 tracked items.')
        .replace(/Tu \*\*Mi Lista\*\* ya alcanzó el límite máximo de \*\*(\d+\/\d+)\*\* objetos\./g, 'Your **Watchlist** has reached the maximum limit of **$1** items.')
        .replace(/⚠️ El probador admite hasta \*\*(\d+) objetos simultáneos\*\*\. Usá \*\*➖ Quitar Último\*\* o \*\*🗑️ Vaciar Todo\*\* para agregar otro\./g, '⚠️ The sandbox supports up to **$1 simultaneous items**. Use **➖ Remove Last** or **🗑️ Clear All** to add another.')
        .replace(/Para gestionar tu lista personal de hasta (\d+) objetos en seguimiento y recibir avisos de bajada de precio, iniciá sesión con tu \*\*Cuenta de Discord\*\*\./g, 'To manage your personal watchlist of up to $1 tracked items and receive price drop alerts, sign in with your **Discord Account**.')
        .replace(/Cargando Fila (\d+) de (\d+)/g, 'Loading Row $1 of $2')
        .replace(/En Cola #(\d+)/g, 'Queued #$1')
        .replace(/Completado \(4\/4\)/g, 'Completed (4/4)')
        .replace(/¿No encontraste el grupo\?/g, 'Didn\'t find the group?')
        .replace(/Elegí entre (\d+) grupos encontrados para "([^"]+)"\.\.\./g, 'Choose from $1 groups found for "$2"...')
        .replace(/Mostrando (\d+) de (\d+) prendas del grupo — Elegí una para inspeccionar\.\.\./g, 'Showing $1 of $2 group items — Choose one to inspect...')
        .replace(/Ver en Roblox/g, 'View on Roblox')
        .replace(/Volver Atrás/g, 'Go Back');

    return out;
}

/**
 * Recorre y traduce recursivamente un árbol JSON de componentes de Discord (Components V2 o ActionRows)
 * según el idioma del usuario ('es' o 'en').
 */
function traducirNodoComponente(node, lang = 'es') {
    if (!node || typeof node !== 'object') return node;

    const raw = typeof node.toJSON === 'function' ? node.toJSON() : { ...node };

    if (typeof raw.content === 'string') {
        raw.content = traducirTexto(raw.content, lang);
    }
    if (typeof raw.label === 'string') {
        const maxLen = raw.type === 4 ? 45 : 80;
        raw.label = traducirTexto(raw.label, lang).slice(0, maxLen);
    }
    if (typeof raw.placeholder === 'string') {
        raw.placeholder = traducirTexto(raw.placeholder, lang).slice(0, 150);
    }
    if (typeof raw.description === 'string') {
        raw.description = traducirTexto(raw.description, lang).slice(0, 100);
    }
    if (typeof raw.title === 'string') {
        raw.title = traducirTexto(raw.title, lang).slice(0, 45);
    }

    if (Array.isArray(raw.options)) {
        raw.options = raw.options.map(opt => {
            const o = typeof opt.toJSON === 'function' ? opt.toJSON() : { ...opt };
            if (typeof o.label === 'string') o.label = traducirTexto(o.label, lang).slice(0, 100);
            if (typeof o.description === 'string') o.description = traducirTexto(o.description, lang).slice(0, 100);
            return o;
        });
    }

    if (raw.accessory && typeof raw.accessory === 'object') {
        raw.accessory = traducirNodoComponente(raw.accessory, lang);
    }

    if (Array.isArray(raw.components)) {
        raw.components = raw.components.map(child => traducirNodoComponente(child, lang));
    }

    return raw;
}

/**
 * Traduce un payload completo de respuesta de Discord (reply, editReply, update, followUp).
 */
function traducirPayloadDiscord(payload, lang = 'es') {
    if (!payload) return payload;
    if (typeof payload === 'string') {
        return traducirTexto(payload, lang);
    }
    if (typeof payload !== 'object') return payload;

    const cloned = { ...payload };
    if (typeof cloned.content === 'string') {
        cloned.content = traducirTexto(cloned.content, lang);
    }
    if (Array.isArray(cloned.components)) {
        cloned.components = cloned.components.map(comp => traducirNodoComponente(comp, lang));
    }
    return cloned;
}

/**
 * Traduce un ModalBuilder o JSON de modal antes de enviarlo con showModal.
 */
function traducirModalDiscord(modal, lang = 'es') {
    if (!modal) return modal;
    const raw = typeof modal.toJSON === 'function' ? modal.toJSON() : { ...modal };
    if (typeof raw.title === 'string') {
        raw.title = traducirTexto(raw.title, lang).slice(0, 45);
    }
    if (Array.isArray(raw.components)) {
        raw.components = raw.components.map(comp => traducirNodoComponente(comp, lang));
    }
    return raw;
}

function sanitizeInitialReplyPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    if (Array.isArray(payload.attachments) && payload.attachments.length === 0) {
        const copy = { ...payload };
        delete copy.attachments;
        return copy;
    }
    return payload;
}

/**
 * Envuelve una interacción de Discord para que todas sus respuestas (reply, editReply, update, followUp, showModal)
 * respeten automáticamente el idioma elegido por el usuario ('es' o 'en').
 */
function envolverInteraccionConI18n(interaction) {
    if (!interaction || interaction._i18nWrapped) return interaction;
    interaction._i18nWrapped = true;

    const userId = interaction.user?.id;
    const getLang = () => obtenerIdiomaUsuario(userId);

    if (typeof interaction.reply === 'function') {
        const origReply = interaction.reply.bind(interaction);
        interaction.reply = (payload) => origReply(sanitizeInitialReplyPayload(traducirPayloadDiscord(payload, getLang())));
    }
    if (typeof interaction.editReply === 'function') {
        const origEditReply = interaction.editReply.bind(interaction);
        interaction.editReply = (payload) => origEditReply(traducirPayloadDiscord(payload, getLang()));
    }
    if (typeof interaction.update === 'function') {
        const origUpdate = interaction.update.bind(interaction);
        interaction.update = (payload) => origUpdate(traducirPayloadDiscord(payload, getLang()));
    }
    if (typeof interaction.followUp === 'function') {
        const origFollowUp = interaction.followUp.bind(interaction);
        interaction.followUp = (payload) => origFollowUp(sanitizeInitialReplyPayload(traducirPayloadDiscord(payload, getLang())));
    }
    if (typeof interaction.showModal === 'function') {
        const origShowModal = interaction.showModal.bind(interaction);
        interaction.showModal = (modal) => origShowModal(traducirModalDiscord(modal, getLang()));
    }

    return interaction;
}

module.exports = {
    SUPPORTED_LANGUAGES,
    TIER_LABELS,
    obtenerPreferenciasUsuario,
    haSeleccionadoIdioma,
    obtenerIdiomaUsuario,
    obtenerIdiomaActual,
    ejecutarConContextoIdioma,
    guardarIdiomaUsuario,
    guardarPreferenciasUsuario,
    construirPanelSeleccionIdiomaInicial,
    traducirTexto,
    traducirPayloadDiscord,
    traducirModalDiscord,
    envolverInteraccionConI18n
};
