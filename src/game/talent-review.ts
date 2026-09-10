import type { TalentData } from './talent-data';
import { randomUUID } from 'node:crypto';

export const assertTalentReviewResolved = (data: TalentData) => {
  if(data.flags.reviewOverflow)throw new Error('复盘记录已满，请打开 /天赋 选择舍弃旧记录或新记录，再开始下一场战斗或生产；未处理的新记录不会被覆盖。若本次批量制作已回滚，请减少批量后重试。');
};
export const queueTalentReview = (data: TalentData, payload: Record<string,any>) => {
  assertTalentReviewResolved(data);
  if(data.jobs.filter(j=>j.kind==='review').length<3)
    data.jobs.push({id:randomUUID(),kind:'review',created:Date.now(),ready:0,payload});
  else data.flags.reviewOverflow=payload;
};
