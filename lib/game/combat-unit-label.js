const combatUnitLabel = (unit) => unit.companion || unit.npc_code || unit.key?.startsWith('automaton:') ? `〖${unit.name}〗` : `【${unit.name}】`;

export { combatUnitLabel };
