import type { OpeningBranch, OpeningChoice, OpeningRoute } from './opening.types';
type BranchNarrative = Pick<OpeningChoice, 'pages' | 'farewell'>;
type RouteNarrative = Pick<OpeningRoute, 'moveEntry' | 'huntEntry' | 'arrival' | 'lessonText'> & {
    pages?: OpeningRoute['pages'];
    choices: Partial<Record<OpeningBranch, Partial<BranchNarrative>>>;
    lessons?: Partial<Record<OpeningBranch, string>>;
};
export declare const openingNarrativeExpansions: Record<string, RouteNarrative>;
export declare const openingExpandedLesson: (route: string, branch: OpeningBranch) => string | undefined;
export {};
