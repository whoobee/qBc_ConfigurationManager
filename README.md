# qBc_ConfigurationManager

Web-based configuration, monitoring, and development interface for the qB Companion robot. Connects to the robot from any browser on the same network — no need to use the Pi's display directly.

## Quick Start

```bash
# 1. Install Python dependencies
cd qBc_ConfigurationManager
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Build the frontend (one-time, or after changes)
cd frontend
npm install
npm run build
cd ..

# 3. Run the server
python3 main.py
```

Open **http://\<robot-ip\>:8080** in your browser.

> **Dev mode (hot-reload):** Run `npm run dev` in the `frontend/` folder and open `http://localhost:5173`. The Vite dev server proxies API and WebSocket calls to the backend on port 8080.

---

## Architecture

```
Browser (any device on LAN)
   │
   ├── HTTP GET /dashboard, /bt-creator, ...  →  Vue SPA (index.html)
   ├── HTTP GET/PUT /api/trees/*, /api/system/* →  REST API (FastAPI)
   └── WebSocket /ws  ←→  MQTT Bridge  ←→  Mosquitto Broker (localhost:1883)
                                               ↕
                                    All robot services (qBc_*)
```

- **Backend** — Python FastAPI server with MQTT↔WebSocket bridge
- **Frontend** — Vue 3 SPA with LiteGraph.js for behavior tree editing
- **Communication** — Browser cannot speak MQTT, so the backend bridges messages bidirectionally over a single WebSocket connection

---

## User Guide

### Status Dashboard (`/dashboard`)

The default landing page shows the real-time health of all robot services.

| Section | What it shows |
|---|---|
| **Hero stats** | Total services online, MQTT broker status, message throughput, session uptime |
| **Service cards** | One card per service (Audio, Vision, Animation, Servos, AI Voice, AI Explore, etc.) with a live heartbeat indicator, time-since-last-seen, and the service's published state fields |

- A **green pulsing dot** means the service is alive (heartbeat received within 5 seconds)
- A **red dot** means the service is down or unreachable
- State fields update in real-time (e.g., `status: online`, `playing: true`)

### BT Creator (`/bt-creator`)

Visual editor for building behavior trees that control the robot's personality and reactions.

#### Layout

```
┌──────────────────────────────────────────────────────────┐
│  [Tree Selector ▼]  [LOAD] [SAVE] [VALIDATE] [DEPLOY]   │  ← Toolbar
├──────────┬───────────────────────────────┬───────────────┤
│          │                               │               │
│  NODE    │      LiteGraph Canvas         │  PROPERTIES   │
│  PALETTE │      (drag, connect,          │  (edit params │
│          │       zoom, pan)              │   of selected │
│          │                               │   node)       │
├──────────┴───────────────────────────────┴───────────────┤
```

#### Workflow

1. **Load a tree** — Select a YAML file from the dropdown and click **LOAD**
2. **Add nodes** — Click any node in the **Node Palette** (left) to add it to the canvas
3. **Connect nodes** — Drag from a node's output slot to another node's input slot to create parent→child relationships
4. **Configure nodes** — Click a node on the canvas to select it, then edit its parameters in the **Properties** panel (right)
5. **Validate** — Click **VALIDATE** to check for errors (missing required params, empty composites, etc.)
6. **Save** — Click **SAVE** to write the tree back to the YAML file on disk
7. **Deploy** — Click **DEPLOY** to hot-reload the tree on the running behavior service (sends `{"command": "reload"}` via MQTT)

#### Node Palette categories

| Category | Color | Purpose | Nodes |
|---|---|---|---|
| **Composites** | Blue | Control flow (run children in order) | Sequence, Selector, Parallel, RandomSelector |
| **Decorators** | Purple | Wrap a single child (modify its result) | Inverter, Timeout, RunningIsSuccess, FailureIsSuccess, SuccessIsFailure, CooldownGuard |
| **Conditions** | Yellow | Check blackboard values / events | BlackboardCondition, EventCheck, HeartbeatCheck |
| **Actions** | Green | Do something (publish MQTT commands) | PlayAnimation, PlayAudio, MoveJoint, SendCommand, WaitForEvent, TimerBehavior |

#### Key concepts

- **Sequence** — Runs children left-to-right. If any child fails, the sequence fails. Think: "do A, then B, then C."
- **Selector** — Tries children left-to-right. Returns SUCCESS on the first child that succeeds. Think: "try A, else try B, else try C."
- **SendCommand** — The escape hatch: publish any JSON payload to any MQTT topic. Use for wheel commands, vision triggers, etc.
- **memory: true** — When a Sequence/Selector resumes after returning RUNNING, it remembers which child was active and continues from there instead of restarting.

