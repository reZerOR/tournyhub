# Issue tracker: local Markdown

Issues and specifications for this repository live as Markdown files under `.scratch/`.

## Conventions

- Store one feature in each `.scratch/<feature-slug>/` directory.
- Store its specification in `.scratch/<feature-slug>/spec.md`.
- Store implementation tickets in `.scratch/<feature-slug>/issues/` as one file per ticket. Name them `<NN>-<slug>.md`, starting at `01`.
- Put a `Status:` line near the top of each specification or ticket. Use the values in `triage-labels.md`.
- Append discussion under a `## Comments` heading.

When a skill says to publish to the issue tracker, create the matching file under `.scratch/`.

## Wayfinding operations

For a wayfinding effort, store the map in `.scratch/<effort>/map.md` and its child tickets in `.scratch/<effort>/issues/`.

- Record a child ticket's kind in a `Type:` line and its state in a `Status:` line.
- Record dependencies in a `Blocked by: NN, NN` line.
- Treat a ticket as unblocked when every listed ticket has status `resolved`.
- Find the frontier by selecting the first numbered open, unblocked, unclaimed ticket.
- Claim a ticket by changing its status to `claimed` before work starts.
- Resolve a ticket by adding its result under `## Answer`, changing its status to `resolved`, and adding a short decision with a link to the map.
