import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
export type MaterialCost={quantity:number;paid:Record<string,number>;children?:Record<string,MaterialCost>};
type Owner='stock'|'market';
export const scaleMaterialCost=(cost:MaterialCost,factor:number):MaterialCost=>({quantity:cost.quantity*factor,paid:Object.fromEntries(Object.entries(cost.paid).map(([k,v])=>[k,v*factor])),children:Object.fromEntries(Object.entries(cost.children??{}).map(([k,v])=>[k,scaleMaterialCost(v,factor)]))});
const mergeCosts=(a:MaterialCost,b:MaterialCost):MaterialCost=>{
  const paid={...a.paid},children={...a.children};
  for(const [k,v]of Object.entries(b.paid))paid[k]=(paid[k]??0)+v;
  for(const [k,v]of Object.entries(b.children??{}))children[k]=children[k]?mergeCosts(children[k],v):v;
  return {quantity:a.quantity+b.quantity,paid,children};
};
const readCosts=async(c:PoolConnection,owner:Owner,id:number,itemId:number)=>{
  const [rows]=await c.execute<RowDataPacket[]>('SELECT material_code,quantity,paid,children_json,children_scale FROM talent_material_costs WHERE owner_type=? AND owner_id=? AND item_id=? FOR UPDATE',[owner,id,itemId]);
  return {quantity:Number(rows[0]?.quantity??0),paid:Object.fromEntries(rows.map(r=>[String(r.material_code),Number(r.paid)])),children:Object.fromEntries(rows.filter(r=>r.children_json).map(r=>[String(r.material_code),scaleMaterialCost(typeof r.children_json==='string'?JSON.parse(r.children_json):r.children_json,Number(r.children_scale))]))};
};
const writeCosts=async(c:PoolConnection,owner:Owner,id:number,itemId:number,cost:MaterialCost)=>{
  await c.execute('DELETE FROM talent_material_costs WHERE owner_type=? AND owner_id=? AND item_id=?',[owner,id,itemId]);
  if(cost.quantity<=0)return;
  for(const [code,paid] of Object.entries(cost.paid))await c.execute('INSERT INTO talent_material_costs(owner_type,owner_id,item_id,material_code,quantity,paid,children_json,children_scale) VALUES (?,?,?,?,?,?,?,1)',[owner,id,itemId,code,cost.quantity,Math.max(0,paid),cost.children?.[code]?JSON.stringify(cost.children[code]):null]);
};
export const addMaterialCosts=async(c:PoolConnection,owner:Owner,id:number,itemId:number,cost:MaterialCost)=>{
  if(cost.quantity<=0||!Object.keys(cost.paid).length)return;
  await writeCosts(c,owner,id,itemId,mergeCosts(await readCosts(c,owner,id,itemId),cost));
};
/** Consume tracked products first, keeping the real material budget through escrow and resale. */
export const takeMaterialCosts=async(c:PoolConnection,owner:Owner,id:number,itemId:number,quantity:number):Promise<MaterialCost>=>{
  const old=await readCosts(c,owner,id,itemId),used=Math.min(quantity,old.quantity);
  if(!used)return {quantity:0,paid:{}};
  const result=scaleMaterialCost(old,used/old.quantity);
  await writeCosts(c,owner,id,itemId,scaleMaterialCost(old,(old.quantity-used)/old.quantity));
  return result;
};
export const moveMaterialCosts=async(c:PoolConnection,from:Owner,fromId:number,to:Owner,toId:number,itemId:number,quantity:number)=>{
  const cost=await takeMaterialCosts(c,from,fromId,itemId,quantity);await addMaterialCosts(c,to,toId,itemId,cost);return cost;
};
export const recoveryMaterialBudget=(cost:MaterialCost,quantity:number,recipe:readonly {code:string;quantity:number}[])=>{
  const paid={...cost.paid};
  for(const item of recipe)paid[item.code]=(paid[item.code]??0)+item.quantity*Math.max(0,quantity-cost.quantity);
  return Object.entries(paid).map(([code,amount])=>({code,quantity:Math.max(0,Math.floor(amount+1e-8))}));
};
