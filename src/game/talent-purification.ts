import { scaleMaterialCost } from './talent-material-recovery';
import type { PoolConnection } from 'mysql2/promise';
import type { Binding } from './inventory-binding';
import { consumeTalentMaterial, refundTalentFailure } from './talent-production';
import { talentProficiency } from './talent-rewards';
import { ordinaryTalentItem } from './talent-rewards';
import { ownedTalent, readTalentData } from './talent-data';
import type { RowDataPacket } from 'mysql2/promise';

/** Keep successful input count separate from value-scaled output count. */
export const settleTalentPurification = async (connection: PoolConnection, characterId: number, input: {
  id: number; code: string; outputCode?:string; quantity: number; success: number; valueMultiplier: number; proficiencyPerInput: number; personal: boolean;
}) => {
  const talent=input.personal?await ownedTalent(connection,characterId):undefined;
  const risk=talent?.number==='H09'&&(await readTalentData(connection,characterId)).settings.riskCraft===true;
  if(risk){
    const [items]=await connection.execute<RowDataPacket[]>('SELECT * FROM item_definitions WHERE id=? OR code=?',[input.id,input.outputCode??'']);
    if(items.length!==2||!items.every(ordinaryTalentItem))throw new Error('孤注提纯仅支持普通主材和普通产物，请先关闭孤注制作。');
  }
  const payment = await consumeTalentMaterial(connection, characterId, input.id, input.quantity, 'craft', input.personal);
  const failed: Binding = { personal: 0, trade: 0, unbound: 0 };
  let successes = 0, outputQuantity = 0;
  for (let index = 0; index < input.quantity; index++) {
    if (Math.random() * 100 < input.success*(risk?.7:1)) {
      successes++;
      outputQuantity += Math.floor(input.valueMultiplier);
      if (Math.random() < input.valueMultiplier % 1) outputQuantity++;
    } else if (index < payment.paid) {
      // Inventory consumes personal, then trade-bound stock; refunds retain that identity.
      const kind = index < payment.binding.personal ? 'personal' : index < payment.binding.personal + payment.binding.trade ? 'trade' : 'unbound';
      failed[kind]++;
    }
  }
  const failedPaid=failed.personal+failed.trade+failed.unbound;
  const refunded = await refundTalentFailure(connection, characterId, [{ itemId: input.id, binding: failed, paid:failedPaid, recovery:scaleMaterialCost(payment.recovery,payment.paid?failedPaid/payment.paid:0) }], input.personal);
  const base = input.quantity * input.proficiencyPerInput;
  const proficiencyGain = input.personal ? await talentProficiency(connection, characterId, base, {
    profession: 'alchemist', recipe: `purification:${input.code}`, successfulBase: successes * input.proficiencyPerInput
  }) : 0;
  return { binding: payment.binding, paid: payment.paid, refunded, successes, outputQuantity:outputQuantity*(risk?4:1), proficiencyGain,success:input.success*(risk?.7:1) };
};
