const firstPersonNarrative = (text) => {
    let result = '', outside = '';
    let quoted = false;
    const flush = () => {
        if (!outside)
            return;
        result += outside.replace(/你们/g, '我们').replace(/你的/g, '我的').replace(/你/g, '我');
        outside = '';
    };
    for (const char of text) {
        if (char === '“') {
            flush();
            quoted = true;
            result += char;
            continue;
        }
        if (char === '”') {
            quoted = false;
            result += char;
            continue;
        }
        if (quoted)
            result += char;
        else
            outside += char;
    }
    flush();
    return result;
};

export { firstPersonNarrative };
