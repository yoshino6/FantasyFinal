const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../pear-admin-cover-CnEy1TFm.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
