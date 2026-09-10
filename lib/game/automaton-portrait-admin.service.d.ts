import { type WebRole } from './operation-journal.service';
export declare const adminPortraitReviews: (query: {
    page?: unknown;
    keyword?: unknown;
    status?: unknown;
}) => Promise<{
    page: number;
    pages: number;
    total: number;
    entries: {
        id: number;
        automatonId: number;
        playerName: any;
        userId: any;
        name: any;
        status: any;
        reason: any;
        reviewer: any;
        createdAt: any;
        reviewedAt: any;
    }[];
}>;
export declare const adminPortraitPreview: (id: number) => Promise<NonSharedBuffer>;
export declare const decidePortraitReview: (actor: {
    username: string;
    role: WebRole;
}, id: number, decision: unknown, reasonValue: unknown) => Promise<{
    status: string;
    operationId: `${string}-${string}-${string}-${string}-${string}`;
}>;
