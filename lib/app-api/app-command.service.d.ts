import { type AppMessage } from './app-format';
type AppCommandInput = {
    qqUserId: string;
    command: string;
};
export declare const executeAppCommand: (input: AppCommandInput) => Promise<AppMessage>;
export declare const appQuickPanel: () => AppMessage;
export {};
