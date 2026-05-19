let _resetCode: string | null = null;
let _resetError: boolean = false;

export const deepLinkStore = {
  setResetCode: (code: string) => { _resetCode = code; _resetError = false; },
  consumeResetCode: (): string | null => { const c = _resetCode; _resetCode = null; return c; },
  setResetError: () => { _resetError = true; },
  consumeResetError: (): boolean => { const e = _resetError; _resetError = false; return e; },
};
