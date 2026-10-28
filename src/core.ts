import { safeRatio, type Dataset, type Evidence, type Hypothesis, type Product, type Report, type TableEvidence } from './domain.ts';

const sum = (evidence: Evidence, field: string): number | null => evidence.quality.length ? null : evidence.rows.reduce((total, row) => total + Number((row as unknown as Record<string, unknown>)[field]), 0);
const usable = (...evidence: Evidence[]) => evidence.every(item => item.quality.length === 0);
export function analyze(product: Product, asOf: string, evidenceInput: TableEvidence): Report {
  const input = structuredClone(evidenceInput);
  const { sales, inventory, promotions, advertising } = input;
  // In this fixture, attribution uses paid-order date, exact SKU and the same
  // revenue definition. A real connector must supply its own attribution policy.
  for (const period of ['baseline', 'recent'] as const) {
    const conflicts = advertising[period].rows.filter(ad => {
      const sale = sales[period].rows.find(row => row.date === ad.date);
      return sale && 'units' in sale && 'orders' in ad && (ad.orders > sale.units || ad.attributedRevenueCents > sale.revenueCents);
    });
    if (conflicts.length) advertising[period].quality.push({ code: 'conflicting_records', source: 'advertising', message: `${conflicts.map(row => row.date).join('、')} 广告归因订单或收入超出同日商品总量，违反本演示的同日已支付订单子集口径；需核对归因定义与 SKU 映射。` });
  }
  const evidence = Object.values(input).flatMap(pair => [pair.baseline, pair.recent]);
  const quality = evidence.flatMap(item => item.quality);
  const baselineUnits = sum(sales.baseline, 'units');
  const recentUnits = sum(sales.recent, 'units');
  const unitsChangeRate = baselineUnits === null || recentUnits === null ? null : safeRatio(recentUnits - baselineUnits, baselineUnits);
  const baselineClicks = sum(advertising.baseline, 'clicks');
  const recentClicks = sum(advertising.recent, 'clicks');
  const baselineAdOrders = sum(advertising.baseline, 'orders');
  const recentAdOrders = sum(advertising.recent, 'orders');
  const spend = sum(advertising.recent, 'spendCents');
  const attributedRevenue = sum(advertising.recent, 'attributedRevenueCents');
  const baselineAdCvr = baselineClicks === null || baselineAdOrders === null ? null : safeRatio(baselineAdOrders, baselineClicks);
  const recentAdCvr = recentClicks === null || recentAdOrders === null ? null : safeRatio(recentAdOrders, recentClicks);
  const contradictoryDates = inventory.recent.rows.filter(row => 'availableHours' in row && row.availableHours === 0 && sales.recent.rows.some(sale => sale.date === row.date && 'units' in sale && sale.units > 0)).map(row => row.date);
  if (contradictoryDates.length) quality.push({ code: 'conflicting_records', source: 'inventory', message: `${contradictoryDates.join('、')} 标记全天不可售，但存在销量；需核对库存与订单口径。` });
  const inventoryReliable = usable(inventory.recent) && contradictoryDates.length === 0;
  const stockoutHours = inventoryReliable ? inventory.recent.rows.reduce((total, row) => total + ('availableHours' in row ? 24 - row.availableHours : 0), 0) : null;
  const decline = unitsChangeRate !== null && unitsChangeRate <= -0.2;
  const hypotheses: Hypothesis[] = [];
  const refs = (table: keyof TableEvidence) => [input[table].baseline.id, input[table].recent.id];
  if (decline && inventoryReliable && stockoutHours !== null && stockoutHours > 0) hypotheses.push({
    code: 'stockout', title: '缺货与销量下降同时出现', interpretation: 'supported_hypothesis',
    detail: `最近窗口累计不可售 ${stockoutHours} 小时。缺货可能限制成交，需要进一步核对缺货期间的需求与补货记录；这些数据不单独证明因果。`,
    evidenceIds: [...refs('sales'), inventory.recent.id],
  });
  if (decline && usable(promotions.baseline, promotions.recent)) {
    const before = promotions.baseline.rows.filter(row => 'active' in row && row.active).length;
    const after = promotions.recent.rows.filter(row => 'active' in row && row.active).length;
    if (before > 0 && after === 0) hypotheses.push({
      code: 'promotion_ended', title: '促销结束与销量下降同时出现', interpretation: 'supported_hypothesis',
      detail: `基期有 ${before} 天促销，最近窗口无促销；需要核对流量、转化与同类商品，不能仅凭时间重合认定促销结束造成下降。`,
      evidenceIds: [...refs('sales'), ...refs('promotions')],
    });
  }
  if (decline && baselineAdCvr !== null && recentAdCvr !== null && baselineAdCvr > 0 && recentAdCvr <= baselineAdCvr * 0.7) hypotheses.push({
    code: 'ad_conversion_decline', title: '广告点击转化率下降', interpretation: 'supported_hypothesis',
    detail: `广告订单/点击由 ${(baselineAdCvr * 100).toFixed(2)}% 降至 ${(recentAdCvr * 100).toFixed(2)}%；${stockoutHours !== null && stockoutHours > 0 ? '同时存在不可售时段，不能把转化下降独立归因于素材或人群；先核对库存。' : '需继续检查素材、人群与落地页。'}广告归因收入不等于商品总收入。`,
    evidenceIds: [...refs('sales'), ...refs('advertising')],
  });
  if (quality.length || baselineUnits === 0) hypotheses.push({
    code: 'insufficient_data', title: '部分数据不足或需要复核', interpretation: 'unresolved',
    detail: quality.length ? '存在缺失、延迟或冲突数据；保留已有可靠证据，相关结论需补查。' : '基期销量为零，不能计算下降百分比。',
    evidenceIds: quality.length ? evidence.filter(item => item.quality.length || item.table === 'inventory' && contradictoryDates.length).map(item => item.id) : refs('sales'),
  });
  if (!hypotheses.length) hypotheses.push(decline ? {
    code: 'unexplained_decline', title: '观察到下降，现有数据未定位原因', interpretation: 'unresolved',
    detail: '需要进一步补充流量、退款、竞争环境或商品详情数据。', evidenceIds: refs('sales'),
  } : {
    code: 'no_material_decline', title: '未观察到达到阈值的销量下降', interpretation: 'observation',
    detail: '当前规则以销量下降至少 20% 为调查阈值；阈值是原型规则，不代表业务统计显著性。', evidenceIds: refs('sales'),
  });
  const actions: Report['actions'] = [];
  if (hypotheses.some(item => item.code === 'stockout')) actions.push({ kind: 'replenish', title: '核对在途库存并拟定补货方案', requiresApproval: true, executed: false, detail: '先核对需求、交期和库存口径，再由运营批准数量。本系统没有执行补货。' });
  if (hypotheses.some(item => item.code === 'promotion_ended')) {
    const proposed = Math.round(product.priceCents * 0.8);
    const margin = (proposed - product.costCents - product.fulfillmentCents) / proposed;
    const floor = Math.ceil((product.costCents + product.fulfillmentCents) / (1 - product.minGrossMargin));
    actions.push({ kind: 'promotion', title: '评估是否恢复促销', requiresApproval: true, executed: false, detail: margin < product.minGrossMargin
      ? `恢复模拟八折价会使商品毛利率降至 ${(margin * 100).toFixed(1)}%，低于 ${(product.minGrossMargin * 100).toFixed(0)}% 下限，该候选方案应驳回；按商品成本与履约费计算的最低售价为 ${(floor / 100).toFixed(2)} 元，尚未包含广告费。`
      : `先评估流量与转化证据，再批准价格。商品毛利按（售价−商品成本−履约费）/售价计算，广告成本另计，不能据此承诺净利润。` });
  }
  if (hypotheses.some(item => item.code === 'ad_conversion_decline')) actions.push({ kind: 'advertising', title: '检查广告素材与落地页', requiresApproval: true, executed: false, detail: `先核对人群和转化链路，调整预算需要审批；单日预算上限为 ${(product.maxDailyAdSpendCents / 100).toFixed(2)} 元。本系统没有调整广告。` });
  if (hypotheses.some(item => item.interpretation === 'unresolved')) actions.push({ kind: 'collect_data', title: '补齐数据并重新调查', requiresApproval: false, executed: false, detail: '补齐缺失日期、核对冲突口径或获取更多只读证据；当前缺失数据不视为零。' });
  if (!actions.length) actions.push({ kind: 'monitor', title: '继续观察销量与数据质量', requiresApproval: false, executed: false, detail: '在后续完整窗口重新比较，当前没有经营写入动作。' });
  return {
    schemaVersion: 1, simulated: true, executionMode: 'deterministic_workflow', sku: product.sku, product, asOf,
    status: quality.length || baselineUnits === 0 ? 'partial' : 'complete', baseline: sales.baseline.window, recent: sales.recent.window,
    metrics: { baselineUnits, recentUnits, unitsChangeRate, baselineRevenueCents: sum(sales.baseline, 'revenueCents'), recentRevenueCents: sum(sales.recent, 'revenueCents'), stockoutHours, baselineAdCvr, recentAdCvr, recentAdRoas: spend === null || attributedRevenue === null ? null : safeRatio(attributedRevenue, spend) },
    hypotheses, actions, quality, evidence,
    review: { passed: false, checks: [], scope: '结构化指标、证据与业务动作边界；不验证真实因果，也不评价任意自然语言。' },
    limitations: ['全部为模拟数据，数据时点固定为 ' + asOf, '原因仅为有证据支持的假设，不是已证实因果', '不具备真实 ERP、投放、店铺写入能力', '广告 ROAS 使用归因收入/广告费，不等于利润率'],
  };
}

