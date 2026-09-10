const OWNER_PASSWORD = 'afshun666666';
const unconfiguredPassword = ['请在这里', '设置主人密码'].join('');
const verifyOwnerPassword = (password) => {
    const configured = OWNER_PASSWORD.trim();
    if (!configured || configured === unconfiguredPassword)
        throw new Error('尚未在 src/config/admin.ts 配置主人密码。');
    return password === configured;
};

export { OWNER_PASSWORD, verifyOwnerPassword };
