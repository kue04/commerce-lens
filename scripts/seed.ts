import { adminPool } from './connections.js';
import { generateSeed,publishSeed } from '../db/seeds/generate.js';
import { portfolioSeed,PORTFOLIO_VERSION } from '../db/seeds/portfolio.js';
const requested=process.argv[2];
if(requested&&requested!==PORTFOLIO_VERSION)throw new Error('Unknown dataset; use portfolio-90d-v1 or omit the argument for the legacy generator');
const pool=adminPool();
try {const data=requested?portfolioSeed():generateSeed(Number(process.env.SEED??42),Number(process.env.ORDER_COUNT??100000));await publishSeed(pool,data);console.log(JSON.stringify({datasetVersion:data.version,isSynthetic:true,orders:data.orders.length,items:data.items.length,refundEvents:data.refunds.length}));}
finally {await pool.end();}
