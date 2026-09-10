import { type PortraitUpload } from './automaton-portrait.service';
export declare const cleanupPortrait: (key: string | undefined) => Promise<void>;
export declare const acceptPortraitImage: (user: string, upload: PortraitUpload, media: {
    Type?: string;
    Url?: string;
    MimeType?: string;
    FileSize?: number;
}[]) => Promise<{
    name: string;
    id: number;
}>;
