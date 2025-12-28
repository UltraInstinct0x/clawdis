# Getting Started with Clawdis

Welcome to Clawdis! This guide will help you set up your personal AI assistant in under 10 minutes.

## What is Clawdis?

Clawdis is a **personal AI assistant** that you run on your own devices. It connects to the messaging surfaces you already use (WhatsApp, Telegram, Discord, WebChat) and can speak and listen on macOS/iOS. The Gateway is your control plane, and the assistant is the product.

```
Your surfaces (WhatsApp, Telegram, Discord, etc.)
   │
   ▼
┌────────────────────────────┐
│         Gateway            │  ws://127.0.0.1:18789
│      (control plane)       │  tcp://0.0.0.0:18790 (optional Bridge)
└─────────────┬──────────────┘
              │
              ├─ Pi agent (RPC)
              ├─ CLI (clawdis …)
              ├─ WebChat (browser)
              ├─ macOS app (Clawdis.app)
              └─ iOS node (Canvas + voice)
```

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 22 or higher
- **pnpm** (npm package manager)
- **macOS, Linux, or Windows** (WSL recommended for Windows)
- **An Anthropic API key** (Claude Pro/Max account)

### Install pnpm (if needed)

```bash
npm install -g pnpm
```

## Quick Start (5 Minutes)

### 1. Install Clawdis

Choose one of the following methods:

#### Option A: From Source (Recommended for Development)

```bash
git clone https://github.com/steipete/clawdis.git
cd clawdis
pnpm install
pnpm build
pnpm ui:build
```

Link the CLI globally:

```bash
pnpm link --global
```

Now `clawdis` is available system-wide.

#### Option B: Via npm (Coming Soon)

```bash
npm install -g clawdis
```

### 2. Link WhatsApp (Optional)

If you want to use WhatsApp as a surface:

```bash
clawdis login
```

This will:
- Display a QR code in your terminal
- Wait for you to scan it with WhatsApp mobile app
- Store credentials in `~/.clawdis/credentials/`

**Note**: Your credentials stay on your machine. Clawdis uses the same protocol as WhatsApp Web.

### 3. Configure Your Assistant

Create a minimal configuration file at `~/.clawdis/clawdis.json`:

```json5
{
  "agent": {
    "workspace": "~/clawd",
    "model": "anthropic/claude-opus-4-5"
  },
  "routing": {
    "allowFrom": ["+1234567890"]  // Your phone number in E.164 format
  }
}
```

**Important**: Replace `+1234567890` with your actual phone number in E.164 format (country code + number, no spaces).

### 4. Set Your Anthropic API Key

Set your API key as an environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Or create `~/.clawdis/credentials/oauth.json`:

```json
{
  "apiKey": "sk-ant-..."
}
```

### 5. Start the Gateway

```bash
clawdis gateway --port 18789
```

You should see:

```
Gateway started on ws://127.0.0.1:18789
WhatsApp provider: linked
Ready to receive messages
```

### 6. Test Your Assistant

Open a new terminal and send a test message:

```bash
clawdis agent --message "Hello! Introduce yourself." --thinking low
```

Or send a WhatsApp message from your phone!

## Provider Setup

### WhatsApp

WhatsApp uses the web protocol via Baileys. To link:

```bash
clawdis login
```

**Requirements**:
- WhatsApp mobile app installed
- Phone connected to internet
- Camera to scan QR code

**Troubleshooting**:
- If login fails, delete `~/.clawdis/credentials/` and try again
- Make sure WhatsApp Web isn't already open elsewhere
- Check that your phone is connected to the internet

### Telegram

