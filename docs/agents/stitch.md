# Stitch (Google) — UI design integration

How agents and developers use [Google Stitch](https://stitch.withgoogle.com/) in this repo for UI exploration, variant generation, and design-system alignment.

## Prerequisites

1. **API key** — obtain a Stitch API key and set it in your environment:

   ```powershell
   # User-level (recommended on Windows)
   [System.Environment]::SetEnvironmentVariable("STITCH_API_KEY", "<your-key>", "User")
   ```

   Or add to a local `.env` (not committed):

   ```
   STITCH_API_KEY=
   ```

2. **MCP server** — Cursor must load the project Stitch MCP proxy. Copy the example config if needed:

   ```text
   docs/agents/stitch-mcp.example.json  →  .cursor/mcp.json
   ```

   The proxy script is `.cursor/stitch-mcp-proxy.mjs`. It authenticates via `STITCH_API_KEY` and strips oversized `outputSchema` fields that break Cursor ingestion.

3. **Restart Cursor** after changing MCP config or environment variables.

## Project identifiers

Canonical values (also in `.stitch/metadata.json`):

| Field | Value |
|-------|-------|
| Project ID | `12447626312814512672` |
| Project title | SkiAcademy UI |
| Design system | `assets/11762622741281556178` (SkiAcademy Alpine Air) |
| Design MD | `docs/design/alpine-air.DESIGN.md` |

## Agent workflow

### Explore or generate screens

1. Read `.stitch/metadata.json` for existing screens and component context.
2. Read `docs/design/alpine-air.DESIGN.md` before writing prompts.
3. Use MCP tool `generate_screen_from_text` with:
   - `projectId`: `12447626312814512672`
   - `designSystem`: `assets/11762622741281556178`
   - `deviceType`: `DESKTOP` (or `MOBILE` when appropriate)
4. Generation can take minutes — do not retry on timeout; poll with `get_screen` every ~30s instead.

### Generate variants of an existing screen

1. `list_screens` or `get_project` to find screen IDs.
2. `generate_variants` with `variantOptions.variantCount` 2–3 and `creativeRange: "EXPLORE"`.
3. Record new screen IDs in `.stitch/metadata.json` when keeping a variant.

### Port Stitch output to React

1. `get_screen` → download `htmlCode` for layout reference.
2. Preserve existing information architecture and callbacks (see metadata `preservedIA` when present).
3. Map colors/fonts to `src/index.css` Alpine Air tokens — never invent parallel theme variables.
4. Follow feature-boundary rules in `AGENTS.md` (containers vs presentational components).
5. Run runtime smoke verification after frontend changes.

### Update the design system

1. Edit `docs/design/alpine-air.DESIGN.md`.
2. `upload_design_md` → `create_design_system_from_design_md` (or `update_design_system`).
3. Update `designSystem` in `.stitch/metadata.json` if a new asset ID is created.

## Local artifacts

| Path | Purpose |
|------|---------|
| `.stitch/metadata.json` | Project/screen registry for agents |
| `.stitch/designs/` | Exported thumbnails and references |
| `.stitch/gen_screen.py` | Ad-hoc API test script (requires `STITCH_API_KEY`) |
| `docs/design/alpine-air.DESIGN.md` | Human-readable design system for Stitch prompts |

`.stitch/` is gitignored (local cache). Commit changes to `docs/design/` and `metadata.json` templates only when sharing design decisions.

## Verify MCP connectivity

```powershell
'{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' |
  node --use-system-ca .cursor/stitch-mcp-proxy.mjs
```

Expect a JSON response with Stitch tool names (`generate_screen_from_text`, `get_project`, etc.).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `STITCH_API_KEY is missing` | Set env var; restart Cursor |
| `API keys are not supported` on built-in `user-stitch` | Use project MCP `stitch` server (proxy), not OAuth-only integration |
| Empty / broken tool list in Cursor | Proxy strips `outputSchema`; ensure proxy is latest |
| Generated screen off-brand | Always pass `designSystem` and reference `alpine-air.DESIGN.md` in prompt |

## Related docs

- Design tokens: `src/index.css` (Alpine Air block)
- UX preservation: `docs/adr/0008-ux-preservation-during-canonical-migration.md`
- Agent rule: `.cursor/rules/stitch.mdc`
