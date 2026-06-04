# Expense Digest Agent — Documentation

This folder is the **map of the code before the code exists**. The rule on
this project is simple: we do not write a module until its shape is documented
here. The docs are the contract; the implementation is the transcription.

## Why document-behind-code

Complex architecture earns its keep only if the code that fills it stays
boring. The way we keep code boring while the system stays sophisticated is to
push every interesting decision *up* into these documents — interfaces, value
objects, dispatch tables, wiring — so that each individual source file ends up
doing one obvious thing. If a file needs cleverness, the cleverness belongs in
a doc first, where it can be reviewed as a decision rather than discovered as a
surprise.

Concretely, this gives us:

- **One source of truth per concern.** A change of approach is a doc edit, not
  an archaeology dig across files.
- **Reviewable design.** A teammate reviews the interface and the dispatch
  table, not 600 lines of implementation.
- **Mechanical implementation.** When a doc is good, writing the code is
  typing. There are no decisions left to make at 2am.

## How to read these docs

Read them in this order. Each one assumes the ones above it.

| # | Document | What it pins down |
|---|----------|-------------------|
| 1 | [`expense-digest-architecture.md`](./expense-digest-architecture.md) | The product, the system, the components, the why. Start here. |
| 2 | [`conventions.md`](./conventions.md) | The non-negotiable primitives every file obeys: money, ids, time, errors, validation, naming, async. |
| 3 | [`domain-model.md`](./domain-model.md) | The entities and value objects. The vocabulary the whole codebase speaks. |
| 4 | [`interfaces.md`](./interfaces.md) | Every port, as a full TypeScript interface plus its behavioral contract. |
| 5 | [`patterns/registries-and-dispatch.md`](./patterns/registries-and-dispatch.md) | How we "load things into a dictionary" instead of writing `switch` ladders. |
| 6 | [`patterns/factories-and-composition.md`](./patterns/factories-and-composition.md) | How adapters are built and wired to ports in one composition root. |
| 7 | [`error-handling.md`](./error-handling.md) | The error taxonomy and how it maps to retry vs. dead-letter. |
| 8 | [`testing.md`](./testing.md) | How the domain is tested against fakes, and how the money contract is enforced. |
| 9 | [`demo-harness.md`](./demo-harness.md) | Offline `demo:replay` and live `demo:live` sandbox demo. |
| 10 | [`code-map.md`](./code-map.md) | The file-by-file layout of every package and app. The literal build checklist. |
| 10 | [`execution-plan.md`](./execution-plan.md) | The TDD-driven, phased build playbook: red-green-refactor, test taxonomy, and milestones. |

## The dependency rule (the one rule that matters)

Everything below is downstream of this single diagram. Arrows mean "depends
on". `core` points at nothing.

```
apps/*  ──►  packages/* adapters  ──►  packages/core (ports + domain)
   │                                          ▲
   └──────────────── wire at ─────────────────┘
              the composition root
```

- `core` holds domain types, value objects, **ports** (interfaces), and pure
  domain services. It imports no vendor SDK and no other workspace package.
- Every other `packages/*` is an **adapter**: it implements a port from `core`
  using a real vendor (Plaid, Claude, Resend, Twilio, Prisma, BullMQ).
- Every `apps/*` is a **composition root**: it instantiates adapters via
  factories and injects them into domain services, then runs a process.

If a proposed change makes `core` import an adapter, the change is wrong. That
inversion is the whole architecture; the rest is detail.

## Conventions for the docs themselves

- TypeScript snippets are **specifications**, not final code. They show shape
  and contract; the implementation may add private helpers.
- Every interface lists its **invariants** and **failure modes**, not just its
  signatures. A signature without a contract is half a spec.
- When a doc and the architecture doc disagree, the architecture doc wins for
  *what* and *why*; these docs win for *how*. Fix the disagreement immediately —
  we keep one story.
