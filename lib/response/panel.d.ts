import { Format } from 'alemonjs';
import { type MapLandmark, type NearbyPoint } from '../game/adventure.service';
type LocationCharacter = {
    adventurer_registered: number;
    region_name: string;
    pos_x: number;
    pos_y: number;
    pos_z: number;
};
export declare const currentLocationText: (character: LocationCharacter) => string;
export declare const movedLocationText: (character: LocationCharacter) => string;
export declare const outsidePanel: (title: string, location: string, speed: number, range: number, x: number, y: number, description: string, points: NearbyPoint[], resting?: boolean, landmarks?: MapLandmark[], speaker?: string, speedLimit?: number, perceptionObscured?: boolean, showLandmarks?: boolean, showPlayers?: boolean, mapUnlocked?: boolean, activityStatus?: string, emphasizeSpeaker?: boolean) => Format;
export declare const panelButtons: (resting?: boolean, _autoBattleEnabled?: boolean, blockedDirections?: string[]) => import("alemonjs").FormatButtonGroup;
declare const _default: () => Promise<void>;
export default _default;
export declare const restHandler: () => Promise<void>;
export declare const resumeActionHandler: () => Promise<void>;
export declare const mapLandmarkVisibilityHandler: () => Promise<void>;
export declare const nearbyPlayersVisibilityHandler: () => Promise<void>;
