const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../../warm-hearth-side-CEvhp1H0.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
