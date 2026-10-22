import { Agent } from '@earendil-works/pi-agent-core';
import { createModels } from '@earendil-works/pi-ai';
import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek';
import { loadEnvironment } from './connections.js';
loadEnvironment();
const models=createModels();models.setProvider(deepseekProvider());
console.log(JSON.stringify({node:process.version,agentImport:typeof Agent==='function',provider:'deepseek',catalog:models.getModels('deepseek').map(m=>m.id),credentialAvailable:!!process.env.DEEPSEEK_API_KEY,networkCallMade:false}));
if(process.env.DEEPSEEK_API_KEY) {
  if(!process.env.DEEPSEEK_MODEL)throw new Error('Set DEEPSEEK_MODEL to an available model from the printed catalog');
  const model=models.getModel('deepseek',process.env.DEEPSEEK_MODEL);
  if(!model)throw new Error('Configured model is not in pinned Pi catalog');
  const result=await models.completeSimple(model,{messages:[{role:'user',content:'Reply with OK.',timestamp:Date.now()}]}, {maxTokens:16,signal:AbortSignal.timeout(15000)});
  if(result.stopReason==='error')throw new Error('Provider connectivity failed; check account/model configuration');
  console.log(JSON.stringify({networkCallMade:true,usage:result.usage,stopReason:result.stopReason,businessAgentVerified:false}));
} else console.log('SKIPPED: no DEEPSEEK_API_KEY; SDK/provider check only, real model and tool loop remain unverified.');
