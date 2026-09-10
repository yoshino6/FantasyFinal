import { useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { divineCatalog, divineDetail } from '../game/divine-message';
import { messageFormat } from '../game/message';
import { useTalentDetailMessage } from '../game/talent-detail-message';

export default async () => {
  const [route] = useRoute(); const [message] = useMessage();
  const category = String(route.param('category')) === '神器' ? 'artifact' : 'ability';
  if (category === 'artifact') { await message.send({ format: messageFormat('神器已经远行', '所有神器已经散布世界各地，请从天赋目录选择恩赐。') }); }
  await message.send({ format: divineCatalog() });
};

export const giftPageHandler = async () => {
  const [route] = useRoute(); const [message] = useMessage();
  const category = String(route.param('category')) === '神器' ? 'artifact' : 'ability';
  const page = Number(route.param('page') ?? 1); const keyword = String(route.param('keyword') ?? '').trim();
  if (category === 'artifact') { await message.send({ format: messageFormat('神器已经远行', '所有神器已经散布世界各地，请从天赋目录选择恩赐。') }); }
  await message.send({ format: divineCatalog(page, keyword) });
};

export const giftSearchHandler = async () => {
  const [route] = useRoute(); const [message] = useMessage();
  const keyword = String(route.param('keyword') ?? '').trim();
  await message.send({ format: divineCatalog(1, keyword) });
};

export const divineCatalogHandler=async()=>{const[route]=useRoute();const[message]=useMessage();await message.send({format:divineCatalog(Number(route.param('page')??1),'',String(route.param('group')??'全部'))});};
export const divineDetailHandler=async()=>{const[route]=useRoute();const[message]=useMessage();const detailMessage=useTalentDetailMessage();try{await detailMessage.send({format:divineDetail(String(route.param('code')))});}catch(error){await message.send({format:messageFormat('天赋',error instanceof Error?error.message:'请重新选择。')});}};
