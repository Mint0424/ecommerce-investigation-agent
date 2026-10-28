import type { Report } from './domain.ts';
const percent = (value: number | null) => value === null ? '无法计算' : `${(value * 100).toFixed(1)}%`;
const money = (value: number | null) => value === null ? '数据不足' : `¥${(value / 100).toFixed(2)}`;
export function renderMarkdown(report: Report): string {
  const m = report.metrics;
  return [
    `# ${report.product.name}（${report.product.variant}）经营调查`,
    '', '**模拟数据 · 固定流程演示 · 未执行经营动作**', '',
    `SKU：${report.sku}；数据时点：${report.asOf}；状态：${report.status === 'partial' ? '部分完成，需补查数据' : '调查完成'}。`,
    `最近窗口：${report.recent.start} 至 ${report.recent.end}；基期：${report.baseline.start} 至 ${report.baseline.end}。`, '',
    '| 指标 | 基期 | 最近窗口 |', '| --- | ---: | ---: |',
    `| 销量（件） | ${m.baselineUnits ?? '数据不足'} | ${m.recentUnits ?? '数据不足'} |`,
    `| 商品收入 | ${money(m.baselineRevenueCents)} | ${money(m.recentRevenueCents)} |`,
    `| 广告点击转化率 | ${percent(m.baselineAdCvr)} | ${percent(m.recentAdCvr)} |`, '',
    `销量变化：**${percent(m.unitsChangeRate)}**。最近窗口不可售时长：${m.stockoutHours ?? '无法计算'} 小时。广告 ROAS：${m.recentAdRoas?.toFixed(2) ?? '无法计算'}。`, '',
    '## 发现与假设', '',
    ...report.hypotheses.flatMap(item => [`### ${item.title}`, '', item.detail, '', `证据：${item.evidenceIds.map(id => `[${id}](#证据索引)`).join('、')}`, '']),
    '## 行动建议草稿', '',
    ...report.actions.map(action => `- **${action.title}**（${action.requiresApproval ? '需人工审批' : '只读建议'}，未执行）：${action.detail}`), '',
    '## 数据质量', '',
    ...(report.quality.length ? report.quality.map(issue => `- ${issue.message}`) : ['在本次窗口与固定校验规则下未发现缺失或冲突。']), '',
    '## 证据索引', '',
    '| 证据 ID | 来源 | 窗口 | 行数 | 缺失日期 | 刷新日 |', '| --- | --- | --- | ---: | --- | --- |',
    ...report.evidence.map(e => `| ${e.id} | ${e.sourceId} | ${e.window.start} ~ ${e.window.end} | ${e.rowIds.length} | ${e.missingDates.join('、') || '无'} | ${e.refreshedAt} |`), '',
    '完整数据行与原始记录 ID 保存在同名 JSON 报告中；证据 ID 随数据与窗口改变。', '',
    '## 只读复核', '', `复核${report.review.passed ? '通过' : '失败'}：${report.review.checks.join('；')}。`, report.review.scope, '',
    '## 使用边界', '', ...report.limitations.map(value => `- ${value}`), '',
  ].join('\n');
}
const escape = (value: unknown) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function renderHtml(reports: Report[]): string {
  const serialized = JSON.stringify(reports).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>电商经营调查 · 演示报告</title><style>
  :root{font:16px/1.65 system-ui,-apple-system,sans-serif;color:#24352c;background:#f6f8f5}*{box-sizing:border-box}body{margin:0}header{background:#173c2d;color:#fff;padding:32px max(24px,calc((100vw - 1100px)/2));}h1{font-size:28px;margin:0}header p{margin:8px 0 0;color:#c3d8ca}main{max-width:1100px;margin:24px auto;padding:0 24px}nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px}button{font:inherit;border:1px solid #cddbd0;border-radius:10px;background:white;padding:8px 14px;cursor:pointer}button[aria-selected=true]{color:white;background:#245940;border-color:#245940}.top{display:flex;justify-content:space-between;gap:16px;align-items:center}h2{margin:0 0 12px;font-size:22px}.badge{padding:6px 12px;border-radius:30px;background:#e7f0e8;font-size:14px}.partial{background:#fff0ce;color:#765819}.muted{color:#68796d;font-size:14px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}.card{background:white;border:1px solid #e0e7de;border-radius:14px;padding:20px}.metric strong{display:block;font-size:30px;line-height:1.4}.columns{display:grid;grid-template-columns:1.25fr 1fr;gap:16px}.item{border-top:1px solid #e8ede6;padding:16px 0}.item:first-of-type{border-top:0}.item h3{font-size:17px;margin:0 0 6px}.item p{margin:0}.refs{font-size:12px;color:#73857a;overflow-wrap:anywhere;margin-top:8px}section{margin-bottom:20px}details{margin-top:14px}summary{cursor:pointer}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:10px;text-align:left;border-bottom:1px solid #e4eae1;vertical-align:top}.table{overflow:auto}pre{font-size:12px;overflow:auto;background:#f3f6f0;padding:14px;max-height:340px;border-radius:8px}.quality{color:#805514}.footer{margin:28px 0;color:#67796a;font-size:13px}@media(max-width:760px){.metrics{grid-template-columns:repeat(2,1fr)}.columns{grid-template-columns:1fr}.top{display:block}header{padding:24px}.metric strong{font-size:25px}}
  </style></head><body><header><h1>电商经营调查</h1><p>销量变化 → 多源证据 → 原因假设 → 建议草稿 → 只读复核</p></header><main><p class="muted">模拟店铺 · 固定数据时点 2026-10-12 · 可切换 8 个案例 · 固定流程生成，未调用模型</p><nav role="tablist" aria-label="选择商品">${reports.map((r, i) => `<button role="tab" id="tab-${i}" aria-selected="${i === 0}" onclick="select(${i})">${escape(r.product.name)} · ${escape(r.product.variant)}</button>`).join('')}</nav><div id="report" role="tabpanel"></div><p class="footer">业务改价、补货与预算调整仅为建议，所有动作均未执行。真实对话请打开 CraftAgents 的「电商经营调查」工作区。</p></main><script>
  const reports=${serialized};
  const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const pct=v=>v===null?'无法计算':(v*100).toFixed(1)+'%';
  function select(i){document.querySelectorAll('nav button').forEach((b,j)=>b.setAttribute('aria-selected',j===i));const r=reports[i],m=r.metrics;document.getElementById('report').innerHTML=
  '<section class="top"><div><h2>'+esc(r.product.name)+' · '+esc(r.product.variant)+'</h2><div class="muted">'+esc(r.sku)+' ｜ '+r.recent.start+' ~ '+r.recent.end+' 对比 '+r.baseline.start+' ~ '+r.baseline.end+'</div></div><span class="badge '+(r.status==='partial'?'partial':'')+'">'+(r.status==='partial'?'部分完成 · 需补查':'调查完成')+'</span></section>'+
  '<div class="metrics">'+[['基期销量',m.baselineUnits??'数据不足','件'],['最近销量',m.recentUnits??'数据不足','件'],['销量变化',pct(m.unitsChangeRate),''],['不可售时长',m.stockoutHours??'无法计算','小时']].map(v=>'<div class="card metric"><span class="muted">'+v[0]+'</span><strong>'+v[1]+'</strong><span class="muted">'+v[2]+'</span></div>').join('')+'</div>'+
  '<section class="columns"><div class="card"><h2>发现与原因假设</h2>'+r.hypotheses.map(h=>'<div class="item"><h3>'+esc(h.title)+'</h3><p>'+esc(h.detail)+'</p><div class="refs">证据：'+h.evidenceIds.map(esc).join(' · ')+'</div></div>').join('')+'</div><div class="card"><h2>行动建议草稿</h2>'+r.actions.map(a=>'<div class="item"><h3>'+esc(a.title)+'</h3><p class="muted">'+(a.requiresApproval?'需人工审批':'只读建议')+' · 未执行</p><p>'+esc(a.detail)+'</p></div>').join('')+'</div></section>'+
  '<section class="card"><h2>数据质量与复核</h2>'+ (r.quality.length?r.quality.map(q=>'<p class="quality">'+esc(q.message)+'</p>').join(''):'<p>在固定规则下未发现缺失或冲突。</p>')+'<p>复核'+(r.review.passed?'通过':'失败')+'：'+r.review.checks.map(esc).join('、')+'</p><p class="muted">'+esc(r.review.scope)+'</p><details><summary>查看证据与原始数据行</summary><div class="table"><table><thead><tr><th>证据 ID</th><th>来源与刷新日</th><th>窗口</th><th>行数</th></tr></thead><tbody>'+r.evidence.map(e=>'<tr><td>'+esc(e.id)+'</td><td>'+esc(e.sourceId)+'<br>'+e.refreshedAt+'</td><td>'+e.window.start+' ~ '+e.window.end+'</td><td>'+e.rowIds.length+'</td></tr>').join('')+'</tbody></table></div><pre>'+esc(JSON.stringify(r.evidence,null,2))+'</pre></details></section>';document.getElementById('report').setAttribute('aria-labelledby','tab-'+i);}
  select(0);
  </script></body></html>`;
}
