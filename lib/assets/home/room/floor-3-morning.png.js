const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../floor-3-morning-De-qRY1E.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
