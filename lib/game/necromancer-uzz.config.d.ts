export declare const uzzTemplateCode = "necromancer_uz";
export declare const uzzOrdinarySummonCodes: readonly ["uzz_skeleton_berserker", "uzz_skeleton_archer", "uzz_pain_wraith", "uzz_skeleton_mage"];
export declare const uzzBoneDragonCode = "uzz_frost_bone_dragon";
export declare const uzzPhaseTwoTransition: {
    code: string;
    title: string;
    description: string;
    dialogue: {
        speaker: string;
        text: string;
    }[];
    effect: string;
};
export declare const uzzPhaseTwoTransitionLog: () => string;
export declare const uzzPhaseTwoTransitionDue: (phaseTwoLocked: boolean, currentHp: number, maxHp: number) => boolean;
export declare const uzzSkills: {
    readonly skeletonCall: "uzz_skeleton_call";
    readonly necromanticCall: "uzz_necromantic_call";
    readonly soulBlast: "uzz_soul_blast";
    readonly darkDecay: "uzz_dark_decay";
    readonly soulRend: "uzz_soul_rend";
    readonly soulDrain: "uzz_soul_drain";
    readonly dominion: "uzz_undead_dominion";
    readonly deathCoil: "uzz_death_coil";
    readonly deathGlory: "uzz_death_glory";
    readonly slash: "uzz_skeleton_slash";
    readonly fireArrow: "uzz_skeleton_fire_arrow";
    readonly fearScream: "uzz_fear_scream";
    readonly wraithBolt: "uzz_wraith_bolt";
    readonly mageBlast: "uzz_mage_soul_blast";
    readonly frostBreath: "uzz_frost_breath";
    readonly frostArmor: "uzz_frost_armor";
    readonly frostClaw: "uzz_frost_claw";
};
export declare const isUzzOrdinarySummonCode: (code: unknown) => boolean;
export declare const isUzzBoneDragonCode: (code: unknown) => boolean;
export declare const uzzNextSummonSlot: (lastSummonSlot: number, lastClearSlot?: number) => number;
export declare const uzzSummonDue: (currentSlot: number, lastSummonSlot: number, lastClearSlot?: number) => boolean;
export declare const uzzRotationSkill: (phaseTwo: boolean, cursor: number) => {
    slot: number;
    code: "uzz_dark_decay" | "uzz_soul_blast" | "uzz_soul_rend" | "uzz_soul_drain";
};
export declare const uzzUndeadConstitutionMultiplier: (magic: boolean, element: string) => number;
export declare const uzzDomainMagicMultiplier: (magic: boolean, element: string) => 1 | 0.75;
export declare const uzzSpeedFactor: (domainActive: boolean, slowPct?: number, breathSlowPct?: number) => number;
export declare const uzzSoulDrainTransfer: (victimCurrentMp: number, bossCurrentMp: number, bossMaxMp: number, bossCurrentHp: number, bossMaxHp: number) => {
    drained: number;
    restoredMp: number;
    overflowMp: number;
    restoredHp: number;
    victimMp: number;
    bossMp: number;
    bossHp: number;
};
