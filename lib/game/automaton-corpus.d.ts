export declare const automatonCorpus: {
    schemaVersion: number;
    corpusRevision: number;
    title: string;
    status: string;
    allowedPlaceholders: string[];
    addressing: {
        profiles: {
            aggressive: {
                ownerDefault: string;
                selfDefault: string;
                ownerOptions: string[];
                selfOptions: string[];
            };
            cautious: {
                ownerDefault: string;
                selfDefault: string;
                ownerOptions: string[];
                selfOptions: string[];
            };
            guardian: {
                ownerDefault: string;
                selfDefault: string;
                ownerOptions: string[];
                selfOptions: string[];
            };
            timid: {
                ownerDefault: string;
                selfDefault: string;
                ownerOptions: string[];
                selfOptions: string[];
            };
            analytical: {
                ownerDefault: string;
                selfDefault: string;
                ownerOptions: string[];
                selfOptions: string[];
            };
            enthusiastic: {
                ownerDefault: string;
                selfDefault: string;
                ownerOptions: string[];
                selfOptions: string[];
            };
            persistent: {
                ownerDefault: string;
                selfDefault: string;
                ownerOptions: string[];
                selfOptions: string[];
            };
            curious: {
                ownerDefault: string;
                selfDefault: string;
                ownerOptions: string[];
                selfOptions: string[];
            };
            gentle: {
                ownerDefault: string;
                selfDefault: string;
                ownerOptions: string[];
                selfOptions: string[];
            };
            witty: {
                ownerDefault: string;
                selfDefault: string;
                ownerOptions: string[];
                selfOptions: string[];
            };
            steady: {
                ownerDefault: string;
                selfDefault: string;
                ownerOptions: string[];
                selfOptions: string[];
            };
            brave: {
                ownerDefault: string;
                selfDefault: string;
                ownerOptions: string[];
                selfOptions: string[];
            };
        };
        priority: string[];
        persistAtBirth: boolean;
        randomizePerMessage: boolean;
        selfAndOwnerAreSeparate: boolean;
        maxCustomOwnerGraphemes: number;
        maxCustomSelfGraphemes: number;
        maxRenderedQuoteGraphemes: number;
        overflowPolicy: string;
        escapeCustomValues: boolean;
    };
    selection: {
        coreCount: number;
        facetCount: number;
        onePerAxis: boolean;
        alignmentBranch: number;
        explorationBranch: number;
        rarityWeightRetained: boolean;
    };
    personas: {
        id: string;
        name: string;
        primary: string;
        secondary: string;
        selfCareHp: number;
        ownerCareHp: number;
        interceptChance: number;
        voice: string;
        birthWeight: number;
        permanence: string;
    }[];
    traitAxes: {
        id: string;
        name: string;
        maxSelected: number;
        traits: {
            id: string;
            name: string;
            ordinal: number;
            birthWeight: number;
        }[];
    }[];
    compatibleRanges: {
        aggressive: {
            risk: number[];
            care: number[];
            expression: number[];
        };
        cautious: {
            risk: number[];
            care: number[];
            expression: number[];
        };
        guardian: {
            risk: number[];
            care: number[];
            closeness: number[];
        };
        timid: {
            risk: number[];
            care: number[];
            expression: number[];
        };
        analytical: {
            risk: number[];
            expression: number[];
            emotion: number[];
        };
        enthusiastic: {
            risk: number[];
            expression: number[];
            emotion: number[];
        };
        persistent: {
            risk: number[];
            discipline: number[];
        };
        curious: {
            risk: number[];
            curiosity: number[];
        };
        gentle: {
            risk: number[];
            care: number[];
            expression: number[];
        };
        witty: {
            risk: number[];
            expression: number[];
        };
        steady: {
            risk: number[];
            expression: number[];
            emotion: number[];
        };
        brave: {
            risk: number[];
            care: number[];
            expression: number[];
        };
    };
    crossRules: {
        ifAll: string[];
        forbid: string[];
        reason: string;
    }[];
    skillDomains: {
        normal: {
            N001: string[];
            N002: string[];
            N003: string[];
            N004: string[];
            N005: string[];
            N006: string[];
            N007: string[];
            N008: string[];
            N009: string[];
            N010: string[];
            N011: string[];
            N012: string[];
            N013: string[];
            N014: string[];
            N015: string[];
            N016: string[];
            N017: string[];
            N018: string[];
            N019: string[];
            N020: string[];
            N021: string[];
            N022: string[];
            N023: string[];
            N024: string[];
            N025: string[];
            N026: string[];
            N027: string[];
            N028: string[];
            N029: string[];
            N030: string[];
            N031: string[];
            N032: string[];
            N033: string[];
            N034: string[];
            N035: string[];
            N036: string[];
            N037: string[];
            N038: string[];
            N039: string[];
            N040: string[];
            N041: string[];
            N042: string[];
            N043: string[];
            N044: string[];
            N045: string[];
            N046: string[];
            N047: string[];
            N048: string[];
            N049: string[];
            N050: string[];
            N051: string[];
            N052: string[];
            N053: string[];
            N054: string[];
            N055: string[];
            N056: string[];
            N057: string[];
            N058: string[];
            N059: string[];
            N060: string[];
            N061: string[];
            N062: string[];
            N063: string[];
            N064: string[];
            N065: string[];
            N066: string[];
            N067: string[];
            N068: string[];
            N069: string[];
            N070: string[];
            N071: string[];
            N072: string[];
            N073: string[];
            N074: string[];
            N075: string[];
            N076: string[];
            N077: string[];
            N078: string[];
            N079: string[];
            N080: string[];
            N081: string[];
            N082: string[];
            N083: string[];
            N084: string[];
            N085: string[];
            N086: string[];
            N087: string[];
            N088: string[];
            N089: string[];
            N090: string[];
            N091: string[];
            N092: string[];
            N093: string[];
            N094: string[];
            N095: string[];
            N096: string[];
        };
        special: {
            S001: string[];
            S002: string[];
            S003: string[];
            S004: string[];
            S005: string[];
            S006: string[];
            S007: string[];
            S008: string[];
            S009: string[];
            S010: string[];
            S011: string[];
            S012: string[];
            S013: string[];
            S014: string[];
            S015: string[];
            S016: string[];
            S017: string[];
            S018: string[];
            S019: string[];
            S020: string[];
            S021: string[];
            S022: string[];
            S023: string[];
            S024: string[];
            S025: string[];
            S026: string[];
            S027: string[];
            S028: string[];
            S029: string[];
            S030: string[];
            S031: string[];
            S032: string[];
        };
        tacticsTraitBoost: string[][];
    };
    events: {
        id: string;
        name: string;
    }[];
    dialogues: {
        id: string;
        personaId: string;
        event: string;
        text: string;
        requires: string[];
        source: string;
        reviewStatus: string;
    }[];
    repetition: {
        exactTextHistoryDays: number;
        recentMainClauseWindow: number;
        noInfiniteUniquenessGuarantee: boolean;
        exhaustionFallback: string;
    };
    privacy: {
        collectPrivateMessages: boolean;
        publicCustomQuotesDefault: boolean;
    };
    corpusValidation: {
        authoredVariantsPerPersonaEvent: number;
        normalizedUniqueTexts: number;
        nearDuplicateMetric: string;
        nearDuplicateThreshold: number;
        nearDuplicateMinimumLength: number;
        nearDuplicatePairs: number;
        semanticUniquenessGuaranteed: boolean;
    };
};
