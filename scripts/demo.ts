import { startLocalPostgres } from './local-postgres.js';
import { acceptanceSeed,publishSeed } from '../db/seeds/generate.js';
import { AnalyticsService } from '../packages/analytics/src/service.js';
import { defaultWindows } from '../packages/metrics/src/index.js';

const db=await startLocalPostgres();
try {
  const data=acceptanceSeed(); await publishSeed(db.admin,data);
  const result=await new AnalyticsService(db.reader).analyze({metricId:'paid_amount',...defaultWindows(data.clock),filters:{regionId:['east']},groupBy:'sku',topN:10},{storeId:'store-demo',datasetVersion:data.version});
  console.log(JSON.stringify({mode:'deterministic_postgres_demo',isSynthetic:true,agentExecuted:false,businessClock:data.clock,
    display:{currency:'CNY',currentYuan:result.comparison.current!/100,baselineYuan:result.comparison.baseline!/100},...result},null,2));
} finally {await db.stop();}
