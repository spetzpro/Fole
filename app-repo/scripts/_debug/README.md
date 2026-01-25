# Debug Scripts & Artifacts

This directory contains non-production debug scripts and captured failure reproductions.
These files are **not** part of normal CI or the production build.

They are preserved here for historical reference or manual troubleshooting.

## Contents

- `debug_*.ts`: Standalone debug harnesses.
- `test_*_failure.ts`: Repro cases for specific bugs.
- `*.txt`: Captured logs or error outputs.

### Preview Seeding
- `deploy_v2_graph.ts`: **DEV ONLY**. Manual deployment script to seed the active server (port 3000) with a valid V2 UI graph.
    - Usage: `npx ts-node app-repo/scripts/_debug/deploy_v2_graph.ts`
    - **Note:** This logic is strictly for seeding a dev environment and is NOT reused by the production runtime or deployment pipeline.
