export const PageSize = 0o200;
export const NumPages = 32;
export const FieldSize = NumPages * PageSize;
export const NumFields = 8;
export const MemSize = NumFields * FieldSize;

export function calcPageNum(loc: number): number {
    return (loc >> 7) & 31;
}

export function firstAddrInPage(pageNum: number): number {
    return pageNum * PageSize;
}

export function isMRIOp(op: number): boolean {
    return (op & 0o7000) <= 0o5000;
}
