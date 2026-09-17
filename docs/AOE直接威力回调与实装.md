# AOE 直接威力回调与实装

日期：2026-09-16。取代上一版《AOE防御后倍率统一复核与实装》。本篇是当前有效方案，旧文保留作变更记录。

## 当前规则

玩家、怪物、Boss、人偶和异械的群攻均采用直接威力，不再添加上一版通用的“防御后群伤比例”。

```text
有效攻击 = 对应攻击属性 × 技能威力 / 100 × 原有攻击修正
直伤 = 有效攻击² / (有效攻击 + 有效防御)
```

之后继续结算原有暴击、抗性、增减伤、护盾和生命扣除。单体和群体使用同一防御公式；群攻威力较低，面对高防目标时相对高威力单体更吃亏，但能一次攻击多个脆皮。高威力不是无视防御。

本轮将上一版参照威力乘其设计比例、四舍五入为整数，作为直接威力，而不是保留高威力再乘最终伤害比例。其目的不是保持上一版对所有防御目标的伤害不变，而是恢复防御带来的技能适用性差异。

## 面板

天穹序列无专精时显示：

> 威力：139

不再显示“单体基准185；每目标伤害75%”。有专精时仍显示专精计算后的实际威力。效果说明同步新威力，并在初始化时清除旧“群攻结算”后缀，重复初始化不会重复削弱威力。

## 玩家常用群攻

| 技能 | 直接威力 |
| --- | ---: |
| 爆燃术 | 82 |
| 崩岩术 | 93 |
| 壁垒裁决 | 137 |
| 震地号令 | 85 |
| 百战横扫 | 146 |
| 雷暴导链 | 88 |
| 天穹序列 | 139 |
| 破法回旋 | 95 |
| 腐蚀雾 | 81 |
| 破晓宣告 | 130 |

MP、冷却、吟唱、职业资源消耗与回合占用不变。上一轮已校正的条件增伤乘区继续保留，例如壁垒裁决选定目标额外60%伤害；它是技能独立附效，不是通用群攻折扣。

## 派生技能

- 万器归宗：单器124、双器每器83、三器每器68；移除防御后75%折算，保留逐段群伤批次与Boss部位去重。
- 余烬攻击灵：普通单体与过载群体均为82%魔攻；过载不减威力，也不乘防御后75%。消耗及三次过载后退场规则不变。
- 余火护幕：盾破后每目标49%魔攻威力；不再乘防御后60%。
- 万法同劫：被转为全体的单体技能使用原威力65%，直接进入防御；原生群攻不再额外折算。
- 裂空振翼：横扫威力65，直接进入防御。
- 天穹坠星：主目标420、至多两个副目标各273，分别直接计算防御。
- 万象扩散的主目标100%/副目标60%继承伤害、粒子调配的范围预算保留：它们本来就是独立扩散/调配机制，并非上一轮新增的通用AOE折扣。
- Boss生命百分比机制、控制、DOT、部位保护、血肉并痛等不变。

## 全部固定群伤配置

表中均为直接威力。只有天穹坠星另有副目标273；420是主目标。

