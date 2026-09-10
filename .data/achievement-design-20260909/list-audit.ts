import {achievementDefinitions} from '../../src/game/achievement.config';
for(const d of achievementDefinitions)console.log(d.id+' '+d.name+' | '+d.condition);
