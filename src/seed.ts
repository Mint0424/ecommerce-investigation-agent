import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addDays, datasetSchema, type Dataset, type Product } from './domain.ts';

export const packageRoot = join(import.meta.dir, '..');
export function createDemoData(): Dataset {
  const variants: Array<[string, string, string, string]> = [
    ['CUP-BLUE-500', '保温杯', '蓝色 · 500ml', 'stockout'],
    ['CUP-RED-500', '保温杯', '红色 · 500ml', 'healthy'],
    ['TOWEL-SET-3', '毛巾套装', '三件装', 'promotion'],
    ['SHOES-WHITE-42', '休闲鞋', '白色 · 42码', 'advertising'],
    ['BAG-BLACK', '通勤包', '黑色', 'missing'],
    ['LAMP-WARM', '台灯', '暖光', 'stale'],
    ['BOTTLE-GREEN', '运动水壶', '绿色 · 750ml', 'conflict'],
    ['CABLE-USB-C', '充电线', 'USB-C · 1米', 'margin'],
  ];
  const data: Dataset = {
    schemaVersion: 1, simulated: true, asOf: '2026-10-12', currency: 'CNY',
    sources: Object.fromEntries(['sales', 'inventory', 'promotions', 'advertising'].map(table => [table, { sourceId: `mock-${table}-v1`, refreshedAt: '2026-10-12' }])) as Dataset['sources'],
    products: [], sales: [], inventory: [], promotions: [], advertising: [],
  };
  for (const [sku, name, variant, kind] of variants) {
    const priceCents = kind === 'margin' ? 2000 : 10000;
    const product: Product = { sku, name, variant, priceCents, costCents: kind === 'margin' ? 1500 : 5000, fulfillmentCents: kind === 'margin' ? 300 : 500, minGrossMargin: 0.2, maxDailyAdSpendCents: 10000 };
    data.products.push(product);
    for (let i = 0; i < 14; i++) {
      const date = addDays('2026-09-28', i);
      const recent = i >= 7;
      const units = !recent || kind === 'healthy' ? 20 : kind === 'stockout' ? (i < 10 ? 20 : 0) : kind === 'advertising' ? 10 : 12;
      const promoActive = (kind === 'promotion' || kind === 'margin') && !recent;
      const effectivePriceCents = promoActive ? Math.round(priceCents * 0.8) : priceCents;
      data.sales.push({ id: `sales:${sku}:${date}`, sku, date, units, revenueCents: units * effectivePriceCents });
      if (!(kind === 'missing' && i >= 11)) data.inventory.push({ id: `inventory:${sku}:${date}`, sku, date, closingUnits: kind === 'stockout' && i >= 10 ? 0 : 200, availableHours: (kind === 'stockout' && i >= 10) || (kind === 'conflict' && i === 10) ? 0 : 24 });
      data.promotions.push({ id: `promotions:${sku}:${date}`, sku, date, active: promoActive, effectivePriceCents, campaign: promoActive ? '模拟八折促销' : '无促销' });
      const adOrders = kind === 'stockout' && i >= 10 ? 0 : kind === 'advertising' && recent ? 4 : 10;
      if (!(kind === 'stale' && i >= 10)) data.advertising.push({ id: `advertising:${sku}:${date}`, sku, date, clicks: 200, orders: adOrders, spendCents: 8000, attributedRevenueCents: adOrders * effectivePriceCents });
    }
  }
  return datasetSchema.parse(data);
}
if (import.meta.main) {
  mkdirSync(join(packageRoot, 'data'), { recursive: true });
  writeFileSync(join(packageRoot, 'data/demo.json'), JSON.stringify(createDemoData(), null, 2) + '\n');
  console.log('已生成模拟数据：8 个 SKU、14 天；数据时点 2026-10-12。');
}
