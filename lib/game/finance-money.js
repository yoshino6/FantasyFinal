const parseFinanceCopper = (value) => {
    const input = String(value).trim();
    if (!/^[1-9]\d{0,7}$/.test(input))
        throw new Error('请输入 1 至 99999999 的整数铜币，不支持小数。');
    return Number(input);
};
const copperText = (copper) => {
    if (!Number.isSafeInteger(copper) || copper < 0)
        throw new Error('铜币金额无效。');
    const silver = Math.floor(copper / 100), remainder = copper % 100;
    if (!silver)
        return `${remainder} 铜币`;
    return remainder ? `${silver} 银币 ${remainder} 铜币` : `${silver} 银币`;
};
const reservedInterestCopper = (principal, basisPoints, poolCopper) => {
    if (![principal, basisPoints, poolCopper].every(value => Number.isSafeInteger(value) && value >= 0))
        throw new Error('利息计算参数无效。');
    return Math.min(Math.floor(principal * basisPoints / 10000), poolCopper);
};

export { copperText, parseFinanceCopper, reservedInterestCopper };
