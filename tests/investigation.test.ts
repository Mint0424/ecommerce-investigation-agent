import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemoData } from '../src/seed.ts';
import { getProduct, loadDataset } from '../src/data.ts';
import { createDataPort, runInvestigation } from '../src/runtime.ts';
import { makeWindows, safeRatio, type ToolPort } from '../src/domain.ts';
import { reviewReport } from '../src/core.ts';

const cases = [
  { sku: 'CUP-BLUE-500', code: 'stockout', status: 'complete' },
  { sku: 'CUP-RED-500', code: 'no_material_decline', status: 'complete' },
  { sku: 'TOWEL-SET-3', code: 'promotion_ended', status: 'complete' },
  { sku: 'SHOES-WHITE-42', code: 'ad_conversion_decline', status: 'complete' },
  { sku: 'BAG-BLACK', code: 'insufficient_data', status: 'partial' },
  { sku: 'LAMP-WARM', code: 'insufficient_data', status: 'partial' },
  { sku: 'BOTTLE-GREEN', code: 'insufficient_data', status: 'partial' },
  { sku: 'CABLE-USB-C', code: 'promotion_ended', status: 'complete' },
] as const;
describe('经营案例回归', () => {
  for (const item of cases) test(`${item.sku}: ${item.code}`, async () => {
    const { report, events } = await runInvestigation(createDemoData(), { sku: item.sku });
    expect(report.hypotheses.map(h => h.code)).toContain(item.code);
    expect(report.status).toBe(item.status);
    expect(report.review.passed).toBe(true);
    expect(events.at(-1)?.type).toBe('run_completed');
    expect(events.map(e => e.sequence)).toEqual(events.map((_, index) => index + 1));
    expect(report.evidence.every(e => e.sku === item.sku)).toBe(true);
    expect(report.actions.every(a => a.executed === false)).toBe(true);
  });
});
test('缺货案例的独立预期计算与规格隔离', async () => {
  const blue = (await runInvestigation(createDemoData(), { sku: 'CUP-BLUE-500' })).report;
  const red = (await runInvestigation(createDemoData(), { sku: 'CUP-RED-500' })).report;
  expect(blue.metrics.baselineUnits).toBe(140);
  expect(blue.metrics.recentUnits).toBe(60);
  expect(blue.metrics.unitsChangeRate).toBeCloseTo(-4 / 7);
  expect(blue.metrics.stockoutHours).toBe(96);
  expect(red.metrics.recentUnits).toBe(140);
  expect(red.metrics.unitsChangeRate).toBe(0);
});
test('广告分母与归因口径', async () => {
  const { report } = await runInvestigation(createDemoData(), { sku: 'SHOES-WHITE-42' });
  expect(report.metrics.baselineAdCvr).toBe(0.05);
  expect(report.metrics.recentAdCvr).toBe(0.02);
  expect(report.metrics.recentAdRoas).toBe(5);
  expect(report.metrics.recentRevenueCents).toBe(700_000);
});
test('库存缺失不能按零库存判断缺货', async () => {
  const { report } = await runInvestigation(createDemoData(), { sku: 'BAG-BLACK' });
  expect(report.metrics.stockoutHours).toBeNull();
  expect(report.hypotheses.some(h => h.code === 'stockout')).toBe(false);
  expect(report.quality.some(q => q.code === 'missing_rows')).toBe(true);
});
test('冲突库存不支持缺货结论', async () => {
  const { report } = await runInvestigation(createDemoData(), { sku: 'BOTTLE-GREEN' });
  expect(report.quality.some(q => q.code === 'conflicting_records')).toBe(true);
  expect(report.metrics.stockoutHours).toBeNull();
  expect(report.hypotheses.some(h => h.code === 'stockout')).toBe(false);
});
test('同日广告归因超过商品总量时降低报告状态', async () => {
  const data = createDemoData();
  const row = data.advertising.find(row => row.sku === 'CUP-RED-500' && row.date === '2026-10-06')!;
  row.orders = 999;
  const { report } = await runInvestigation(data, { sku: 'CUP-RED-500' });
  expect(report.status).toBe('partial');
  expect(report.quality.some(q => q.source === 'advertising' && q.code === 'conflicting_records')).toBe(true);
  expect(report.metrics.recentAdCvr).toBeNull();
});
test('完整行数也不能掩盖过期来源', async () => {
  const data = createDemoData();
  data.sources.advertising.refreshedAt = '2026-10-08';
  const { report } = await runInvestigation(data, { sku: 'SHOES-WHITE-42' });
  expect(report.status).toBe('partial');
  expect(report.quality.some(q => q.code === 'stale_source')).toBe(true);
  expect(report.metrics.recentAdCvr).toBeNull();
  expect(report.hypotheses.some(h => h.code === 'ad_conversion_decline')).toBe(false);
});
test('促销候选违反商品毛利下限时驳回', async () => {
  const { report } = await runInvestigation(createDemoData(), { sku: 'CABLE-USB-C' });
  expect(report.actions.find(a => a.kind === 'promotion')?.detail).toContain('应驳回');
  expect(report.actions.find(a => a.kind === 'promotion')?.detail).toContain('22.50');
  expect(report.actions.find(a => a.kind === 'promotion')?.requiresApproval).toBe(true);
});
test('零基期不会生成下降百分比', async () => {
  const data = createDemoData();
  for (const row of data.sales) if (row.sku === 'CUP-RED-500' && row.date <= '2026-10-04') { row.units = 0; row.revenueCents = 0; }
  const { report } = await runInvestigation(data, { sku: 'CUP-RED-500' });
  expect(report.metrics.unitsChangeRate).toBeNull();
  expect(report.status).toBe('partial');
  expect(safeRatio(5, 0)).toBeNull();
});
test('销售缺一天不能生成完整总额', async () => {
  const data = createDemoData();
  data.sales = data.sales.filter(row => !(row.sku === 'CUP-BLUE-500' && row.date === '2026-10-06'));
  const { report } = await runInvestigation(data, { sku: 'CUP-BLUE-500' });
  expect(report.metrics.recentUnits).toBeNull();
  expect(report.metrics.unitsChangeRate).toBeNull();
  expect(report.hypotheses.some(h => h.code === 'stockout')).toBe(false);
});
test('拒绝未来、不真实日期与非整数窗口', () => {
  expect(() => makeWindows('2026-10-12', '2026-10-12')).toThrow();
  expect(() => makeWindows('2026-10-12', '2026-02-30')).toThrow();
  expect(() => makeWindows('2026-10-12', '2026-10-11', 1.5)).toThrow();
  expect(() => getProduct(createDemoData(), 'CUP')).toThrow('精确 SKU');
});
test('不提供任意业务写入或任意命令工具', async () => {
  await expect(createDataPort(createDemoData()).execute('set_price', {}, new AbortController().signal)).rejects.toThrow('不允许调用');
});
test('篡改指标、证据或执行状态均被 Reviewer 驳回', async () => {
  const original = (await runInvestigation(createDemoData(), { sku: 'CUP-BLUE-500' })).report;
  const modified = structuredClone(original);
  modified.metrics.recentUnits = 9999;
  modified.evidence[0]!.rowIds = ['fabricated'];
  modified.actions[0]!.executed = true as false;
  expect(reviewReport(modified, original).passed).toBe(false);
  expect(reviewReport(modified, original).checks.length).toBeGreaterThanOrEqual(3);
});
test('Reviewer 接受字段换序，但拒绝伪造窗口和商品规则', async () => {
  const original = (await runInvestigation(createDemoData(), { sku: 'CUP-BLUE-500' })).report;
  const modified = structuredClone(original);
  modified.metrics = Object.fromEntries(Object.entries(original.metrics).reverse()) as typeof original.metrics;
  expect(reviewReport(modified, original).passed).toBe(true);
  modified.baseline.start = '2025-01-01';
  modified.product.minGrossMargin = 0;
  expect(reviewReport(modified, original).passed).toBe(false);
});
test('调用预算、取消与无响应端口均有终止记录', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'ecommerce-trace-'));
  try {
    const tracePath = join(temp, 'trace.jsonl');
    await expect(runInvestigation(createDemoData(), { sku: 'CUP-BLUE-500' }, { maxToolCalls: 1, tracePath })).rejects.toThrow('预算');
    const events = readFileSync(tracePath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(events.at(-1).data.code).toBe('budget_tools');
    const controller = new AbortController(); controller.abort();
    await expect(runInvestigation(createDemoData(), { sku: 'CUP-BLUE-500' }, { signal: controller.signal, tracePath })).rejects.toThrow();
    expect(JSON.parse(readFileSync(tracePath, 'utf8').trim().split('\n').at(-1)!).type).toBe('run_cancelled');
    const stuckPort: ToolPort = { execute: () => new Promise(() => {}) };
    await expect(runInvestigation(createDemoData(), { sku: 'CUP-BLUE-500' }, { port: stuckPort, timeoutMs: 20, tracePath })).rejects.toThrow();
    expect(JSON.parse(readFileSync(tracePath, 'utf8').trim().split('\n').at(-1)!).data.code).toBe('budget_timeout');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
test('重复日汇总与未知 SKU 在加载时被拒绝', () => {
  const temp = mkdtempSync(join(tmpdir(), 'ecommerce-data-'));
  try {
    const path = join(temp, 'bad.json');
    const data = createDemoData();
    data.sales.push({ ...data.sales[0]!, id: 'duplicate' });
    writeFileSync(path, JSON.stringify(data));
    expect(() => loadDataset(path)).toThrow('重复');
    data.sales.pop(); data.sales[0]!.sku = 'unknown';
    writeFileSync(path, JSON.stringify(data));
    expect(() => loadDataset(path)).toThrow('未知');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
