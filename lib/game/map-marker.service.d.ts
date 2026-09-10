export type MapMarker = {
    code?: string;
    name: string;
    siteType?: string | null;
};
export declare const markerName: (marker: MapMarker) => string;
export declare const sortMapMarkers: <T extends MapMarker>(markers: T[]) => T[];
