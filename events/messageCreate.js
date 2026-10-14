// ==========================================
// ARCHIVO: events/messageCreate.js
// ==========================================

const { Events } = require('discord.js');
const { construirMenuPrincipal } = require('../interactions/buttons/navigation');
const { construirPanelPing } = require('../commands/ping');

module.exports = {
    name: Events.MessageCreate,

    async execute(message) {
        if (message.author.bot) return;

        const clientUser = message.client.user;

        if (!message.mentions.has(clientUser, { ignoreEveryone: true, ignoreRoles: true })) {
            return;
        }

        const texto = message.content
            .replace(new RegExp(`<@!?${clientUser.id}>`, 'g'), '')
            .trim()
            .toLowerCase();

        // 1. @Kortex ping -> mismo panel que /ping
        if (texto === 'ping') {
            const latencia = Math.max(0, Date.now() - message.createdTimestamp);
            return await message.reply(construirPanelPing(message.client, latencia));
        }

        // 2. @Kortex help -> Abre la guía
        if (texto === 'help' || texto === 'ayuda') {
            const helpCommand = message.client.commands.get('help');
            if (helpCommand) {
                // Simula la llamada pasando el mensaje con reply
                return await helpCommand.execute(message);
            }
        }

        // 3. @Kortex solo o @Kortex roblox -> Abre el Action Hub directo
        const hub = construirMenuPrincipal(message.author.id);
        await message.reply(hub);
    }
};