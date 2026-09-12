import { Format } from 'alemonjs';
import { openingRoadPanel } from '../game/opening-road.service';
export declare const openingRoadPanelFormat: (panel: Awaited<ReturnType<typeof openingRoadPanel>>) => Format;
export declare const openingRoadPanelHandler: () => Promise<void>;
export declare const openingRoadChoiceHandler: () => Promise<void>;
