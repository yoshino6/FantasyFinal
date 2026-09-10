export const rootGuildPeople=[
  {code:'root_guild_clerk',name:'鹿族书记官·维萝',role:'登记柜台',first:'不会写这里的字也没关系，告诉我读音。名字是你的，不该由表格替你决定。',again:'我记得你的名字。今天要登记新的路，还是先歇一会儿？'},
  {code:'root_guild_commissioner',name:'獾族委托官·砾秋',role:'委托板',first:'先看委托要求。报酬写得越大，越要把下面的小字看完。',again:'你上次按时回来了。这比你少花了多久更值得写进记录。'},
  {code:'root_guild_appraiser',name:'鸮族鉴物员·澄叶',role:'见闻与地图',first:'我能告诉你我知道的，也会把不知道的地方留空。空白比乱写可靠。',again:'你的见闻我留了副本。不是不信你，是好线索不该只存一份。'},
  {code:'root_guild_cook',name:'蜜獾厨娘·朵菈',role:'餐厅',first:'坐下。想逞强，也先把汤喝了。饿着肚子想出来的主意，多半不怎么样。',again:'还是上次那个口味？不急，我给你把烫的那一口晾一晾。'},
  {code:'root_guild_shopkeeper',name:'狐族掌柜·斐珞',role:'公会商店',first:'这件贵，是因为多了你暂时用不到的功能。今天买旁边那件就够。',again:'你会比较价格了。不错，以后我就不必每笔都替你再算一遍。'},
  {code:'root_guild_keeper',name:'人类契兽员·温槐',role:'随从兽栏',first:'先别叫它做什么。让它知道待在你旁边不会受伤，才谈得上同行。',again:'它听见你的脚步就抬头了。这个，可不是我教得出来的。'},
  {code:'root_guild_builder',name:'木灵工匠·木芽',role:'工艺练习',first:'歪一点能修，少一根承重柱可不能靠祝福。来，先认这个。',again:'你上次那张凳子还稳着呢。我坐过，替你验过了。'},
  {code:'root_guild_gatekeeper',name:'半精灵值守·岑渡',role:'门口接引',first:'门在这里。进来以后，就不用再赶路了。',again:'回来就好。那张空椅子，还在老地方。'}
] as const;
export const rootGuildScenes: Record<string, string> = {
  root_guild_clerk:'枝叶筛下的灯光落在登记册上。维萝把翘起的纸角压平，搁下笔，认真听你说完。',
  root_guild_commissioner:'砾秋站在委托板旁，把危险事项用红笔一条条圈出。见你走近，他先将遮住小字的纸角抚平。',
  root_guild_appraiser:'澄叶从成叠的地图间抬起头，鼻梁上的镜片映着窗外叶影。她给一处未查明的岔路留了空白，又把笔轻轻放下。',
  root_guild_cook:'汤锅在灶上咕嘟作响。朵菈用围裙擦净手，先把一碗温水推到你面前，才叉起腰等你开口。',
  root_guild_shopkeeper:'斐珞将价签转向客人，把昂贵的卷轴留在高架，伸手够得着的地方摆着常用药剂。她笑着示意你慢慢比较。',
  root_guild_keeper:'温槐蹲在饮水盆旁，掌心朝上，等一只紧张的小兽自己凑近。听见脚步，他抬手示意你放轻声音。',
  root_guild_builder:'木屑落满了工台。木芽把刚做好的凳子翻过来，逐个检查榫口，又用力摇了摇，确认稳固后才转向你。',
  root_guild_gatekeeper:'岑渡扶住被风吹动的木门，让扛着行李的旅人先过。风铃声落下时，他回头看了看门边留出的空椅。'
};
export const guildLessons=[
  {code:'supply',title:'把药箱安放妥当',text:'接引员将空药瓶、标签与软布放在桌上。你先将瓶底垫稳，再让标签朝向取药的人。最上面留给急用的药，不必为了看着整齐，把每样东西都压得紧紧的。',reward:'healing_herb',quantity:2},
  {code:'contract',title:'等它愿意靠近',text:'契兽员把一只木制球兔放在桌上，演示如何辨认戒备和信任。\n\n“礼物只能在开战之前送。先观察它喜欢什么；拒收的东西收回来，不要硬塞。交涉成功，也要等它自己愿意同行。”\n\n你在练习册上勾选“留出退路”。这是模拟练习，没有扣除真实礼物。',reward:'opening_companion_feed',quantity:1},
  {code:'craft',title:'第一道稳妥的榫口',text:'工匠递来削好的短木。你沿标线压住边角，试着将两块木头扣在一起。第一次歪了，拆开重来；第二次，木件终于稳稳立住。\n\n“做得慢不要紧。会检查的人，才敢让别人放心用。”',reward:'opening_practice_stool',quantity:1},
  {code:'map',title:'认清回来的路',text:'鉴物员压平地图，先请你指出自己所在的公会，再找最近的安全出口。你把来时的方向画在纸边，确认图上没有把高危野外误写成新手练习场。\n\n“去哪里都可以先问。还有，回程也要一起看。”',reward:'healing_herb',quantity:1}
] as const;
