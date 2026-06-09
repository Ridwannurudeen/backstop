// One PredictManager per user (created on first use). Cached locally by address.
const key = (addr: string) => `backstop.manager.${addr}`;
export const getManager = (addr: string) => localStorage.getItem(key(addr));
export const setManager = (addr: string, id: string) =>
  localStorage.setItem(key(addr), id);
