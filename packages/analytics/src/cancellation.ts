import type { Pool,PoolClient } from 'pg';

// Cancels only the current read-only connection, using the same database login.
// Await cancellation completion before returning the connection to the pool so
// a late cancel cannot hit an unrelated future query on the same backend PID.
export async function watchQueryAbort(pool:Pool,client:PoolClient,signal?:AbortSignal){
  signal?.throwIfAborted();
  if(!signal)return {stop:async()=>{}};
  const pid=(await client.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
  let pending:Promise<unknown>|undefined;
  const cancel=()=>{pending=pool.query('SELECT pg_cancel_backend($1)',[pid]).catch(()=>undefined);};
  signal.addEventListener('abort',cancel,{once:true});
  if(signal.aborted)cancel();
  return {async stop(){signal.removeEventListener('abort',cancel);await pending;}};
}
