import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadDataset } from './data.ts';
import { createDataPort, runInvestigation } from './runtime.ts';
import { dateSchema, type Report } from './domain.ts';
import { reviewReport } from './core.ts';

const data = loadDataset();
const port = createDataPort(data);
const server = new McpServer({ name: 'ecommerce-investigation', version: '0.1.0' });
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const sku = z.string().min(1).max(80).describe('精确 SKU；先用 list_products 确认颜色与规格');
const windowSchema = { sku, endDate: dateSchema.optional().describe('窗口结束日，默认 2026-10-11，非真实当天'), days: z.number().int().min(1).max(31).optional().describe('相邻两个窗口各自的天数，默认 7') };
const reply = (result: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(result) }] });
const errorReply = (error: unknown) => ({ ...reply({ error: error instanceof Error ? error.message : String(error) }), isError: true });

server.registerTool('list_products', { description: '列出模拟店铺商品与精确规格。所有数据均为模拟，固定数据时点 2026-10-12。', inputSchema: {}, annotations }, async () => reply({ simulated: true, asOf: data.asOf, currency: data.currency, products: data.products }));
server.registerTool('get_product_rules', { description: '读取商品成本、履约费、商品毛利下限与单日广告预算上限；不执行改价或预算。', inputSchema: { sku }, annotations }, async (args, extra) => {
  try { return reply(await port.execute('get_product_rules', args, extra.signal)); } catch (error) { return errorReply(error); }
});
for (const [name, description] of [
  ['get_sales', '查询两段等长窗口的商品销量、收入和原始日汇总记录；缺日期不能当成零。'],
  ['get_inventory', '查询两段窗口库存与可售小时数，不修改库存或补货。'],
  ['get_promotions', '查询促销状态、有效售价与活动记录，不修改价格。'],
  ['get_advertising', '查询点击、广告归因订单、费用与归因收入；广告收入不能当作商品总收入。'],
] as const) server.registerTool(name, { description, inputSchema: windowSchema, annotations }, async (args, extra) => {
  try { return reply(await port.execute(name, args, extra.signal)); } catch (error) { return errorReply(error); }
});
server.registerTool('monitor_sales', { description: '只读扫描所有 SKU 的窗口销量变化，返回下降至少 20% 的调查候选和数据不足项；没有定时监控。', inputSchema: { endDate: dateSchema.optional(), days: z.number().int().min(1).max(31).optional() }, annotations }, async (args, extra) => {
  try {
    const candidates = [];
    for (const product of data.products) {
      extra.signal.throwIfAborted();
      const { report } = await runInvestigation(data, { sku: product.sku, ...args }, { signal: extra.signal });
      candidates.push({ sku: report.sku, name: product.name, unitsChangeRate: report.metrics.unitsChangeRate, status: report.status, investigate: report.metrics.unitsChangeRate === null || report.metrics.unitsChangeRate <= -0.2 });
    }
    return reply({ simulated: true, asOf: data.asOf, threshold: -0.2, candidates });
  } catch (error) { return errorReply(error); }
});
server.registerTool('investigate_sku', { description: '运行固定的五工具调查流程，返回结构化报告、证据、质量问题和待审批建议。它是可复现基线，不是 LLM 推理；业务动作均未执行。', inputSchema: windowSchema, annotations }, async (args, extra) => {
  try { return reply((await runInvestigation(data, args, { signal: extra.signal })).report); } catch (error) { return errorReply(error); }
});
server.registerTool('review_report', { description: '独立重算结构化报告的指标与证据并检查审批边界。输入 investigate_sku 返回的完整报告；不能证明因果，不能评价任意自然语言，也不能执行动作。', inputSchema: { reportJson: z.string().min(1).max(150_000) }, annotations }, async ({ reportJson }, extra) => {
  try {
    const raw: unknown = JSON.parse(reportJson);
    const header = z.object({ sku, recent: z.object({ end: dateSchema, days: z.number().int().min(1).max(31) }), metrics: z.record(z.string(), z.unknown()), hypotheses: z.array(z.unknown()), evidence: z.array(z.unknown()), actions: z.array(z.unknown()), quality: z.array(z.unknown()) }).parse(raw);
    const expected = (await runInvestigation(data, { sku: header.sku, endDate: header.recent.end, days: header.recent.days }, { signal: extra.signal })).report;
    return reply(reviewReport(raw as Report, expected));
  } catch (error) { return errorReply(error); }
});
await server.connect(new StdioServerTransport());
