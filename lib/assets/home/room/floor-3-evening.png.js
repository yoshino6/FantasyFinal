const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../floor-3-evening-BxlFT75u.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
