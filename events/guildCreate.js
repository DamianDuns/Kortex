// ==========================================
// ARCHIVO: events/guildCreate.js
// Sistema Interactivo de Bienvenida para Nuevos Servidores (Components V2)
// ==========================================

const {
    Events,
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ChannelType,
    PermissionFlagsBits
} = require('discord.js');
const supabase = require('../db');
const logger = require('../utils/logger');
const { COLORES, footer, separador } = require('../utils/ui');

const DOCS_URL = process.env.DOCS_URL || process.env.PUBLIC_GUIDE_URL || process.env.APP_URL || 'https://ais-dev-dmpwse4jqkfkz4vfkzt6pu-494677195769.us-west1.run.app';

const SECCIONES_TOUR_BIENVENIDA = {
    overview: {
        color: COLORES.primario,
        subtitulo: '👋 Comandos Principales',
        contenido: (guildName, memberCount) =>
            `¡Gracias por sumar a **Kortex** a **${guildName}**${memberCount ? ` (\`${memberCount.toLocaleString('es-AR')}\` miembros)` : ''}!\n\n` +
            '> • **`/roblox`** *(o mencionar `@Kortex`)* — Panel de herramientas de Roblox (**Economía**, **Avatares 3D/2D** y **Juegos y Servidores**).\n' +
            '> • **`/config`** — Configuración de cuentas vinculadas, datos guardados, **idioma** y región de precios.\n' +
            '> • **`/help`** — Guía interactiva de comandos y herramientas.\n' +
            '> • **`/ping`** — Estado y latencia del bot en tiempo real.'
    },
    cat_economy: {
        color: COLORES.sniper,
        subtitulo: '💰 Categoría 1: Economía y Precios',
        contenido: () =>
            '> 🎯 **1.1 Seguimiento de Precios y Mi Lista:** Monitoreá hasta 5 objetos con gráficas e historial de precios + alertas.\n' +
            '> 🧮 **1.2 Calculadora de Economía:** Calculá descuentos de grupo, Roblox Plus y precios regionales.\n' +
            '> 📉 **1.3 Pisos de Precio del Catálogo:** Consultá los precios mínimos actuales por categoría de accesorios.\n' +
            '> ⏳ **1.4 Agenda de Robux Pendientes:** Registrá tus ventas y recibí un aviso cuando se liberen tus Robux.\n' +
            '> 🏛️ **1.5 Auditor y Catálogo de Grupos:** Explorá cualquier grupo de Roblox y su tienda de ropa.'
    },
    cat_avatar: {
        color: 0x8B5CF6,
        subtitulo: '👕 Categoría 2: Avatares y Estudio 3D/2D',
        contenido: () =>
            '> 🧪 **2.1 Probador de Ropa en Vivo:** Cotizá tu avatar actual o probate hasta 5 objetos del catálogo.\n' +
            '> 🔍 **2.2 Buscador de Clones y Similares:** Encontrá versiones más económicas e ítems parecidos.\n' +
            '> 🧬 **2.3 Extractor de Texturas y Maniquí 2D:** Descargá la plantilla `.PNG` de camisas y pantalones y probala en un maniquí.\n' +
            '> 📦 **2.4 Exportador de Modelos 3D:** Descargá el render PNG y el paquete `.ZIP` con el modelo 3D.\n' +
            '> 🎨 **2.5 Combinador por Color:** Extraé los colores de tu avatar o prenda y buscá accesorios que combinen.'
    },
    cat_games: {
        color: 0x10B981,
        subtitulo: '🕹️ Categoría 3: Juegos y Servidores',
        contenido: () =>
            '> 👻 **3.1 Buscador de Servidores Vacíos:** Encontrá servidores con pocos jugadores y unión directa.\n' +
            '> 🎟️ **3.2 Buscador de Pases de Juego:** Consultá y ordená por precio todos los pases de un juego.\n' +
            '> 🎁 **3.3 Bóveda de Códigos Activos:** Consultá códigos promocionales y marcá los que ya canjeaste.\n' +
            '> 🔔 **3.4 Alertas de Actualizaciones:** Seguí hasta 3 juegos favoritos y recibí avisos de parches.\n' +
            '> 🗺️ **3.5 Explorador de Mapas Conectados:** Descubrí los sub-lugares y mundos dentro de cualquier juego.'
    },
    oauth_setup: {
        color: COLORES.exito,
        subtitulo: '🔗 Cuentas de Discord y Roblox',
        contenido: () =>
            '> 💬 **Cuenta de Discord (`/config`):** Conectala para guardar tu lista de precios, Robux pendientes, códigos y alertas.\n' +
            '> 🎮 **Cuenta de Roblox (`/roblox` o `/config`):** Vinculala para cargar automáticamente tu avatar en el Probador de Ropa, el Exportador 3D y el Combinador por Color.'
    }
};

/**
 * Construye el panel interactivo de bienvenida de Kortex (Components V2).
 * @param {import('discord.js').Guild | null} guild
 * @param {string} activeTab 'overview' | 'cat_economy' | 'cat_avatar' | 'cat_games' | 'oauth_setup'
 */
function construirPanelBienvenidaServidor(guild, activeTab = 'overview') {
    const tabKey = SECCIONES_TOUR_BIENVENIDA[activeTab] ? activeTab : 'overview';
    const seccion = SECCIONES_TOUR_BIENVENIDA[tabKey];

    const guildName = guild?.name || 'tu servidor';
    const memberCount = Number(guild?.memberCount || 0);

    const iconUrl =
        (typeof guild?.iconURL === 'function' && guild.iconURL({ extension: 'png', size: 256 })) ||
        (typeof guild?.client?.user?.displayAvatarURL === 'function' && guild.client.user.displayAvatarURL({ extension: 'png', size: 256 })) ||
        null;

    const headerText = new TextDisplayBuilder().setContent(
        `# ✨ ¡Kortex ya está activo en ${guildName}!\n` +
        `## ${seccion.subtitulo}\n\n` +
        seccion.contenido(guildName, memberCount)
    );

    const container = new ContainerBuilder().setAccentColor(seccion.color);

    if (iconUrl && /^https?:\/\//i.test(iconUrl)) {
        const headerSection = new SectionBuilder()
            .addTextDisplayComponents(headerText)
            .setThumbnailAccessory(thumb => thumb.setURL(iconUrl));
        container.addSectionComponents(headerSection);
    } else {
        container.addTextDisplayComponents(headerText);
    }

    container.addSeparatorComponents(separador(true));

    // Selector interactivo de recorrido rápido de bienvenida
    const selectTour = new StringSelectMenuBuilder()
        .setCustomId('welcome_tour_select')
        .setPlaceholder('🧭 Explorá las categorías del bot...')
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel('Comandos Principales')
                .setDescription('Vista general de /roblox, /config, /help y /ping')
                .setValue('overview')
                .setEmoji('👋')
                .setDefault(tabKey === 'overview'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Categoría 1: Economía y Precios')
                .setDescription('Seguimiento de Precios, Calculadora, Pisos, Robux Pendientes y Grupos')
                .setValue('cat_economy')
                .setEmoji('💰')
                .setDefault(tabKey === 'cat_economy'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Categoría 2: Avatares y Estudio 3D/2D')
                .setDescription('Probador de Ropa, Clones, Texturas 2D, Exportador 3D y Color-Match')
                .setValue('cat_avatar')
                .setEmoji('👕')
                .setDefault(tabKey === 'cat_avatar'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Categoría 3: Juegos y Servidores')
                .setDescription('Servidores Vacíos, Pases, Códigos, Alertas y Mapas')
                .setValue('cat_games')
                .setEmoji('🕹️')
                .setDefault(tabKey === 'cat_games'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Cuentas de Discord y Roblox')
                .setDescription('Cómo vincular tus cuentas para alertas y funciones de avatar')
                .setValue('oauth_setup')
                .setEmoji('🔗')
                .setDefault(tabKey === 'oauth_setup')
        ]);

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectTour));

    const rowBotones = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_welcome_open_roblox')
            .setLabel('Abrir /roblox')
            .setEmoji('🎮')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('btn_welcome_open_config')
            .setLabel('Configuración (/config)')
            .setEmoji('⚙️')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('btn_welcome_open_help')
            .setLabel('Ayuda (/help)')
            .setEmoji('📚')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('btn_welcome_open_ping')
            .setLabel('Estado (/ping)')
            .setEmoji('🏓')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setLabel('Guía Web')
            .setEmoji('🌐')
            .setStyle(ButtonStyle.Link)
            .setURL(DOCS_URL)
    );

    container.addActionRowComponents(rowBotones);
    container.addSeparatorComponents(separador());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Comandos: /roblox • /config • /help • /ping')
    ));

    return {
        embeds: [],
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

/**
 * Busca el mejor canal de texto disponible para enviar el mensaje de bienvenida.
 * Prioriza el canal del sistema y luego canales con nombres de bienvenida/general/chat/comandos.
 */
function resolverCanalBienvenida(guild) {
    const me = guild?.members?.me;
    if (!me) return null;

    const puedeEscribir = (channel) => {
        if (!channel || channel.type !== ChannelType.GuildText) return false;
        const perms = channel.permissionsFor(me);
        return Boolean(
            perms &&
            perms.has(PermissionFlagsBits.ViewChannel) &&
            perms.has(PermissionFlagsBits.SendMessages)
        );
    };

    if (puedeEscribir(guild.systemChannel)) {
        return guild.systemChannel;
    }

    const canalesTexto = [...guild.channels.cache.values()]
        .filter(puedeEscribir)
        .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));

    if (canalesTexto.length === 0) return null;

    const palabrasClavePrioritarias = [
        'bienvenida',
        'welcome',
        'general',
        'chat',
        'inicio',
        'comandos',
        'commands',
        'bots',
        'kortex'
    ];

    for (const keyword of palabrasClavePrioritarias) {
        const match = canalesTexto.find(ch => String(ch.name || '').toLowerCase().includes(keyword));
        if (match) return match;
    }

    return canalesTexto[0];
}

