import { Format } from 'alemonjs';
import type { newWorldPanel } from './new-world.service';
export declare const newWorldFormat: (panel: Awaited<ReturnType<typeof newWorldPanel>>, notice?: string) => Format;
