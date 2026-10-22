import { createHash } from 'node:crypto';
export function resultHash(value:unknown):string {
  const sorted=(v:unknown):unknown=>Array.isArray(v)?v.map(sorted):v && typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:1).map(([k,x])=>[k,sorted(x)])):v;
  return createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
}
