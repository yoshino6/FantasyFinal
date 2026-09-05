const nativeCleanseLimit = (code) => ({ saint_healer_absolution_hand: 2, saint_healer_revival_sanctuary: 1, summoner_returning_veil: 1, dawn_judgment_litany: 1, purifying_light: 2 }[code] ?? Infinity);
const protectedControlCodes = new Set(['petrify', 'charm']);
const canDispelCombatEffect = (code, authority = 'ordinary', mechanismLocked = false) => {
    if (authority === 'mechanism')
        return true;
    if (mechanismLocked || code === 'nightmare')
        return false;
    return authority === 'holy' || !protectedControlCodes.has(code);
};

export { canDispelCombatEffect, nativeCleanseLimit, protectedControlCodes };
