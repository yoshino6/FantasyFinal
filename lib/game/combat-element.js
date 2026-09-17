const nativeElement = (value) => {
    const element = String(value ?? '').trim();
    return element && element !== '无' ? element : undefined;
};
const resolveDirectAttackElement = (options) => options.skill
    ? nativeElement(options.skillElement) ?? '无'
    : nativeElement(options.weaponElement) ?? nativeElement(options.cardElement) ?? '无';
const hasNativeAttackElement = (value) => Boolean(nativeElement(value));

export { hasNativeAttackElement, resolveDirectAttackElement };
