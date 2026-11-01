import { DomainError } from '../../contracts/src/index.js';
import type { RunDTO } from '../../contracts/src/http.js';

export class RunBudget {
  readonly usage:RunDTO['usage']={modelRequests:0,toolCalls:0,tokens:0,costUsd:null};
  constructor(readonly signal:AbortSignal,readonly maxTokens=30000){}
  check(){this.signal.throwIfAborted();if(this.usage.tokens>this.maxTokens || (this.usage.costUsd??0)>0.30)throw new DomainError('BUDGET_EXCEEDED','任务 token 或成本预算已耗尽');}
  tool(){this.check();if(this.usage.toolCalls>=12)throw new DomainError('BUDGET_EXCEEDED','工具调用预算已耗尽');this.usage.toolCalls++;}
  private outputBudget(inputUpperBound:number,prices?:{input:number;output:number},reserveTokens=0,maxOutput=2048){
    this.check();if(this.usage.modelRequests>=8)throw new DomainError('BUDGET_EXCEEDED','模型请求预算已耗尽');
    if(!Number.isSafeInteger(inputUpperBound)||inputUpperBound<0||!Number.isSafeInteger(reserveTokens)||reserveTokens<0||!Number.isSafeInteger(maxOutput)||maxOutput<32||maxOutput>2048)throw new DomainError('INVALID_USAGE','模型预算预检参数无效');
    const output=Math.min(maxOutput,this.maxTokens-this.usage.tokens-inputUpperBound-reserveTokens);
    if(output<32)throw new DomainError('BUDGET_EXCEEDED','本地预算预检拒绝：剩余 token 不足，请求未发送');
    if(prices && (this.usage.costUsd??0)+(inputUpperBound*prices.input+output*prices.output+reserveTokens*Math.max(prices.input,prices.output))/1000000>0.30)throw new DomainError('BUDGET_EXCEEDED','本地预算预检拒绝：下一次请求预计超过成本预算，请求未发送');
    return output;
  }
  canRequest(inputUpperBound:number,prices?:{input:number;output:number},reserveTokens=0,maxOutput=2048){
    try{this.outputBudget(inputUpperBound,prices,reserveTokens,maxOutput);return true;}
    catch(error){if(error instanceof DomainError && error.code==='BUDGET_EXCEEDED')return false;throw error;}
  }
  request(inputUpperBound:number,prices?:{input:number;output:number},reserveTokens=0,maxOutput=2048){
    const output=this.outputBudget(inputUpperBound,prices,reserveTokens,maxOutput);
    this.usage.modelRequests++;return output;
  }
  record(tokens:number,cost:number|null){
    if(!Number.isSafeInteger(tokens)||tokens<0 || (cost!==null && (!Number.isFinite(cost)||cost<0)))throw new DomainError('INVALID_USAGE','供应商用量无效');
    this.usage.tokens+=tokens;
    if(cost!==null)this.usage.costUsd=(this.usage.costUsd??0)+cost;
    this.check();
  }
}
