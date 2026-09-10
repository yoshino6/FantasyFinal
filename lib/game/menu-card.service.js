import sharp from 'sharp';

const pages = {
    1: [
        {
            title: '角色档案',
            description: '建立角色与查看自身资料',
            accent: '#8fd3ff',
            entries: [
                { command: '/注册', description: '创建角色，或继续未完成的转生流程' },
                { command: '/角色  ·  /我', description: '查看等级、属性、恩赐与当前位置' },
                { command: '/角色详情', description: '展开查看角色的完整战斗资料' },
                { command: '/角色改名 <新昵称>', description: '修改冒险者昵称' },
                { command: '/改性 <男|女>', description: '调整角色性别' },
                { command: '/卡片', description: '生成冒险者资历卡片' },
                { command: '/状态', description: '查看服务器与世界运行状态' },
                { command: '/注销账户', description: '申请注销当前账户（需二次确认）' }
            ]
        },
        {
            title: '装备与成长',
            description: '背包、技能与职业体系',
            accent: '#c8a6ff',
            entries: [
                { command: '/背包 [装备|道具|材料]', description: '分类查看随身物品；可继续分页或搜索' },
                { command: '/装备', description: '查看、穿戴、切换或卸下装备' },
                { command: '/技能列表 [已学习|未学习]', description: '查看技能并进入学习、升级与快捷配置' },
                { command: '/技能 <1-4>', description: '在战斗中施放对应栏位技能' },
                { command: '/道具 <1-4>', description: '在战斗中使用对应快捷道具' },
                { command: '/副职业', description: '查看锻造、炼金、解构或全知者进度' },
                { command: '/图鉴', description: '查阅已发现的装备、道具、怪物与技能' },
                { command: '/异械', description: '查看并启用已获得的异械' },
                { command: '/道具配置', description: '设置战斗道具快捷栏' }
            ]
        },
        {
            title: '行动与地图',
            description: '从当前位置出发探索世界',
            accent: '#82e3bc',
            entries: [
                { command: '/面板', description: '查看周边目标、移动方向与快捷操作' },
                { command: '/地图', description: '查看已解锁区域与地点标识' },
                { command: '/前往 <横坐标> <纵坐标>', description: '前往当前地图内的指定坐标' },
                { command: '/移动 <上|下|左|右>', description: '按方向进行单步移动' },
                { command: '/调整移速 <距离>', description: '设置单次移动距离' },
                { command: '/寻怪', description: '搜索附近怪物并开始寻路' },
                { command: '/休息  ·  /行动', description: '开始休息恢复，或结束当前休息' },
                { command: '/探索', description: '探索当前位置，发现事件与目标' },
                { command: '/目标 <编号>', description: '查看地图上已发现目标的详情' },
                { command: '/开采 <资源编号>', description: '采集附近的矿产或植被资源' }
            ]
        },
        {
            title: '战斗操作',
            description: '手动战斗与自动作战',
            accent: '#ffb680',
            entries: [
                { command: '/战斗信息', description: '查看敌我生命、魔力、回合与目标' },
                { command: '/攻击', description: '对当前目标使用普通攻击' },
                { command: '/技能 <1-4>', description: '施放技能快捷栏中的技能' },
                { command: '/道具 <1-4>', description: '使用道具快捷栏中的物品' },
                { command: '/切换目标 <编号>', description: '更换当前攻击目标' },
                { command: '/鉴识', description: '鉴别敌我资料与可用信息' },
                { command: '/逃跑', description: '尝试脱离当前战斗' },
                { command: '/自动战斗 [开启|关闭|配置|PVE|PVP]', description: '启停或进入自动作战配置' },
                { command: '/异械施放 <1-4>', description: '在战斗中使用已装配异械' }
            ]
        },
        {
            title: '队伍与社交',
            description: '与其他冒险者同行',
            accent: '#ff9fbc',
            entries: [
                { command: '/队伍', description: '查看当前队伍、成员与队长设置' },
                { command: '/组队 创建', description: '创建最多四人的冒险队伍' },
                { command: '/组队 加入 <队长QQ用户ID>', description: '加入目标队伍' },
                { command: '/队伍列表', description: '浏览当前可加入的队伍' },
                { command: '/好友', description: '查看好友列表、好感与赠礼入口' },
                { command: '/星誓', description: '查看星誓同行记录与仪式入口' },
                { command: '/祈福', description: '领取每日一次的自身祈福增益' },
                { command: '/邮件', description: '查看邮件并领取其中附件' },
                { command: '/通缉', description: '查看自己在城镇中的通缉状态' }
            ]
        },
        {
            title: '城镇服务',
            description: '常用商店、任务与休整服务',
            accent: '#f5db7f',
            entries: [
                { command: '/任务', description: '查看主线、支线、悬赏与委托' },
                { command: '/悬赏板', description: '浏览并接取怪物悬赏' },
                { command: '/工会商店', description: '购买地图与基础物资' },
                { command: '/餐厅', description: '查看菜品并享用增益食物' },
                { command: '/铁匠铺', description: '进入装备打造、精炼、熔铸与交易服务' },
                { command: '/糖水屋', description: '购买药剂或进入炼金服务' },
                { command: '/异工坊', description: '进入解构师的分解与构造服务' },
                { command: '/百味书屋', description: '购买、出售或研读技能书' },
                { command: '/家园', description: '查看、购买或进入个人家园' }
            ]
        }
    ],
    2: [
        {
            title: '任务与深度探索',
            description: '悬赏、站点、迷宫与世界事件',
            accent: '#8fd3ff',
            entries: [
                { command: '/任务分类 <分类>', description: '按主线、支线、悬赏或委托筛选任务' },
                { command: '/接取悬赏 <编号>', description: '接取悬赏板中的指定任务' },
                { command: '/领取悬赏 <编号>', description: '领取已完成悬赏的奖励' },
                { command: '/天气', description: '查看当前区域的天气与环境影响' },
                { command: '/奇遇  ·  /附近奇遇', description: '查看个人或附近发生的动态奇遇' },
                { command: '/参与奇遇 <公共奇遇ID>', description: '加入公共世界奇遇' },
                { command: '/下迷宫 <入口编号>', description: '从入口进入可探索的迷宫' },
                { command: '/地宫上行  ·  /地宫下行', description: '在迷宫楼层之间移动' },
                { command: '/离开迷宫  ·  /脱离', description: '正常离开或紧急脱离迷宫' },
                { command: '/开启地宫宝箱 <宝箱编号>', description: '打开当前楼层发现的宝箱' }
            ]
        },
        {
            title: '家园与万叶联市',
            description: '个人空间与玩家交易',
            accent: '#82e3bc',
            entries: [
                { command: '/家园购买', description: '购买第一处个人家园' },
                { command: '/家园回家  ·  /家园出门', description: '进入或离开个人家园' },
                { command: '/家园改名 <新名称>', description: '修改家园名称' },
                { command: '/家园储物 [背包|仓储]', description: '整理背包与家园仓库物资' },
                { command: '/家园升级', description: '提升家园等级并解锁更多空间' },
                { command: '/家园商店', description: '购买家园家具与布置物' },
                { command: '/万叶联市', description: '进入玩家交易市场首页' },
                { command: '/万叶市场 <页码>', description: '浏览其他玩家的上架商品' },
                { command: '/万叶出售 <页码>', description: '选择物品并创建出售订单' },
                { command: '/万叶订单  ·  /万叶撤单 <编号>', description: '管理自己发布的交易订单' }
            ]
        },
        {
            title: '打造、炼金与解构',
            description: '生产职业的完整入口',
            accent: '#f5db7f',
            entries: [
                { command: '/打造装备', description: '按部位、类型、等级和材料打造装备' },
                { command: '/图纸打造', description: '查看并打造已持有的史诗图纸装备' },
                { command: '/精炼', description: '为武器投入材料进行精炼' },
                { command: '/熔铸', description: '用材料熔铸并改造武器' },
                { command: '/分解', description: '分解装备、道具或材料取得资源' },
                { command: '/构造', description: '用配方构造基材、构件或异械' },
                { command: '/炼金', description: '选择主材、辅材与反应剂制作药剂' },
                { command: '/提纯', description: '提纯材料以获取更高品质资源' },
                { command: '/炼金配方', description: '查看、保存、改名或载入炼金配方' },
                { command: '/炼金商店购买', description: '购买糖水屋的成品炼金物资' }
            ]
        },
        {
            title: '快捷栏与自动作战',
            description: '将常用操作设为自动流程',
            accent: '#ffb680',
            entries: [
                { command: '/道具配置', description: '查看战斗道具快捷栏设置' },
                { command: '/道具配置选择 <栏位>', description: '为指定栏位挑选快捷道具' },
                { command: '/异械配置', description: '查看异械快捷栏设置' },
                { command: '/异械配置设置 <装备编号>', description: '选择异械后放入指定快捷栏' },
                { command: '/自动战斗 配置', description: '进入自动战斗的详细配置界面' },
                { command: '/自动战斗 出招选择 <位置>', description: '选择循环中的一个出招位置' },
                { command: '/自动战斗 选择出招 <位置> <技能编号>', description: '为循环位置指定技能或普攻' },
                { command: '/自动战斗 嗑药 <开启|关闭>', description: '启用或停用自动使用药剂' },
                { command: '/自动战斗 设置门槛 <生命|魔力>', description: '设定自动嗑药的百分比门槛' },
                { command: '/自动战斗 快速配置', description: '快速完成一套自动出招方案' }
            ]
        },
        {
            title: '进阶成长与进化',
            description: '二转、全知者与进化路线',
            accent: '#c8a6ff',
            entries: [
                { command: '/职业选择', description: '查看一转职业并选择发展方向' },
                { command: '/二转导师 <导师编号>', description: '拜访二转导师并查看职业路线' },
                { command: '/进化研究室', description: '进入进化系统的研究室入口' },
                { command: '/进化面板', description: '查看当前进化进度与已获能力' },
                { command: '/进化针剂', description: '浏览可用的进化针剂' },
                { command: '/进化注射 <针剂> [部位]', description: '向指定部位注射进化针剂' },
                { command: '/进化定型', description: '选择并固定已获得的进化结果' },
                { command: '/进化委托', description: '接取或提交进化观察委托' },
                { command: '/进化变异 [记录编号]', description: '查看或处理当前进化变异记录' },
                { command: '/全知者明鉴', description: '使用全知者的洞察能力' }
            ]
        },
        {
            title: 'PvP 与界面设置',
            description: '对战、通缉与面板显示',
            accent: '#ff9fbc',
            entries: [
                { command: '/pvp', description: '打开 PvP 对战面板' },
                { command: '/玩家攻击 <玩家游戏ID>', description: '向目标玩家发起战斗' },
                { command: '/PvP记录 [页码]', description: '查看自己的对战记录' },
                { command: '/我的仇人', description: '查看近期与自己交战的玩家' },
                { command: '/通缉令', description: '查看全部通缉令与逮捕赏金' },
                { command: '/通缉筛选 <条件>', description: '按行踪状态筛选通缉目标' },
                { command: '/通缉上赏 <编号> <铜币|物品> …', description: '为通缉目标追加赏金' },
                { command: '/地图标识 <折叠|显示>', description: '切换面板中的地图标识显示' },
                { command: '/感知内目标 <隐藏玩家|显示玩家>', description: '控制面板是否展示附近玩家' },
                { command: '/菜单', description: '返回核心功能第一页' }
            ]
        }
    ]
};
const escapeXml = (value) => value.replace(/[<>&'"]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]));
const sectionHeight = (section) => 112 + section.entries.length * 62;
const sectionSvg = (section, x, y, width, index) => {
    const height = sectionHeight(section);
    const entries = section.entries.map((entry, entryIndex) => {
        const entryY = y + 132 + entryIndex * 62;
        return `<text x="${x + 32}" y="${entryY}" class="command">${escapeXml(entry.command)}</text><text x="${x + 32}" y="${entryY + 25}" class="description">${escapeXml(entry.description)}</text>`;
    }).join('');
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="24" fill="#10264d" fill-opacity=".72" stroke="#d9edff" stroke-opacity=".19"/>
    <rect x="${x}" y="${y}" width="7" height="${height}" rx="3" fill="${section.accent}"/>
    <text x="${x + 32}" y="${y + 42}" class="section-number">${String(index + 1).padStart(2, '0')}</text>
    <text x="${x + 78}" y="${y + 42}" class="section-title">${escapeXml(section.title)}</text>
    <text x="${x + 32}" y="${y + 76}" class="section-description">${escapeXml(section.description)}</text>
    <path d="M${x + 32} ${y + 94}H${x + width - 32}" stroke="${section.accent}" stroke-opacity=".34"/>${entries}`;
};
const pageSvg = (page) => {
    const sections = pages[page];
    const columns = [[], []];
    const columnHeights = [0, 0];
    for (const section of sections) {
        const target = columnHeights[0] <= columnHeights[1] ? 0 : 1;
        columns[target].push(section);
        columnHeights[target] += sectionHeight(section) + 28;
    }
    const contentHeight = Math.max(...columnHeights) - 28;
    const height = Math.max(1520, 246 + contentHeight + 118);
    const columnWidth = 646;
    const left = 62;
    const top = 216;
    const markup = columns.flatMap((column, columnIndex) => {
        let y = top;
        return column.map(section => {
            const sectionIndex = sections.indexOf(section);
            const result = sectionSvg(section, left + columnIndex * (columnWidth + 24), y, columnWidth, sectionIndex);
            y += sectionHeight(section) + 28;
            return result;
        });
    }).join('');
    const pageLabel = page === 1 ? '核心功能' : '进阶功能';
    const subtitle = page === 1 ? '从创建角色到城镇休整的常用入口' : '探索、生产、成长与 PvP 的扩展入口';
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1400" height="${height}" viewBox="0 0 1400 ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071a3c"/><stop offset=".52" stop-color="#1c4386"/><stop offset="1" stop-color="#503c7c"/></linearGradient>
    <radialGradient id="aurora" cx="83%" cy="2%" r="82%"><stop stop-color="#b9e7ff" stop-opacity=".40"/><stop offset=".35" stop-color="#7da6ff" stop-opacity=".13"/><stop offset="1" stop-color="#132447" stop-opacity="0"/></radialGradient>
    <linearGradient id="header" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#c9ebff"/><stop offset="1" stop-color="#dbcbff"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <style>
      .cn { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; }
      .eyebrow { font-family:'Segoe UI','Microsoft YaHei',sans-serif; fill:#b8d9ff; font-size:16px; font-weight:700; letter-spacing:4px; }
      .title { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:url(#header); font-size:44px; font-weight:700; }
      .subtitle { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#cadcf7; font-size:19px; }
      .page { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#dff0ff; font-size:18px; font-weight:700; }
      .section-number { font-family:'Segoe UI',sans-serif; fill:#9bbfe8; font-size:18px; font-weight:700; letter-spacing:2px; }
      .section-title { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#f7fbff; font-size:28px; font-weight:700; }
      .section-description { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#afc9ee; font-size:17px; }
      .command { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#fff7df; font-size:20px; font-weight:700; }
      .description { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#c4d6ef; font-size:17px; }
      .footer { font-family:'Microsoft YaHei','Noto Sans CJK SC',sans-serif; fill:#a9c1e5; font-size:16px; }
    </style>
  </defs>
  <rect width="1400" height="${height}" fill="url(#background)"/>
  <rect width="1400" height="${height}" fill="url(#aurora)"/>
  <path d="M-80 142C176 292 376 18 697 144s445 11 779 154" fill="none" stroke="#d5ecff" stroke-opacity=".16" stroke-width="2"/>
  <circle cx="102" cy="68" r="3" fill="#dff5ff" filter="url(#glow)"/><circle cx="260" cy="134" r="2" fill="#dff5ff"/><circle cx="1079" cy="66" r="3" fill="#e8dcff" filter="url(#glow)"/><circle cx="1275" cy="151" r="2" fill="#e8dcff"/>
  <text x="62" y="66" class="eyebrow">FANTASY FINAL · COMMAND GUIDE</text>
  <text x="62" y="119" class="title">幻想次元 · ${pageLabel}</text>
  <text x="62" y="152" class="subtitle">${subtitle}</text>
  <rect x="1160" y="62" width="178" height="54" rx="27" fill="#102b55" fill-opacity=".66" stroke="#d8ebff" stroke-opacity=".24"/>
  <text x="1249" y="96" text-anchor="middle" class="page">第 ${page} / 2 页</text>
  ${markup}
  <path d="M62 ${height - 78}H1338" stroke="#cce8ff" stroke-opacity=".20"/>
  <text x="62" y="${height - 42}" class="footer">尖括号 &lt;参数&gt; 需要自行补全；分页、确认与选择等续办指令会在对应功能界面中给出。</text>
</svg>`;
};
const menuCardImage = (page) => sharp(Buffer.from(pageSvg(page))).webp({ quality: 90, effort: 4 }).toBuffer();

export { menuCardImage };
