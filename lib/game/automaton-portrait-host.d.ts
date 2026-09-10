export declare const portraitHostConfig: () => {
    provider: string;
    url: string;
    token: string;
};
export declare const parsePortraitHostResponse: (value: unknown) => string;
export declare const uploadPortraitToHost: (data: Buffer, key: string) => Promise<string>;
