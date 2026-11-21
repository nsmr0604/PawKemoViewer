# Architecture Refactor Guide

This folder contains the tracked roadmap and handoffs for evolving the experimental platform separation in `0.5.0` toward layered architecture.

## Read in order
1. [ROADMAP.md](ROADMAP.md) — milestones, goals and boundaries.
2. [TASKS.md](TASKS.md) — small task IDs, dependencies and completion checklist.
3. [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) — shared instructions for contributors/agents.
4. [STATUS.md](STATUS.md) — current focus, handoff and validation.

See the [baseline inventory](inventory.md) for code references and validation, and [platform contract semantics](platform-contracts.md) for capability and failure rules.

See the [application use-case conventions](use-cases.md) for workflow boundaries and cancellation.

See the [repository and infrastructure design](repositories.md) for storage ownership and transport policy.

## Principles
- Incremental migrations, behavior-preserving first.
- Keep platform-specific implementation behind typed contracts.
- Application use cases coordinate workflows; repositories abstract data access.
- Domain rules remain framework-agnostic.
- Do not create abstractions without concrete use cases.
- Documents in this folder are tracked and are the shared source of truth; local notes are not.
