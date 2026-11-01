import { shiftDate } from '../../packages/metrics/src/index.js';
import type { SeedData } from './generate.js';

export const PORTFOLIO_VERSION='portfolio-90d-v1';
export const PORTFOLIO_SEED=20261022;
const channels=['douyin','tmall','jd'] as const,regions=['east','south','north','west'] as const;
const clock='2026-10-22',start='2026-07-24';

// Only business facts are emitted. Scenario expectations remain outside business tables.
export function portfolioSeed():SeedData {
  let state=PORTFOLIO_SEED;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const data:SeedData={version:PORTFOLIO_VERSION,seed:PORTFOLIO_SEED,clock,start,completeThrough:clock,missing:[],products:[],orders:[],items:[],refunds:[],inventory:[],traffic:[],promotions:[
    {store:'store-demo',id:'autumn-snack',start:'2026-09-25T00:00:00+08:00',end:'2026-10-15T00:00:00+08:00',channel:'douyin',sku:'SKU-02',type:'discount'},
    {store:'store-demo',id:'october-nuts',start:'2026-10-01T00:00:00+08:00',end:'2026-10-22T00:00:00+08:00',channel:'tmall',sku:'SKU-04',type:'discount'},
  ]};
  for(let index=0;index<30;index++)data.products.push({store:'store-demo',sku:`SKU-${String(index+1).padStart(2,'0')}`,name:`${['坚果','饼干','果干'][index%3]} ${index+1}`,category:['坚果','饼干','果干'][index%3]!});
  const stock=(day:number,sku:number,region:string,hour:number)=>sku===0&&region==='east'&&day>=83&&hour>=8&&hour<18?0:60+(day*7+sku*13+hour*3)%140;
  const cells:{day:number;date:string;channel:string;region:string;weight:number;count:number;remainder:number}[]=[];
  for(let day=0;day<90;day++){
    const date=shiftDate(start,day),weekday=new Date(`${date}T00:00:00Z`).getUTCDay();
    for(const region of regions){
      for(let sku=0;sku<30;sku++)for(let hour=0;hour<24;hour++)data.inventory!.push({store:'store-demo',sku:data.products[sku]!.sku,region,at:`${date}T${String(hour).padStart(2,'0')}:00:00+08:00`,units:stock(day,sku,region,hour),observed:true});
      for(const channel of channels){
        const sessions=Math.round(2600*([0,6].includes(weekday)?1.25:1)*(1+day/450)*(channel==='douyin'?1.3:channel==='tmall'?1.1:0.8)*(region==='east'?1.4:region==='south'?1.1:0.85)*(day>=83&&channel==='douyin'&&region==='east'?0.65:1));
        data.traffic!.push({store:'store-demo',channel,region,date,sessions,attribution:'order-channel-region-v1'});
        cells.push({day,date,channel,region,weight:sessions*(0.028+(channel==='tmall'?0.005:0)),count:0,remainder:0});
      }
    }
  }
  // Allocate a fixed number of orders from daily traffic and conversion weights.
  const totalWeight=cells.reduce((sum,cell)=>sum+cell.weight,0);
  for(const cell of cells){const exact=cell.weight/totalWeight*100000;cell.count=Math.floor(exact);cell.remainder=exact-cell.count;}
  const remaining=100000-cells.reduce((sum,cell)=>sum+cell.count,0);
  [...cells].sort((a,b)=>b.remainder-a.remainder||a.day-b.day||a.channel.localeCompare(b.channel)||a.region.localeCompare(b.region)).slice(0,remaining).forEach(cell=>cell.count++);
  let sequence=0;
  for(const cell of cells)for(let n=0;n<cell.count;n++){
    const id=`P-${sequence++}`,hour=Math.floor(random()*24),minute=Math.floor(random()*60);
    const at=`${cell.date}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+08:00`;
    const order={store:'store-demo',id,at,status:random()<0.025?'failed':'succeeded',channel:cell.channel,region:cell.region,amount:0};
    for(let line=0;line<2;line++){
      let index=Math.floor(random()*(cell.day<83?29:30));
      if(cell.channel==='douyin'&&random()<0.25)index=Math.floor(random()*10);
      if(stock(cell.day,index,cell.region,hour)===0)index=1;
      const product=data.products[index]!,quantity=1+Math.floor(random()*3),unitPrice=990+index*137;
      const discounted=data.promotions!.some(p=>p.sku===product.sku&&p.channel===cell.channel&&at>=p.start&&at<p.end);
      const amount=quantity*(discounted?Math.floor(unitPrice*0.85):unitPrice),itemId=`${id}-${line}`;
      data.items.push({store:'store-demo',id:itemId,order:id,sku:product.sku,category:product.category,quantity,amount});order.amount+=amount;
      if(order.status==='succeeded'&&random()<(cell.day>=76&&index===2?0.14:0.025)){
        // Include same-day and cross-period partial refunds, never beyond the clock.
        const lag=random()<0.15?0:1+Math.floor(random()*7);
        if(cell.day+lag<90){
          const refundDate=shiftDate(cell.date,lag),refundUnits=1,refundAmount=amount/quantity;
          data.refunds.push({store:'store-demo',id:`PR-${itemId}`,item:itemId,at:`${refundDate}T23:59:00+08:00`,status:'succeeded',amount:refundAmount,units:refundUnits,reason:random()<0.08?null:cell.day>=76&&index===2?'damaged':'not_needed'});
        }
      }
    }
    data.orders.push(order);
  }
  return data;
}
