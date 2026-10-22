import { adminPool } from './connections.js';
import { generateSeed,publishSeed } from '../db/seeds/generate.js';
const pool=adminPool();
try {const data=generateSeed(Number(process.env.SEED??42),Number(process.env.ORDER_COUNT??100000));await publishSeed(pool,data);console.log(JSON.stringify({datasetVersion:data.version,isSynthetic:true,orders:data.orders.length,items:data.items.length,refundEvents:data.refunds.length}));}
finally {await pool.end();}
