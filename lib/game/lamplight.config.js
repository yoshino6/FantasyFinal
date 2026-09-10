import { lamplightLegacy, lamplightPrivate, lamplightLocal, lamplightJoin, lamplightWorld } from './lamplight-content.generated.js';
import { firstPersonNarrative } from './narrative-voice.js';

const lamplightWorldPlaces = [
    ['lamplight_wm01', '王都·外使行馆', '马车停在王都外使行馆。这里留着公众办事的长桌，也留着不必经过家族就能写信的地方。'],
    ['lamplight_wm02', '北境·雪灯接应站', '雪灯标出两条回程路。暖房里的人轮流报平安，旧军令和新鲜的面包放在不同的桌上。'],
    ['lamplight_wm03', '天穹修理院·转乘空港', '护栏围住开阔的降落坪。云下面有路，云上面也有人等着交班以后回家。'],
    ['lamplight_wm04', '魔界·公议行馆', '厚重的门为正式来访者打开。每把椅子前都有发言的位置，空席的名字也没有被划掉。'],
    ['lamplight_wm05', '神界·公务接引厅', '公务光门落在接引厅的另一侧。你仍活着，也仍是原来的自己；这次带来的是地面的问题。'],
    ['lamplight_wm06', '失落矿城·第十三间客房', '矿车的到站铃从深处传来。应急温室仍有灯，旅馆多出的那间房终于等到有回程的人。'],
    ['lamplight_wm07', '大陆联合接应营地', '六地的信堆在桌边，帐篷出口留得很宽。有人接前线，也有人替刚回来的人把热饭端稳。'],
    ['lamplight_wm08', '界路中枢·联合前哨', '地图在半空缓慢展开。主线与备用线都亮着，通向中枢的路已经留下了能够退回的一端。']
];
const lamplightHubNames = { baina_town: '莫妮卡', world_tree: '维萝', floating_leaf_town: '菈芮', snowlamp_hollow: '温棠', frost_dragon_inn: '格琳达', sleepwhale_market: '滴算' };
const lamplightNodes = (state) => {
    if (state.phase === 'private')
        return (state.story_version < 4 ? lamplightLegacy[state.origin_route] : undefined) ?? lamplightPrivate[state.origin_route] ?? [
            { code: 'LEGACY-1', title: '最初那张登记表', npc: lamplightHubNames[state.local_hub], intro: '接待员翻开你已有的冒险记录，确认你走过的路。没有记载的初行，不会被补写成另一个人的奇遇。', findings: ['现有登记、职业与任务经历逐一核实，已经完成的事保留原样。', '公会将本地正在调查的案卷交给你，请你从能够核实的部分开始。'], choices: ['从居民的见闻查起', '从交通与补给记录查起'], conclusion: '你以自己已有的经历接过案卷，没有领取另一份初行奖励。', minLevel: 5, endLevel: 7, copper: 0, experienceShare: 0, place: 'origin' }
        ];
    if (state.phase === 'local')
        return lamplightLocal[state.local_hub];
    if (state.phase === 'join')
        return lamplightJoin;
    if (state.phase === 'world')
        return lamplightWorld;
    return [];
};
const lamplightNode = (state) => lamplightNodes(state)[state.node_index];
const lamplightPrivateEcho = (state) => {
    const arc = (state.story_version < 4 ? lamplightLegacy[state.origin_route] : undefined) ?? lamplightPrivate[state.origin_route];
    if (!arc)
        return '最初公会寄来一封值守回信，确认愿意参与本次接应。';
    return `公会转来${arc[0].npc}的署名回复。\n${lamplightPublicText(arc.at(-1).conclusion, state)}\n\n${state.phase === 'completed' ? '这次交接已经完成，双方签收留在案卷中。' : '回复确认能够协助一次本地交接，具体数量和接收人仍要由你在本次行动中核验。'}`;
};
const nextLamplightState = (state) => {
    if (state.node_index + 1 < lamplightNodes(state).length)
        return { phase: state.phase, node_index: state.node_index + 1 };
    const next = { private: 'local', local: 'join', join: 'world', world: 'completed', completed: 'completed' };
    return { phase: next[state.phase], node_index: 0 };
};
const lamplightPublicText = (text, state) => {
    let result = text;
    if (state.origin_route === 'F02') {
        result = result.replace('救援线邀请本人赴约；出手线则是她要求归还坠落护具上的王印拓本，语气冷淡，见面由公会见证', state.origin_branch === 'B' ? '她邀请你赴约，公会已确认安全会面的安排' : '她请公会见证护具王印的拓本核验，口信语气冷淡');
        result = result.replace('救援线她主动说明伤势来源；敌对线只给足以查案的信息，玩家从公开货单补足其余证据', state.origin_branch === 'B' ? '她主动说明当日伤势的来由，你对照公开货单核实' : '她只提供查案所需的信息，你从公开货单核对其余证据');
        if (state.origin_branch === 'B')
            result = result.replace('“我邀请的是帮过我的人。”她看了眼公会的印章，“若你不是，那我们今天就只谈这份货单。”', '“你来过，我记得。”她将货单推近些，“这次，也请先听我把话说完。”');
    }
    result = result.replace(/(?:初行 |来时选择 )?A ([^。]+)(?=。|$)/g, (whole, body) => {
        const parts = ('A ' + body).split(/[，；]\s*(?=[BC] )/);
        if (parts.length < 2)
            return whole;
        const picked = parts.find(p => p.startsWith(state.origin_branch + ' '));
        return picked?.slice(2).replace(/[，；]\s*(?:归|转) [A-Z]+-\d.*$/, '') ?? '你依据自己保留的经历核对原记录';
    });
    if (state.origin_route === 'F01')
        result = state.origin_branch === 'A' ? result.replace(/；若当初出手[^。]+。/, '。').replace(/；宝箱线[^。]+。/, '。') : result.replace(/^安置好的黄金兔[^；]+；若当初出手/, '当初开出的宝箱').replace(/喂兔线[^；]+；宝箱线/, '你将');
    const labelled = result.match(/(?:初行|来时选择) A ([\s\S]*?)(?=。)/);
    if (labelled) {
        const pieces = ('A ' + labelled[1]).split(/[，；](?=[ABC] )/);
        const selected = pieces.find(p => p.startsWith(state.origin_branch + ' '));
        result = result.replace(labelled[0], selected?.slice(2) ?? '你从自己保存的经历与证据开始核验');
    }
    const publicText = result.replace(/[，；](?:不是.*等玩家|不发|不重发|不补发|不补领|不新增|不要求.*背包)[^。]*[。]?/g, '。').replace(/(?:[，；]\s*)?(?:归|转|交) (?:HB|HW|HF|HS|HD|HM|JN)-?\d*/g, '').replace(/(?:WM\d{2}|HB|HW|HF|HS|HD|HM|JN)-?\d*/g, '后续调查').replace(/奖励 P[。，]?/g, '').replace(/玩家/g, '你').replace(/两支都|三支都|两者都/g, '随后')
        .split(/(?<=[。；])/).filter(s => !/(?:初行 [ABC]|来时选择 [ABC]|来源白名单|U 类|无援天赋|神技|实力投影|仅一件|奖励预算|奖励不|两支都|三支都|两者都|两项要点最终|归入|归 H|初行关系者|该节点|本稿|主线状态|任务键|story_version|Lv\.|不发|不重发|不补发|不补领|不新增|不是.*等你|不要求.*背包)/.test(s)).join('').replace(/^可【/, '你可以【').trim();
    return firstPersonNarrative(publicText);
};

export { lamplightHubNames, lamplightNode, lamplightNodes, lamplightPrivateEcho, lamplightPublicText, lamplightWorldPlaces, nextLamplightState };
