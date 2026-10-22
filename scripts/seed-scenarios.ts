import { adminPool } from './connections.js';
import { publishSeed } from '../db/seeds/generate.js';
import { scenarioIds,scenarioSeed } from '../db/seeds/scenarios.js';
const pool=adminPool();
try{for(const id of scenarioIds){const data=scenarioSeed(id);if(!(await pool.query('SELECT 1 FROM business.datasets WHERE dataset_version=$1',[data.version])).rowCount)await publishSeed(pool,data);console.log(`${id}: ${data.version}`);}}finally{await pool.end();}
