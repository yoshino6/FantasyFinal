const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../../wooden-bed-back-6cAkstly.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
