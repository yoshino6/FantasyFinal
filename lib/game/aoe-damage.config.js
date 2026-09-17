const aoeDamageProfiles = {
    automaton_N007: { power: 78, reason: '三目标横扫' },
    automaton_N018: { power: 78, reason: '三目标群伤' },
    automaton_S019: { power: 196, reason: '三目标资源爆发' },
    automaton_S020: { power: 168, reason: '三目标减速' },
    automaton_S026: { power: 266, reason: '蓄力三目标爆发' },
    automaton_S031: { power: 420, secondaryPower: 273, reason: '主目标420，副目标273' },
    device_simple_launcher_fire: { power: 140, reason: '充能群伤' },
    device_frost_pulse: { power: 60, reason: '充能群减速' },
    device_electromagnetic_coil_fire: { power: 117, reason: '充能群易伤' },
    device_reactor_overcharge: { power: 173, reason: '充能与自损爆发' },
    goblin_player_volatile_flask: { power: 82, reason: '常规群伤' },
    goblin_player_rockfall: { power: 93, reason: '群控' },
    bulwark_bastion_judgment: { power: 137, reason: '资源爆发与保护' },
    warlord_quake_command: { power: 85, reason: '群减速' },
    warlord_hundred_battle_sweep: { power: 146, reason: '资源爆发' },
    elementalist_storm_chain: { power: 88, reason: '群印记' },
    elementalist_sky_sequence: { power: 139, reason: '资源爆发' },
    spellblade_spellbreak_whirl: { power: 95, reason: '资源消耗' },
    venomancer_corrosion_mist: { power: 81, reason: '群减防与毒' },
    dawn_daybreak_decree: { power: 130, reason: '资源爆发与驱散' },
    wolfking_trample: { power: 81, reason: '常规群伤' },
    black_slime_wave: { power: 83, reason: '常规群伤' },
    black_slime_bind: { power: 90, reason: '群控' },
    skeleton_quake: { power: 96, reason: '群减益' },
    death_knight_cleave: { power: 103, reason: '常规群伤' },
    death_knight_prison: { power: 102, reason: '群控' },
    necromancer_storm: { power: 101, reason: '常规群伤' },
    necromancer_grave_bind: { power: 102, reason: '群控' },
    goblin_colonel_crushing_wave: { power: 90, reason: '群减益' },
    goblin_colonel_toxic_barrage: { power: 111, reason: '群附效' },
    goblin_splitshot: { power: 88, reason: '常规群伤' },
    goblin_volatile_flask: { power: 92, reason: '常规群伤' },
    goblin_mudstar: { power: 109, reason: '常规群伤' },
    goblin_rockfall: { power: 120, reason: '群附效' },
    goblin_royal_static_net: { power: 90, reason: '群控' },
    habadragon_royal_stomp: { power: 98, reason: '群附效' },
    habadragon_royal_tail_sweep: { power: 90, reason: '群减益' },
    habadragon_royal_cataclysm_trample: { power: 139, reason: '高成本爆发' },
    goblin_king_stormchain: { power: 111, reason: '群附效' },
    habadragon_crushing_stomp: { power: 98, reason: '群附效' },
    gruen_riftfall: { power: 98, reason: '群附效' },
    gruen_corequake: { power: 139, reason: '预警爆发' },
    valk_chain_draw: { power: 77, reason: '群控' },
    valk_furnace_overdrive: { power: 139, reason: '预警爆发' },
    threehead_mist_lash: { power: 91, reason: '群附效' },
    uzz_choir_of_graves: { power: 98, reason: '群附效' },
    uzz_dark_decay: { power: 90, reason: '群减益' },
    uzz_fear_scream: { power: 69, reason: '群硬控' },
    uzz_frost_breath: { power: 101, reason: '群减速' },
    ga_ether_tether: { power: 87, reason: '群控' },
    ga_archive_storm: { power: 111, reason: '常规群伤' },
    ga_threshold_reversal: { power: 130, reason: '阶段爆发' },
    ga_evolution_proof: { power: 146, reason: '阶段爆发' },
    mia_tide_chorus: { power: 81, reason: '群减益' },
    mia_root_resonance: { power: 88, reason: '群附效' },
    aeson_earthbreak: { power: 98, reason: '轮转群伤' },
    aeson_ultimate: { power: 108, reason: '附降疗与斩杀' },
    mother_plague_breath: { power: 78, reason: '群持续伤害' },
    mother_flame_torrent: { power: 91, reason: '群持续伤害' },
    mother_flame_storm: { power: 104, reason: '强化群持续伤害' },
    mother_gale_howl: { power: 72, reason: '群引爆' },
    mother_rift_vortex: { power: 78, reason: '群叠层' },
    mother_eroding_gale: { power: 104, reason: '群持续伤害' },
    mother_disaster_wind: { power: 135, reason: '可打断预警爆发' },
};
const aoeSkillPower = (code, originalPower, secondary = false) => {
    const profile = aoeDamageProfiles[code ?? ''];
    return (secondary ? profile?.secondaryPower ?? profile?.power : profile?.power) ?? originalPower;
};
const aoeDescription = (code, text) => {
    const profile = aoeDamageProfiles[code];
    if (!profile)
        return text;
    const clean = text.replace(/；群攻结算：.*$/, '').replace(/；群攻威力：.*$/, '')
        .replace(/\d+(?:\.\d+)?%(?:单体基准)?\s*(?=(?:物理|魔法|[风雷火水木土冰光暗](?:系|物理|魔法)))/, `${profile.power}%`);
    return `${clean}；群攻威力：${profile.power}%（直接参与防御计算）。`;
};

export { aoeDamageProfiles, aoeDescription, aoeSkillPower };
