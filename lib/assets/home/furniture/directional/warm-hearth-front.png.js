const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../../warm-hearth-front-G2vbVNEl.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
