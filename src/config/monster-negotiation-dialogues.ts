import { creatureVoices, type NegotiationFamily } from './monster-negotiation';
import { moodBand, type MoodBand, type Preference } from '../game/negotiation-rules';

const moods: Record<MoodBand, [string, string]> = {
  furious: ['积压的怒意仍没有散去，任何疏忽都可能让局面失控。', '强烈的排斥几乎凝在空气里，它仍不肯让你们靠近。'],
  resentful: ['先前的不快仍留着，它显然还在衡量你们。', '那份烦躁并未消失，双方之间仍隔着谨慎的距离。'],
  hostile: ['敌意还未褪去，但它仍留意着你们的举动。', '气氛仍然紧绷，试探远没有结束。'],
  wary: ['它仍留着戒心，等着看你们接下来如何表示。', '双方保持着距离，它没有急着作出决定。'],
  hesitant: ['那份坚决开始松动，它似乎在重新考虑你们的来意。', '它停顿了一会儿，原本的敌意已有些迟疑。'],
  receptive: ['气氛缓和下来，它愿意再给你们一些时间。', '它的防备松动了，双方之间不再那么剑拔弩张。'],
  pleased: ['它显然满意这场往来，开始期待你们的下一步。', '愉快的回应已经藏不住，它愿意认真听你们说下去。'],
  trusting: ['它已经接受了你们的诚意，只待正式说定。', '先前的隔阂已消散，它正安静等待你们最后的提议。']
};
const particleDetails: Record<string, [string, string]> = {
  木: ['草木的清香随微光散开。', '一点生机沿着礼物的边缘流动。'], 水: ['细小的水纹在礼物旁漾开。', '湿润清凉的气息浮了起来。'],
  土: ['沉稳的土相微光贴近地面。', '砂砾般的光点缓缓落定。'], 火: ['几粒火星跃起，带出暖热的气流。', '一线赤光裹着热意闪过。'],
  冰: ['细霜在礼物边缘凝出一道白痕。', '冰凉的雾气缓缓散开。'], 雷: ['微小电弧发出短促的噼啪声。', '亮紫色的电光跳了一下。'],
  风: ['一道轻旋卷过地面的浮尘。', '流动的微光带起一缕清风。'], 光: ['洁净的亮光照过四周。', '一缕温明的光辉从礼物间散出。'],
  暗: ['淡淡的幽影在微光边缘聚拢。', '暗色的波动像低语般掠过。'], 血肉: ['礼物里散出浓重的血肉气息。', '深红的残渣透出野性的气味。'],
  能量: ['零星余烬缓缓明灭。', '尚未散尽的能量轻轻跃动。'], 魔力: ['细小的魔力弧线交织一瞬。', '微弧在空气里闪出淡淡涟漪。']
};
const materialDetails: Record<string, [string, string]> = {
  草药: ['柔软叶片散出清淡的草香。', '草木的汁液留下细小的绿痕。'], 鲜肉: ['新鲜的肉香从礼物中散出。', '鲜肉上还保留着湿润的纹理。'],
  兽材: ['兽材保留着原本的野性气息。', '礼物上仍能辨出天然的纹理。'], 骨质: ['骨质在接触间碰出清脆的轻响。', '苍白骨面映出一点暗光。'],
  兽核: ['核中的魔力低低脉动。', '温润的核光在缝隙里闪动。'], 金属: ['金属边缘掠过一道冷光。', '矿材相碰，发出沉实的声响。'],
  木石: ['木石带着朴素的土地气息。', '礼物粗糙的纹理留着自然的痕迹。'], 零件: ['细密的构造在光下露出棱角。', '零件的接缝折出细碎的亮光。'],
  炼材: ['一缕萃取后的气息散开。', '炼材的微光在表面缓缓流动。'], 魂性: ['一丝安静的魂光在其中游动。', '幽淡的余韵从礼物中传来。']
};
export type DialogueKind = Preference | 'approach' | 'talk_failed' | 'success' | 'blocked' | 'protected' | 'left' | 'refused';
/** 同一动作的 key 持久化，刷新不得另抽文案或玩法概率。 */
export const negotiationDialogue = (family: NegotiationFamily, ppm: number, kind: DialogueKind, subtype = '', itemName = '', lastKey = '', random: () => number = Math.random) => {
  const band = moodBand(ppm).code; const prefix = `${family}:${band}:${kind}:${subtype}`;
  const previous = lastKey.startsWith(prefix + ':') ? Number(lastKey.slice(lastKey.lastIndexOf(':') + 1)) : -1;
  const variant = previous === 0 ? 1 : previous === 1 ? 0 : random() < .5 ? 0 : 1;
  const voice = creatureVoices[family];
  let text: string;
  if (kind === 'like' || kind === 'neutral' || kind === 'dislike') {
    const detail = subtype.startsWith('粒子·') ? particleDetails[subtype.slice(3)] : materialDetails[subtype];
    text = `${detail?.[variant] ?? ''}${voice.reactions[kind][variant].replaceAll('{物品}', `「${itemName}」`)}${moods[band][variant]}`;
  } else if (kind === 'protected') text = voice.protection[variant];
  else if (kind === 'approach') text = voice.approach[variant] + moods[band][variant];
  else if (kind === 'blocked') text = voice.approach[variant] + (variant ? '熟悉的旧面孔让局面骤然绷紧；它仍记得上次谈判如何结束，不肯再听解释。' : '它认出了你们中的旧人，再多礼物也不能让这次谈判重新开始。');
  else if (kind === 'talk_failed') text = voice.approach[variant] + (variant ? '你试着继续解释，却没有得到认可；它的耐心正在消退。' : '你的提议没有打动它，短暂的沉默让气氛紧了几分。') + moods[band][variant];
  else if (kind === 'refused') text = voice.approach[variant] + (variant ? '它已经心满意足，没有再接下礼物。你可以直接与它交谈。' : '它没有继续索取，愿意听你们说定最后的条件。礼物仍留在背包中。');
  else if (kind === 'success') text = voice.approach[variant] + (variant ? '这次回应已经足够清楚：它接受了提议，同意和平结束这场遭遇。' : '你们终于读懂了彼此的意思。它不再阻拦，双方达成了协议。');
  else text = voice.approach[variant] + (variant ? '你们暂且收住话头。它记住了这次往来，态度不会因离开而重置。' : '谈判暂告一段落，已经发生的好意与冒犯仍会留在记忆中。');
  return { key: `${prefix}:${variant}`, text };
};
