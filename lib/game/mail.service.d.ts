import type { RowDataPacket } from 'mysql2/promise';
type CharacterRow = RowDataPacket & {
    id: number;
    name: string;
};
export declare const registeredMailRecipient: (qqUserId: string) => Promise<CharacterRow>;
export declare const playerMails: (qqUserId: string, page?: number, keyword?: string) => Promise<{
    keyword: string;
    page: number;
    totalPages: number;
    mails: {
        id: number;
        title: string;
        content: string;
        receivedAt: Date;
        claimed: boolean;
        attachmentCount: number;
        attachments: string;
    }[];
}>;
export declare const mailDetail: (qqUserId: string, mailId: number) => Promise<{
    id: number;
    title: string;
    content: string;
    receivedAt: Date;
    claimed: boolean;
    attachmentCount: number;
    attachments: string;
}>;
export declare const claimMail: (qqUserId: string, mailId: number) => Promise<{
    items: {
        name: string;
        quantity: number;
    }[];
}>;
export declare const claimAllMails: (qqUserId: string) => Promise<{
    mailCount: number;
    items: {
        name: string;
        quantity: number;
    }[];
}>;
export declare const deleteMail: (qqUserId: string, mailId: number) => Promise<void>;
export declare const sendAdminItemMail: (adminQqUserId: string, targetQqUserId: string, itemKey: string, quantity: number, title?: string) => Promise<{
    mailId: number;
    targetName: string;
    itemName: string;
    quantity: number;
}>;
export declare const sendAdminItemMailToAll: (adminQqUserId: string, itemKey: string, quantity: number, title?: string) => Promise<{
    targetCount: number;
    itemName: string;
    quantity: number;
}>;
export {};
