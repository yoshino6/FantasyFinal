const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../../slime-bed-side-ChneyWLX.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
