/** 普通二转的四个 Lv.20～32 任务区；坐标落在普通野外，地图包含世界树出发的沿途区域。 */
export const advancedProfessionRoutes = {
  ridge_foothills: { regionCode: 'ridge_foothills', name: '岩脊山麓', x: -221, y: 0, maps: ['gravelwind_shore', 'ridge_foothills'], materialCode: 'ridge_core', materialName: '岩脊核心' },
  rediron_pass: { regionCode: 'rediron_pass', name: '赤铁山道', x: 0, y: 161, maps: ['morningdew_riverbank', 'rediron_pass'], materialCode: 'fire_crystal', materialName: '炉心赤晶' },
  mistalgae_marsh: { regionCode: 'mistalgae_marsh', name: '雾藻湿地', x: 161, y: 0, maps: ['morningdew_riverbank', 'mistalgae_marsh'], materialCode: 'marsh_heart', materialName: '雾沼心' },
  dark_forest_deep: { regionCode: 'dark_forest_deep', name: '幽暗密林深处', x: 0, y: -220, maps: ['dark_forest', 'dark_forest_deep'], materialCode: 'goblin_ear', materialName: '哥布林耳' }
} as const;

export type AdvancedProfessionRoute = typeof advancedProfessionRoutes[keyof typeof advancedProfessionRoutes];
