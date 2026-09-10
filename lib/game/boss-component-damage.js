const installBossComponentDamage = (rules, bodyByPart) => {
    let area;
    const unitFor = (key) => rules.units.find(unit => unit.key === key);
    const bodies = new Set(bodyByPart.values());
    const multiplier = (body) => Math.pow(.7, [...bodyByPart].filter(([part, parent]) => parent === body.key && Number(unitFor(part)?.hp ?? 0) > 0).length);
    const reduction = (body) => (1 - Math.max(0, Math.min(80, rules.value(body, 'barrier'))) / 100)
        * (1 - Math.max(0, Math.min(80, rules.value(body, 'reduction') + Number(body.modifiers?.damageReductionPct ?? 0))) / 100);
    const transmit = async (body, damage) => {
        if (body.hp <= 0 || damage <= 0)
            return;
        const before = body.hp;
        const absorbed = await rules.takeUnlinked(body, damage);
        rules.log.push(`　&部位传伤&【${body.name}】受到 ${damage} 点伤害${absorbed ? `（护盾吸收 ${absorbed}）` : ''}（${before}→${body.hp}）。`);
    };
    rules.hooks.bodyMultiplier = body => area?.multipliers.get(body.key) ?? multiplier(body);
    rules.hooks.linkDamage = async (target, damage, apply, areaHit) => {
        const batch = areaHit ? area : undefined;
        if (batch && bodies.has(target.key)) {
            const linked = batch.candidates.get(target.key) ?? 0;
            batch.candidates.delete(target.key);
            if (linked > 0)
                rules.log.push(`　&群攻合算&【${target.name}】直击 ${damage}／部位传伤 ${linked}，取较高值一次。`);
            return apply(Math.max(damage, linked));
        }
        const body = unitFor(bodyByPart.get(target.key) ?? '');
        const factor = body ? (batch?.multipliers.get(body.key) ?? multiplier(body)) * (batch?.reductions.get(body.key) ?? reduction(body)) : 0;
        const before = target.hp;
        const result = await apply(damage);
        if (!body || body.hp <= 0)
            return result;
        const linked = Math.max(0, Math.floor(Math.max(0, before - target.hp) * factor + 1e-9));
        if (batch)
            batch.candidates.set(body.key, Math.max(batch.candidates.get(body.key) ?? 0, linked));
        else
            await transmit(body, linked);
        return result;
    };
    rules.hooks.areaDamage = async (targets, hit) => {
        const previous = area;
        const batch = { multipliers: new Map(), reductions: new Map(), candidates: new Map() };
        for (const key of bodies) {
            const body = unitFor(key);
            if (body) {
                batch.multipliers.set(key, multiplier(body));
                batch.reductions.set(key, reduction(body));
            }
        }
        area = batch;
        try {
            const ordered = [...new Map(targets.map(target => [target.key, target])).values()].sort((a, b) => Number(bodies.has(a.key)) - Number(bodies.has(b.key)));
            for (const target of ordered)
                if (target.hp > 0 && target.participating !== false)
                    await hit(target);
            for (const [key, damage] of batch.candidates) {
                const body = unitFor(key);
                if (body)
                    await transmit(body, damage);
            }
        }
        finally {
            area = previous;
        }
    };
};

export { installBossComponentDamage };
