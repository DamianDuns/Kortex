// ==========================================
// ARCHIVO: commands/help.js
// Centro de Ayuda Interactiva de Comandos, Herramientas y Mecánicas (/help)
// ==========================================

const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags
} = require('discord.js');
const { COLORES, footer, separador } = require('../utils/ui');

const DOCS_URL = process.env.DOCS_URL || process.env.PUBLIC_GUIDE_URL || process.env.APP_URL || 'https://ais-dev-dmpwse4jqkfkz4vfkzt6pu-494677195769.us-west1.run.app';

const DETALLE_SUBCATEGORIAS_ROBLOX = {
    sub_economy: {
        titulo: '💰 `/roblox` — Categoría 1: Economía, Mercado y Precios',
        color: COLORES.primario,
        contenido:
            '### 🎯 1.1 Seguimiento de Precios y Mi Lista (`máx. 5`)\n' +
            '> • **Función:** Seguí hasta 5 activos (Catálogo, Limiteds, Gamepasses, Plugins en USD y Experiencias de Acceso Pago).\n' +
            '> • **Mecánica:** Genera gráficas históricas de evolución de precio y envía alertas automáticas por Mensaje Directo cuando el artículo baja de precio o alcanza tu meta.\n\n' +
            '### 🧮 1.2 Calculadoras Financieras (+40% Cashback)\n' +
            '> • **Función:** Tres calculadoras integradas: **Método del 40% Cashback de grupo**, **Comisiones de Mercado (10% / 20%)** y **Precios Regionales por País**.\n' +
            '> • **Mecánica:** Calcula al instante cuánto gastás, cuánto recuperás en el grupo y la equivalencia exacta de Robux en tu moneda local.\n\n' +
            '### 📉 1.3 Monitor de Pisos de Precio Dinámicos (UGC)\n' +
            '> • **Función:** Rastrea los precios mínimos oficiales de Roblox para Sombreros, Pelo, Cara, Cuello, Hombros, Frente, Espalda y Cintura.\n' +
            '> • **Mecánica:** Compara el piso actual contra el promedio semanal y renderiza una tabla visual indicando qué categorías bajaron hoy.\n\n' +
            '### ⏳ 1.4 Agenda y Alerta de Robux Pendientes\n' +
            '> • **Función:** Registra ventas de pases, ropa, limitados o fondos de grupo en espera de liberación.\n' +
            '> • **Mecánica:** Calcula la cuenta regresiva exacta de retención de Roblox y te envía una notificación directa apenas los Robux quedan disponibles.\n\n' +
            '### 🏛️ 1.5 Auditor y Catálogo de Grupos\n' +
            '> • **Función:** Inspecciona cualquier grupo de Roblox (propietario, miembros, fondos públicos y tienda completa).\n' +
            '> • **Mecánica:** Ordena las prendas por **Más Vendidas** o **Más Recientes**, muestra la ficha de cada prenda y calcula el ahorro del 40%.'
    },
    sub_avatar: {
        titulo: '👕 `/roblox` — Categoría 2: Taller de Avatares y Estudio 3D/2D',
        color: 0x8B5CF6,
        contenido:
            '### 🧪 2.1 Probador de Combinaciones en Vivo (Outfit Sandbox)\n' +
            '> • **Función:** Cotiza el valor real de tu avatar actual o permite probarte hasta 5 ítems del catálogo por nombre o ID.\n' +
            '> • **Mecánica:** Renderiza una tarjeta comparativa con el desglose de precios ítem por ítem y botones para enviar cualquiera a **Mi Lista**.\n\n' +
            '### 🔍 2.2 Buscador de Clones y Similares (Roblox Oficial + UGC)\n' +
            '> • **Función:** Encuentra alternativas económicas o versiones similares de cualquier accesorio o prenda.\n' +
            '> • **Mecánica:** Filtra entre ítems creados por **Roblox Oficial** y creadores **UGC**, calculando el porcentaje exacto de ahorro en Robux.\n\n' +
            '### 🧬 2.3 Extractor de Texturas + Maniquí 2D\n' +
            '> • **Función:** Extrae la plantilla `.PNG` original de cualquier camisa o pantalón clásico de Roblox.\n' +
            '> • **Mecánica:** Proyecta la textura sobre un maniquí 2D de **Frente y Espalda** para revisar costuras y permite descargar el archivo original.\n\n' +
            '### 📦 2.4 Exportador 3D (Render PNG HD + Archivo `.ZIP`)\n' +
            '> • **Función:** Exporta el modelo tridimensional de cualquier avatar de Roblox o activo del catálogo.\n' +
            '> • **Mecánica:** Entrega en el mismo panel el **Render PNG HD** visible en Discord y el paquete `.ZIP` descargable con geometría `.OBJ`, materiales `.MTL` y texturas.\n\n' +
            '### 🎨 2.5 Emparejador de Accesorios por Color (Color-Match)\n' +
            '> • **Función:** Extrae la paleta de los 3 colores dominantes de tu avatar, prenda o código HEX.\n' +
            '> • **Mecánica:** Busca automáticamente en el catálogo accesorios que combinen cromáticamente con tu estilo.'
    },
    sub_games: {
        titulo: '🎮 `/roblox` — Categoría 3: Utilidades de Juego y Servidores',
        color: 0x10B981,
        contenido:
            '### 👻 3.1 Buscador de Servidores Vacíos con Unión Directa\n' +
            '> • **Función:** Escanea las instancias públicas activas de cualquier juego de Roblox para encontrar servidores casi vacíos.\n' +
            '> • **Mecánica:** Ordena por menor cantidad de jugadores (1 a 2 personas) y mejor ping, incluyendo botones de unión directa en un clic.\n\n' +
            '### 🎟️ 3.2 Extractor Completo de Pases de un Juego\n' +
            '> • **Función:** Lista todos los Gamepasses de una experiencia (tanto de la Tienda Web como de la Tienda Interna).\n' +
            '> • **Mecánica:** Permite buscar pases por nombre o precio en Robux, ordenarlos y guardarlos en **Mi Lista**.\n\n' +
            '### 🎁 3.3 Bóveda de Códigos Activos con Checklist Personal\n' +
            '> • **Función:** Base de datos interactiva de códigos promocionales por juego.\n' +
            '> • **Mecánica:** Permite marcar qué códigos ya canjeaste en tu cuenta para llevar tu progreso personal o aportar nuevos códigos.\n\n' +
            '### 🔔 3.4 Avisos de Parches y Actualizaciones de Juegos\n' +
            '> • **Función:** Sigue hasta 3 experiencias favoritas para detectar cuándo sus desarrolladores suben un parche nuevo.\n' +
            '> • **Mecánica:** Compara el sello de versión del universo en tiempo real y te notifica apenas se publica una actualización.\n\n' +
            '### 🗺️ 3.5 Explorador de Sub-Lugares y Mapas Conectados\n' +
            '> • **Función:** Descubre la arquitectura interna de cualquier universo de Roblox.\n' +
            '> • **Mecánica:** Identifica el Place raíz y todos los sub-lugares ocultos (lobbies de tradeo, mapas de evento, arenas y servidores VIP).'
    },
    sub_account: {
        titulo: '🔐 `/roblox` — Centro de Vinculación de Cuenta de Roblox',
        color: 0x23A55A,
        contenido:
            '### 🎮 ¿Cómo funciona la Cuenta de Roblox en `/roblox`?\n' +
            '> Al pie del comando `/roblox` disponés de un botón dedicado exclusivamente a vincular o gestionar tu **Cuenta de Roblox**, la cual se utiliza en las funciones personales de tu avatar.\n\n' +
            '### 🔐 Opción 1: Conexión Oficial con Roblox OAuth 2.0\n' +
            '> • Autorizás tu perfil desde la página oficial de Roblox (`apis.roblox.com/oauth`).\n' +
            '> • El bot sincroniza tu estado en tiempo real con tus **Aplicaciones Autorizadas de Roblox**: si quitás el permiso desde los ajustes de Roblox y presionás **Comprobar Estado**, el bot lo detecta automáticamente.\n\n' +
            '### ✏️ Opción 2: Vinculación por Nombre o ID (Modo Básico)\n' +
            '> • Si preferís no usar OAuth, podés escribir directamente tu **Nombre de Usuario, ID numérico o enlace de perfil** de Roblox en un formulario rápido.\n' +
            '> • El bot resuelve tu perfil y miniatura al instante para autocompletar las herramientas.'
    }
};

