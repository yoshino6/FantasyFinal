const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../floor-1-evening-C3is365K.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
