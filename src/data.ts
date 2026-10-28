import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { datasetSchema, addDays, DomainError, type Dataset, type DateWindow, type Evidence, type Table } from './domain.ts';

export const dataPath = join(import.meta.dir, '../data/demo.json');
export function loadDataset(path = dataPath): Dataset {
  const data = datasetSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const known = new Set(data.products.map(product => product.sku));
  if (known.size !== data.products.length) throw new DomainError('duplicate_sku', '商品 SKU 重复');
  for (const table of ['sales', 'inventory', 'promotions', 'advertising'] as const) {
    const ids = new Set<string>();
    const keys = new Set<string>();
    for (const row of data[table]) {
      if (!known.has(row.sku)) throw new DomainError('unknown_sku', `${table} 存在未知 SKU`);
      const key = row.sku + ':' + row.date;
      if (ids.has(row.id) || keys.has(key)) throw new DomainError('duplicate_record', `${table} 存在重复的日汇总记录`);
      if (row.date >= data.asOf) throw new DomainError('future_record', `${table} 存在未完成日期的数据`);
      ids.add(row.id); keys.add(key);
    }
  }
  return data;
}
export function getProduct(data: Dataset, sku: string) {
  const product = data.products.find(product => product.sku === sku);
  if (!product) throw new DomainError('unknown_sku', `找不到精确 SKU：${sku}。请先调用 list_products 查看规格。`);
  return product;
}
export function queryTable(data: Dataset, table: Table, sku: string, window: DateWindow): Evidence {
  getProduct(data, sku);
  const rows = data[table].filter(row => row.sku === sku && row.date >= window.start && row.date <= window.end);
  const dates = new Set(rows.map(row => row.date));
  const missingDates = Array.from({ length: window.days }, (_, index) => addDays(window.start, index)).filter(date => !dates.has(date));
  const quality: Evidence['quality'] = [];
  if (missingDates.length) quality.push({ code: 'missing_rows', source: table, message: `${sku} 的 ${table} 缺少日期：${missingDates.join('、')}，缺失值不能按零处理。` });
  const source = data.sources[table];
  if (source.refreshedAt < addDays(window.end, 1)) quality.push({ code: 'stale_source', source: table, message: `${table} 刷新于 ${source.refreshedAt}，未覆盖完整对比窗口。` });
  const digest = createHash('sha256').update(JSON.stringify({ sku, table, window, source, rows })).digest('hex').slice(0, 16);
  return { id: `${table}:${digest}`, sourceId: source.sourceId, table, simulated: true, sku, refreshedAt: source.refreshedAt, window, rowIds: rows.map(row => row.id), missingDates, quality, rows };
}
