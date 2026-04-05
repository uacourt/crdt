# CRDT: Consilium Editor

A high-fidelity, peer-to-peer collaborative editor designed for the
National Court Registry System of Ukraine. This project demonstrates
a implementation of Yjs CRDT in a Vanilla JavaScript
environment, optimized for transactional legal document preparation.

## Key Features

- Paper Sheet UX: A professional A4-style document interface tailored for legal protocols.
- Transactional Locking: Real-time paragraph-level focus management using Yjs Awareness.
- Cursors of other "Judges" are visible in real-time until you enter focus mode.
- High-Fidelity Sync: Surgical DOM updates and non-destructive string diffing to prevent data loss and flickering.
- Group Consensus: A collaborative "Commit" workflow. The reconciliation logic ensures no changes are finalized until all active participants signal their approval.
- Reconcile & Review: A built-in diff engine that compares the current state against the initial baseline, providing a clear review before persisting to the registry.

## Architecture

- Vanilla JS: Zero build tools, zero frameworks. Pure performance.
- CRDT Engine: [Yjs](https://yjs.dev/) for conflict-free replicated data types.
- WebSocket Relay: Uses `y-websocket` (standardized on v1.5.0) for peer discovery and synchronization.
- Styling: Tailwind CSS for modern, premium aesthetics.

## Quick Start

### 1. Start the Relay Server

Ensure you have Node.js installed in your WSL/Linux environment:

```bash
# node server.js
```

### 2. Launch the Editor

Open multiple `https://localhost:1234/crdt.html` page tabs in your favorite browser.

## Credits

* Максим Сохацький, Інформаційні Судові Системи
* 
