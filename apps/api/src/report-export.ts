import type { ReportDTO } from '../../../packages/contracts/src/http.js';

// Stored text and identifiers are data, including user questions and SKU labels.
const prose=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_[\]]/g,'\\$&').replace(/[\r\n]+/g,' ');
function json(value:unknown){
  const content=JSON.stringify(value,null,2);
  const fence='`'.repeat(Math.max(3,...[...content.matchAll(/`+/g)].map(m=>m[0].length+1)));
  return `${fence}json\n${content}\n${fence}`;
}
const list=(values:string[])=>values.length?values.map(value=>`- ${prose(value)}`):['- 无'];

export function reportMarkdown(report:ReportDTO):string{
  return [
    `# ${prose(report.title)}`,'','> 合成数据；固定演示业务时钟。','',
    `报告：${prose(report.id)}；run：${prose(report.runId)}；session：${prose(report.sessionId)}`,
    `生成时间：${prose(report.createdAt)}`,
    `问题：${prose(report.question)}`,
    `状态：${report.status}；单位：${report.unit}（fen 为人民币分整数，units 为支付件数；null 表示不可计算或缺失，不等于 0）`,
    `模式：${report.provenance.executionMode}；Agent 执行：${report.provenance.agentExecuted}`,
    `指标：${prose(report.metricLabel)}；范围摘要：${prose(report.scopeLabel)}`,
    `时区：${report.dataset.timezone}；数据水位：${report.dataset.updatedAt}`,'',
    '## 分析口径',json(report.query),'',
    '### 数据集',json(report.dataset),'',
    '### 版本与执行来源',json(report.provenance),'',
    '## 总量与贡献',prose(report.finding),'',
    '原始总量（分/件及未舍入比例）：',json(report.comparison),'',
    '原始贡献（负份额与超过 100% 的份额均保留；不同维度不相加）：',json(report.contributors),'',
    '## 事实',...report.facts.flatMap(f=>[
      `- ${prose(f.text)} [${f.evidenceIds.map(prose).join(', ')}]`,
      `  数值引用：${f.valueRefs.map(prose).join('；')}`,
    ]),'',
    '## 可能解释',...report.hypotheses.map(h=>
      `- ${prose(h.text)} [${h.evidenceIds.map(prose).join(', ')}]；反证引用：${h.contradictingEvidenceIds?.map(prose).join(', ')||'未提供'}；缺失信息：${h.missingEvidence.map(prose).join('；')||'未提供'}`),'',
    '## 未知',...list(report.unknowns),'',
    '## 建议核实',...list(report.nextActions),'',
    '## 限制',...list(report.limitations),'',
    '## 证据',
    '以下各证据保留自身 QuerySpec、两期窗口、筛选、列名、原始值、覆盖率、结构化信号、说明及 hash；证据子范围不等于报告总范围。库存是大区共享池，流量不支持 SKU 归因；活动不支持大区归因，退款原因仅描述本期成功退款分类。',
    ...report.evidences.flatMap(e=>['',`### ${prose(e.code)} ${prose(e.title)}（${prose(e.id)}）`,json(e)]),'',
    '## 执行记录',json(report.trace),'',
  ].join('\n');
}
