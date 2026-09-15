"""将逐题创作的生活事件素材校验并排版为 Markdown；不生成或改写题目内容。"""
from collections import Counter
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "问心事件题库素材"
OUTPUT = ROOT / "docs" / "窥尘问心深层事件题库V3.md"
ATTRS = {"体", "精", "力", "智", "敏", "感"}
NAMES = {"体": "体质", "精": "精神", "力": "力量", "智": "智力", "敏": "敏捷", "感": "感知"}


def parse_choice(raw: str, source: Path, row_no: int):
    pair, answer = raw.split(":", 1)
    positive, negative = pair.split(">", 1)
    assert positive in ATTRS and negative in ATTRS and positive != negative, (source.name, row_no, raw)
    assert answer.strip() and answer == answer.strip(), (source.name, row_no, raw)
    return positive, negative, answer


def main():
    files = sorted(SOURCE.glob("[0-9][0-9]-*.tsv"))
    assert len(files) == 10, f"expected 10 source files, got {len(files)}"
    cards = []
    for source in files:
        category = source.stem.split("-", 1)[1]
        for row_no, line in enumerate(source.read_text(encoding="utf-8").splitlines(), 1):
            fields = line.split("|")
            assert len(fields) == 8, (source.name, row_no, len(fields))
            title, prompt, *raw_choices = fields
            assert title and prompt and prompt.endswith("。") and "你" not in title, (source.name, row_no, title)
            assert "？" not in prompt and "?" not in prompt, (source.name, row_no, title, "question punctuation")
            assert "你" not in prompt, (source.name, row_no, title, "player-directed phrasing")
            choices = [parse_choice(raw, source, row_no) for raw in raw_choices]
            assert {choice[0] for choice in choices} == ATTRS, (source.name, row_no, title)
            assert len({choice[2] for choice in choices}) == 6, (source.name, row_no, title)
            assert all("我" in choice[2] and "你" not in choice[2] and "？" not in choice[2] and "?" not in choice[2] for choice in choices), (source.name, row_no, title, "heart stance")
            cards.append((category, title, prompt, choices))

    assert len(cards) == 500, f"expected 500 independent events, got {len(cards)}"
    assert len({card[1] for card in cards}) == 500, "duplicate titles"
    assert len({card[2] for card in cards}) == 500, "duplicate prompts"
    assert len({choice[2] for _, _, _, choices in cards for choice in choices}) == 3000, "duplicate answers"
    pairs = Counter((positive, negative) for _, _, _, choices in cards for positive, negative, _ in choices)
    assert all(len({negative for (positive, negative) in pairs if pairs[(positive, negative)]}) >= 2 for positive in ATTRS), "fixed repulsion mapping"

    output = [
        "# 窥尘问心深层事件题库 V3（500 题）", "",
        "状态：**500 题已接入窥尘问心运行时**；部署和完整验收状态见[实装成果](窥尘问心实装成果20260914.md)。题库覆盖城镇日常、战斗、NPC 与人际、探索、技艺、交易、委托、生活哲思、家园和新世界见闻。", "",
        "每题都是一个完整的异世界事件陈述，不用疑问句向玩家索要标准答案。片段把责任、牺牲、身份、真相、自由、秩序与后果放进具体冲突；六个选项分别陈述旁观者看破的本质、愿意承担的代价及无愧于心的选择。`倾向／排斥`按该立场实际倚重与放下的能力逐条标注，同一维度不存在固定排斥搭档。普通结果按 10% 目标增量在两维间转移，大成功不扣排斥维；六维成长总和最多 12.0，实际变动以结算规则为准。", "",
        "编号供本稿审阅；正式入库时应另设不可变事件 code，并保存题干、六个回答、倾向／排斥及版本快照。抽题时过滤不可执行的数值选项，并避免短期重复同类事件。", "",
    ]
    last_category = None
    for index, (category, title, prompt, choices) in enumerate(cards, 1):
        if category != last_category:
            output.extend([f"## {category}", ""])
            last_category = category
        code = f"WQ-{index:03d}"
        output.extend([f"### {code}·{title}", "", prompt, ""])
        choices = sorted(choices, key=lambda choice: sha256(f"{code}:{choice[0]}".encode("utf-8")).digest())
        output.extend(f"- {answer}（倾向{NAMES[positive]}／排斥{NAMES[negative]}）" for positive, negative, answer in choices)
        output.append("")
    OUTPUT.write_text("\n".join(output), encoding="utf-8")
    print(f"validated {len(cards)} distinct cards, {sum(pairs.values())} choices, {len(pairs)} direction pairs")
    print(f"output: {OUTPUT}")
    for positive in sorted(ATTRS):
        variants = sorted((NAMES[negative], count) for (p, negative), count in pairs.items() if p == positive)
        print(f"{NAMES[positive]}: {variants}")


if __name__ == "__main__":
    main()
