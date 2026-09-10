const reg = ['win32'].includes(process.platform) ? /^file:\/\/\// : /^file:\/\// ;
const fileUrl = new URL('../../../training-dummy-front-lSQzV1-o.png', import.meta.url).href.replace(reg, '');

export { fileUrl as default };
