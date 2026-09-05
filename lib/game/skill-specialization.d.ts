export type Specialization = 'overcharge' | 'instant' | 'efficient' | 'potent';
export type SkillSpecializations = Partial<Record<Specialization, number>>;
export type SpecializationBase = {
    code: string;
    category: string;
    tier?: string;
    power: number;
    mana_cost: number;
    cooldown_turns: number;
    chant_turns?: number;
};
export declare const manaTransferCost: (currentMp: number) => number;
export declare const specializationMaximum: (tier?: string) => 10 | 20 | 40;
export declare const specializationProgress: (level: unknown, tier?: string) => number;
export declare const specializationDescriptions: {
    readonly overcharge: "线性成长至威力/直接治疗/护盾 +25%，蓝耗 +50%，冷却至多增加2回合；不增加行动或控制次数。";
    readonly instant: "线性成长至冷却按进度缩短（满级1–2回合），威力/直接治疗/护盾 -10%；冷却不越出本阶档位、吟唱至少1回合。";
    readonly efficient: "线性成长至基础蓝耗 -25%；不减免生命、当前魔力百分比和职业资源消耗。";
    readonly potent: "线性成长至最终直接伤害 +10%，直接治疗/护盾及普通增减益数值 +25%，蓝耗 +20%；不增加控制概率、时长、次数或返还资源。";
};
export declare const skillSpecialization: (base: SpecializationBase, levels?: SkillSpecializations) => {
    power: number;
    mana: number;
    cooldown: number;
    chant: number;
    powerFactor: number;
    effectFactor: number;
    supportFactor: number;
    damageFactor: number;
};
export type SkillSpecializationResult = ReturnType<typeof skillSpecialization>;
export declare const specializationOptions: (base: SpecializationBase, hasOrdinaryEffect?: boolean) => Specialization[];
export declare const specializeEffectValue: (code: string, value: number, factor?: number) => number;
