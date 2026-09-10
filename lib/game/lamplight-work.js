const lamplightWork = (node) => {
    const source = node.title + node.findings.join('');
    const kind = /维修|检修|接点|承重|装置|机关|航标|根索|隔离.*核心/.test(source) ? 'maintenance' : /救援|撤离|伤员|担架|被困|安置|接应|获救/.test(source) ? 'rescue' : /补给|药包|食物|物资|餐|汤|燃料/.test(source) ? 'supplies' : 'records';
    const hash = [...node.code].reduce((v, c) => v + c.charCodeAt(0), 0), units = 2 + hash % 3;
    if (kind === 'maintenance')
        return { kind, object: `《${node.title}》检修件`, units, steps: ['核对隔离与检修用料', '复查空载与备用通路'], receipts: ['检修件领用及安装记录', '空载试验与备用通路回执'], test: ['先隔离操作端，保留维生与返程', '同时切断所有供能', '带载更换未经检验的接点'], answer: 0 };
    if (kind === 'rescue')
        return { kind, object: `《${node.title}》待接分组`, units, steps: ['确认意愿与出发名单', '核实到达与实际安置'], receipts: ['本人确认的分组出发单', '接收人签认的到达安置单'], test: ['发出即记作全部到达', '按双方签收登记，未到者留待接', '把无法行走的人从名单删去'], answer: 1 };
    if (kind === 'supplies')
        return { kind, object: `《${node.title}》公会补给`, units, steps: ['按领用单分配用品', '核对收件与剩余数量'], receipts: ['补给领用与分配单', '收件数量及余量核验单'], test: [`登记发出 ${units + 1} 份`, `未签收即重复领取`, `发出 ${units} 份，逐份确认去向`], answer: 2 };
    return { kind, object: `《${node.title}》待核记录`, units, steps: ['对照原件与本人陈述', '封存差异并核实收件'], receipts: ['有来源的原件与见证核对单', '保留异议的封存交接单'], test: ['保留原件与异议，见证人自行确认', '替未到场者补签同意', '只保留看起来最整齐的新副本'], answer: 0 };
};
const lamplightWorkResult = (node, work, index, choice) => {
    const selected = node.choices['ABC'.indexOf(choice)];
    const first = work.kind === 'maintenance' ? `值守保留必要供能，你核对隔离牌后领用 ${work.units} 份检修件。更换位置与旧件编号逐一记入《${node.title}》现场单。`
        : work.kind === 'rescue' ? `你逐组确认本人意愿、去向与接收人，将 ${work.units} 组待接人员交给已登记的接应班。尚未到达的名字仍留在待接栏。`
            : work.kind === 'supplies' ? `你检查封签后，将 ${work.units} 份公会补给按指定去向交出。每份只有一条领用记录，尚未签收的物资单独保留。`
                : `你对照 ${work.units} 份现场记录，请在场见证人分别说明。原件没有销毁，不一致之处另页登记，缺席者没有被代签。`;
    const second = work.kind === 'maintenance' ? '空载与备用通路分别试验，接收端报回正确编号。旧件封存，新件使用数与领取数相符。'
        : work.kind === 'rescue' ? '接收人逐组确认到达，安置点逐项核对床位与照料。出发和到达两份单据一致，最后一组的回讯也已收到。'
            : work.kind === 'supplies' ? '收件人逐份核对用品与数量。已签收数等于领用数，现场余量为零，空箱按原记录交回。'
                : '原件、核对页与异议说明一起封存，接收人复查页数和封签。记录留有来源，后续仍可以追溯。';
    return `${index === 0 ? first : second}\n\n你的处理方式：${selected}。\n已记入：${work.receipts[index]}。`;
};

export { lamplightWork, lamplightWorkResult };
