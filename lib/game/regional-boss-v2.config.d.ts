import type { RegionalV2Code } from './regional-boss-v2';
export declare const regionalV2Resistance: Record<RegionalV2Code, Record<string, number>>;
export declare const regionalV2Passives: Record<RegionalV2Code, Array<{
    name: string;
    description: string;
}>>;
export declare const regionalV2SkillProfiles: Record<string, {
    power: number;
    ratio: number;
}>;
export declare const regionalV2Skills: readonly [readonly ["gruen_v2_measure", "山脊测重", "physical", "土"], readonly ["gruen_v2_fault", "断层推进", "physical", "土"], readonly ["gruen_v2_warning", "地脉预震", "utility", "土"], readonly ["gruen_v2_quake", "山心崩震", "physical", "土"], readonly ["gruen_v2_faultquake", "断层崩震", "physical", "土"], readonly ["gruen_v2_overturn", "万壑倾覆", "physical", "土"], readonly ["valk_v2_orders", "监工派令", "utility", "无"], readonly ["valk_v2_inspect", "赤铁抽检", "physical", "无"], readonly ["valk_v2_cold", "冷砧回火", "physical", "无"], readonly ["valk_v2_forge", "赤铁横锻", "physical", "无"], readonly ["valk_v2_slag", "炉渣喷流", "magic", "火"], readonly ["valk_v2_sentence", "白热裁决", "magic", "火"], readonly ["valk_v2_overload", "封炉清算", "magic", "火"]];
export declare const regionalV2Rotation: Record<string, string[]>;