module.exports = {
    name: Events.GuildCreate,
    construirPanelBienvenidaServidor,
    async execute(guild) {
        logger.info('GUILD JOIN', `Kortex fue añadido al servidor: ${guild.name} (ID: ${guild.id})`);

        const registroServidor = {
            guild_id: String(guild.id),
            name: String(guild.name || 'Servidor'),
            joined_at: new Date().toISOString()
        };

        try {
            const { error } = await supabase
                .from('guilds')
                .upsert([registroServidor], { onConflict: 'guild_id' });

            if (error) {
                await supabase.memoryFrom('guilds').upsert([registroServidor], { onConflict: 'guild_id' });
                logger.warn('GUILD SYNC', `Guardado en memoria local para ${guild.name} (${error.message})`);
            } else {
                logger.success('GUILD SYNC', `Servidor ${guild.name} sincronizado en la base de datos.`);
            }
        } catch (err) {
            await supabase.memoryFrom('guilds').upsert([registroServidor], { onConflict: 'guild_id' });
            logger.warn('GUILD SYNC', `Respaldo en memoria aplicado para ${guild.name}: ${err.message}`);
        }

        const targetChannel = resolverCanalBienvenida(guild);

        if (!targetChannel) {
            logger.warn('BIENVENIDA', `No se encontraron canales con permisos de lectura/escritura en ${guild.name}.`);
            return;
        }

        try {
            const panelBienvenida = construirPanelBienvenidaServidor(guild, 'overview');
            await targetChannel.send(panelBienvenida);
            logger.success('BIENVENIDA', `Panel interactivo de bienvenida enviado en #${targetChannel.name} (${guild.name}).`);
        } catch (error) {
            logger.error('BIENVENIDA', `Error al enviar el panel de bienvenida en ${guild.name}: ${error.message}`);
        }
    }
};