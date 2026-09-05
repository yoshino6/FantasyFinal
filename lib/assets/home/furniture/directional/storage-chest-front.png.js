const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../../storage-chest-front-CWQ8H7DO.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
