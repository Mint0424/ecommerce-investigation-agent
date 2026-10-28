import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { analyze, reviewReport } from './core.ts';
import { getProduct, queryTable } from './data.ts';
import { makeWindows, DomainError, type Dataset, type InvestigationInput, type Report, type TableEvidence, type ToolPort, type TraceEvent } from './domain.ts';

export function createDataPort(data: Dataset): ToolPort {
  return {
    async execute(name, input, signal) {
      signal.throwIfAborted();
      if (name === 'get_product_rules') return getProduct(data, z.string().parse(input.sku));
      const table = ({ get_sales: 'sales', get_inventory: 'inventory', get_promotions: 'promotions', get_advertising: 'advertising' } as const)[name as 'get_sales'];
      if (!table) throw new DomainError('invalid_tool', `不允许调用工具：${name}`);
      const sku = z.string().parse(input.sku);
      const windows = makeWindows(data.asOf, input.endDate as string | undefined, input.days as number | undefined);
      return { baseline: queryTable(data, table, sku, windows.baseline), recent: queryTable(data, table, sku, windows.recent) };
    },
  };
}
export async function runInvestigation(data: Dataset, input: InvestigationInput, options: {
  port?: ToolPort; signal?: AbortSignal; timeoutMs?: number; maxToolCalls?: number; tracePath?: string;
} = {}): Promise<{ report: Report; events: TraceEvent[]; runId: string }> {
  const windows = makeWindows(data.asOf, input.endDate, input.days);
  const port = options.port ?? createDataPort(data);
  const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 10_000), ...(options.signal ? [options.signal] : [])]);
  const runId = randomUUID();
  const events: TraceEvent[] = [];
  const emit = (type: TraceEvent['type'], eventData: TraceEvent['data']) => {
    const event = { runId, sequence: events.length + 1, timestamp: new Date().toISOString(), type, data: eventData };
    if (options.tracePath) {
      mkdirSync(dirname(options.tracePath), { recursive: true });
      appendFileSync(options.tracePath, JSON.stringify(event) + '\n');
    }
    events.push(event);
  };
  const bounded = async <T>(promise: Promise<T>): Promise<T> => {
    signal.throwIfAborted();
    let listener: () => void = () => {};
    const abort = new Promise<never>((_, reject) => {
      listener = () => reject(signal.reason);
      signal.addEventListener('abort', listener, { once: true });
    });
    try { return await Promise.race([promise, abort]); }
    finally { signal.removeEventListener('abort', listener); }
  };
  let calls = 0;
  const call = async (name: string) => {
    signal.throwIfAborted();
    if (calls >= (options.maxToolCalls ?? 5)) throw new DomainError('budget_tools', '达到工具调用预算');
    calls++;
    const args = { sku: input.sku, endDate: windows.recent.end, days: windows.recent.days };
    emit('tool_started', { name, args });
    try {
      const result = await bounded(port.execute(name, args, signal));
      emit('tool_completed', { name, status: 'success', result });
      return result;
    } catch (error) {
      emit('tool_completed', { name, status: 'error', error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
  emit('run_started', { input, simulated: true, mode: 'deterministic_workflow' });
  try {
    const product = await call('get_product_rules') as Report['product'];
    const sales = await call('get_sales') as TableEvidence['sales'];
    const inventory = await call('get_inventory') as TableEvidence['inventory'];
    const promotions = await call('get_promotions') as TableEvidence['promotions'];
    const advertising = await call('get_advertising') as TableEvidence['advertising'];
    const report = analyze(product, data.asOf, { sales, inventory, promotions, advertising });
    const canonical = analyze(getProduct(data, input.sku), data.asOf, Object.fromEntries(['sales', 'inventory', 'promotions', 'advertising'].map(table => [table, {
      baseline: queryTable(data, table as keyof TableEvidence, input.sku, windows.baseline), recent: queryTable(data, table as keyof TableEvidence, input.sku, windows.recent),
    }])) as TableEvidence);
    report.review = reviewReport(report, canonical);
    if (!report.review.passed) throw new DomainError('review_failed', report.review.checks.join('；'));
    signal.throwIfAborted();
    emit('run_completed', { status: report.status, toolCalls: calls, modelUsed: false, review: report.review, sku: report.sku });
    return { report, events, runId };
  } catch (error) {
    const cancelled = options.signal?.aborted;
    const code = cancelled ? 'cancelled' : signal.aborted ? 'budget_timeout' : error instanceof DomainError ? error.code : 'runtime_error';
    emit(cancelled ? 'run_cancelled' : 'run_failed', { code, message: error instanceof Error ? error.message : String(error), toolCalls: calls });
    throw error;
  }
}
