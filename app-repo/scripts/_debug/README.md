# Debug Scripts & Artifacts

This directory contains non-production debug scripts and captured failure reproductions.
These files are **not** part of normal CI or the production build.

They are preserved here for historical reference or manual troubleshooting.

## Contents

- `debug_*.ts`: Standalone debug harnesses.
- `test_*_failure.ts`: Repro cases for specific bugs.
- `*.txt`: Captured logs or error outputs.

### Preview Seeding
- `deploy_v2_graph.ts`: Manual deployment script to seed the active server (port 3000) with a valid V2 UI graph (Container, Text, Button) for testing the V2 Renderer Preview.
