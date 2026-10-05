// ==========================================
// ARCHIVO: utils/http.js
// ==========================================

const axios = require('axios');

const robloxClient = axios.create({
    timeout: 6000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
});

async function fetchWithRetry(url, options = {}, retries = 3, backoff = 1000) {
    try {
        const method = options.method || 'get';
        return await robloxClient({ url, method, ...options });
    } catch (error) {
        const status = error.response?.status;
        if (retries > 0 && (!status || status === 429 || status >= 500)) {
            await new Promise(res => setTimeout(res, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw error;
    }
}

module.exports = { robloxClient, fetchWithRetry };
