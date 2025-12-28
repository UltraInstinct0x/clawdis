# Deployment Patterns

This guide describes the three main deployment patterns for Clawdis, helping you choose the right architecture for your needs.

## Overview

Clawdis is designed to be flexible. You can run everything locally, split the Gateway to the cloud, or go fully headless. Here's how to choose:

| Pattern | Best For | Complexity | Cost |
|---------|----------|------------|------|
| **Pattern A**: All-Local | Development, testing, full control | Low | Free |
| **Pattern B**: Cloud Gateway + Local CLI | 24/7 availability, low local resource usage | Medium | $0-12/mo |
| **Pattern C**: Headless Cloud-Only | Production, mobile-only access | Medium | $0-12/mo |

## Pattern A: All-Local (Mac or Linux)

Everything runs on your local machine: Gateway, Agent, CLI, and the macOS app (if on macOS).

### Architecture

```
┌─────────────────────────────────────────────┐
│         Your Local Machine (Mac/Linux)      │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │         Gateway (local)              │  │
│  │    ws://127.0.0.1:18789              │  │
│  └────────────┬─────────────────────────┘  │
│               │                             │
│               ├─ Pi Agent (RPC)             │
│               ├─ CLI (clawdis send/agent)   │
│               ├─ WebChat (browser)          │
│               └─ macOS App (menubar)        │
│                                             │
│  Providers:                                 │
│   • WhatsApp (Baileys)                      │
│   • Telegram (grammY)                       │
│   • Discord (discord.js)                    │
│                                             │
└─────────────────────────────────────────────┘
         ↓
    Your Phone / Other Devices
    (WhatsApp, Telegram, Discord)
```

### When to Use

- **Development and testing**: Quick iteration, full debugging
- **Privacy-focused**: All data stays on your machine
- **Full native app experience**: Voice wake, menubar, Canvas
- **Low/no budget**: No cloud costs

### Pros

- ✅ Complete local control and privacy
- ✅ No cloud costs
- ✅ Best native app experience (macOS/iOS)
- ✅ Lowest latency for local tools
- ✅ Easy debugging

### Cons

- ❌ Requires your machine to stay on 24/7
- ❌ No assistant access when machine is off
- ❌ Higher local resource usage (CPU, RAM)
- ❌ Manual updates required

### Setup

1. **Install Clawdis**:

```bash
git clone https://github.com/steipete/clawdis.git
cd clawdis
pnpm install && pnpm build
pnpm link --global
```

2. **Configure** (`~/.clawdis/clawdis.json`):

```json5
{
  "gateway": {
    "mode": "local",
    "bind": "loopback"
  },
  "agent": {
    "workspace": "~/clawd",
    "model": "anthropic/claude-opus-4-5"
  },
  "routing": {
    "allowFrom": ["+1234567890"]
  }
}
```

3. **Set API Key**:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

4. **Start Gateway**:

```bash
clawdis gateway --port 18789
```

Or use the macOS app, which starts the Gateway automatically.

5. **Link Providers**:

```bash
clawdis login  # WhatsApp
export TELEGRAM_BOT_TOKEN="..."  # Telegram
export DISCORD_BOT_TOKEN="..."   # Discord
```

### Keeping it Running

**macOS (Recommended)**:
Use Clawdis.app, which handles Gateway lifecycle via launchd.

**Linux (systemd)**:

Create `/etc/systemd/system/clawdis-gateway.service`:

```ini
[Unit]
Description=Clawdis Gateway
After=network.target

[Service]
Type=simple
User=yourusername
ExecStart=/usr/local/bin/clawdis gateway --port 18789
Restart=on-failure
Environment="ANTHROPIC_API_KEY=sk-ant-..."

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now clawdis-gateway.service
```

## Pattern B: Cloud Gateway + Local CLI

Gateway runs in the cloud (always-on), but you use local tools (CLI, macOS app) to interact with it.

### Architecture

```
┌──────────────────────────────────┐
│     Cloud VM (Oracle/AWS/GCP)    │
│                                  │
│  ┌────────────────────────────┐  │
│  │      Gateway (cloud)       │  │
│  │   ws://127.0.0.1:18789     │  │
│  └──────────┬─────────────────┘  │
│             │                    │
│             ├─ Pi Agent (RPC)    │
│             └─ Providers         │
│                                  │
└─────────────┬────────────────────┘
              │
         Tailscale / SSH Tunnel
              │
              ▼
┌─────────────────────────────────────┐
│       Your Local Machine            │
│                                     │
│  • CLI (clawdis send/agent)         │
│  • macOS App (remote mode)          │
│  • WebChat (via tunnel)             │
│                                     │
└─────────────────────────────────────┘
```

