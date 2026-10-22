import { DomainError } from '../../contracts/src/index.js';
import type { RunDTO } from '../../contracts/src/http.js';

export class RunBudget {
  readonly usage:RunDTO['usage']={modelRequests:0,toolCalls:0,tokens:0,costUsd:null};
  constructor(readonly signal:AbortSignal,readonly maxTokens=30000){}
  check(){this.signal.throwIfAborted();if(this.usage.tokens>this.maxTokens || (this.usage.costUsd??0)>0.30)throw new DomainError('BUDGET_EXCEEDED','任务 token 或成本预算已耗尽');}
  tool(){this.check();if(this.usage.toolCalls>=12)throw new DomainError('BUDGET_EXCEEDED','工具调用预算已耗尽');this.usage.toolCalls++;}
  request(inputUpperBound:number,prices?:{input:number;output:number}){
    this.check();if(this.usage.modelRequests>=8)throw new DomainError('BUDGET_EXCEEDED','模型请求预算已耗尽');
    const output=Math.min(2048,this.maxTokens-this.usage.tokens-inputUpperBound);
    if(output<32)throw new DomainError('BUDGET_EXCEEDED','剩余 token 不足以开始下一次模型调用');
    if(prices && (this.usage.costUsd??0)+(inputUpperBound*prices.input+output*prices.output)/1000000>0.30)throw new DomainError('BUDGET_EXCEEDED','下一次模型请求预计超过成本预算');
    this.usage.modelRequests++;return output;
  }
  record(tokens:number,cost:number|null){
    if(!Number.isSafeInteger(tokens)||tokens<0 || (cost!==null && (!Number.isFinite(cost)||cost<0)))throw new DomainError('INVALID_USAGE','供应商用量无效');
    this.usage.tokens+=tokens;
    if(cost!==null)this.usage.costUsd=(this.usage.costUsd??0)+cost;
    this.check();
  }
}
