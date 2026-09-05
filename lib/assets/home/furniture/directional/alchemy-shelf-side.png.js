const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../../alchemy-shelf-side-CjTI6Gwn.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
