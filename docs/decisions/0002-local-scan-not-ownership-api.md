# 0002 — Local-scan detection, not ownership APIs

**Status:** decided

Third-party game detection (Steam, GOG, Epic, ...) reads local install
manifests/registry keys only, and launches via native protocol/URI
handlers. We do not call any storefront's web API to read a user's
owned-games list for this feature.

For Steam specifically, this avoids the Steamworks Web API's
competing-service terms. It also mirrors how the Xbox PC app
aggregates other launchers' libraries.
