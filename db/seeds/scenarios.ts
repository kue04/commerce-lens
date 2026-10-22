import { acceptanceSeed,signalSeed,type SeedData } from './generate.js';
export const scenarioIds=['S01','S02','S03','S04','S05','S06','S07','S08','S09','S10','S11','S12'] as const;
export type ScenarioId=typeof scenarioIds[number];
// Labels belong to the evaluation layer; they are not inserted as business facts.
export function scenarioSeed(id:ScenarioId):SeedData {
  const data=['S02','S03','S12'].includes(id)?signalSeed(`scenario-${id}-v1`):acceptanceSeed(`scenario-${id}-v1`);
  const current=data.orders.find(o=>o.id==='current' && o.store==='store-demo')!;
  if(id==='S01'){
    const b=data.items.find(i=>i.store==='store-demo'&&i.id==='current-B')!;b.amount=4000000;b.quantity=40;current.amount=6000000;
  }
  if(id==='S02')data.inventory=[];
  if(id==='S03')data.traffic=[];
  if(id==='S07')data.orders.find(o=>o.id==='new')!.at='2026-10-21T12:00:00+08:00';
  if(id==='S08'){
    data.orders=data.orders.filter(o=>!(o.id==='current'&&o.store==='store-demo'));
    data.items=data.items.filter(i=>!(i.order==='current'&&i.store==='store-demo'));
    data.sourceOverrides={orders:{completeThrough:'2026-10-21'}};
  }
  if(id==='S10'){
    const a=data.items.find(i=>i.id==='current-A'&&i.store==='store-demo')!,b=data.items.find(i=>i.id==='current-B'&&i.store==='store-demo')!;
    a.amount=6000000;a.quantity=60;b.amount=4000000;b.quantity=40;current.amount=10000000;
  }
  if(id==='S11')data.refunds.forEach(r=>{r.reason=null;});
  return data;
}
