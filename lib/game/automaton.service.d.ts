import type { AutomatonBattleState } from './automaton-combat';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { type AutomatonState } from './automaton';
import type { AlchemyIngredient } from './alchemy-journal';
export type AutomatonRow = RowDataPacket & {
    id: number;
    holder_id: number;
    creator_id: number;
    owner_id: number | null;
    following: number;
    bound_kind: string;
    state_json: unknown;
    revision: number;
    recover_at: Date | null;
    combat_id: string | null;
    market_listing_id: number | null;
};
type Character = RowDataPacket & {
    id: number;
    level: number;
    realm_stage: number;
    secondary_profession_code: string | null;
};
export declare const automatonCharacter: (connection: PoolConnection, user: string) => Promise<Character>;
export declare const assertAutomatonSafe: (connection: PoolConnection, characterId: number) => Promise<void>;
export declare const automatonFor: (connection: PoolConnection, characterId: number, id: number, claimed?: boolean) => Promise<{
    row: AutomatonRow;
    state: AutomatonState;
}>;
export declare const saveAutomaton: (connection: PoolConnection, row: AutomatonRow, state: AutomatonState, revise?: boolean) => Promise<void>;
export declare const recordAutomatonEvent: (connection: PoolConnection, id: number, characterId: number, key: string, kind: string, data: unknown, occurredAt?: Date | null) => Promise<void>;
export declare const recordAutomatonFirstEvent: (connection: PoolConnection, id: number, characterId: number, kind: string, data: unknown, identity?: string) => Promise<void>;
export declare const grantOpeningAutomaton: (connection: PoolConnection, characterId: number) => Promise<{
    id: number;
    state: AutomatonState;
}>;
export declare const automatonEventPage: (user: string, id: number, page?: number) => Promise<{
    page: number;
    pages: number;
    state: AutomatonState;
    events: {
        kind: string;
        time: Date;
        data: Record<string, unknown>;
    }[];
}>;
export declare const automatonIntimacy: (connection: PoolConnection, characterId: number, state: AutomatonState, kind: "interaction" | "cultivation" | "victory", automatonId?: number) => Promise<void>;
export declare const automatonList: (user: string) => Promise<{
    character: Character;
    items: {
        row: AutomatonRow;
        state: AutomatonState;
        battle?: AutomatonBattleState;
    }[];
}>;
export type AutomatonRecipe = {
    code: string;
    name: string;
    profession: 'alchemist' | 'deconstructor';
    chance: number;
    ingredients: {
        code: string;
        quantity: number;
        role: string;
    }[];
};
export declare const automatonRecipes: AutomatonRecipe[];
export declare const automatonCraftChance: (recipe: AutomatonRecipe, level: number) => number;
export declare const automatonRecipeCatalog: (user: string, kind: string) => Promise<(Omit<AutomatonRecipe, "ingredients"> & {
    ingredients: (AutomatonRecipe["ingredients"][number] & {
        name: string;
        owned: number;
    })[];
})[]>;
export declare const previewAutomatonCraft: (user: string, code: string, batches?: number) => Promise<{
    token: `${string}-${string}-${string}-${string}-${string}`;
    recipe: {
        chance: number;
        code: string;
        name: string;
        profession: "alchemist" | "deconstructor";
        ingredients: {
            code: string;
            quantity: number;
            role: string;
        }[];
    };
    batches: number;
    ingredients: AlchemyIngredient[];
    owned: Record<string, number>;
    reserved: number;
}>;
export declare const confirmAutomatonCraft: (user: string, token: string) => Promise<{
    text: string;
    code: string;
    journalId: number;
}>;
export declare const cultivationInput: (args: string[]) => {
    bottles: {
        code: string;
        count: number;
    }[];
    stop: number;
};
export declare const previewAutomatonMutation: (user: string, id: number, action: string, args?: string[]) => Promise<{
    token: `${string}-${string}-${string}-${string}-${string}`;
    description: string;
}>;
export declare const confirmAutomatonMutation: (user: string, token: string) => Promise<{
    text: string;
}>;
export {};
