const collectBossBattleAnnouncements = (logs, announcements, separated) => {
    for (const line of logs) {
        if (separated.has(line))
            continue;
        const event = line.startsWith('&独劫焚身·血脉同源&')
            ? { code: 'mother_solo', kind: 'phase', title: '独劫焚身', description: line.slice('&独劫焚身·血脉同源&'.length) }
            : line.startsWith('&灾劫预兆&')
                ? { code: 'mother_disaster_chant', kind: 'chant', title: '灾劫预兆', description: line.slice('&灾劫预兆&'.length) }
                : line.includes('$骨龙咏唱$')
                    ? { code: 'uzz_dragon_chant', kind: 'chant', title: '死之荣耀·咏唱', description: '乌兹高举法杖，低沉的咏唱响彻墓地。巨大的召唤阵正在凝结，白骨巨翼的影子从幽光深处缓缓浮现。' }
                    : null;
        if (!event)
            continue;
        announcements.push({ ...event, dialogue: [], effect: '' });
        separated.add(line);
    }
};

export { collectBossBattleAnnouncements };