const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
  : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
export function reviewReport(report: Report, expected: Report): Report['review'] {
  const checks: string[] = [];
  if (report.sku !== expected.sku || report.asOf !== expected.asOf || !report.simulated || report.schemaVersion !== 1 || report.executionMode !== expected.executionMode) checks.push('SKU、时点或模拟数据声明不匹配');
  if (!same(report.product, expected.product) || !same(report.baseline, expected.baseline) || !same(report.recent, expected.recent)) checks.push('商品规格、成本约束或对比窗口不匹配');
  if (!same(report.metrics, expected.metrics)) checks.push('指标与工具计算结果不匹配');
  if (!same(report.evidence, expected.evidence)) checks.push('证据与原始数据不匹配');
  if (!same(report.hypotheses, expected.hypotheses)) checks.push('假设或证据引用不匹配');
  if (report.status !== expected.status || !same(report.quality, expected.quality)) checks.push('缺失、冲突或完成状态不匹配');
  if (!same(report.actions, expected.actions)) checks.push('行动建议或约束不匹配');
  if (report.actions.some(action => action.executed || ['replenish', 'promotion', 'advertising'].includes(action.kind) && !action.requiresApproval)) checks.push('动作越过只读及审批边界');
  return { passed: checks.length === 0, checks: checks.length ? checks : ['指标计算一致', 'SKU 与来源证据一致', '假设引用完整', '数据质量与完成状态一致', '业务动作未执行且标明审批'], scope: expected.review.scope };
}
