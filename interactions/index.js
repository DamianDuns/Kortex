// ==========================================
// ARCHIVO: interactions/index.js
// ==========================================

const fs = require('fs');
const path = require('path');
const { MessageFlags } = require('discord.js');

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
    return {
        botones: [...buttons.keys()],
        selects: [...selects.keys()],
        modales: [...modals.keys()],
        total: buttons.size + selects.size + modals.size
    };
}

async function routerInteracciones(interaction) {
    let mapa = null;

    if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu()) mapa = selects;
    else if (interaction.isButton()) mapa = buttons;
    else if (interaction.isModalSubmit()) mapa = modals;

    if (!mapa) return;

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

    // Ordenamos los prefijos de más largo a más corto para que los prefijos
    // específicos (ej: "btn_save_no_target:") se evalúen antes que los
    // genéricos (ej: "btn_") y no se los "coma" el handler equivocado.
    const prefijosOrdenados = [...mapa.entries()].sort((a, b) => b[0].length - a[0].length);

    for (const [prefix, handler] of prefijosOrdenados) {
        if (interaction.customId.startsWith(prefix)) {
            await handler.execute(interaction);
            return;
        }
    }
}

routerInteracciones.obtenerResumenHandlers = obtenerResumenHandlers;
module.exports = routerInteracciones;
