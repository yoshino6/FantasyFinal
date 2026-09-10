import { type RuleUnit } from './combat-rule-registry';
import { type HiddenDevice } from './hidden-combat-state';
import type { HiddenProfessionCode } from './hidden-profession.config';
export type HiddenTrial = {
    units: RuleUnit[];
    devices: HiddenDevice[];
    turn: number;
    log: string[];
    particles: number;
    won: boolean;
    events: string[];
};
export declare const newHiddenTrial: (profession: HiddenProfessionCode) => HiddenTrial;
export declare const advanceHiddenTrial: (profession: HiddenProfessionCode, previous?: HiddenTrial) => Promise<HiddenTrial>;