1. **Create a bot** via [@BotFather](https://t.me/BotFather):
   - Send `/newbot`
   - Choose a name and username
   - Save the bot token

2. **Configure Clawdis**:

Add to `~/.clawdis/clawdis.json`:

```json5
{
  "telegram": {
    "botToken": "123456:ABCDEF..."
  }
}
```

Or set the environment variable:

```bash
export TELEGRAM_BOT_TOKEN="123456:ABCDEF..."
```

3. **Restart the Gateway** and message your bot!

### Discord

1. **Create a Discord bot**:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to "Bot" section and create a bot
   - Copy the bot token
   - Enable "Message Content Intent" under Bot → Privileged Gateway Intents

2. **Invite the bot to your server**:
   - Go to OAuth2 → URL Generator
   - Select scopes: `bot`
   - Select permissions: `Read Messages`, `Send Messages`, `Read Message History`
   - Copy the generated URL and open it to invite the bot

3. **Configure Clawdis**:

```json5
{
  "discord": {
    "token": "your-bot-token"
  }
}
```

Or set the environment variable:

```bash
export DISCORD_BOT_TOKEN="your-bot-token"
```

## First Configuration Wizard

When you first run Clawdis with the macOS app, you'll go through an onboarding wizard that:

1. **Chooses Gateway location**: Local (this Mac) or Remote (over SSH)
2. **Connects Claude**: Anthropic OAuth flow for Claude Pro/Max users
3. **Agent bootstrap ritual**: The agent introduces itself and guides setup
   - Asks your name and how you want to be addressed
   - Visits soul.md to establish identity and tone
   - Guides provider linking (WhatsApp QR, Telegram, etc.)

The wizard creates:
- `~/.clawdis/workspace/` (agent's workspace)
- `IDENTITY.md`, `USER.md`, `SOUL.md` (agent identity files)
- `~/.clawdis/clawdis.json` (configuration)

## Starting the Gateway

### Foreground (Development)

```bash
clawdis gateway --port 18789 --verbose
```

**Flags**:
- `--verbose`: Debug logging to console
- `--force`: Kill any process on the port and start
- `--token <secret>`: Require auth token from clients

### Background (Production)

Use a process manager like systemd (Linux) or launchd (macOS).

**systemd example** (`/etc/systemd/system/clawdis-gateway.service`):

```ini
[Unit]
Description=Clawdis Gateway
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/clawdis gateway --port 18789
Restart=on-failure
RestartSec=5
User=clawdis
WorkingDirectory=/home/clawdis

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable --now clawdis-gateway.service
```

## Chat Commands

Send these in WhatsApp/Telegram/Discord:

| Command | Description |
|---------|-------------|
| `/status` | Health + session info |
| `/new` or `/reset` | Reset the session |
| `/think <level>` | Set thinking level: off, minimal, low, medium, high |
| `/verbose on\|off` | Toggle verbose output |
| `/restart` | Restart the gateway (owner only in groups) |
| `/activation mention\|always` | Group activation mode (groups only) |

## Using the CLI

### Send a Message

```bash
clawdis send --to "+1234567890" --message "Hello from Clawdis"
```

### Run the Agent

```bash
clawdis agent --message "What's the weather?" --thinking medium
```

### Check Status

```bash
clawdis status --deep
clawdis health
```

### View Sessions

```bash
clawdis sessions list
clawdis sessions show <session-id>
```

## Troubleshooting Common Issues

### Gateway Won't Start

**Error: Port already in use**

```bash
clawdis gateway --force
```

This kills any process on port 18789 and starts the gateway.

**Error: WhatsApp not linked**

```bash
clawdis login
```

Scan the QR code with WhatsApp mobile.

### Messages Not Getting Through

**Check routing allowlist**:

Make sure your phone number is in `routing.allowFrom` in `~/.clawdis/clawdis.json`.

**Check gateway status**:

```bash
clawdis health
```

Look for `web.linked: true` (WhatsApp) or provider status.

### Agent Not Responding

**Check API key**:

```bash
echo $ANTHROPIC_API_KEY
```

**Check agent configuration**:

```json5
{
  "agent": {
    "model": "anthropic/claude-opus-4-5"
  }
}
```

**Check logs**:

```bash
tail -f /tmp/clawdis/clawdis-*.log
```

### WhatsApp QR Code Won't Scan

1. Delete credentials: `rm -rf ~/.clawdis/credentials/`
2. Make sure WhatsApp Web isn't open elsewhere
3. Try again: `clawdis login`

## Next Steps

Now that Clawdis is running, explore:

- **[Cloud Deployment](./CLOUD_DEPLOYMENT.md)**: Deploy to Oracle Cloud, AWS, or other providers
- **[Deployment Patterns](./DEPLOYMENT_PATTERNS.md)**: Choose the right architecture for your needs
- **[Configuration Reference](./configuration.md)**: Deep dive into all configuration options
- **[Agent Workspace](./agent.md)**: Understand how the agent manages memory and skills
- **[macOS App](./clawdis-mac.md)**: Use the native macOS menubar app

## Getting Help

- **Documentation**: [docs/](../docs/)
- **Issues**: [GitHub Issues](https://github.com/steipete/clawdis/issues)
- **Architecture**: [docs/architecture.md](./architecture.md)
- **Security**: [docs/security.md](./security.md)

---

**Welcome to Clawdis! EXFOLIATE! EXFOLIATE!** 🦞
