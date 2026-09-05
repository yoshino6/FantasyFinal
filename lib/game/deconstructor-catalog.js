const ingredient = (code, quantity) => ({ code, quantity });
const blueprintFor = (code) => `${code}_blueprint`;
const material = (code, name, description, ingredients, level = 1) => ({
    code, name, description, ingredients, recommendedSecondaryLevel: level, blueprintCode: blueprintFor(code), outputType: 'material', itemCategory: level ? '基材' : '基材', constructionCategory: '基材'
});
const component = (code, name, description, ingredients, level = 1) => ({
    code, name, description, ingredients, recommendedSecondaryLevel: level, blueprintCode: blueprintFor(code), outputType: 'material', itemCategory: '构件', constructionCategory: '构件'
});
const device = (code, name, description, ingredients, level, effect = {}) => ({
    code, name, description, ingredients, recommendedSecondaryLevel: level, blueprintCode: blueprintFor(code), outputType: 'equipment', itemCategory: '异械', constructionCategory: '异械', effect
});
const bases = [
    material('magic_gear', '魔力齿轮', '以金元素微尘为骨架、魔力微弧为驱动的基础传动基材。', [ingredient('metal_element_dust', 4), ingredient('magic_unit', 2), ingredient('thunder_element_dust', 3)]),
    material('energy_core', '能量中枢', '将余烬与水元素微粒压缩为持续供能的基础中枢。', [ingredient('energy_ember', 5), ingredient('magic_unit', 2), ingredient('water_element_dust', 2)]),
    material('flesh_atrium', '血肉心房', '模拟生物循环结构制成的活性基材。', [ingredient('blood_residue', 5), ingredient('energy_ember', 3), ingredient('wood_element_dust', 1)]),
    material('flame_matrix', '炽焰矩阵', '将火元素规整成稳定热源的基础基材。', [ingredient('fire_element_dust', 4), ingredient('metal_element_dust', 2), ingredient('energy_ember', 3)]),
    material('frost_prism', '凝霜棱晶', '可将冰与水元素折射为稳定冷却回路的基材。', [ingredient('ice_element_dust', 4), ingredient('water_element_dust', 3), ingredient('magic_unit', 2)]),
    material('shadow_filament', '暗影导丝', '由暗元素编织而成、能传递细微魔力信号的基材。', [ingredient('dark_element_dust', 4), ingredient('metal_element_dust', 3), ingredient('magic_unit', 2)]),
    material('luminous_lens', '光导晶片', '将光元素收束为清晰视界的透明基材。', [ingredient('light_element_dust', 4), ingredient('water_element_dust', 3), ingredient('magic_unit', 2)]),
    material('piezo_ceramic_core', '压电陶芯', '会随压力释放稳定电荷的陶瓷基材。', [ingredient('metal_element_dust', 3), ingredient('thunder_element_dust', 4), ingredient('energy_ember', 2)], 2),
    material('memory_polymer', '记忆聚胶', '能记录形变并在供能后回弹的柔性基材。', [ingredient('flesh_atrium', 1), ingredient('water_element_dust', 3), ingredient('wood_element_dust', 3), ingredient('magic_unit', 1)], 2),
    material('mirror_silver_coating', '镜银镀层', '兼具反射与导光特性的细密镀层。', [ingredient('metal_element_dust', 3), ingredient('light_element_dust', 3), ingredient('water_element_dust', 2)], 2),
    material('insulating_resin', '绝缘树脂', '将木质纤维和水分子交联而成的隔离树脂。', [ingredient('wood_element_dust', 4), ingredient('water_element_dust', 2), ingredient('energy_ember', 3)], 1),
    material('phase_sand_crystal', '相位砂晶', '在光暗交界处析出的不稳定晶砂，可短暂错开实体相位。', [ingredient('ice_element_dust', 2), ingredient('light_element_dust', 2), ingredient('dark_element_dust', 2), ingredient('magic_unit', 2)], 4)
];
const components = [
    component('interference_shell', '阻扰外壳', '隔离外部魔力扰动、保护内部组件的异械构件。', [ingredient('magic_gear', 2), ingredient('flesh_atrium', 1), ingredient('shadow_filament', 2)]),
    component('low_power_standard_lens', '低倍标准镜', '提供基础视距与对焦能力的标准光学构件。', [ingredient('luminous_lens', 2), ingredient('frost_prism', 2), ingredient('magic_gear', 1)]),
    component('calibration_module', '校准模块', '负责修正视线偏差与锁定轨迹的精密构件。', [ingredient('magic_gear', 2), ingredient('energy_core', 2), ingredient('shadow_filament', 1)]),
    component('mana_power_source', '魔力源能', '向异械稳定输送魔力的供能构件。', [ingredient('energy_core', 2), ingredient('flame_matrix', 2), ingredient('flesh_atrium', 1)]),
    component('kinetic_frame', '动能骨架', '将力量与动作稳定传导的强化构件。', [ingredient('magic_gear', 2), ingredient('flesh_atrium', 2), ingredient('flame_matrix', 1)]),
    component('pulse_regulator', '脉冲调节器', '以循环脉冲校准器械响应的精密构件。', [ingredient('energy_core', 2), ingredient('frost_prism', 1), ingredient('luminous_lens', 2)]),
    component('palm_weave', '掌心织片', '能贴合掌心起伏、传递细微动作的柔性构件。', [ingredient('flesh_atrium', 2), ingredient('shadow_filament', 1), ingredient('luminous_lens', 1), ingredient('frost_prism', 1)]),
    component('finger_actuator', '指节驱动器', '嵌入指节位置的微型传动构件，可让动作更迅疾地传达。', [ingredient('magic_gear', 2), ingredient('energy_core', 1), ingredient('flesh_atrium', 1), ingredient('flame_matrix', 1)], 2),
    component('force_feedback_ring', '力反馈环', '回传出力变化的环形构件，用于细微调整发力节奏。', [ingredient('magic_gear', 1), ingredient('energy_core', 2), ingredient('frost_prism', 1), ingredient('luminous_lens', 1)], 2),
    component('pressure_buckle', '压感扣具', '能辨识握力与接触变化的扣具，适合装配在手部异械上。', [ingredient('shadow_filament', 2), ingredient('flesh_atrium', 2), ingredient('luminous_lens', 1)], 2),
    component('flash_capacitor', '瞬容电容', '在一瞬间释放储能的紧凑电容。', [ingredient('energy_core', 2), ingredient('insulating_resin', 1)], 1),
    component('servo_bundle', '伺服束组', '将意图转译为细密驱动的多轴伺服组。', [ingredient('magic_gear', 1), ingredient('piezo_ceramic_core', 1), ingredient('memory_polymer', 1)], 2),
    component('optical_rangefinder', '测距镜组', '把焦距、折射和偏移统一校正的镜组。', [ingredient('low_power_standard_lens', 1), ingredient('mirror_silver_coating', 2), ingredient('calibration_module', 1)], 2),
    component('rail_coil', '磁轨线圈', '沿固定轨道释放强磁脉冲的线圈构件。', [ingredient('magic_gear', 2), ingredient('pulse_regulator', 1), ingredient('flash_capacitor', 1)], 2),
    component('barrier_emitter', '壁垒投射器', '将干涉场投射成短时稳定屏障。', [ingredient('interference_shell', 1), ingredient('phase_sand_crystal', 1), ingredient('pulse_regulator', 1)], 4),
    component('micro_drone_frame', '微机蜂框', '用于承载维修或反制微机的轻量骨架。', [ingredient('magic_gear', 1), ingredient('memory_polymer', 2), ingredient('palm_weave', 1)], 3),
    component('tractor_anchor', '牵引锚', '将目标动量拉入预设方向的固定锚。', [ingredient('kinetic_frame', 1), ingredient('piezo_ceramic_core', 1), ingredient('shadow_filament', 1)], 4),
    component('countermeasure_node', '反制节点', '识别敌方正向场并给出干扰回路的节点。', [ingredient('phase_sand_crystal', 1), ingredient('shadow_filament', 1), ingredient('calibration_module', 1)], 6),
    component('thermal_chamber', '热熔舱', '可将高密度能量安全汇聚、再分段释放的热舱。', [ingredient('flame_matrix', 1), ingredient('insulating_resin', 2), ingredient('mana_power_source', 1)], 5),
    component('regenerative_joint', '再生关节', '能依据受损反馈调整结构的自修复关节。', [ingredient('flesh_atrium', 1), ingredient('servo_bundle', 1), ingredient('force_feedback_ring', 1)], 6),
    component('chaos_resonator', '偶发谐振骰', '会在多种可控频段间随机抽取共振结果。', [ingredient('luminous_lens', 1), ingredient('pulse_regulator', 1), ingredient('flash_capacitor', 1)], 1)
];
const devices = [
    device('auxiliary_aiming_scope', '辅助瞄准镜', '会自行校准视线的魔导目镜；生效后实际命中率提高 8%。', [ingredient('interference_shell', 1), ingredient('low_power_standard_lens', 1), ingredient('calibration_module', 1), ingredient('mana_power_source', 1)], 1, { actualHitRatePct: 8 }),
    device('muscle_pacer', '肌肉起搏器', '脉冲会刺激肌肉在出手时爆发更强力量，但会降低细微准度。', [ingredient('kinetic_frame', 1), ingredient('pulse_regulator', 1), ingredient('force_feedback_ring', 1), ingredient('mana_power_source', 1)], 3, { physicalActualHitRatePct: -6, physicalSkillDamagePct: 6 }),
    device('critical_glove', '刻薄手套', '强行锁定最锐利的攻击节奏；物理攻击必暴击，但最终暴伤降低。', [ingredient('finger_actuator', 2), ingredient('palm_weave', 2), ingredient('force_feedback_ring', 1), ingredient('pressure_buckle', 1)], 2, { physicalForceCrit: true, physicalCriticalFinalDamagePct: -50 }),
    device('mana_accumulator', '魔力积蓄仪', '把魔力压入深层回路；魔法技能吟唱+1、技能增伤+60%。', [ingredient('mana_power_source', 2), ingredient('pulse_regulator', 2), ingredient('interference_shell', 1)], 5, { magicChantBonus: 1, magicSkillDamagePct: 60 }),
    device('rocket_propeller', '火箭推进器', '每回合开始时为使用者叠加 10% 速度，最多叠至 100%。', [ingredient('kinetic_frame', 2), ingredient('servo_bundle', 1), ingredient('flash_capacitor', 1), ingredient('force_feedback_ring', 1)], 10, { devicePassive: 'rocket_speed' }),
    device('inverse_buffer', '逆相缓冲器', '生命首次低于 30% 时，获得 2 回合 20% 减伤。', [ingredient('barrier_emitter', 1), ingredient('phase_sand_crystal', 1), ingredient('frost_prism', 1), ingredient('interference_shell', 1)], 6, { devicePassive: 'inverse_buffer' }),
    device('rail_stabilizer', '磁轨稳定架', '使异械直接伤害提高 12%。', [ingredient('rail_coil', 1), ingredient('optical_rangefinder', 1), ingredient('kinetic_frame', 1), ingredient('calibration_module', 1)], 11, { deviceDamagePct: 12 }),
    device('emergency_evasion_module', '紧急回避模组', '以瞬时电容推开一次迫近的物理伤害。', [ingredient('flash_capacitor', 1), ingredient('insulating_resin', 1), ingredient('interference_shell', 1), ingredient('pulse_regulator', 1)], 1),
    device('easter_egg_thrower', '彩蛋投掷器', '向目标投出一枚会随机绽放五种效应的共振彩蛋。', [ingredient('chaos_resonator', 1), ingredient('low_power_standard_lens', 1), ingredient('flash_capacitor', 1), ingredient('luminous_lens', 1)], 1),
    device('simple_launcher', '简易发射器', '将动能脉冲均匀扫向全部敌人。', [ingredient('rail_coil', 1), ingredient('kinetic_frame', 1), ingredient('flash_capacitor', 1), ingredient('calibration_module', 1)], 2),
    device('precision_scope', '精准瞄准镜', '将测距和校准数据叠入友方视界；其直接伤害命中额外提高。', [ingredient('optical_rangefinder', 2), ingredient('calibration_module', 1), ingredient('interference_shell', 1), ingredient('luminous_lens', 1)], 2, { deviceActualHitRatePct: 10 }),
    device('recycling_hammer', '再利用锤', '敲击回收节点，为同伴异械导回少量能量。', [ingredient('servo_bundle', 1), ingredient('piezo_ceramic_core', 1), ingredient('force_feedback_ring', 2), ingredient('magic_gear', 1)], 3),
    device('weave_repair_swarm', '织体修复蜂群', '微机蜂群可修补伤口并剥离一层负面效应。', [ingredient('micro_drone_frame', 2), ingredient('memory_polymer', 1), ingredient('flash_capacitor', 1), ingredient('calibration_module', 1)], 3),
    device('gravity_tether', '引力缆索枪', '以锚定脉冲拖拽目标的身位与闪避。', [ingredient('tractor_anchor', 2), ingredient('kinetic_frame', 1), ingredient('shadow_filament', 1), ingredient('flash_capacitor', 1)], 4),
    device('fold_barrier_generator', '折叠壁垒发生器', '将防护场折叠到队友周围；自身异械护盾、减伤延长 1 回合。', [ingredient('barrier_emitter', 2), ingredient('interference_shell', 1), ingredient('phase_sand_crystal', 1), ingredient('mana_power_source', 1)], 5, { deviceProtectionDurationBonus: 1 }),
    device('shock_pile_launcher', '震爆桩发射器', '将压电震爆桩钉入地面，尝试击晕目标。', [ingredient('rail_coil', 1), ingredient('piezo_ceramic_core', 2), ingredient('kinetic_frame', 1), ingredient('thermal_chamber', 1)], 5),
    device('frost_pulse_interferer', '霜脉干扰器', '以冰冷脉冲压制敌方整体行动。', [ingredient('frost_prism', 3), ingredient('flash_capacitor', 1), ingredient('pulse_regulator', 1), ingredient('interference_shell', 1)], 6),
    device('phase_decoy_pod', '相位替身仓', '制造一次错位残像，抵消下一次直接伤害。', [ingredient('countermeasure_node', 1), ingredient('phase_sand_crystal', 2), ingredient('interference_shell', 1), ingredient('servo_bundle', 1)], 7),
    device('counter_spider', '反制蜘蛛机', '小型反制机优先拆除正面强化，找不到时则暴露目标弱点。', [ingredient('micro_drone_frame', 1), ingredient('countermeasure_node', 2), ingredient('palm_weave', 1), ingredient('calibration_module', 1)], 6),
    device('electromagnetic_coil_cannon', '电磁线圈炮', '经过长磁轨加速后释放覆盖全敌的雷性轰击。', [ingredient('rail_coil', 3), ingredient('flash_capacitor', 2), ingredient('thermal_chamber', 1), ingredient('kinetic_frame', 2)], 7, { thunderDeviceDamagePct: 12 }),
    device('autonomous_repair_arm', '自律维修臂', '以再生关节完成深度维修；对带护盾的解构师还能补充异械能量。', [ingredient('regenerative_joint', 2), ingredient('micro_drone_frame', 1), ingredient('force_feedback_ring', 1), ingredient('calibration_module', 1)], 8),
    device('micro_reactor_pack', '微型反应堆背包', '高热回路提供极限输出；所有主动异械最大充能提高 20。', [ingredient('thermal_chamber', 3), ingredient('flash_capacitor', 2), ingredient('insulating_resin', 2), ingredient('interference_shell', 1)], 9, { deviceMaxEnergyBonus: 20 })
];
const teleporter = {
    code: 'demon_breaker_teleporter', name: '破魔传送器', description: '可撕开旧式结界缝隙的便携装置。',
    ingredients: [ingredient('mana_power_source', 2), ingredient('calibration_module', 2), ingredient('shadow_filament', 3), ingredient('luminous_lens', 2)],
    recommendedSecondaryLevel: 6, blueprintCode: blueprintFor('demon_breaker_teleporter'), outputType: 'consumable', itemCategory: '特殊', constructionCategory: '异械'
};
const constructionRecipes = [...bases, ...components, ...devices, teleporter];
const constructionRecipeByCode = new Map(constructionRecipes.map(recipe => [recipe.code, recipe]));
const requiresConstructionBlueprint = (recipe) => recipe.constructionCategory === '异械';
const activeDeviceCodes = new Set(devices.filter(recipe => !['auxiliary_aiming_scope', 'muscle_pacer', 'critical_glove', 'mana_accumulator', 'rocket_propeller', 'inverse_buffer', 'rail_stabilizer'].includes(recipe.code)).map(recipe => recipe.code));
const deviceCodes = new Set(devices.map(recipe => recipe.code));
const courseDeviceBlueprints = [
    [1, 'emergency_evasion_module'], [2, 'simple_launcher'], [3, 'weave_repair_swarm'], [4, 'gravity_tether'], [5, 'shock_pile_launcher'], [6, 'counter_spider'], [7, 'electromagnetic_coil_cannon'], [8, 'autonomous_repair_arm'], [9, 'micro_reactor_pack'], [10, 'rocket_propeller'], [11, 'rail_stabilizer']
];
const affinityBlueprints = [{ affinity: 200, level: 6, code: 'inverse_buffer' }];
const workshopBlueprints = [{ code: 'auxiliary_aiming_scope', price: 80 }, { code: 'precision_scope', price: 120 }, { code: 'recycling_hammer', price: 160 }];
const blindBoxBlueprints = [
    { code: 'starter_device_blueprint_box', name: '异械盲盒·入门', price: 80, requiredLevel: 1, outputs: ['easter_egg_thrower', 'critical_glove'] },
    { code: 'advanced_device_blueprint_box', name: '异械盲盒·进阶', price: 240, requiredLevel: 5, outputs: ['frost_pulse_interferer', 'mana_accumulator'] }
];
const dungeonBlueprintDrops = [
    { code: 'muscle_pacer', floor: 1, chance: .10, chestTypes: ['silver', 'gold'] },
    { code: 'fold_barrier_generator', floor: 2, chance: .07, chestTypes: ['gold'] },
    { code: 'phase_decoy_pod', floor: 3, chance: .05, chestTypes: ['boss_gold'] }
];
const baseMaterialTradeValues = {
    blood_residue: 2, energy_ember: 2, magic_unit: 10,
    wood_element_dust: 3, metal_element_dust: 3, water_element_dust: 3,
    ice_element_dust: 4, dark_element_dust: 4, fire_element_dust: 5, thunder_element_dust: 5, light_element_dust: 5
};
const constructionValueByCode = (() => {
    const values = new Map(Object.entries(baseMaterialTradeValues));
    for (const recipe of constructionRecipes)
        values.set(recipe.code, recipe.ingredients.reduce((sum, part) => sum + (values.get(part.code) ?? 0) * part.quantity, 0));
    return values;
})();
const constructionBlueprintCodes = new Set(constructionRecipes.filter(requiresConstructionBlueprint).map(recipe => recipe.blueprintCode));
const blueprintRecipeCode = (blueprintCode) => constructionRecipes.find(recipe => requiresConstructionBlueprint(recipe) && recipe.blueprintCode === blueprintCode)?.code ?? null;
const constructionRefundRate = (gap) => gap <= 0 ? 0 : gap <= 1 ? .8 : gap <= 3 ? .7 : .6;
const constructionSuccessRate = (recommendedLevel, currentLevel) => Math.max(40, 100 - Math.max(0, recommendedLevel - currentLevel) * 12);
const constructionGapFor = (recipe, currentLevel) => Math.max(0, recipe.recommendedSecondaryLevel - currentLevel);

export { activeDeviceCodes, affinityBlueprints, baseMaterialTradeValues, blindBoxBlueprints, blueprintRecipeCode, constructionBlueprintCodes, constructionGapFor, constructionRecipeByCode, constructionRecipes, constructionRefundRate, constructionSuccessRate, constructionValueByCode, courseDeviceBlueprints, deviceCodes, dungeonBlueprintDrops, requiresConstructionBlueprint, workshopBlueprints };
