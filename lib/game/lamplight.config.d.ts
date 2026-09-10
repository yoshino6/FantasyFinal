import type { LamplightHub, LamplightNode, LamplightState } from './lamplight.types';
export declare const lamplightWorldPlaces: readonly [readonly ["lamplight_wm01", "王都·外使行馆", "马车停在王都外使行馆。这里留着公众办事的长桌，也留着不必经过家族就能写信的地方。"], readonly ["lamplight_wm02", "北境·雪灯接应站", "雪灯标出两条回程路。暖房里的人轮流报平安，旧军令和新鲜的面包放在不同的桌上。"], readonly ["lamplight_wm03", "天穹修理院·转乘空港", "护栏围住开阔的降落坪。云下面有路，云上面也有人等着交班以后回家。"], readonly ["lamplight_wm04", "魔界·公议行馆", "厚重的门为正式来访者打开。每把椅子前都有发言的位置，空席的名字也没有被划掉。"], readonly ["lamplight_wm05", "神界·公务接引厅", "公务光门落在接引厅的另一侧。你仍活着，也仍是原来的自己；这次带来的是地面的问题。"], readonly ["lamplight_wm06", "失落矿城·第十三间客房", "矿车的到站铃从深处传来。应急温室仍有灯，旅馆多出的那间房终于等到有回程的人。"], readonly ["lamplight_wm07", "大陆联合接应营地", "六地的信堆在桌边，帐篷出口留得很宽。有人接前线，也有人替刚回来的人把热饭端稳。"], readonly ["lamplight_wm08", "界路中枢·联合前哨", "地图在半空缓慢展开。主线与备用线都亮着，通向中枢的路已经留下了能够退回的一端。"]];
export declare const lamplightHubNames: Record<LamplightHub, string>;
export declare const lamplightNodes: (state: LamplightState) => LamplightNode[];
export declare const lamplightNode: (state: LamplightState) => LamplightNode;
export declare const lamplightPrivateEcho: (state: LamplightState) => string;
export declare const nextLamplightState: (state: LamplightState) => Pick<LamplightState, "phase" | "node_index">;
export declare const lamplightPublicText: (text: string, state: Pick<LamplightState, "origin_branch" | "origin_route">) => string;
