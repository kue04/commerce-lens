import type { Pool } from 'pg';
import { shiftDate } from '../../packages/metrics/src/index.js';

type Order = { store: string; id: string; at: string; status: string; channel: string; region: string; amount: number };
type Item = { store: string; id: string; order: string; sku: string; category: string; quantity: number; amount: number };
type Refund = { store: string; id: string; item: string; at: string; status: string; amount: number; units: number; reason: string | null };
type Product = { store: string; sku: string; name: string; category: string };
export type InventoryRow={store:string;sku:string;region:string;at:string;units:number;observed:boolean};
export type TrafficRow={store:string;channel:string;region:string;date:string;sessions:number;attribution:string};
export type PromotionRow={store:string;id:string;start:string;end:string;channel:string|null;sku:string|null;type:string};
export type SeedData = { version: string; seed: number; clock: string; start: string; products: Product[]; orders: Order[]; items: Item[]; refunds: Refund[]; missing: string[]; completeThrough: string;
  inventory?:InventoryRow[];traffic?:TrafficRow[];promotions?:PromotionRow[];
  sourceOverrides?: Partial<Record<'orders'|'order_items'|'refund_events'|'inventory'|'traffic'|'promotion',{completeThrough?:string;missing?:string[]}>> };

export function signalSeed(version='signals-v1'):SeedData {
  const data=acceptanceSeed(version);data.inventory=[];data.traffic=[];
  for(const date of ['2026-10-14','2026-10-21']){
    for(const region of ['east','south','north','west']){
      for(const sku of ['A','B','C'])for(let hour=0;hour<24;hour++)data.inventory.push({store:'store-demo',sku,region,at:`${date}T${String(hour).padStart(2,'0')}:00:00+08:00`,units:date==='2026-10-21' && sku==='A' && region==='east' && hour>=8 && hour<18?0:100,observed:true});
      for(const channel of ['douyin','tmall','jd'])data.traffic.push({store:'store-demo',region,channel,date,sessions:date==='2026-10-21'?700:1000,attribution:'order-channel-region-v1'});
    }
  }
  data.promotions=[{store:'store-demo',id:'promotion-A',start:'2026-10-10T00:00:00+08:00',end:'2026-10-21T00:00:00+08:00',channel:'douyin',sku:'A',type:'discount_ended'}];
  return data;
}

export function acceptanceSeed(version = 'acceptance-v1', seed = 42): SeedData {
  const products: Product[] = ['store-demo', 'store-other'].flatMap(store => ['A','B','C'].map(sku => ({ store, sku, name: `食品 ${sku}`, category: sku === 'C' ? '新品' : '零食' })));
  const orders: Order[] = [], items: Item[] = [];
  const add = (id: string, date: string, lines: [string, number, number][], store = 'store-demo', status = 'succeeded') => {
    orders.push({ store, id, at: `${date}T12:00:00+08:00`, status, channel: 'douyin', region: 'east', amount: lines.reduce((s,l) => s + l[2],0) });
    for (const [sku, quantity, amount] of lines) items.push({ store, id: `${id}-${sku}`, order: id, sku, category: sku === 'C' ? '新品' : '零食', quantity, amount });
  };
  add('base','2026-10-14',[['A',60,6000000],['B',40,4000000]]);
  add('current','2026-10-21',[['A',20,2000000],['B',50,5000000]]);
  add('new','2026-10-20',[['C',1,12345]]);
  add('failed','2026-10-21',[['A',5,990000]],'store-demo','failed');
  add('base','2026-10-14',[['A',1,900000000]],'store-other');
  add('current','2026-10-21',[['A',1,800000000]],'store-other');
  return { version, seed, clock: '2026-10-22', start: '2026-07-24', completeThrough: '2026-10-22', missing: [], products, orders, items, refunds: [
    { store:'store-demo', id:'r1', item:'base-A', at:'2026-10-21T01:00:00+08:00', status:'succeeded', amount:100000, units:1, reason:'damaged' },
    { store:'store-demo', id:'r2', item:'base-A', at:'2026-10-21T02:00:00+08:00', status:'succeeded', amount:200000, units:2, reason:null },
    { store:'store-demo', id:'r-failed', item:'base-A', at:'2026-10-21T03:00:00+08:00', status:'failed', amount:900000, units:1, reason:'damaged' },
  ] };
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state,1664525)+1013904223)>>>0; return state/4294967296; };
}
export function generateSeed(seed = 42, orderCount = 100000): SeedData {
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647 || !Number.isInteger(orderCount) || orderCount < 1 || orderCount > 1000000) throw new Error('Invalid seed or order count');
  const rng = random(seed), clock = '2026-10-22', start = shiftDate(clock,-90);
  const data: SeedData = { version:`synthetic-v1-${seed}-${orderCount}`, seed, clock, start, completeThrough:clock, missing:[], products:[],orders:[],items:[],refunds:[] };
  for (let n=0;n<30;n++) data.products.push({store:'store-demo',sku:`SKU-${String(n+1).padStart(2,'0')}`,name:`${['坚果','饼干','果干'][n%3]} ${n+1}`,category:['坚果','饼干','果干'][n%3]!});
  for (let n=0;n<orderCount;n++) {
    let day = Math.floor(rng()*90);
    // Weekly volume cycle; weekend days receive more orders, preserving the requested total.
    while (rng() > ([0,6].includes(new Date(`${shiftDate(start,day)}T00:00:00Z`).getUTCDay()) ? 1 : 0.75)) day=Math.floor(rng()*90);
    const date=shiftDate(start,day);
    const hour=Math.floor(rng()*24), minute=Math.floor(rng()*60);
    const id=`O-${n}`, channel=['douyin','tmall','jd'][Math.floor(rng()*3)]!, region=['east','south','north','west'][Math.floor(rng()*4)]!;
    const order: Order={store:'store-demo',id,at:`${date}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+08:00`,status:rng()<0.03?'failed':'succeeded',channel,region,amount:0};
    for(let j=0;j<2;j++) {
      let index=Math.floor(rng()*(day<83?29:30));
      // Channel preferences alter product mix rather than introducing separate reporting totals.
      if(channel==='douyin' && rng()<0.25) index=Math.floor(rng()*10);
      // Stable-price SKU-01 loses units on the target day; this changes facts, not summaries.
      if(day===89 && index===0 && rng()<0.8) index=1;
      const sku=data.products[index]!, quantity=1+Math.floor(rng()*3), amount=quantity*(990+index*137);
      const item:Item={store:'store-demo',id:`${id}-${j}`,order:id,sku:sku.sku,category:sku.category,quantity,amount};
      data.items.push(item); order.amount+=amount;
      if(order.status==='succeeded' && day<88 && rng()<0.025) {
        const refundDate=shiftDate(date,1+Math.floor(rng()*Math.min(7,89-day)));
        data.refunds.push({store:'store-demo',id:`R-${n}-${j}`,item:item.id,at:`${refundDate}T23:00:00+08:00`,status:'succeeded',amount:Math.floor(amount/2),units:0,reason:rng()<0.1?null:'not_needed'});
      }
    }
    data.orders.push(order);
  }
  return data;
}

