export declare const planAutomatonComponents: (stock: Map<string, number>, bodies: number) => {
    missing: {
        code: string;
        count: number;
    }[];
    used: {
        code: string;
        count: number;
    }[];
    steps: string[];
};
export declare const previewAutomatonComponents: (user: string, bodies?: number) => Promise<{
    token: `${string}-${string}-${string}-${string}-${string}` | null;
    bodies: number;
    missing: {
        name: string;
        code: string;
        count: number;
    }[];
    used: {
        name: string;
        code: string;
        count: number;
    }[];
    steps: {
        name: string;
        count: number;
    }[];
}>;
export declare const confirmAutomatonComponents: (user: string, token: string) => Promise<{
    text: string;
}>;