### When to Use

- **Always-on assistant**: Gateway available 24/7 without local machine
- **Low local resource usage**: Free up CPU/RAM on laptop
- **Multiple devices**: Access from laptop, desktop, phone
- **Budget-conscious**: Free tier cloud options available

### Pros

- ✅ 24/7 availability without local machine
- ✅ Low local resource usage
- ✅ Can still use local CLI and macOS app
- ✅ Free tier options (Oracle Cloud)
- ✅ Accessible from multiple devices via Tailscale

### Cons

- ❌ Setup complexity (cloud instance + Tailscale)
- ❌ Requires SSH tunnel or Tailscale for access
- ❌ No Voice Wake or local Canvas (unless forwarded)
- ❌ Slight latency increase for agent calls

### Setup

See [CLOUD_DEPLOYMENT.md](./CLOUD_DEPLOYMENT.md) for detailed cloud setup.

**Quick version**:

1. **Provision Cloud VM** (Oracle Cloud A1.Flex recommended)
2. **Install Clawdis** on cloud instance
3. **Configure for cloud**:

```json5
{
  "gateway": {
    "mode": "local",
    "bind": "loopback"
  },
  "agent": {
    "workspace": "~/.clawdis/workspace",
    "model": "anthropic/claude-opus-4-5"
  }
}
```

4. **Link providers** (via temporary VNC or copy credentials)
5. **Install Tailscale** on cloud instance
6. **Access via Tailscale** from local machine:

```bash
# Via Tailscale magic DNS
export CLAWDIS_GATEWAY_URL="ws://100.x.x.x:18789"
clawdis health
```

Or use **SSH tunnel**:

```bash
ssh -L 18789:127.0.0.1:18789 user@cloud-instance
```

### macOS App Remote Mode

The macOS app has a "Remote over SSH" mode:

1. Configure cloud host in app settings
2. App manages SSH tunnel automatically
3. Voice Wake can forward to cloud gateway
4. WebChat accessible through tunnel

## Pattern C: Headless Cloud-Only

Everything runs in the cloud, no local dependencies. Access via mobile apps or web interfaces.

### Architecture

```
┌──────────────────────────────────────────┐
│         Cloud VM (Oracle/AWS/GCP)        │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │        Gateway (cloud)             │  │
│  │     ws://127.0.0.1:18789           │  │
│  └──────────┬─────────────────────────┘  │
│             │                            │
│             ├─ Pi Agent (RPC)            │
│             ├─ iOS/Android Node (Bridge) │
│             └─ Providers                 │
│                (WhatsApp/Telegram/etc)   │
│                                          │
└──────────────────────────────────────────┘
         ↓
    Tailscale (secure access)
         ↓
┌──────────────────────────────────────────┐
│            Your Devices                  │
│                                          │
│  • Phone (WhatsApp, Telegram, Discord)  │
│  • iPad/iPhone (Canvas via Bridge)      │
│  • Any browser (WebChat via Tailscale)  │
│                                          │
└──────────────────────────────────────────┘
```

### When to Use

- **Production personal assistant**: Always-on, no local machine needed
- **Mobile-first**: Primary access via phone/tablet
- **Minimal local footprint**: No local installation required
- **Travel/remote work**: Access from anywhere

### Pros

- ✅ True 24/7 availability
- ✅ Zero local resource usage
- ✅ Access from any device (phone, tablet, browser)
- ✅ No local installation needed (except for admin)
- ✅ Perfect for mobile-first workflows

### Cons

- ❌ Higher setup complexity
- ❌ No local Voice Wake or Canvas (unless via node)
- ❌ Requires cloud instance and Tailscale
- ❌ Provider linking needs workaround (VNC or credential copy)

### Setup

1. **Provision Cloud VM** (see [CLOUD_DEPLOYMENT.md](./CLOUD_DEPLOYMENT.md))
2. **Install Clawdis** and configure
3. **Link providers** (via VNC or credential copy)
4. **Install Tailscale** for secure access
5. **Create systemd service** for auto-start
6. **Access via**:
   - **Mobile**: WhatsApp/Telegram/Discord directly
   - **WebChat**: `https://<instance>.tailnet.ts.net/ui/`
   - **iOS/Android**: Pair via Bridge for Canvas

