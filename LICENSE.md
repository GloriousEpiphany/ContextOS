# Licensing FAQ

> Companion to `LICENSE` (GNU AGPL-3.0-only). Last updated 2026-05-01.

## TL;DR

ContextOS is **AGPL-3.0-only**. You can use it for personal research, install it from
the Chrome Web Store, fork it, modify it, and self-host it. If you ship a modified
version of the ContextOS extension or its Native Host as part of a network-accessible
service, you must release your source under AGPL-3.0.

## Connecting to ContextOS via MCP

**Connecting an external program (Claude Desktop, Cursor, custom AI client, etc.) to
the ContextOS MCP server is NOT considered creating a derivative work under
AGPL-3.0.**

The MCP (Model Context Protocol) interface is a network protocol — analogous to HTTP,
gRPC, or any other RPC contract. AGPL-3.0's copyleft applies to derivative works of
the ContextOS source code itself. Programs that communicate with ContextOS over MCP
remain under their original license.

This means:
- Closed-source AI clients (Claude Desktop, Cursor, ChatGPT Desktop) can call the
  ContextOS MCP server without inheriting AGPL-3.0.
- Commercial / proprietary code in your employer's repository can query ContextOS
  via MCP without becoming AGPL.
- The user's own knowledge graph data (papers, notes, captured chats) is theirs;
  AGPL applies to the ContextOS code, not to user content.

This position is consistent with the GNU GPL FAQ on aggregation and with how
projects like PostgreSQL, Redis, and Git treat client/protocol interactions. We are
**not** lawyers; if you are using ContextOS in a regulated commercial environment,
consult yours. We will revise this document if a competent license review demands a
different reading.

## What triggers AGPL-3.0 copyleft

You **must** release your source under AGPL-3.0 if you:
- Distribute a modified ContextOS browser extension to users (e.g., a fork on the
  Chrome Web Store under a different name).
- Run a modified ContextOS Native Host as part of a hosted service that other users
  interact with over a network.
- Bundle ContextOS source code into a larger product that ships to others.

You **do not** trigger copyleft if you:
- Connect to the ContextOS MCP server from a separate program (see above).
- Use ContextOS personally on your own machine, with or without modifications.
- Read or fork the source code privately without redistributing.

## SIL OFL Fonts

ContextOS bundles four open-source fonts under SIL Open Font License 1.1:
- Fraunces (UndercaseType)
- Instrument Sans (Instrument)
- Geist + Geist Mono (Vercel)
- JetBrains Mono (JetBrains)

These fonts are compatible with AGPL-3.0 and any commercial use. See `DESIGN.md`
for usage and loading guidance.

## Questions

Open an issue on https://github.com/GloriousEpiphany/ContextOS — happy to clarify.
