const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../../wolfhide-carpet-back-qCIX1PDo.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
