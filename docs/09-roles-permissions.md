# Roles and Permissions

| Action | admin | operator | viewer |
|---|---|---|---|
| View dashboard and real-time charts | ✅ | ✅ | ✅ |
| Mark alert as reviewed/resolved | ✅ | ✅ | ❌ |
| Manually stop/restart motor | ✅ | ✅ | ❌ |
| Reactivate a `disabled` motor or `fault_persistent` sensor | ✅ | ✅ | ❌ |
| Configure healthy/warning/critical thresholds per sensor (validated against real standard) | ✅ | ❌ | ❌ |
| Manage users and roles | ✅ | ❌ | ❌ |
| Query the RAG module | ✅ | ✅ | ✅ |

Notes:
- The simulator (ESP32) has no user role: it authenticates at the MQTT broker level with its own ACL
  (see `03-mqtt-contract.md`), never against the REST API.
- The fault injection script (QA) is also not an application user: it runs outside the production system,
  with its own MQTT credentials (see `kiro/steering/02-security.md`).
