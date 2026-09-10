const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../adventurer-card-background-DNkAmUVY.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
