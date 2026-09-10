const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../../moonlight-lamp-front-DHxD0Kuw.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