### Canvas and Nodes

To use Canvas on mobile with cloud gateway:

1. **Enable Bridge** in config:

```json5
{
  "bridge": {
    "enabled": true,
    "port": 18790,
    "bind": "tailnet"  // Bind to Tailscale IP
  }
}
```

2. **Install iOS/Android app** and configure:
   - Host: `100.x.x.x` (Tailscale IP)
   - Port: `18790`
   - Pair via QR code

3. **Canvas Host** serves HTML/JS over Tailscale:

```json5
{
  "canvasHost": {
    "root": "~/.clawdis/workspace/canvas",
    "port": 18793
  }
}
```

Access Canvas: `http://100.x.x.x:18793/__clawdis__/canvas/`

## Hybrid Patterns

### Pattern A + B: Local + Cloud Failover

Run Gateway locally but keep a cloud standby:

- Primary: Local Gateway (Pattern A)
- Failover: Cloud Gateway (Pattern B)
- Use Tailscale to switch between them

### Pattern B + iOS Bridge: Best of Both Worlds

- Cloud Gateway (always-on)
- Local CLI/macOS app (when at desk)
- iOS node for Canvas (when mobile)

```
Cloud Gateway (24/7)
    ↓
Tailscale
    ↓
├─ Local Machine (CLI, macOS app)
└─ iPhone/iPad (Canvas, Voice Wake via Bridge)
```

## Choosing the Right Pattern

### Decision Matrix

Ask yourself:

1. **Do I need 24/7 availability?**
   - Yes → Pattern B or C
   - No → Pattern A

2. **Do I primarily use mobile devices?**
   - Yes → Pattern C
   - No → Pattern A or B

3. **Do I want to minimize costs?**
   - Yes → Pattern A or B (Oracle free tier)
   - No → Pattern C (paid cloud)

4. **Do I need Voice Wake and native macOS features?**
   - Yes → Pattern A or A+B hybrid
   - No → Pattern B or C

5. **How important is local privacy?**
   - Critical → Pattern A
   - Moderate → Pattern B
   - Flexible → Pattern C

### Recommendations by Use Case

| Use Case | Recommended Pattern | Why |
|----------|---------------------|-----|
| Developer/Power User | Pattern A | Full control, local debugging |
| Always-On Personal Assistant | Pattern B | Best balance of availability and flexibility |
| Mobile-First User | Pattern C | Optimized for phone/tablet access |
| Privacy-Conscious | Pattern A | All data stays local |
| Traveler/Remote Worker | Pattern B or C | Access from anywhere |
| Budget-Conscious | Pattern A or B | Free tier cloud options |

## Migration Between Patterns

### From Pattern A to Pattern B

1. Provision cloud instance
2. Install Clawdis on cloud
3. Copy credentials: `scp -r ~/.clawdis user@cloud:/home/user/`
4. Start cloud Gateway
5. Update local config to point to cloud: `export CLAWDIS_GATEWAY_URL="ws://100.x.x.x:18789"`

### From Pattern B to Pattern C

1. Pair iOS/Android nodes to cloud Bridge
2. Stop using local CLI (optional)
3. Rely on mobile apps + WebChat only

### From Pattern A to Pattern C

1. Follow Pattern A → B steps
2. Then follow Pattern B → C steps

## Performance Comparison

| Metric | Pattern A | Pattern B | Pattern C |
|--------|-----------|-----------|-----------|
| Agent Response Time | Fast (local) | Medium (network latency) | Medium (network latency) |
| Message Delivery | Fast | Fast | Fast |
| Resource Usage (Local) | High | Low | Zero |
| Resource Usage (Cloud) | None | Medium | Medium |
| Availability | When machine on | 24/7 | 24/7 |
| Setup Complexity | Low | Medium | Medium-High |

## Next Steps

- **Pattern A**: Continue with [Getting Started](./GETTING_STARTED.md)
- **Pattern B**: Read [Cloud Deployment](./CLOUD_DEPLOYMENT.md)
- **Pattern C**: Read [Cloud Deployment](./CLOUD_DEPLOYMENT.md) + [Nodes](./nodes.md)

---

**Choose the pattern that fits your workflow!** 🦞
