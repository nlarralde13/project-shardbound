# UI Layout API

Persist and retrieve the authenticated user's UI layout.

### Sample Layout JSON
```json
{
  "version": 1,
  "mode": "free",
  "locked": false,
  "snap": { "mode": "pixel", "px": 8, "colW": 160 },
  "panels": {
    "chat": { "xPx": 0, "yPx": 0, "xPct": 0.0, "yPct": 0.0, "col": 0, "z": 0 }
  },
  "updatedAt": 1697040000000
}
```

### Example Requests
Fetch existing layout:
```bash
curl -X GET /api/ui/layout -b 'session=...'
```

Save new layout:
```bash
curl -X PUT /api/ui/layout \
  -H 'Content-Type: application/json' \
  -d '{"version":1,"mode":"free","locked":false,"snap":{"mode":"pixel","px":8,"colW":160},"panels":{"chat":{"xPx":0,"yPx":0,"xPct":0.0,"yPct":0.0,"col":0,"z":0}},"updatedAt":1697040000000}' \
  -b 'session=...'
```