### BT Visualizer (`/bt-visualizer`)

Live view of the currently running behavior tree.

| Section | What it shows |
|---|---|
| **Canvas** | Tree structure with nodes colored by status: green=SUCCESS, cyan=RUNNING, red=FAILURE, grey=INVALID |
| **Blackboard panel** | Real-time key-value pairs from the behavior tree's blackboard (sensor data, event flags, etc.) |
| **Toolbar** | Current tree name, tick counter, status legend |

The visualizer subscribes to `robot/behavior/tree_state` over MQTT and updates the graph in real-time:
- **Full snapshots** rebuild the entire graph (sent on tree load/reload)
- **Diff updates** change only the status of modified nodes (sent every tick)

Use **scroll** to zoom and **drag** the background to pan.

---

## Adding New Applets

The frontend uses an auto-discovery applet system. To add a new tool page:

1. Create a folder: `frontend/src/applets/my-tool/`
2. Create the manifest `index.js`:
```js
export default {
  id: 'my-tool',
  name: 'My Tool',
  icon: 'grid',           // icon name (grid, edit, activity)
  route: '/my-tool',
  component: () => import('./MyToolPage.vue'),
  order: 20,              // sidebar sort order
  category: 'tools',      // sidebar group
  description: 'Does something cool',
}
```
3. Create `MyToolPage.vue` with your tool's UI
4. Run `npm run build` — it auto-registers in the sidebar and router

Future applet ideas: Animation Editor, Joint Controller, MQTT Monitor, AI Prompt Debugger.

---

## REST API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/system/status` | Service heartbeats + MQTT status |
| `GET` | `/api/system/topics` | Full MQTT topic registry |
| `GET` | `/api/trees/` | List all behavior tree YAML files |
| `GET` | `/api/trees/schema` | Node type schema (categories, params) |
| `GET` | `/api/trees/{filename}` | Load a tree descriptor |
| `PUT` | `/api/trees/{filename}` | Save a tree descriptor |
| `POST` | `/api/trees/validate` | Validate a tree (returns errors) |
| `POST` | `/api/trees/deploy` | Send reload command to behavior service |

Interactive API docs at **http://\<robot-ip\>:8080/docs** (Swagger UI).

## WebSocket Protocol (`/ws`)

```json
// Subscribe to MQTT topics (supports + and # wildcards)
{"type": "subscribe", "topics": ["robot/+/state", "robot/system/heartbeat/#"]}

// Publish to MQTT
{"type": "publish", "topic": "robot/animation/play", "payload": {"expression": "happy"}}

// Incoming MQTT messages (server → client)
{"type": "message", "topic": "robot/audio/state", "payload": {...}, "timestamp": 1712534400.0}
```

---

## CLI Options

```
python3 main.py [OPTIONS]

  --host          HTTP bind address     (default: 0.0.0.0)
  --http-port     HTTP port             (default: 8080)
  --mqtt-broker   MQTT broker address   (default: localhost)
  --mqtt-port     MQTT broker port      (default: 1883)
  --log-level     DEBUG|INFO|WARNING    (default: INFO)
```

## Project Structure

```
qBc_ConfigurationManager/
├── main.py                     Entry point (standard qBc pattern)
├── requirements.txt            Python deps (fastapi, uvicorn, paho-mqtt)
├── server/
│   ├── app.py                  FastAPI factory (routes, WS, SPA serving)
│   ├── config.py               Paths and defaults
│   ├── mqtt_bridge.py          MQTT ↔ WebSocket bridge
│   ├── ws_manager.py           WebSocket connection manager
│   ├── routers/
│   │   ├── system.py           /api/system/* endpoints
│   │   └── trees.py            /api/trees/* endpoints
│   └── services/
│       ├── tree_service.py     BT CRUD + schema import
│       └── heartbeat_tracker.py  Service liveness tracking
└── frontend/
    ├── package.json            Vue 3 + LiteGraph.js
    ├── vite.config.js          Dev proxy to backend
    ├── index.html              SPA entry
    └── src/
        ├── main.js             Vue app bootstrap
        ├── App.vue             Shell (sidebar + topbar + router-view)
        ├── router.js           Auto-generated from applet registry
        ├── stores/             Pinia state (mqtt.js, system.js)
        ├── composables/        useLiteGraph.js (canvas lifecycle)
        ├── components/         Shared UI (AppSidebar, AppTopbar)
        └── applets/            Auto-discovered applet pages
            ├── registry.js     import.meta.glob discovery
            ├── dashboard/      Status Dashboard
            ├── bt-creator/     BT editor + LiteGraph node defs
            └── bt-visualizer/  Live BT state viewer
```
