import { Format } from 'alemonjs';
export declare const appendItemUse: (markdown: ReturnType<typeof Format.createMarkdown>, item: {
    id: number;
    code: string;
    item_type?: string;
    effect_json?: unknown;
}) => import("alemonjs").FormatMarkDown;
declare const _default: () => Promise<void>;
export default _default;
