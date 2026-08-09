import { useEvent, useMessage } from 'alemonjs';
import { partyInfo } from '../game/adventure.service';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const party = await partyInfo(event.current.UserId);
    await message.send({ format: messageFormat('队伍', party ? `队长：${party.leader_name}\n成员：${party.member_count}/4` : '你尚未加入队伍。\n发送 /组队 创建 创建队伍。') });
  } catch (error) { await message.send({ format: messageFormat('队伍不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};
