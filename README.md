# Database Dumper CLI

Interactive, cross-platform database dump CLI (MySQL first) with an Ink-based, OpenCode-inspired TUI. Implements first-run configuration, config reuse, mysqldump download with checksum verification, optional gzip via Node streams, and secure password storage via keytar when available.

## Features
- Ink TUI with persistent header, menu navigation, spinners/progress, and step-based panels.
- First-run config wizard; subsequent runs support use/update/add/delete/export.
- Stores configs in JSON under platform config dir; passwords via keytar fallback to plaintext (warned).
- Downloads pinned MySQL 8.0.x mysqldump binaries at runtime, caches per OS/arch, verifies SHA256.
- Guided dump flow: table excludes, flag picker (curated + custom), gzip toggle, default temp output paths.
- CLI flags for non-interactive assists (`--select`, `--gzip`, `--output`, `--skip-test`, `--flags`, `--binary-path`).

## Getting Started
1. Install Node.js 18 or later and ensure `npm` is available.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the TypeScript output:
   ```bash
   npm run build
   ```
4. Run the compiled CLI:
   ```bash
   node dist/cli.js
   ```

## Notes
- mysqldump checksums in `src/versionMap.ts` are set for MySQL 8.0.36 (linux x64/arm64, macOS arm64/x64, win x64) from Oracle CDN.
- keytar is optional; if unavailable, passwords are stored in plaintext with a visible warning.
- Default dump path: `<os-temp>/database-cli-dumper/<env>/<alias-or-name>/<timestamp>.sql[.gz]`.
- This project is still **beta** and has only been tested on Ubuntu-based systems.

## CLI Flags (quick reference)
- `--config <path>` use custom config file
- `--select <id|alias>` choose configuration directly
- `--gzip` enable gzip for this run
- `--output <path>` override output path
- `--skip-test` skip connection test
- `--update-password` prompt to refresh password
- `--binary-path <path>` use an existing mysqldump binary
- `--flags "<...>"` append raw mysqldump flags
