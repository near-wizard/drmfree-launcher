# 0003 — Platform and stack

**Status:** decided

Cross-platform from Stage 0, with Linux treated as a first-class
target (not an afterthought), reflecting the project's Stage 3+
Linux/handheld focus. Windows and macOS are supported alongside it.

Stack: Tauri + TypeScript + React. Rust backend for filesystem/registry
access and native launch handoff, web frontend for the UI shell.
Chosen over Electron for a smaller/lighter binary and better
performance; chosen over a fully native toolkit (e.g. Qt) for faster
UI iteration and easier cross-platform maintenance from one codebase.
