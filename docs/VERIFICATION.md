# Verification

The standalone repository was checked on 2026-10-28 using Bun 1.3.8.

- Dependency installation and standalone TypeScript configuration.
- 24 business and real stdio MCP tests, including tool discovery, calls, review rejection and direct/MCP report parity.
- Eight deterministic synthetic cases and generation of JSON, Markdown and HTML reports.
- Cases cover exact SKU separation, missing/stale/conflicting records, zero denominators, invalid dates, margin limits, report tampering, call budgets, cancellation and an unresponsive port.

The expected blue-cup case is 140 baseline units, 60 recent units, -57.1% and 96 unavailable selling hours. These are synthetic ground-truth checks, not real merchant results.

A real model-driven investigation was previously completed in the local CraftAgents integration. This repository does not publish that private workspace or conversation history. The standalone tests do not measure model accuracy, repeated-run stability, production latency or financial impact.

Reviewer recomputation shares the deterministic analysis function. Separate numerical assertions help catch shared implementation errors; recomputation alone is not proof of correctness or causality.

Run: `bun install --frozen-lockfile`, `bun run typecheck`, `bun test`, and `bun run demo`.