export async function publishSeed(pool: Pool, data: SeedData, onProgress?: (stage: string) => void) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '60s'");
    const exists=await client.query('SELECT 1 FROM business.datasets WHERE dataset_version=$1',[data.version]);
    if(exists.rowCount) throw new Error('Dataset version already exists; use a new version instead of overwriting');
    await client.query(`INSERT INTO business.datasets(dataset_version,schema_version,seed,business_clock,is_synthetic) VALUES($1,'1.1.0',$2,$3,true)`,[data.version,data.seed,data.clock]);
    const insert = async (table:string, columns:string[], rows:unknown[][]) => {
      for(let offset=0;offset<rows.length;offset+=1500) {
        const batch=rows.slice(offset,offset+1500), values:unknown[]=[];
        const tuples=batch.map(row=>`(${row.map(value=>{values.push(value);return `$${values.length}`;}).join(',')})`);
        await client.query(`INSERT INTO business.${table}(${columns.join(',')}) VALUES ${tuples.join(',')}`,values);
      }
    };
    await insert('products',['dataset_version','store_id','sku_id','name','category'],data.products.map(p=>[data.version,p.store,p.sku,p.name,p.category]));
    onProgress?.('products_inserted');
    await client.query('ANALYZE business.products');
    await insert('orders',['dataset_version','store_id','order_id','paid_at','payment_status','channel_id','region_id','paid_amount_cents'],data.orders.map(o=>[data.version,o.store,o.id,o.at,o.status,o.channel,o.region,o.amount]));
    onProgress?.('orders_inserted');
    await client.query('ANALYZE business.orders');
    await insert('order_items',['dataset_version','store_id','order_item_id','order_id','sku_id','category_at_sale','quantity','paid_amount_cents'],data.items.map(i=>[data.version,i.store,i.id,i.order,i.sku,i.category,i.quantity,i.amount]));
    onProgress?.('items_inserted');
    await client.query('ANALYZE business.order_items');
    await insert('refund_events',['dataset_version','store_id','refund_event_id','order_item_id','succeeded_at','status','refund_amount_cents','refunded_units','reason_code'],data.refunds.map(r=>[data.version,r.store,r.id,r.item,r.at,r.status,r.amount,r.units,r.reason]));
    onProgress?.('refunds_inserted');
    await client.query('ANALYZE business.refund_events');
    if(data.inventory)await insert('inventory_hourly',['dataset_version','store_id','sku_id','region_id','hour_at','available_units','is_observed'],data.inventory.map(r=>[data.version,r.store,r.sku,r.region,r.at,r.units,r.observed]));
    if(data.traffic)await insert('traffic_daily',['dataset_version','store_id','channel_id','region_id','business_date','sessions','attribution_version'],data.traffic.map(r=>[data.version,r.store,r.channel,r.region,r.date,r.sessions,r.attribution]));
    if(data.promotions)await insert('promotion_events',['dataset_version','store_id','campaign_id','start_at','end_at','channel_id','sku_id','event_type'],data.promotions.map(r=>[data.version,r.store,r.id,r.start,r.end,r.channel,r.sku,r.type]));
    const sources=['orders','order_items','refund_events',...(data.inventory?['inventory']:[]),...(data.traffic?['traffic']:[]),...(data.promotions?['promotion']:[])] as const;
    const checkedAt=new Date().toISOString();
    for(const store of new Set(data.products.map(p=>p.store))) for(const source of sources) {
      const override=data.sourceOverrides?.[source as keyof NonNullable<SeedData['sourceOverrides']>];
      await client.query(`INSERT INTO business.source_watermarks(dataset_version,store_id,source,coverage_start,complete_through,missing_partitions,checked_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,[data.version,store,source,data.start,override?.completeThrough??data.completeThrough,override?.missing??data.missing,checkedAt]);
    }
    await client.query("UPDATE business.datasets SET status='published',published_at=$2 WHERE dataset_version=$1",[data.version,new Date().toISOString()]);
    onProgress?.('validated');
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally {client.release();}
}
