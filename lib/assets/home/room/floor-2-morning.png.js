const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../floor-2-morning-Bumr8eM5.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
