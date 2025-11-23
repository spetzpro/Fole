# _AI_MONITORING_AND_ALERTING_SPEC.md  
Version: 1.0.0  
Last-Updated: 2025-11-23  
Status: Authoritative Specification (SSOT)

# AI Monitoring & Alerting Specification  
Defines all metrics, thresholds, alert rules, logging requirements, and AI behavior constraints for monitoring the FOLE platform.

This document is binding for:
- AI agents  
- Backend monitoring subsystems  
- Observability pipelines  
- Server operators  
- Module developers  

It integrates tightly with:
- _AI_STORAGE_ARCHITECTURE.md  
- _AI_AUTOMATION_ENGINE_SPEC.md  
- _AI_DB_AND_DATA_MODELS_SPEC.md  

---

# 1. PURPOSE & SCOPE

This specification ensures:

1. **Deterministic observability** across all modules and services.  
2. **Uniform metrics**, **uniform alerting**, and **uniform dashboards**.  
3. **AI-safe monitoring logic** — AI cannot suppress or silence alerts.  
4. **Predictable SLO/SLA compliance**.  
5. **Early detection** of corruption, storage failures, and runaway resource usage.  

Covers:
- Metrics  
- Thresholds  
- Alerts  
- Dashboards  
- AI monitoring behavior  
- Log governance  
- Module monitoring contracts  

---

# 2. METRIC NAMING CONVENTION

All metric names MUST follow:

```
<domain>.<component>.<metric>
```

Examples:
- storage.disk.free_pct  
- storage.db.size_bytes  
- storage.wal.size_bytes  
- job.queue.length  
- job.runtime.seconds  
- http.request.count  
- http.request.latency_ms  
- map.tilegen.duration_ms  
- ai.agent.error.count  
- ai.agent.stop.count  
- project.users.active  
- system.cpu.percent  
- system.memory.used_mb  

Labels MUST follow:

```
project=<id?>  
module=<moduleName?>  
resource=<map|sketch|project|file>  
severity=<info|warn|critical>  
```

---

# 3. CORE METRICS (MANDATORY)

All FOLE deployments must emit:

### 3.1 System Health
- system.cpu.percent  
- system.memory.used_mb  
- system.memory.free_mb  
- system.load.1m / 5m / 15m  
- system.uptime.seconds  

### 3.2 Disk / Storage
- storage.disk.free_pct (per filesystem)  
- storage.disk.used_bytes  
- storage.disk.inodes_used_pct  
- storage.total.projects  
- storage.total.files  

### 3.3 Database
- db.core.size_bytes  
- db.project.size_bytes  
- db.map.size_bytes  
- db.wal.size_bytes  
- db.checkpoint.duration_ms  
- db.lock.wait_seconds  
- db.errors.count  

### 3.4 Automation Engine
- job.queue.length  
- job.running.count  
- job.error.count  
- job.runtime.seconds  
- automation.approval.pending  
- automation.dangerous.pending  

### 3.5 AI Behavior
- ai.agent.tokens.used  
- ai.agent.request.count  
- ai.agent.stop.count  
- ai.agent.stop.reasons (label: reason)  
- ai.agent.approval_requests  
- ai.agent.invalid_action_attempted  

### 3.6 File & Image Pipeline
- image.convert.duration_ms  
- image.normalize.count  
- pdf.page.extract.count  
- vector.parse.duration_ms  
- pipeline.error.count  

### 3.7 Projects
- project.active.count  
- project.users.active  
- project.maps.count  
- project.sketches.count  

---

# 4. ALERT THRESHOLDS

### 4.1 Disk
| Metric | Warning | Critical |
|--------|---------|----------|
| storage.disk.free_pct | < 20% | < 10% |
| storage.disk.inodes_used_pct | > 80% | > 90% |

### 4.2 Database Size
| Database | Warning | Critical |
|----------|---------|----------|
| project.db | > 1.6 GB | > 2.0 GB |
| map.db | > 3.2 GB | > 4.0 GB |
| WAL size | > 500 MB | > 1 GB |

