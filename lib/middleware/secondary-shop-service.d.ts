import { type ServiceShop } from '../game/secondary-shop-context';
export declare const shopServiceMiddleware: (fixedShop?: ServiceShop) => (_event: unknown, next: () => Promise<void>) => Promise<void>;
