import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { reportMarkdown } from '../../apps/api/src/report-export.js';
import type { ReportDTO } from '../../packages/contracts/src/http.js';

test('Markdown renders stored legacy reports without rewriting them and keeps data inside code fences',async()=>{
  const sample=JSON.parse(await readFile(new URL('../../packages/contracts/examples/payment-flow.json',import.meta.url),'utf8'));
  const report=sample.report as ReportDTO;report.provenance.contractVersion='1.0.0';
  report.question='[不可信链接](https://example.invalid)\n# 伪造结论\n<script>data</script>';
  report.evidences[0]!.note='包含 ```json 和 ```` 的数据\n## 伪造证据';
  const original=structuredClone(report),markdown=reportMarkdown(report);
  assert.deepEqual(report,original,'export must never mutate immutable stored results');
  assert.equal(markdown.includes('[不可信链接](https://example.invalid)'),false);
  assert.equal(markdown.includes('<script>'),false);
  assert.equal(/^# 伪造结论$/m.test(markdown),false);
  const blocks=[...markdown.matchAll(/^(`{3,})json\n([\s\S]*?)\n\1$/gm)].map(m=>JSON.parse(m[2]!));
  for(const e of report.evidences)assert.ok(blocks.some(value=>isDeepStrictEqual(value,e)));
  assert.ok(blocks.some(value=>isDeepStrictEqual(value,report.provenance)));
  assert.match(markdown,/null 表示不可计算或缺失，不等于 0/);
});
