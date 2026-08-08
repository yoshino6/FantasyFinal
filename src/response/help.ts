import { Format, useMessage } from 'alemonjs';

export default async () => {
  const [message] = useMessage();
  const menu = Format.createMarkdown()
    .addTitle('异界菜单')
    .addSubtitle('注册与角色')
    .addButton('注册', { data: '注册', autoEnter: true }).addText(' 开始或继续创建角色\n')
    .addButton('/角色', { data: '/角色', autoEnter: true }).addText(' 查看个人属性\n')
    .addButton('/地图', { data: '/地图', autoEnter: true }).addText(' 查看当前位置\n')
    .addButton('/面板', { data: '/面板', autoEnter: true }).addText(' 打开当前快捷操作\n')
    .addSubtitle('探索与遭遇')
    .addButton('/探索', { data: '/探索', autoEnter: true }).addText(' 搜寻当前坐标的怪物\n')
    .addButton('/背包', { data: '/背包', autoEnter: true }).addText(' 查看负重、速度与道具\n')
    .addButton('/移动 上', { data: '/移动 上', autoEnter: true }).addText(' 向上移动（下/左/右同理）\n')
    .addButton('/目标 编号', { data: '/目标 ', autoEnter: false }).addText(' 锁定怪物进入战斗\n')
    .addButton('/偷袭 编号', { data: '/偷袭 ', autoEnter: false }).addText(' 感知和速度判定\n')
    .addButton('/躲避 编号', { data: '/躲避 ', autoEnter: false }).addText(' 尝试避开敌人\n')
    .addButton('/交涉 编号', { data: '/交涉 ', autoEnter: false }).addText(' 尝试和平解决\n')
    .addSubtitle('战斗')
    .addButton('/战斗信息', { data: '/战斗信息', autoEnter: true }).addText(' 查看敌我状态\n')
    .addButton('/攻击', { data: '/攻击', autoEnter: true }).addText(' 普通攻击\n')
    .addButton('/技能 1', { data: '/技能 1', autoEnter: true }).addText(' 使用技能栏 1（可改 1-4）\n')
    .addButton('/道具 1', { data: '/道具 1', autoEnter: true }).addText(' 使用道具栏 1（可改 1-4）\n')
    .addButton('/逃跑', { data: '/逃跑', autoEnter: true }).addText(' 尝试脱离战斗\n')
    .addSubtitle('队伍')
    .addButton('/组队 创建', { data: '/组队 创建', autoEnter: true }).addText(' 创建最多四人的队伍\n')
    .addButton('/组队 加入 队长QQ用户ID', { data: '/组队 加入 ', autoEnter: false }).addText(' 加入队长的队伍\n')
    .addText('\n参数类命令点击后会填入输入框，请补全编号或用户 ID。');
  await message.send({ format: Format.create().addMarkdown(menu) });
};
