import { expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'node:path';
import { runInvestigation } from '../src/runtime.ts';
import { createDemoData } from '../src/seed.ts';

test('真实 stdio MCP：发现、查询、调查、复核、错误与写入边界', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(import.meta.dir, '../src/mcp-server.ts')], stderr: 'pipe' });
  const client = new Client({ name: 'ecommerce-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    expect(tools).toHaveLength(9);
    expect(tools.every(tool => tool.annotations?.readOnlyHint)).toBe(true);
    expect(tools.some(tool => ['set_price', 'execute_action', 'run_sql'].includes(tool.name))).toBe(false);
    const result = await client.callTool({ name: 'investigate_sku', arguments: { sku: 'CUP-BLUE-500' } });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text?: string }>;
    const report = JSON.parse(content[0]!.text!);
    expect(report.metrics.recentUnits).toBe(60);
    const review = await client.callTool({ name: 'review_report', arguments: { reportJson: JSON.stringify(report) } });
    expect(JSON.parse((review.content as Array<{ text: string }>)[0]!.text).passed).toBe(true);
    report.metrics.recentUnits = 999;
    const badReview = await client.callTool({ name: 'review_report', arguments: { reportJson: JSON.stringify(report) } });
    expect(JSON.parse((badReview.content as Array<{ text: string }>)[0]!.text).passed).toBe(false);
    expect((await client.callTool({ name: 'get_sales', arguments: { sku: 'CUP' } })).isError).toBe(true);
    expect((await client.callTool({ name: 'get_sales', arguments: { sku: 'CUP-BLUE-500', days: -1 } })).isError).toBe(true);
    const direct = (await runInvestigation(createDemoData(), { sku: 'CUP-BLUE-500' })).report;
    const replay = await runInvestigation(createDemoData(), { sku: 'CUP-BLUE-500' }, { port: {
      async execute(name, args, signal) {
        const reply = await client.callTool({ name, arguments: args }, undefined, { signal });
        if (reply.isError) throw new Error('MCP tool failed');
        return JSON.parse((reply.content as Array<{ text: string }>)[0]!.text);
      },
    } });
    expect(replay.report).toEqual(direct);
  } finally { await client.close(); await transport.close(); }
}, 20_000);