| 技能代码 | 直接威力 | 定位 |
| --- | ---: | --- |
| `automaton_N007` | 78 | 三目标横扫 |
| `automaton_N018` | 78 | 三目标群伤 |
| `automaton_S019` | 196 | 三目标资源爆发 |
| `automaton_S020` | 168 | 三目标减速 |
| `automaton_S026` | 266 | 蓄力三目标爆发 |
| `automaton_S031` | 420 | 主目标420／副目标273 |
| `device_simple_launcher_fire` | 140 | 充能群伤 |
| `device_frost_pulse` | 60 | 充能群减速 |
| `device_electromagnetic_coil_fire` | 117 | 充能群易伤 |
| `device_reactor_overcharge` | 173 | 充能与自损爆发 |
| `goblin_player_volatile_flask` | 82 | 常规群伤 |
| `goblin_player_rockfall` | 93 | 群控 |
| `bulwark_bastion_judgment` | 137 | 资源爆发与保护 |
| `warlord_quake_command` | 85 | 群减速 |
| `warlord_hundred_battle_sweep` | 146 | 资源爆发 |
| `elementalist_storm_chain` | 88 | 群印记 |
| `elementalist_sky_sequence` | 139 | 资源爆发 |
| `spellblade_spellbreak_whirl` | 95 | 资源消耗 |
| `venomancer_corrosion_mist` | 81 | 群减防与毒 |
| `dawn_daybreak_decree` | 130 | 资源爆发与驱散 |
| `wolfking_trample` | 81 | 常规群伤 |
| `black_slime_wave` | 83 | 常规群伤 |
| `black_slime_bind` | 90 | 群控 |
| `skeleton_quake` | 96 | 群减益 |
| `death_knight_cleave` | 103 | 常规群伤 |
| `death_knight_prison` | 102 | 群控 |
| `necromancer_storm` | 101 | 常规群伤 |
| `necromancer_grave_bind` | 102 | 群控 |
| `goblin_colonel_crushing_wave` | 90 | 群减益 |
| `goblin_colonel_toxic_barrage` | 111 | 群附效 |
| `goblin_splitshot` | 88 | 常规群伤 |
| `goblin_volatile_flask` | 92 | 常规群伤 |
| `goblin_mudstar` | 109 | 常规群伤 |
| `goblin_rockfall` | 120 | 群附效 |
| `goblin_royal_static_net` | 90 | 群控 |
| `habadragon_royal_stomp` | 98 | 群附效 |
| `habadragon_royal_tail_sweep` | 90 | 群减益 |
| `habadragon_royal_cataclysm_trample` | 139 | 高成本爆发 |
| `goblin_king_stormchain` | 111 | 群附效 |
| `habadragon_crushing_stomp` | 98 | 群附效 |
| `gruen_riftfall` | 98 | 群附效 |
| `gruen_corequake` | 139 | 预警爆发 |
| `valk_chain_draw` | 77 | 群控 |
| `valk_furnace_overdrive` | 139 | 预警爆发 |
| `threehead_mist_lash` | 91 | 群附效 |
| `uzz_choir_of_graves` | 98 | 群附效 |
| `uzz_dark_decay` | 90 | 群减益 |
| `uzz_fear_scream` | 69 | 群硬控 |
| `uzz_frost_breath` | 101 | 群减速 |
| `ga_ether_tether` | 87 | 群控 |
| `ga_archive_storm` | 111 | 常规群伤 |
| `ga_threshold_reversal` | 130 | 阶段爆发 |
| `ga_evolution_proof` | 146 | 阶段爆发 |
| `mia_tide_chorus` | 81 | 群减益 |
| `mia_root_resonance` | 88 | 群附效 |
| `aeson_earthbreak` | 98 | 轮转群伤 |
| `aeson_ultimate` | 108 | 附降疗与斩杀 |
| `mother_plague_breath` | 78 | 群持续伤害 |
| `mother_flame_torrent` | 91 | 群持续伤害 |
| `mother_flame_storm` | 104 | 强化群持续伤害 |
| `mother_gale_howl` | 72 | 群引爆 |
| `mother_rift_vortex` | 78 | 群叠层 |
| `mother_eroding_gale` | 104 | 群持续伤害 |
| `mother_disaster_wind` | 135 | 可打断预警爆发 |

## 实装与验证

- 更新中央配置、技能专精威力入口、数据库最终覆盖、普通PvE/PvP、怪物/导师借用技能、混乱友伤、蛇母独立AI、人偶与异械路径。
- 恢复技能面板单一威力数值；同步灵契、御器、余火、人偶、异械、Boss被动描述。
- 不重置玩家学习/SP/专精/快捷栏/自动设置，不修改切磋奖励或自动战斗规则。
- 核心定向测试119/119通过；覆盖直接威力幂等、低/高防差异、旧描述迁移、双方规则引擎、人偶实际攻击、Boss群伤聚合。
- 加上技能平衡扩展集：515项中514通过；既有 `goblin_royal_signal_flag` 下位标签与5回合冷却断言仍失败，本轮未修改该非伤害技能。
- 类型检查：`npx tsc --noEmit` 通过。
- 未执行线上数据库初始化、重启或QQ真实战斗验收。部署时仍需加载代码并走既有技能初始化流程。

测试命令使用 `npx tsx --test --test-force-exit --test-reporter=spec`，测试文件为 `aoe-damage、automaton-combat、hidden-combat、threehead-mother、boss-component-damage`，扩展集另加 `skill-balance`。
