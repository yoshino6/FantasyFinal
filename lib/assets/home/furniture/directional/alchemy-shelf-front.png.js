const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../../alchemy-shelf-front-Cnc_5HJD.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
