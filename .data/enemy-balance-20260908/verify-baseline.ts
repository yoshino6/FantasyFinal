import {readFileSync,writeFileSync} from 'node:fs';
import {previousMonsterHpMax} from '../../src/game/enemy-stat-balance';
import {monsterCombatStats as oldStats} from './legacy-adventure';
import {monsterCombatStats} from '../../src/game/adventure.service';
const s=JSON.parse(readFileSync('.data/enemy-balance-20260908/verified-before.json','utf8'));
const mismatch=s.spawns.filter((r:any)=>!r.defeated_at&&previousMonsterHpMax(r)!==oldStats(r).hpMax).map((r:any)=>({id:r.id,code:r.code,old:oldStats(r).hpMax,migration:previousMonsterHpMax(r)}));
const invalid=[...s.templates,...s.spawns].flatMap((r:any)=>Object.entries(monsterCombatStats(r)).filter(([,v])=>!Number.isFinite(v)||Number(v)<0).map(([key,v])=>({id:r.id,key,v})));
writeFileSync('.data/enemy-balance-20260908/baseline-verification.json',JSON.stringify({mismatch,invalid},null,2));console.log(JSON.stringify({liveLegacyHpMismatches:mismatch.length,invalidStats:invalid.length,first:mismatch.slice(0,4)}));process.exit(mismatch.length||invalid.length?1:0);
