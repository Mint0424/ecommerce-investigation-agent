import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDataset } from './data.ts';
import { runInvestigation } from './runtime.ts';
import { renderMarkdown, renderHtml } from './report.ts';
import type { Report } from './domain.ts';

const root = join(import.meta.dir, '..');
const outputDir = join(root, 'artifacts');
const data = loadDataset();
const [command, ...args] = process.argv.slice(2);
if (!['demo', 'investigate'].includes(command ?? '')) {
  console.log('用法：bun src/cli.ts demo | investigate <精确SKU> [结束日期] [窗口天数]');
  process.exit(1);
}
const skus = command === 'demo' ? data.products.map(product => product.sku) : [args[0] ?? 'CUP-BLUE-500'];
mkdirSync(outputDir, { recursive: true });
const reports: Report[] = [];
for (const sku of skus) {
  const { report } = await runInvestigation(data, { sku, endDate: args[1], days: args[2] ? Number(args[2]) : undefined }, { tracePath: join(outputDir, 'traces.jsonl') });
  writeFileSync(join(outputDir, `${sku}.json`), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(outputDir, `${sku}.md`), renderMarkdown(report));
  reports.push(report);
  console.log(`${sku}: ${report.status}，复核${report.review.passed ? '通过' : '失败'}，${report.hypotheses.map(h => h.code).join(', ')}`);
}
writeFileSync(join(outputDir, 'report.html'), renderHtml(reports));
console.log(`报告已保存：${outputDir}/report.html`);
