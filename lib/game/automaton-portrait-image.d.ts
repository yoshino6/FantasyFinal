export declare const portraitMaxBytes: number;
export declare const isPortraitPublicAddress: (address: string) => boolean;
export declare const downloadPortrait: (value: string) => Promise<Buffer>;
export declare const normalizePortrait: (input: Buffer) => Promise<{
    data: Buffer<ArrayBuffer>;
    width: number;
    height: number;
}>;
export declare const portraitPath: (key: string) => string;
export declare const writePortrait: (key: string, data: Buffer) => Promise<void>;
export declare const readPortrait: (key: string) => Promise<NonSharedBuffer>;
export declare const removePortrait: (key: string) => Promise<void>;
export declare const portraitHeaderImage: (key: string) => Promise<Buffer<ArrayBuffer>>;
