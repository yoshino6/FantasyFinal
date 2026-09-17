import { Format, useEvent } from 'alemonjs';
import { battleStatus, bossRandomEffectSummary, currentEncounter } from '../game/adventure.service';
import { bossTraitCardImage, type BossTraitCardData } from '../game/boss-trait-card.service';
import { level32BossDifficultyCodeFromTraits, type Level32BossDifficultyCode } from '../game/level32-boss-difficulty.config';
import { useGameMessage as useMessage } from '../game/use-game-message';

const uniqueLines = (values: string[]) => [...new Set(values.filter(Boolean))];
type BossTraitCardView = BossTraitCardData & { bossCode: string };
const uniqueCards = (cards: BossTraitCardView[]) => [...new Map(cards.map(card => [`${card.bossCode}:${card.difficultyCode}`, card])).values()];

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  const qqUserId = String(event.current.UserId);
  let foundBoss = false;
  let lines: string[] = [];
  let cards: BossTraitCardView[] = [];

  try {
    const encounter = await currentEncounter(qqUserId);
    const bosses = encounter?.spawns.filter(spawn => spawn.monster_class === 'boss') ?? [];
    if (bosses.length) {
      foundBoss = true;
      lines = uniqueLines(bosses.flatMap(boss => bossRandomEffectSummary(boss.traits_json)));
      cards = bosses.flatMap(boss => {
        const difficultyCode = level32BossDifficultyCodeFromTraits(String(boss.template_code ?? ''), boss.traits_json);
        return difficultyCode ? [{ bossCode: String(boss.template_code), bossName: String(boss.name), difficultyCode, effects: bossRandomEffectSummary(boss.traits_json) }] : [];
      });
    }
  } catch { /* 已进入战斗或当前没有可读取的遇战时，继续读取战斗目标。 */ }

  if (!foundBoss) {
    try {
      const battle = await battleStatus(qqUserId);
      const bosses = battle.targets.filter(target => target.isBoss && !target.isBossComponent);
      if (bosses.length) {
        foundBoss = true;
        lines = uniqueLines(bosses.flatMap(target => target.randomEffects));
        cards = bosses.flatMap(target => target.difficultyCode
          ? [{ bossCode: String(target.bossCode), bossName: String(target.name), difficultyCode: target.difficultyCode as Level32BossDifficultyCode, effects: target.randomEffects }]
          : []);
      }
    } catch { /* 下方统一返回“当前未遭遇 BOSS”。 */ }
  }

  const currentCards = uniqueCards(cards);
  if (currentCards.length) {
    for (const card of currentCards) await message.send({ format: Format.create().addImage(await bossTraitCardImage(card)) });
    return;
  }

  if (foundBoss && !lines.length) return;

  const markdown = Format.createMarkdown().addTitle('当前BOSS特殊效果').addNewline().addNewline();
  if (!foundBoss) markdown.addBlockquote('当前没有正在遇战或战斗中的 BOSS。');
  else lines.forEach((line, index) => {
    markdown.addBlockquote(line);
    if (index < lines.length - 1) markdown.addNewline();
  });
  await message.send({ format: Format.create().addMarkdown(markdown) });
};
