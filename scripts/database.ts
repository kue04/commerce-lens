import { startLocalPostgres } from './local-postgres.js';
const db=await startLocalPostgres(true);
console.log(`PostgreSQL running on 127.0.0.1:${db.port}. Credentials: .local/connection.env (ignored). Ctrl+C to stop.`);
const keepAlive=setInterval(()=>{},60000);
let stopping=false;
const stop=async()=>{if(stopping)return;stopping=true;clearInterval(keepAlive);await db.stop();};
process.once('SIGINT',()=>{void stop();});process.once('SIGTERM',()=>{void stop();});
