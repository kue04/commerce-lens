import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { Pool } from 'pg';
export function loadEnvironment() {
  // Explicit process env > .env > generated local defaults; blank template values fall back.
  for(const path of ['.env','.local/connection.env']) if(existsSync(path)) {
    for(const [key,value]of Object.entries(parseEnv(readFileSync(path,'utf8')))) if(!process.env[key] && value)process.env[key]=value;
  }
}
export function adminPool() {
  loadEnvironment();
  if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL or start npm run db:start in another terminal');
  return new Pool({connectionString:process.env.DATABASE_URL});
}
