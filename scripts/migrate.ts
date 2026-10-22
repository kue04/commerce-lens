import { adminPool } from './connections.js';
import { migrate } from '../db/migrate.js';
const pool=adminPool();
try {await migrate(pool);console.log('Migrations applied.');} finally {await pool.end();}
