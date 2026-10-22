import { cp,mkdir } from 'node:fs/promises';
for (const [source,target] of [['db/migrations','dist/db/migrations'],['evals/oracles','dist/evals/oracles']]) {
  await mkdir(target,{recursive:true});
  await cp(source,target,{recursive:true});
}