const SECCIONES_PRINCIPALES_HELP = {
    cmd_overview: {
        titulo: '🏠 Resumen General de Comandos y Funciones del Bot',
        color: COLORES.primario,
        contenido:
            'Kortex está organizado en **comandos independientes por función** para que cada panel tenga su propio propósito claro:\n\n' +
            '### 🎮 Comando `/roblox` (o mención `@Kortex`)\n' +
            '> • **Qué es:** El panel central de herramientas de Roblox organizado en **3 Categorías seleccionables** con **15 utilidades interactivas**.\n' +
            '> • **Incluye:** Economía y Precios (`1.1` a `1.5`), Taller de Avatares 3D/2D (`2.1` a `2.5`), Juegos y Servidores (`3.1` a `3.5`) y el **Centro de Vinculación de Cuenta de Roblox**.\n\n' +
            '### ⚙️ Comando `/config`\n' +
            '> • **Qué es:** El panel de **Configuración por Categorías**.\n' +
            '> • **Incluye:** La categoría **🔗 Cuentas y Conexión** (para todos los usuarios, sincronizada con tus *Aplicaciones Autorizadas* de Discord) y la categoría **🛡️ Configuración y Moderación del Bot** (exclusiva para el propietario del bot para controlar el Motor RAM/GPU y las mecánicas generales).\n\n' +
            '### 🏓 Comando `/ping`\n' +
            '> • **Qué es:** El monitor técnico en tiempo real del bot y del servidor de alojamiento.\n' +
            '> • **Incluye:** Latencia de respuesta, ping del WebSocket de Discord, tiempo en línea (Uptime), servidores activos, RAM del proceso (`RSS`, `JS`, `Canvas/Caché`) y **RAM general del Contenedor / Host** de cualquier plataforma.\n\n' +
            '### 📚 Comando `/help`\n' +
            '> • **Qué es:** Este centro de documentación interactiva donde podés elegir cada comando arriba para explorar sus categorías y detalles.'
    },
    cmd_config: {
        titulo: '⚙️ Comando `/config` — Cuentas, Conexión y Moderación del Bot',
        color: 0x5865F2,
        contenido:
            'El comando `/config` funciona como un **Panel de Configuración por Categorías Seleccionables**:\n\n' +
            '### 🔗 Categoría 1: Cuentas y Conexión (Para Todos los Usuarios)\n' +
            '> • **Detección de sesión:** Reconoce automáticamente tu usuario de Discord actual.\n' +
            '> • **Conexión Oficial OAuth2:** Incluye el botón directo para autorizar o revalidar tu cuenta mediante Discord OAuth2.\n' +
            '> • **Sincronización con Aplicaciones Autorizadas:** Al presionar **🔄 Comprobar Conexión**, el bot consulta en vivo si la aplicación sigue autorizada en tus Ajustes de Discord.\n\n' +
            '### 🛡️ Categoría 2: Configuración y Moderación del Bot (Exclusivo Propietario)\n' +
            '> • **Motor de Optimización RAM / GPU:** Permite al propietario liberar memoria y cachés manualmente (**🧹 Optimizar Memoria**) y alternar el modo del motor (`Automático`, `Ahorro Estricto`, `Alto Rendimiento`).\n' +
            '> • **Control General de Mecánicas y Módulos:** Permite al propietario activar o pausar en tiempo real el **Modo Mantenimiento Global**, el **Sistema de Carga Paso a Paso**, las **Alertas en 2do Plano**, el **Motor Canvas/3D** y cada una de las **3 Categorías de Herramientas**.'
    },
    cmd_ping: {
        titulo: '🏓 Comando `/ping` — Estado, Latencia y Memoria General',
        color: 0x10B981,
        contenido:
            'El comando `/ping` brinda un diagnóstico técnico completo del rendimiento del bot y de la plataforma donde esté alojado:\n\n' +
            '### ⚡ Indicadores de Latencia y Salud de Conexión\n' +
            '> • **Respuesta (`ms`):** Tiempo exacto entre tu comando y la respuesta del bot.\n' +
            '> • **WebSocket API (`ms`):** Latencia en vivo con el Gateway de Discord.\n' +
            '> • **Semáforo automático:** Clasifica el estado en 🟢 **Excelente** (`< 200ms`), 🟡 **Estable** (`< 400ms`) o 🔴 **Lenta** (`+400ms`).\n\n' +
            '### 💾 Desglose de Memoria (Proceso + Contenedor / Host General)\n' +
            '> • **RAM Proceso (Bot):** Muestra la memoria `RSS` total del bot, separando el motor JavaScript (`Heap`) de la memoria nativa usada por renderizados gráficos (`Canvas/Caché`).\n' +
            '> • **📦 RAM Contenedor / Host (Universal):** Lee automáticamente los límites y consumo real del contenedor Linux (`cgroup v1 / v2`) o del sistema operativo del servidor (`os.totalmem()`), mostrando los `MB` usados, el límite total y el porcentaje (`%`) sin importar en qué plataforma alojes el bot.\n' +
            '> • **Botón 🔄 Actualizar:** Permite recalcular todas las métricas en vivo dentro del mismo mensaje.'
    }
};

