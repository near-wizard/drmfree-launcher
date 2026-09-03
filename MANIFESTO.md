# The DRM-Free Launcher manifesto

You don't own your games. You own a revocable permission slip, stored
on someone else's server, that they can amend, restrict, or delete.
Steam has never sold you a copy of a game — it's sold you a promise
that its servers will keep letting you play it, for as long as that
remains convenient for Valve. Every DRM-locked storefront makes the
same deal. Most players have never read the terms, because the terms
don't matter until the day they do: a delisting, a region lock, a
"this content is no longer available," a company that shuts down and
takes its authentication servers with it.

DRM-Free Launcher exists because that deal is bad, and because a
better one is sitting right there, mostly ignored: GOG, itch.io, and a
long tail of publishers already sell the same games without the
leash. The problem was never that DRM-free games don't exist. The
problem is that *finding out* takes more effort than clicking "Buy"
on the platform you're already staring at — so almost nobody does it,
and the DRM-free alternative quietly loses to convenience it never
had a fair shot at competing with.

So this app does the one thing that actually moves the needle: it
looks at what you already own, on whatever platform you already use,
and tells you — title by title — when a DRM-free version of the same
game is one click away. No lecture. No all-or-nothing pledge to
abandon Steam. Just the missing information, delivered at the exact
moment it's useful, so that "buy DRM-free instead" becomes a real
choice instead of a hypothetical one.

## What we believe

**A library you can't take with you isn't a library.** It's a lease.
Ownership means the files are yours, the install doesn't phone home
to ask permission, and no company's business decisions can delete
something you already paid for.

**Convenience is the actual enemy, not malice.** Nobody chooses DRM
because they love it. They choose it because it's the default, and
defaults win. Beating a bad default takes making the good option
equally easy — not moralizing at people for not already knowing about
it.

**Local-first, always.** This app reads what's on your disk. It does
not ask Steam, GOG, or Epic what you're "entitled" to, because that
framing is the whole problem. If a file is installed on your machine,
it's yours to launch, full stop — see
[decision 0002](docs/decisions/0002-local-scan-not-ownership-api.md).

**Community trust beats platform trust.** A storefront telling you
its own game is DRM-free is a claim, not a fact — platforms have
every incentive to blur that line. The people who've actually checked
are a better source than the people selling you the thing. That's why
DRM status here carries its provenance, not just a badge (see
[decision 0008](docs/decisions/0008-drm-status-schema.md)), and why
community verification is a core feature, not an afterthought.

**Open where it matters, funded where it must be.** The parts of this
project that determine what "DRM-free" means, how detection works,
and how the UI treats your data are open source and always will be —
copyleft is the point, not a marketing label. The parts that touch
real business relationships (direct publisher deals, affiliate
economics) are allowed to live in a private repo, because a project
that can't sustain itself doesn't get to keep being principled for
long. See [decision 0011](docs/decisions/0011-open-core-boundary-concrete-split.md)
for exactly where that line sits, drawn in public, not left vague.

**No dark patterns, ever.** No nagging you toward a purchase. No fake
urgency. No telemetry you didn't explicitly opt into (see
[decision 0012](docs/decisions/0012-opt-in-analytics.md)). If a
feature only works by making the honest choice harder to see than the
manipulative one, it doesn't ship.

## What we're not

We're not anti-Steam. Half of this app's job is reading Steam's own
library data respectfully and launching through Steam's own protocol
handler when that's what you choose to do. We're not telling you to
delete your Steam library. We're not a boycott.

We're also not neutral. A launcher that quietly treated "locked to
one company's servers forever" and "yours to keep" as equally fine
outcomes would be lying about the thing it's for. This one doesn't.
