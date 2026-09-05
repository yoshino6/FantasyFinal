const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../floor-1-morning-wDYMLduM.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
