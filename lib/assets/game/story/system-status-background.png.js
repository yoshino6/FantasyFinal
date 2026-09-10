const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../system-status-background-DztjYQYw.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
