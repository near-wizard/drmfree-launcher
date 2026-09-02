# 0004 — License

**Status:** decided — MIT

The launcher/client is MIT licensed. Reasoning:

- **Fork-and-compete risk is naturally blunted by architecture, not
  license terms.** The valuable, hard-to-replicate part of this
  project — the marketplace, publisher relationships, affiliate deals
  — lives outside this repo entirely (see decision 0001, open-core
  split). Someone forking the launcher gets a local-scan library
  aggregator, not the business.
- **AGPL's actual teeth don't apply to this project's shape.** AGPL's
  distinguishing feature over plain GPL is copyleft triggered by
  running modified code as a network service. This is a desktop
  client — that trigger essentially never fires — so AGPL would add
  contributor friction (many companies blanket-ban AGPL dependencies)
  without deterring the fork-and-compete scenario it's meant to stop.
- **Precedent**: PostHog — the explicit model for this project's
  business philosophy — uses MIT for its core product, with
  enterprise-only features gated behind a separate proprietary license
  on a specific directory, not copyleft on the whole codebase. Same
  open-core shape as this project, and MIT is the permissive half of
  that split.

A `LICENSE` file (MIT, copyright holder: the project) is now at the
repo root.
