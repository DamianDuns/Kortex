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
        const rawContent = (message.content || '').trim();
        const lowerContent = rawContent.toLowerCase();

        // Soporte directo para prefijo !roblox (ej. en DM o servidores con MessageContent)
        if (lowerContent === '!roblox' || lowerContent.startsWith('!roblox ')) {
            const robloxCommand = message.client.commands.get('roblox');
            if (robloxCommand && typeof robloxCommand.executePrefix === 'function') {
                return await robloxCommand.executePrefix(message);
            }
            return await message.reply(construirMenuPrincipal(message.author.id));
        }

        if (!message.mentions.has(clientUser, { ignoreEveryone: true, ignoreRoles: true })) {
            return;
        }

        const texto = rawContent
            .replace(new RegExp(`<@!?${clientUser.id}>`, 'g'), '')
            .trim()
            .toLowerCase();

        // 1. @Kortex ping -> mismo panel que /ping
        if (texto === 'ping' || texto === '!ping') {
            const latencia = Math.max(0, Date.now() - message.createdTimestamp);
            return await message.reply(construirPanelPing(message.client, latencia));
        }

        // 2. @Kortex help -> Abre la guía
        if (texto === 'help' || texto === 'ayuda' || texto === '!help') {
            const helpCommand = message.client.commands.get('help');
            if (helpCommand) {
                return await helpCommand.execute(message);
            }
        }

        // 3. @Kortex solo, @Kortex roblox o @Kortex !roblox -> Abre el Action Hub directo
        const robloxCommand = message.client.commands.get('roblox');
        if (robloxCommand && typeof robloxCommand.executePrefix === 'function') {
            return await robloxCommand.executePrefix(message);
        }
        const hub = construirMenuPrincipal(message.author.id);
        await message.reply(hub);
    }
};