let fallbackIdCounter = 0;

const getCryptoObject = () => {
    if (typeof globalThis === 'undefined') return null;
    return globalThis.crypto || null;
};

export const secureRandomFloat = () => {
    const cryptoObj = getCryptoObject();
    if (cryptoObj?.getRandomValues) {
        const values = new Uint32Array(1);
        cryptoObj.getRandomValues(values);
        return values[0] / 0xFFFFFFFF;
    }

    // Non-crypto fallback for non-browser/test contexts.
    const now = Date.now();
    const seed = (now ^ (now >>> 7) ^ (now >>> 13)) >>> 0;
    return seed / 0xFFFFFFFF;
};

const toHex = (bytes) => Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');

export const createClientId = (prefix = 'id') => {
    const cryptoObj = getCryptoObject();

    if (cryptoObj?.randomUUID) {
        return `${prefix}-${cryptoObj.randomUUID()}`;
    }

    if (cryptoObj?.getRandomValues) {
        const bytes = new Uint8Array(12);
        cryptoObj.getRandomValues(bytes);
        return `${prefix}-${toHex(bytes)}`;
    }

    fallbackIdCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
};
