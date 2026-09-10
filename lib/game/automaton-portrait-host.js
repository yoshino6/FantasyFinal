import { getConfigValue } from 'alemonjs';

const portraitHostConfig = () => {
    const config = getConfigValue();
    const host = config.FantasyFinal?.automatonPortrait?.host;
    if (host?.provider === 'imgbb') {
        if (!host.apiKey?.trim())
            throw new Error('ImgBB API Key 尚未配置。');
        return { provider: 'imgbb', url: 'https://api.imgbb.com/1/upload', token: host.apiKey.trim() };
    }
    if (host?.provider && host.provider !== 'generic')
        throw new Error('图床类型无效。');
    if (!host?.uploadUrl || !host.token)
        throw new Error('机巧图床尚未配置，暂不能上传图片。');
    const url = new URL(host.uploadUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        throw new Error('机巧图床配置无效，请联系管理员。');
    return { provider: 'generic', url: url.href, token: host.token };
};
const parsePortraitHostResponse = (value) => {
    const result = value;
    if (result?.success === false || result?.status === false)
        throw new Error('图床拒绝了上传请求。');
    const address = result?.data?.links?.url ?? result?.data?.url ?? result?.url;
    if (typeof address !== 'string' || address.length > 2048)
        throw new Error('图床没有返回有效图片地址。');
    const url = new URL(address);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        throw new Error('图床须返回公开的 HTTPS 图片地址。');
    return url.href;
};
const uploadPortraitToHost = async (data, key) => {
    const config = portraitHostConfig(), form = new FormData();
    if (config.provider === 'imgbb')
        form.append('key', config.token);
    form.append(config.provider === 'imgbb' ? 'image' : 'file', new Blob([new Uint8Array(data)], { type: 'image/webp' }), key);
    try {
        const response = await fetch(config.url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000), headers: config.provider === 'imgbb' ? { Accept: 'application/json' } : { Authorization: 'Bearer ' + config.token, Accept: 'application/json' }, body: form });
        if (!response.ok)
            throw new Error('图床上传失败。');
        return parsePortraitHostResponse(await response.json());
    }
    catch {
        throw new Error('图床上传失败，本次审核未生效，图片仍待审核，原形象保留，请稍后重试。');
    }
};

export { parsePortraitHostResponse, portraitHostConfig, uploadPortraitToHost };
