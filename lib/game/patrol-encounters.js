import { dynamicWorldRegions } from './world-dynamics.content.js';
import { dynamicNpcVoiceAnchor } from './dynamic-npc-dialogue.service.js';

const patrolKindNames = { clue: '巡路查线', observe: '定点观测', rescue: '救援转移', sample: '封存样本', escort: '护送旅人' };
const ecology = {
    baina_town: { trace: '被翻到背面的街口告示', danger: '松动的雨棚横梁', sample: '雨棚铆钉上的锈屑', signal: '旧钟与街口报时的偏差', duties: ['核实告示上的改道安排是否真的张贴到街口', '沿归客常走的街巷检查夜间落脚处', '对照旧钟报时，查清交接簿上错开的时刻'] },
    world_tree: { trace: '根桥边被磨断的引路绳', danger: '缠住栈道的幼根', sample: '引路绳上的树脂', signal: '幼根伸向栈道的方向', duties: ['确认祭坛附近的新根没有拦住行路', '查看挂信处到根桥之间的交接记号', '到树冠投影边缘校对观景台记录'] },
    dark_forest: { trace: '被反插的巡哨木签', danger: '横在旧路上的倒木', sample: '木签上的荧孢', signal: '林缘鸟鸣中断的方位', duties: ['核对上一班留下的回返记号', '检查修好的路标是否仍指向安全林段', '查看夜行人惯走的林路是否还能通过'] },
    dark_forest_deep: { trace: '少了一结的回返绳', danger: '掩住树根裂隙的菌毯', sample: '回返绳上的菌丝', signal: '雾线吞没绳结的次序', duties: ['在带人入林前检查回返绳', '核实采样区外的菌环有没有扩张', '补记旧石门外脱落的绳结'] },
    worldtree_meadow: { trace: '偏向饮水坡的兽群蹄印', danger: '被踩塌的草沟边缘', sample: '蹄印中的琥珀花粉', signal: '风铃停顿与兽群移动的先后', duties: ['沿饮水坡确认幼兽没有掉队', '查看药圃外的授粉草带有没有受损', '在新手出发前复查绕开泥沟的路线'] },
    morningdew_riverbank: { trace: '系在错误渡头的信袋浮标', danger: '松脱的渡头踏板', sample: '浮标绳上的银色水藻', signal: '回流纹与浮标偏移的方向', duties: ['核对信袋浮标，免得下一船把急信送错渡头', '逐段试查浮桥缆索的受力', '查看旅人夜间上岸的浅滩是否安全'] },
    gravelwind_shore: { trace: '被盐膜遮住的退潮刻线', danger: '积水下松动的礁石', sample: '刻线上的薄盐晶', signal: '潮池退水与灯塔报潮的时差', duties: ['到潮池核对灯塔的退潮记录', '沿搁浅小艇的拖痕查找船底损伤来源', '确认祭棚通向岸线的退潮路仍可走'] },
    ridge_foothills: { trace: '落石下露出的旧矿道标钉', danger: '尚未稳定的碎岩坡', sample: '标钉旁的新鲜岩粉', signal: '石笛回声与裂缝响动的间隔', duties: ['检查矿道口的支撑与禁行标记', '在山口实测石笛信号能否传到下一岗', '复查补给搬运经过的坡道'] },
    rediron_pass: { trace: '被灰覆盖的炉道泄压标记', danger: '漏出热汽的渠盖', sample: '泄压口的暗红灰屑', signal: '警铃响动与热汽喷出的先后', duties: ['到炉道外核对警铃前的泄压征兆', '检查冷却渠末端是否仍有水流', '查看避烬所外的撤离路有无堵塞'] },
    mistalgae_marsh: { trace: '漂离安全水道的浮草结', danger: '看似实地的浮草薄层', sample: '浮草结上的发光孢子', signal: '孢光变暗与浮岛移位的次序', duties: ['在下一班渡筏出发前重认浮草路', '测量温室外孢群是否越过隔离线', '确认露出水面的石碑刻度没有被泥遮住'] },
    fallenstar_swamp: { trace: '被星泥盖住的测深刻度', danger: '正在下陷的泥岸', sample: '刻度上的银蓝星泥', signal: '泥面闪光与气泡上浮的间隔', duties: ['复核新陨坑周围的泥岸承重', '检查封存库外样本转运留下的痕迹', '沿观测线寻找失去回应的测深杆'] },
    frostcrown_plateau: { trace: '断在雪坡转角的引路旗线', danger: '覆盖冰裂的薄雪', sample: '旗线上的镜面雪粒', signal: '雪面反光与真实足迹的偏移', duties: ['替下一批旅人检查风雪中的路旗', '复查补给转运途中容易结冰的路段', '到雪坡边缘核对避风处的观测记录'] },
    thundercliff: { trace: '挂在低处的断线测雷鸢', danger: '被阵风掀起的悬桥木板', sample: '鸢线上的导电矿尘', signal: '鸢骨放电与雷声抵达的时差', duties: ['收回断线测雷鸢，查明是否需要改线', '复查悬桥的缆绳与背风支点', '到崖口核实下一段路的通行信号'] },
    eclipse_ruins: { trace: '影子没有覆盖的半块石刻', danger: '塌陷的月井台阶', sample: '石刻缝中的暗色露珠', signal: '月井倒影与石柱影线的交点', duties: ['核对遗迹通路上的旧刻痕', '检查档案转运经过的石阶', '在月井外确认影线异常的边界'] }
};
const patrolKindFor = (routeIndex, revision, npcIndex) => routeIndex === 1 ? 'clue' : ['observe', 'rescue', 'sample', 'escort'][Math.abs(revision + npcIndex) % 4];
const patrolObjective = (patrol, node) => ({
    text: node === 'handoff' ? `将${patrol.kind === 'rescue' ? '伤者' : '旅人'}送到${patrol.target.name}门前，确认安置。` : `在${patrol.origin.name}完成${patrolKindNames[patrol.kind]}。`,
    location: node === 'handoff' ? patrol.target : patrol.origin
});
const patrolPositionMatches = (player, location) => Number(player.region_id) === location.regionId && Number(player.pos_x) === location.x && Number(player.pos_y) === location.y && Number(player.pos_z) === location.z;
const buildPatrolEncounter = (npcCode, kind, targetName, affinity = 0, stage = 0, variant = 0, copper = 12) => {
    const region = dynamicWorldRegions.find(region => region.npcs.some(npc => npc.code === npcCode));
    const npc = region?.npcs.find(npc => npc.code === npcCode);
    if (!region || !npc)
        throw new Error('这位域民尚未登记巡查职责。');
    const local = ecology[region.code];
    const voice = dynamicNpcVoiceAnchor(npcCode, affinity, variant);
    const reason = `${voice.displayName}正在${local.duties[npc.homeIndex]}。`;
    const greeting = `${voice.catchphrase}。${affinity >= 200 ? voice.trust : affinity >= 50 ? voice.warmth : voice.caution}。`;
    const urgency = stage >= 5 ? '最近这段路的异常记录多了，我得把这一处也查清。' : '趁下一批行人经过前，先把缘由弄明白。';
    const details = {
        clue: `我发现了${local.trace}，旁边就是${local.danger}。记号若有错，后来的人会被引向危险。能帮我核对一下，再决定修正记号还是留下警示吗？`,
        observe: `这里最适合观察${local.signal}。只看一次容易误判；请帮我连续记两次，分清真正的变化与偶然的干扰。`,
        rescue: `有个旅人经过${local.danger}时失足扭伤了脚，暂时走不动。先固定伤处，再送到${targetName}门前的安全落脚处；别急着把人拉起来。`,
        sample: `我在${local.trace}旁找到了${local.sample}。它可能说明记号为什么变了。请取边缘的一小份封好；若无法安全接近，就记下位置，别毁掉现场。`,
        escort: `有个初到这里的旅人被${local.trace}误导，正准备经过${local.danger}。请先说明危险，再陪他绕到${targetName}门前；我还得留在这儿提醒后来的人。`
    };
    const finish = (code, label, text, progress = true) => ({ code, label, text, copper: progress ? copper : 0, worldline: region.worldline, stage: progress ? 1 : 0, flag: `${npcCode}_${kind}_${code}` });
    const leave = finish('leave', '暂不参与', '你记住了提醒，向域民道别，没有接手现场的事务。', false);
    const opening = `${reason}\n\n${voice.gesture}。\n“${greeting}${details[kind]}${urgency}”`;
    const nodes = {
        opening: { text: opening, choices: [] }
    };
    if (kind === 'clue') {
        nodes.opening.choices = [{ code: 'inspect', label: '核对沿途线索', text: `你对照两侧行迹，发现${local.trace}与现有通路对不上。`, nextNode: 'evidence' }, leave];
        nodes.evidence = { text: `痕迹指向${local.danger}。原有记号已经不适合作为通行依据，你可以把安全方向补清，也可以先封住误导处。`, choices: [finish('repair', '补正安全方向', `你沿安全一侧复核后补正了记号，留下${local.trace}的变化记录，后来者有了可核对的方向。`), finish('warn', '标出危险并留证', `你在${local.danger}之前留下禁行提示，并保存原有痕迹，供后续巡查追溯。`), leave] };
    }
    else if (kind === 'observe') {
        nodes.opening.choices = [{ code: 'measure', label: '连续记录两次', text: `你以固定位置为基准，记下${local.signal}的两次变化。`, nextNode: 'evidence' }, leave];
        nodes.evidence = { text: '两次记录并不完全相同。对照后发现，靠近路面的读数变化明显，远处的参照却保持稳定。', choices: [finish('boundary', '标定异常边界', `你标出读数开始偏离的位置，将${local.signal}的观测范围缩小到现场附近。`), finish('record', '保留原始观测', '你保留两组读数与测量位置，没有把尚未证实的推测写成结论；下次复测有了可靠参照。'), leave] };
    }
    else if (kind === 'sample') {
        nodes.opening.choices = [{ code: 'collect', label: '取边缘样本', text: `你避开${local.danger}，只取下少量${local.sample}，保留其余现场。`, nextNode: 'evidence' }, finish('mark', '记录位置待复采', `你标出${local.sample}的位置与危险边界，留下不应贸然靠近的提示。`), leave];
        nodes.evidence = { text: `少量${local.sample}已经放入域民留下的样本匣。下一步要防止来源混淆。`, choices: [finish('seal', '分装封存并标注来源', `你封好样本匣，注明${local.trace}旁的采集位置，放入约定的巡查收取处。`), finish('compare', '附上对照记录', `你将${local.sample}单独封存，并记录附近未受影响的位置，便于后续比较。`), leave] };
    }
    else {
        const rescue = kind === 'rescue';
        nodes.opening.choices = [{ code: 'prepare', label: rescue ? '固定伤处再转移' : '说明险情并带路', text: rescue ? `你用现场急救包固定伤处，确认伤者能够在搀扶下缓慢前行。接下来带他到${targetName}门前。` : `你向旅人说明误导记号，约定跟紧你的脚步，一起前往${targetName}门前。`, nextNode: 'handoff' }, leave];
        nodes.handoff = { text: `请带${rescue ? '伤者' : '旅人'}到${targetName}门前的安全落脚处，再确认安置。域民继续照看原处的危险路段。`, choices: [finish('deliver', '确认抵达并安置', `你已将${rescue ? '伤者' : '旅人'}带到${targetName}门前，安排其在安全处歇脚，并在巡查交接夹中留下到达记录。`), finish('leave', '中止护送并呼援', '你停止继续护送，在安全处留下求援标记，等待后续巡查接应。本次未完成交接。', false)] };
    }
    return { title: `${npc.name}的${patrolKindNames[kind]}·${kind === 'sample' ? local.sample : kind === 'observe' ? local.signal : local.trace}`, reason, opening, definition: { relatedNpcCodes: [npcCode], relatedSiteCodes: [region.buildings[npc.homeIndex].code], nodes } };
};

export { buildPatrolEncounter, patrolKindFor, patrolKindNames, patrolObjective, patrolPositionMatches };
