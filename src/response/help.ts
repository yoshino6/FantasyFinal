import { Format, useMessage } from 'alemonjs';

export default async () => {
  const [message] = useMessage();
  await message.send({ format: Format.create().addText('AlemonJS 开发机器人已就绪。') });
};
