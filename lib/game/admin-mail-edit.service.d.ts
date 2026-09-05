type Scope = 'personal' | 'global';
export type MailEdit = {
    scope: Scope;
    status: 'editing' | 'draft';
    title: string;
    content: string;
    recipients: Array<{
        qqUserId: string;
        nickname: string;
    }>;
    attachments: Array<{
        itemId: number;
        name: string;
        quantity: number;
    }>;
};
export declare const activeMailEdit: (adminQqUserId: string) => Promise<boolean>;
export declare const openMailEdit: (adminQqUserId: string, scope: Scope) => Promise<MailEdit>;
export declare const switchMailEditToGlobal: (adminQqUserId: string) => Promise<MailEdit>;
export declare const getMailEdit: (adminQqUserId: string) => Promise<MailEdit>;
export declare const addMailRecipientByQq: (adminQqUserId: string, targetQqUserId: string) => Promise<MailEdit>;
export declare const addMailRecipientByName: (adminQqUserId: string, name: string) => Promise<MailEdit>;
export declare const removeMailRecipient: (adminQqUserId: string, targetQqUserId: string) => Promise<MailEdit>;
export declare const updateMailContent: (adminQqUserId: string, content: string) => Promise<MailEdit>;
export declare const updateMailTitle: (adminQqUserId: string, title: string) => Promise<MailEdit>;
export declare const addMailAttachment: (adminQqUserId: string, itemKey: string, quantity: number) => Promise<MailEdit>;
export declare const updateMailAttachmentQuantity: (adminQqUserId: string, itemId: number, quantity: number) => Promise<MailEdit>;
export declare const removeMailAttachment: (adminQqUserId: string, itemId: number) => Promise<MailEdit>;
export declare const stashMailEdit: (adminQqUserId: string) => Promise<void>;
export declare const discardMailEdit: (adminQqUserId: string) => Promise<void>;
export declare const previewMailEdit: (adminQqUserId: string) => Promise<MailEdit>;
export declare const sendMailEdit: (adminQqUserId: string) => Promise<{
    recipientCount: number;
    attachments: {
        itemId: number;
        name: string;
        quantity: number;
    }[];
}>;
export {};
