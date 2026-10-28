# Ecommerce Investigation Agent

A read-only ecommerce investigation prototype: query sales, inventory, promotions and advertising for an exact SKU, inspect source evidence, and produce constrained action drafts.

The business module can run independently as a CLI or stdio MCP server. A bundled investigation Skill supports integration with CraftAgents; the desktop application and model runtime are upstream dependencies and are not included here. Developed with AI assistance as a learning project.

## Quick start

Tested with Bun 1.3.8. After cloning, enter the repository and run:

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run demo
bun run preview
```

Open `http://127.0.0.1:4317/` to view eight cases. `artifacts/report.html` is also a self-contained generated report. The CLI and HTML demo do not call a model.

```sh
bun run investigate CUP-BLUE-500
bun run mcp
```

The MCP process speaks protocol on stdio; use a compatible client for model-driven investigation. See [MCP setup](docs/MCP_SETUP.md).

## Demonstrated case

All data is synthetic, fixed at **2026-10-12**. The recent window is October 5–11, compared with September 28–October 4.

| Metric | Baseline | Recent |
| --- | ---: | ---: |
| Blue 500ml cup units | 140 | 60 |
| Sales change | — | -57.1% |
| Unavailable selling hours | 0 | 96 |
| Advertising orders | 70 | 30 |
| Advertising click conversion | 5.00% | 2.14% |

Stockout and sales decline overlap. Lower advertising conversion may share that explanation; these observations do not prove causality or establish that an ad creative caused the decline. Sample metrics are not business improvements achieved by this software.

## Nine read-only tools

| Tool | Purpose |
| --- | --- |
| `list_products` | Confirm exact SKU and variant |
| `get_product_rules` | Product costs, margin floor and daily ad limit |
| `get_sales` | Units, revenue and original daily rows |
| `get_inventory` | Closing inventory and available selling hours |
| `get_promotions` | Promotion state and effective price |
| `get_advertising` | Clicks, attributed orders, spend and revenue |
| `monitor_sales` | Manually scan window changes; no scheduler |
| `investigate_sku` | Run a fixed five-query investigation baseline |
| `review_report` | Recompute and compare a structured report |

## Reliability and verification

- Zod input contracts, exact SKU matching and equal complete windows.
- Evidence contains source, refresh date, window, row IDs and original rows.
- Missing, stale or conflicting data is exposed; unavailable metrics are null.
- Fixed-workflow call budget, timeout, cancellation and ordered JSONL events.
- Margin-constrained promotion suggestions and unexecuted action drafts.
- Eight synthetic SKU cases and 24 business/real-stdio-MCP tests. This is not an LLM accuracy benchmark.

See [architecture and limitations](docs/ARCHITECTURE.md), [verification](docs/VERIFICATION.md), and [sample report](examples/CUP-BLUE-500.md).

## Repository layout

```text
src/             Domain, data queries, analysis, runtime, MCP and reports
tests/           Business cases, failure paths and real MCP integration
data/            Reproducible synthetic dataset
craft/           Source guide and investigation Skill
integrations/    Portable CraftAgents source and permission templates
examples/        Generated synthetic report examples
docs/            Architecture, setup and verification
```

## Upstream and scope

This project originated as a business extension in a CraftAgents 0.11.4 checkout. It reuses the client's model execution, Skill loading, source discovery and permission checks when integrated. It does not claim to implement the upstream Agent platform.

Upstream: [craft-ai-agents/craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss). The upstream license and notice are retained in [LICENSE](LICENSE) and [NOTICE](NOTICE).

No real shop or ad account is connected. No production outcome, autonomous business write, scheduled monitoring, RAG or independent LLM reviewer is claimed. Local accounts, credentials, conversations, course materials and monorepo build artifacts are not part of this repository.
