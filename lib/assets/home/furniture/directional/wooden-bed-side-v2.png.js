const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../../wooden-bed-side-v2-DVGGOmVn.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
