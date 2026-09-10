import { type SpecializationBase, type Specialization, type SkillSpecializations, type SkillSpecializationResult } from './skill-specialization';
export declare const specializationNumberText: (value: number) => string;
export declare const specializationPerLevelLines: (tier?: string, levels?: SkillSpecializations, code?: string) => Record<Specialization, string[]>;
export declare const specializationTotalLines: (base: SpecializationBase, current: SkillSpecializationResult) => string[];
export declare const passiveSpecializationPerLevelLine: (tier?: string, currentLevel?: unknown) => string;
export declare const passiveSpecializationTotalLine: (factor: number) => string;