/**
 * Construye el panel interactivo de /help.
 * @param {string} mainCategory 'cmd_overview' | 'cmd_roblox' | 'cmd_config' | 'cmd_ping'
 * @param {string} robloxSubCategory 'sub_economy' | 'sub_avatar' | 'sub_games' | 'sub_account'
 */
function construirPanelHelp(mainCategory = 'cmd_overview', robloxSubCategory = 'sub_economy') {
    // Compatibilidad si se pasa directamente 'cat_economy', 'cat_avatar', 'cat_games'
    if (mainCategory === 'cat_economy') {
        mainCategory = 'cmd_roblox';
        robloxSubCategory = 'sub_economy';
    } else if (mainCategory === 'cat_avatar') {
        mainCategory = 'cmd_roblox';
        robloxSubCategory = 'sub_avatar';
    } else if (mainCategory === 'cat_games') {
        mainCategory = 'cmd_roblox';
        robloxSubCategory = 'sub_games';
    }

    const validMainKeys = ['cmd_overview', 'cmd_roblox', 'cmd_config', 'cmd_ping'];
    const activeMain = validMainKeys.includes(mainCategory) ? mainCategory : 'cmd_overview';

    const validSubKeys = ['sub_economy', 'sub_avatar', 'sub_games', 'sub_account'];
    const activeSub = validSubKeys.includes(robloxSubCategory) ? robloxSubCategory : 'sub_economy';

    const vistaActual = activeMain === 'cmd_roblox'
        ? DETALLE_SUBCATEGORIAS_ROBLOX[activeSub]
        : SECCIONES_PRINCIPALES_HELP[activeMain];

    const container = new ContainerBuilder().setAccentColor(vistaActual.color);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '# 📚 Centro de Ayuda y Documentación — Kortex\n' +
        'Seleccioná un **comando del bot** en el menú desplegable para consultar sus herramientas, categorías y funciones.'
    ));

    // Menú desplegable 1: Selección de Comando del Bot
    const selectMainHelp = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('📂 Elegí un comando del bot para ver sus detalles...')
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel('Resumen General de Comandos del Bot')
                .setDescription('Vista general de /roblox, /config, /ping, /help y mención @Kortex')
                .setValue('cmd_overview')
                .setEmoji('🏠')
                .setDefault(activeMain === 'cmd_overview'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Comando /roblox — 15 Herramientas y Cuenta Roblox')
                .setDescription('Economía, Avatares 3D/2D, Juegos y Vinculación de Cuenta de Roblox')
                .setValue('cmd_roblox')
                .setEmoji('🎮')
                .setDefault(activeMain === 'cmd_roblox'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Comando /config — Configuración de Usuario y Conexión')
                .setDescription('Categoría Cuentas y Conexión, autorización Discord OAuth2 y estado')
                .setValue('cmd_config')
                .setEmoji('⚙️')
                .setDefault(activeMain === 'cmd_config'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Comando /ping — Latencia, Estado y RAM del Host')
                .setDescription('Medición de respuesta, WebSocket, RAM del bot y memoria del contenedor')
                .setValue('cmd_ping')
                .setEmoji('🏓')
                .setDefault(activeMain === 'cmd_ping')
        ]);

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMainHelp));

    // Si el usuario seleccionó el comando /roblox, mostramos el segundo selector para explorar sus 3 categorías + vinculación
    if (activeMain === 'cmd_roblox') {
        const selectRobloxSub = new StringSelectMenuBuilder()
            .setCustomId('help_roblox_subcat_select')
            .setPlaceholder('🎮 Elegí qué categoría de /roblox querés inspeccionar...')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel('Categoría 1: Economía, Mercado y Precios (5 herramientas)')
                    .setDescription('1.1 Precios y Mi Lista, 1.2 Calculadoras, 1.3 Pisos UGC, 1.4 Pendientes, 1.5 Grupos')
                    .setValue('sub_economy')
                    .setEmoji('💰')
                    .setDefault(activeSub === 'sub_economy'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Categoría 2: Taller de Avatares y Estudio 3D/2D (5 herramientas)')
                    .setDescription('2.1 Sandbox, 2.2 Similares, 2.3 Texturas 2D, 2.4 Exportador 3D, 2.5 Color-Match')
                    .setValue('sub_avatar')
                    .setEmoji('👕')
                    .setDefault(activeSub === 'sub_avatar'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Categoría 3: Utilidades de Juego y Servidores (5 herramientas)')
                    .setDescription('3.1 Servidores Vacíos, 3.2 Pases, 3.3 Códigos, 3.4 Parches, 3.5 Sub-Lugares')
                    .setValue('sub_games')
                    .setEmoji('🎮')
                    .setDefault(activeSub === 'sub_games'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Centro de Vinculación de Cuenta de Roblox')
                    .setDescription('Cómo conectar tu cuenta con Roblox OAuth 2.0 o por Nombre/ID en /roblox')
                    .setValue('sub_account')
                    .setEmoji('🔐')
                    .setDefault(activeSub === 'sub_account')
            ]);

        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectRobloxSub));
    }

    container.addSeparatorComponents(separador(true));

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## ${vistaActual.titulo}\n\n${vistaActual.contenido}`
    ));

    container.addSeparatorComponents(separador(true));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Guía Web Oficial')
                .setEmoji('🌐')
                .setStyle(ButtonStyle.Link)
                .setURL(DOCS_URL)
        )
    );

    container.addSeparatorComponents(separador());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Comandos: /roblox • /config • /ping • /help')
    ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Muestra la guía interactiva de comandos (/roblox, /config, /ping), herramientas y mecánicas del bot.'),

    construirPanelHelp,

    async execute(interaction) {
        await interaction.reply(construirPanelHelp('cmd_overview'));
    }
};
