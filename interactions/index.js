// ==========================================
// ARCHIVO: interactions/index.js
// ==========================================

const fs = require('fs');
const path = require('path');

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

    if (interaction.isStringSelectMenu()) mapa = selects;
    else if (interaction.isButton()) mapa = buttons;
    else if (interaction.isModalSubmit()) mapa = modals;

    if (!mapa) return;

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
