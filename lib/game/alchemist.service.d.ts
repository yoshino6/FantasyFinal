export declare const alchemistQuest: (qqUserId: string) => Promise<{
    readonly status: string;
    readonly herbs: number;
}>;
export declare const acceptAlchemistQuest: (qqUserId: string) => Promise<void>;
export declare const claimAlchemistQuest: (qqUserId: string) => Promise<{
    name: string;
    characterName: string;
    giftName: string;
}>;
export declare const secondaryProfessionCode: (qqUserId: string) => Promise<string | null>;
type AlchemyServiceMode = 'personal' | 'sweetshop';
type AlchemistProgress = {
    level: number;
    proficiency: number;
    required: number;
    bonus: number;
    serviceMode: AlchemyServiceMode;
};
export declare const alchemistProgress: (qqUserId: string) => Promise<AlchemistProgress>;
export declare const activatePersonalAlchemy: (qqUserId: string) => Promise<void>;
export declare const activateSweetshopAlchemy: (qqUserId: string) => Promise<void>;
export declare const purificationMaterials: (qqUserId: string) => Promise<({
    id: number;
    code: string;
    name: string;
    category: string;
    quantity: number;
    outputCode: string;
} & {
    outputCode: string;
})[]>;
export declare const bulkPurificationPreview: (qqUserId: string) => Promise<{
    success: number;
    materials: {
        outputName: string;
        expectedOutput: number;
        id: number;
        code: string;
        name: string;
        item_category: string;
        quantity: number;
        effect_json: unknown;
        outputCode: string;
    }[];
}>;
export declare const purificationState: (qqUserId: string) => Promise<{
    progress: AlchemistProgress;
    itemId: number | null;
    name: string | null;
    quantity: number;
    available: number;
    outputCode: string | undefined;
    outputName: any;
    expectedOutput: number;
    success: number;
}>;
export declare const selectPurificationMaterial: (qqUserId: string, itemId: number, quantity?: number) => Promise<void>;
export declare const clearPurificationMaterial: (qqUserId: string) => Promise<void>;
export declare const executePurification: (qqUserId: string) => Promise<{
    succeeded: boolean;
    inputName: string;
    inputQuantity: number;
    outputName: string;
    outputQuantity: number;
    success: number;
    proficiencyGain: number;
    progress: AlchemistProgress;
}>;
export declare const executeBulkPurification: (qqUserId: string) => Promise<{
    inputQuantity: number;
    outputQuantity: number;
    outputs: {
        name: string;
        quantity: number;
    }[];
    success: number;
    proficiencyGain: number;
    progress: AlchemistProgress;
}>;
export declare const alchemyState: (qqUserId: string) => Promise<{
    progress: AlchemistProgress;
    mainId: number | null;
    mainName: string | null;
    mainQuantity: number;
    auxiliaryId: number | null;
    auxiliaryName: string | null;
    auxiliaryQuantity: number;
    reagentId: number | null;
    reagentName: string | null;
    reagentQuantity: number;
    confirmationPending: boolean;
    processing: boolean;
}>;
export declare const selectAlchemyMaterial: (qqUserId: string, role: "main" | "auxiliary" | "reagent", itemKey: string, quantity?: number) => Promise<string>;
export declare const clearAlchemyMaterial: (qqUserId: string, role: "main" | "auxiliary" | "reagent") => Promise<void>;
export declare const alchemyMaterials: (qqUserId: string) => Promise<{
    id: number;
    code: string;
    name: string;
    category: string;
    quantity: number;
}[]>;
export declare const saveAlchemyFormula: (qqUserId: string) => Promise<{
    id: number;
    name: string;
    capacity: number;
}>;
export declare const alchemyFormulaList: (qqUserId: string, page?: number, keyword?: string) => Promise<{
    capacity: number;
    total: number;
    page: number;
    totalPages: number;
    keyword: string;
    formulas: {
        id: number;
        name: string;
        mainName: string;
        auxiliaryName: string | null;
        reagentName: string | null;
    }[];
}>;
export declare const renameAlchemyFormula: (qqUserId: string, formulaId: number, name: string) => Promise<string>;
export declare const loadAlchemyFormula: (qqUserId: string, formulaId: number) => Promise<string>;
export declare const deleteAlchemyFormula: (qqUserId: string, formulaId: number) => Promise<void>;
export declare const cancelAlchemyConfirmation: (qqUserId: string) => Promise<void>;
type DynamicAlchemyResult = {
    needsConfirmation?: boolean;
    succeeded?: boolean;
    batches?: number;
    successRate?: number;
    greatSuccesses?: number;
    failures?: number;
    outputs?: {
        name: string;
        quantity: number;
    }[];
    stages?: string[];
    proficiencyGain?: number;
    progress?: {
        level: number;
        proficiency: number;
        required: number;
        bonus: number;
    };
};
export declare const executeAlchemy: (qqUserId: string, confirmed?: boolean) => Promise<DynamicAlchemyResult>;
export declare const finishAlchemyProcessing: (qqUserId: string) => Promise<void>;
export {};
