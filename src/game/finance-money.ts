/** 所有钱庄命令均以整数铜币输入；1 银币仅是 100 铜币的展示单位。 */
export const parseFinanceCopper = (value: string) => {
  const input = String(value).trim();
  if (!/^[1-9]\d{0,7}$/.test(input)) throw new Error('请输入 1 至 99999999 的整数铜币，不支持小数。');
  return Number(input);
};

export const copperText = (copper: number) => {
  if (!Number.isSafeInteger(copper) || copper < 0) throw new Error('铜币金额无效。');
  const silver = Math.floor(copper / 100), remainder = copper % 100;
  if (!silver) return `${remainder} 铜币`;
  return remainder ? `${silver} 银币 ${remainder} 铜币` : `${silver} 银币`;
};

/** 利息在铜币层按基点向下取整，且不超过已筹集的利息池。 */
export const reservedInterestCopper = (principal: number, basisPoints: number, poolCopper: number) => {
  if (![principal, basisPoints, poolCopper].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('利息计算参数无效。');
  return Math.min(Math.floor(principal * basisPoints / 10000), poolCopper);
};
