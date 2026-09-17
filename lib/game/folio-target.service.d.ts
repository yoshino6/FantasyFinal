export declare const folioTargetView: (user: string, slot: number) => Promise<{
    skill: import("./active-folio-skills.config").FolioSkill;
    battle: {
        talentNote: string;
        canEnchant: boolean;
        enchantElement: string;
        canLeafAnchor: boolean;
        negotiation: {
            spawnId: number;
            sessionId: string;
            revision: number;
        } | null;
        sessionId: string;
        mode: string;
        environment: {
            regionId: number;
            weatherCode: string;
            intensity: number;
            anomalyCode: string | null;
            name: string;
            hint: string;
            modifiers: {
                memberSpeedPct: number;
                targetSpeedPct: number;
                hint: string;
                elementBonuses: Record<string, number>;
                shelteredCharacterIds?: number[];
            };
        } | null;
        characterId: number;
        turn: number;
        playerHp: number;
        playerHpMax: number;
        playerMp: number;
        playerMpMax: number;
        selectedAllyId: number | null;
        selectedTargetId: number | null;
        canAct: boolean;
        resource: {
            professionCode: string;
            code: string;
            name: string;
            current: number;
            max: number;
        } | null;
        skillSlots: number[];
        readySkillSlots: number[];
        advancedSkills: {
            id: number;
            code: string;
            name: string;
            ready: boolean;
        }[];
        itemSlots: number[];
        deviceSlots: {
            skills: {
                ready: boolean;
                code: string;
                name: string;
                description: string;
                energyCost: number;
                cooldownTurns: number;
                targetScope: import("./device.service").DeviceTargetScope;
                power?: number;
                effect?: string;
                inventor?: import("./hidden-device-protocol").InventorCapability;
            }[];
            slot: number;
            instanceId: number;
            deviceCode: string;
            deviceName: string;
            currentEnergy: number;
            maxEnergy: number;
        }[];
        appraisal: {
            learned: boolean;
            rangeLevel: number;
            informationLevel: number;
        };
        members: {
            statusText: string;
            id: number;
            name: string;
            companion: boolean;
            hp: number;
            hpMax: number;
            mp: number;
            mpMax: number;
            resource: {
                professionCode: string;
                code: string;
                name: string;
                current: number;
                max: number;
            } | null;
            defeated: boolean;
            pending: boolean;
            chanting: string | null;
            extraAction: boolean;
        }[];
        spirits: {
            ownerCharacterId: number;
            code: string;
            name: string;
            hp: number;
            hpMax: number;
            remainingTurns: number;
        }[];
        targets: {
            hideBossMechanics: boolean;
            encounterStatus: string | null;
            statusText: string;
            id: number;
            name: string;
            level: number | null;
            hp: string | number;
            hpMax: string | number;
            mp: string | number;
            mpMax: string | number;
            defeated: boolean;
            identified: boolean;
            isBoss: boolean;
            isBossComponent: boolean;
            bodyTargetId: number | null;
            passiveSummary: string | null;
            breakSummary: string | null;
            warning: string | null;
            bodyDamageReductionPct: number | null;
            livingComponentCount: number | null;
            randomEffects: string[];
            mechanicSummary: string | null;
        }[];
    };
    pool: ({
        statusText: string;
        id: number;
        name: string;
        companion: boolean;
        hp: number;
        hpMax: number;
        mp: number;
        mpMax: number;
        resource: {
            professionCode: string;
            code: string;
            name: string;
            current: number;
            max: number;
        } | null;
        defeated: boolean;
        pending: boolean;
        chanting: string | null;
        extraAction: boolean;
    } | {
        hideBossMechanics: boolean;
        encounterStatus: string | null;
        statusText: string;
        id: number;
        name: string;
        level: number | null;
        hp: string | number;
        hpMax: string | number;
        mp: string | number;
        mpMax: string | number;
        defeated: boolean;
        identified: boolean;
        isBoss: boolean;
        isBossComponent: boolean;
        bodyTargetId: number | null;
        passiveSummary: string | null;
        breakSummary: string | null;
        warning: string | null;
        bodyDamageReductionPct: number | null;
        livingComponentCount: number | null;
        randomEffects: string[];
        mechanicSummary: string | null;
    })[];
    primary: number;
} | null>;
export declare const saveFolioTargets: (user: string, slot: number, ids: number[], turn: number, session: string) => Promise<{
    ended: boolean;
    waiting: boolean;
    log: string;
} | {
    log: string;
    manualLog: string;
    bossTransitions: import("./kingbeast.config").BossPhaseTransition[];
    ended: boolean;
    waiting: boolean;
} | {
    settlement: string;
    log: string;
    manualLog: string;
    bossTransitions: import("./kingbeast.config").BossPhaseTransition[];
    ended: boolean;
    waiting: boolean;
} | {
    settlement: import("./adventure.service").VictorySettlement;
    ambushSessionId: string;
    log: string;
    manualLog: string;
    bossTransitions: import("./kingbeast.config").BossPhaseTransition[];
    ended: boolean;
    waiting: boolean;
} | {
    settlement: string;
    ambushSessionId: string | undefined;
    log: string;
    manualLog: string;
    bossTransitions: import("./kingbeast.config").BossPhaseTransition[];
    ended: boolean;
    waiting: boolean;
}>;
