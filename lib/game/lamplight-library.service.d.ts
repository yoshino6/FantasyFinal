import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { LamplightState } from './lamplight.types';
export declare const lamplightLibraryRooms: readonly [readonly ["大厅", "总目录把“界路维护”归在生命与居所的交叉索引。你找到一张磨损的卡片，卡上提醒：被删去的路，不一定无人居住。"], readonly ["阅览室", "旧笔记将界路连接与灵魂承载分开记录。相同笔迹留下资料室的索引号，并指出维护记录必须与居民见闻相互核验。"], readonly ["资料室", "你在第七列封存盒找到引荐函。落款提及噶，函中还有旧界路的编号规则，不能只凭后来抄录的地图认定一处地方不存在。"], readonly ["休息室", "守馆人记得那位爱喝苦茶的研究者。你询问她离开的方向，核对旧留言，然后带着已查明的索引前往无尽回廊。"], readonly ["无尽回廊", "引荐函上的火漆与门边的笔画对应。你沿原编号找到研究室，门里传来杯盏轻响。噶先请你把证据放到桌上，没有直接替你下结论。"]];
export declare const lamplightLibraryAction: (c: PoolConnection, character: RowDataPacket, state: LamplightState, flags: Record<string, any>, action: string) => Promise<void>;
