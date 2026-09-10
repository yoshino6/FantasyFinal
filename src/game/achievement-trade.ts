import type {PoolConnection,RowDataPacket} from 'mysql2/promise';
import {recordAchievement} from './achievement-events';
import {achievementItem} from './achievement-hooks';
export const achievementTrade=async(c:PoolConnection,buyer:number,seller:number,item:number,paid:number,net:number,event:string)=>{
 const [actors]=await c.query<RowDataPacket[]>('SELECT c.id,p.qq_user_id FROM characters c JOIN players p ON p.id=c.player_id WHERE c.id IN (?) AND c.npc_code IS NULL',[[buyer,seller]]);
 const left=actors.find(a=>Number(a.id)===buyer),right=actors.find(a=>Number(a.id)===seller);if(!left||!right||left.qq_user_id===right.qq_user_id)return;
 recordAchievement(c,buyer,[{metric:'ACH_K05',distinct:String(right.qq_user_id)},{metric:'ACH_K08',value:paid,life:true}],event);
 recordAchievement(c,seller,[{metric:'ACH_K05',distinct:String(left.qq_user_id)},{metric:'ACH_K09',value:net,life:true}],event);
 if(item>0)await achievementItem(c,buyer,item);
};
