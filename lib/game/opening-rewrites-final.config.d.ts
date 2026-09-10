import type { OpeningBranch, OpeningChoice, OpeningRoute } from './opening.types';
type Branch = Pick<OpeningChoice, 'label' | 'pages' | 'quest' | 'task' | 'farewell' | 'future' | 'rewardName' | 'rewardUse' | 'rewardKind' | 'bonusItem' | 'rewardItems' | 'rewardCopper' | 'rewardEquipment'>;
export type OpeningRewrite = Pick<OpeningRoute, 'title' | 'moveEntry' | 'huntEntry' | 'pages' | 'arrival' | 'lessonText' | 'person'> & {
    choices: Partial<Record<OpeningBranch, Branch>>;
};
export declare const finalOpeningRewrites: Record<string, OpeningRewrite & {
    choices: Partial<Record<OpeningBranch, Branch>>;
}>;
export {};
