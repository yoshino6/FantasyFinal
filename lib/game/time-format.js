const durationText = (seconds) => {
    const total = Math.max(0, Math.ceil(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const remainingSeconds = total % 60;
    const parts = [hours ? `${hours}时` : '', minutes ? `${minutes}分` : '', remainingSeconds ? `${remainingSeconds}秒` : ''].filter(Boolean);
    return parts.join('') || '0秒';
};
const detentionMessage = (detainedUntil) => {
    const until = detainedUntil ? new Date(detainedUntil).getTime() : Date.now();
    return `你已被城镇守卫关押，请安静等待释放。\n剩余时间：${durationText((until - Date.now()) / 1000)}`;
};

export { detentionMessage, durationText };
