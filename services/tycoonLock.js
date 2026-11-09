// ==========================================
// ARCHIVO: services/tycoonLock.js
// Exclusión mutua por usuario para /tycoon (anti-duplicación).
// Serializa toda operación de lectura-modificación-escritura sobre un mismo perfil,
// de modo que dos clics simultáneos nunca puedan acreditar o consumir dos veces.
// Es reentrante: una operación bloqueada puede llamar a otra del mismo usuario sin deadlock.
// ==========================================

const { AsyncLocalStorage } = require('node:async_hooks');

const heldLocks = new AsyncLocalStorage();
const queueTails = new Map();

/**
 * Ejecuta `fn` con el perfil del usuario bloqueado. Las llamadas concurrentes del mismo
 * usuario se encolan en orden de llegada; usuarios distintos no se bloquean entre sí.
 */
async function withUserLock(userId, fn) {
    const key = String(userId);
    const held = heldLocks.getStore();
    if (held && held.has(key)) {
        return fn();
    }

    const previous = queueTails.get(key) || Promise.resolve();
    let release;
    const gate = new Promise(resolve => {
        release = resolve;
    });
    const tail = previous.then(() => gate);
    queueTails.set(key, tail);

    await previous;
    const nextHeld = new Set(held || []);
    nextHeld.add(key);

    try {
        return await heldLocks.run(nextHeld, fn);
    } finally {
        release();
        if (queueTails.get(key) === tail) {
            queueTails.delete(key);
        }
    }
}

/**
 * Envuelve una función `(userId, ...args)` para que siempre corra bajo el lock del usuario.
 */
function locked(fn) {
    return function lockedFn(userId, ...args) {
        return withUserLock(userId, () => fn(userId, ...args));
    };
}

module.exports = { withUserLock, locked };
