export declare const openingPersonHandler: () => Promise<void>;
export declare const openingChoiceHandler: () => Promise<void>;
export declare const continueOpeningIfPresent: (user: string, message: {
    send: (params: any) => Promise<any>;
}) => Promise<boolean>;
