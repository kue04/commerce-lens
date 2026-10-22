import { setTimeout as delay } from 'node:timers/promises';
export async function readWithRetry<T>(operation:()=>Promise<T>,signal:AbortSignal,onRetry?:()=>void):Promise<T>{
  try{return await operation();}catch(error){
    const code=error && typeof error==='object' && 'code' in error?String(error.code):'';
    if(!['40001','40P01','08000','08003','08006','57P01'].includes(code))throw error;
    signal.throwIfAborted();onRetry?.();await delay(50,undefined,{signal});return operation();
  }
}