### 4.3 DB Locking
- db.lock.wait_seconds > 5 → warn  
- db.lock.wait_seconds > 20 → critical  

### 4.4 Automation Engine
- job.queue.length > 50 → warn  
- job.queue.length > 150 → critical  
- automation.dangerous.pending > 0 for > 24h → warning  

### 4.5 AI Safety Alerts
- ai.agent.stop.count spikes x3 baseline → warn  
- ai.agent.invalid_action_attempted > 0 → warn  
- ai.agent.invalid_action_attempted > 3 per hour → critical  

### 4.6 Image Pipeline
- pipeline.error.count > 0 → warn  
- repeated failures for same file → critical  

---

# 5. ALERT ACTIONS (WHAT THE SYSTEM MUST DO)

When a **warning** triggers:
- Log event  
- Notify sysadmin via UI/API  
- Expose warning in dashboards  

When a **critical** alert triggers:
- Immediate notification  
- Mark system as “degraded”  
- AI agents MUST NOT run heavy operations (new tile jobs, massive imports, migrations)  
- Automation engine enters RATE-LIMITED mode  

Critical alerts do NOT stop the system, but force safety mode.

---

# 6. AI BEHAVIOR RULES (EXTREMELY IMPORTANT)

AI MUST:

### 6.1 Read Metrics & Alerts Before Acting
Before running operations involving:
- storage  
- tile generation  
- file import  
- migrations  
- bulk operations  
AI MUST check relevant metrics.

### 6.2 STOP Conditions
AI MUST STOP if:
- storage.disk.free_pct < 15%  
- db.project.size_bytes near critical threshold  
- db.lock.wait_seconds high  
- automation queue overloaded  
- pipeline.error.count > 0 for current target file  
- anomaly detected in inputs  
- alert indicates partial corruption  

STOP = ask the user.

### 6.3 MUST NOT
AI MUST NEVER:
- silence alerts  
- modify alert thresholds  
- dismiss errors from monitoring  
- disable monitoring  
- modify metrics origin code  

AI is read-only in the monitoring domain.

---

# 7. LOGGING REQUIREMENTS

All logs must follow:

```
timestamp
severity
component
message
context (JSON)
```

### Minimum fields:
- eventId  
- projectId?  
- userId?  
- automationId?  
- fileId?  
- mapId?  
- error stack trace (if exists)  
- ai.agentId (if AI-triggered)  

Logs must be:
- immutable  
- append-only  
- exported with projects  
- available for offline audit  

---

# 8. MODULE MONITORING CONTRACT

All modules MUST expose:

```
metrics/
  module.<name>.health
  module.<name>.errors
  module.<name>.warnings
  module.<name>.actions.count
alerts/
  module.<name>.critical
  module.<name>.degraded
```

Modules MAY define extra metrics.

Modules MUST NOT:
- generate metrics outside their namespace  
- override system-wide thresholds  
- disable system alerts  

---

# 9. DASHBOARD REQUIREMENTS

A default server must include dashboards for:

### Storage Dashboard
- free space  
- db sizes  
- WAL sizes  
- tile generation times  

### AI Dashboard
- agent activity curve  
- stop reasons  
- invalid actions  
- per-spec error counters  

### Automation Dashboard
- queue length  
- runtime  
- error trend  
- dangerous pending  

### System Dashboard
- CPU  
- memory  
- uptime  
- http errors  

All dashboards must use the metric names defined above.

---

# 10. EXPORT / IMPORT OF METRICS

When exporting a project:
- include project-scoped metrics  
- anonymize user IDs  
- preserve timeline integrity  

When importing:
- do NOT merge monitoring history  
- treat import as a new isolated timeline  

---

# 11. END OF DOCUMENT

_AI_MONITORING_AND_ALERTING_SPEC.md  
This document is authoritative.  
All AI agents and backend services MUST follow it exactly.
