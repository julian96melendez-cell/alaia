import React from "react";

export const memo = <P extends object>(component: React.FC<P>) => React.memo(component);
export const areEqualShallow = (prev: any, next: any) => {
  const pKeys = Object.keys(prev);
  const nKeys = Object.keys(next);
  if (pKeys.length !== nKeys.length) return false;
  for (const k of pKeys) if (prev[k] !== next[k]) return false;
  return true;
};