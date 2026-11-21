# Agent Workflow for Architecture Refactor

This is the shared operating procedure for humans and agents. Treat the ROADMAP and TASKS as project context and sequencing authority.

## Before starting (mandatory)
1. Read `AGENTS.md` and all `docs/architecture/` handoffs: README, ROADMAP, TASKS, STATUS, and relevant design/inventory files.
2. Check the target branch and recent commits/PRs for overlapping work; read the latest handoff.
3. Pick one unchecked task ID. Confirm its dependencies are complete; if not, stop or choose a ready task.
4. Keep work isolated on a task branch based on the agreed milestone branch. Do not merge PRs unless authorized.
5. Review the task scope. Split further if context, files or risks are too large.

## Work execution
- Implement only the selected task and prerequisite corrections; do not silently expand scope.
- Preserve existing functionality and security constraints.
- Avoid simultaneous edits to shared contracts or status documents by multiple agents. Coordinate through task IDs and branch/PR.
- One commit should represent one task. Do not combine unrelated tasks.
- Validate with the smallest relevant test first; batch broader validation at milestone checkpoints.
- If validation cannot be run, report that explicitly; never claim it passed.
- For purely design/inventory tasks, deliver the document and cross-check against code.

## Handoff (mandatory before pausing or completing)
Update `docs/architecture/STATUS.md` with:
- Current milestone/task ID and status
- Completed work and commit/PR references
- Exact files touched
- Validation commands/results
- Open issues, risks, and next ready task IDs
Update TASKS.md checkboxes only when evidence supports completion.
Add task-specific design notes when needed; keep documents concise and link them from README.
Commit the handoff update together with the task where possible.

## Suggested agent prompt
```
Read AGENTS.md and docs/architecture/README.md, ROADMAP.md, TASKS.md, STATUS.md and related notes first.
Work only on task <TASK-ID>. Verify its dependencies and avoid overlapping edits.
Implement the task as a small change, run focused validation, update TASKS and STATUS with evidence and next steps, and commit one task only. Do not merge.
```

## Branching and collaboration
- Branch names: `arch/<task-id>-short-name`.
- Multiple agents may work concurrently only on tasks with no shared-file or contract dependency.
- Design tasks may produce a proposal first; implementation should follow the proposal task, not reinterpret it.
- Tracked docs in `docs/architecture/` are the shared handoff; local `notes/` is gitignored and cannot be relied upon by remote agents.
