# Cloud Deployment Guide

This guide covers deploying Clawdis to cloud providers for always-on, headless operation. Perfect for running your assistant 24/7 without keeping your local machine on.

## Why Cloud Deployment?

- **Always-on**: Gateway runs 24/7 without tying up your local machine
- **Cost-effective**: Free tier options available (Oracle Cloud Ampere)
- **Secure**: Use Tailscale for encrypted remote access
- **Scalable**: Handle multiple surfaces and high message volume

## Deployment Patterns

This guide covers **Pattern C** (headless cloud-only). See [DEPLOYMENT_PATTERNS.md](./DEPLOYMENT_PATTERNS.md) for other options.

```
Cloud VM (Oracle/AWS/GCP)
├── Gateway (always-on)
├── Agent (Pi RPC)
├── WhatsApp/Telegram/Discord providers
└── Tailscale (for secure remote access)

You (laptop/phone) → Tailscale → Gateway
```

## Prerequisites

- A cloud provider account (Oracle Cloud recommended for free tier)
- Basic Linux command-line knowledge
- Tailscale account (free tier is fine)
- Your messaging provider credentials (WhatsApp, Telegram, etc.)

## Option 1: Oracle Cloud Ampere (Free Tier)

Oracle Cloud's Always Free tier includes ARM-based Ampere instances perfect for Clawdis.

### Instance Specs (Free Tier)

- **Shape**: VM.Standard.A1.Flex
- **CPU**: 4 OCPUs (ARM)
- **RAM**: 24 GB
- **Storage**: 200 GB block volume
- **OS**: Ubuntu 22.04 LTS (ARM64)

### 1. Create the Instance

1. Sign up at [cloud.oracle.com](https://cloud.oracle.com)
2. Navigate to **Compute → Instances → Create Instance**
3. Configure:
   - **Name**: `clawdis-gateway`
   - **Image**: Ubuntu 22.04 LTS (ARM64)
   - **Shape**: VM.Standard.A1.Flex (4 OCPUs, 24GB RAM)
   - **Network**: Create/use VCN with public subnet
   - **SSH keys**: Upload your public key
4. Click **Create**

### 2. Initial Server Setup

SSH into your instance:

```bash
ssh ubuntu@<instance-public-ip>
```

Update the system:

```bash
sudo apt update && sudo apt upgrade -y
```

Install dependencies:

```bash
# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
npm install -g pnpm

# Install build tools
sudo apt install -y git build-essential
```

### 3. Create a Service User

```bash
sudo useradd -r -m -s /bin/bash clawdis
sudo su - clawdis
```

### 4. Install Clawdis

```bash
git clone https://github.com/steipete/clawdis.git
cd clawdis
pnpm install
pnpm build
pnpm link --global
```

### 5. Configure Clawdis

Create `~/.clawdis/clawdis.json`:

```json5
{
  "gateway": {
    "mode": "local",
    "bind": "loopback"  // Tailscale handles external access
  },
  "agent": {
    "workspace": "~/.clawdis/workspace",
    "model": "anthropic/claude-opus-4-5",
    "timeoutSeconds": 600
  },
  "routing": {
    "allowFrom": ["+1234567890"]  // Your phone number
  },
  "logging": {
    "file": "/var/log/clawdis/clawdis.log",
    "level": "info"
  }
}
```

Set your Anthropic API key:

```bash
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
source ~/.bashrc
```

### 6. Link WhatsApp (Using Docker with Display)

Since Oracle instances are headless, we need a workaround for the QR code:

```bash
# Install Docker
sudo apt install -y docker.io
sudo usermod -aG docker clawdis
newgrp docker

# Run temporary X11 VNC container for QR display
docker run -d -p 5900:5900 -p 6080:6080 \
  --name x11vnc \
  -e DISPLAY=:0 \
  dorowu/ubuntu-desktop-lxde-vnc

# Forward VNC port via SSH tunnel (from your local machine)
# ssh -L 6080:localhost:6080 ubuntu@<instance-ip>
```

Open `http://localhost:6080` in your browser, then inside the VNC session:

```bash
su - clawdis
export DISPLAY=:0
clawdis login
```

Scan the QR code with your phone. After linking, stop the container:

```bash
docker stop x11vnc && docker rm x11vnc
```

**Alternative**: Use the macOS app locally to link WhatsApp, then copy credentials to the cloud:

```bash
# On your local machine
tar czf clawdis-creds.tar.gz ~/.clawdis/credentials/

# Copy to cloud instance
scp clawdis-creds.tar.gz ubuntu@<instance-ip>:/tmp/

# On cloud instance
sudo su - clawdis
cd ~
tar xzf /tmp/clawdis-creds.tar.gz
```

### 7. Install Tailscale

```bash
# As ubuntu user (exit from clawdis user)
exit

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Enable IP forwarding (optional, for subnet routing)
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

Note your instance's Tailscale IP (e.g., `100.x.x.x`).

### 8. Create systemd Service

Create `/etc/systemd/system/clawdis-gateway.service`:

```ini
[Unit]
Description=Clawdis Gateway
After=network-online.target tailscaled.service
Wants=network-online.target
Requires=tailscaled.service

[Service]
Type=simple
User=clawdis
Group=clawdis
WorkingDirectory=/home/clawdis
Environment="PATH=/home/clawdis/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin"
Environment="NODE_ENV=production"
EnvironmentFile=/home/clawdis/.clawdis/env
ExecStart=/home/clawdis/.local/share/pnpm/clawdis gateway --port 18789
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=clawdis-gateway

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/clawdis/.clawdis /var/log/clawdis

[Install]
WantedBy=multi-user.target
```

Create the environment file `/home/clawdis/.clawdis/env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Set permissions:

```bash
sudo chmod 600 /home/clawdis/.clawdis/env
sudo chown clawdis:clawdis /home/clawdis/.clawdis/env
```

Create log directory:

```bash
sudo mkdir -p /var/log/clawdis
sudo chown clawdis:clawdis /var/log/clawdis
```

### 9. Enable and Start the Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable clawdis-gateway.service
sudo systemctl start clawdis-gateway.service
```

Check status:

```bash
sudo systemctl status clawdis-gateway.service
sudo journalctl -u clawdis-gateway.service -f
```

### 10. Configure Firewall

```bash
# Allow Tailscale
sudo ufw allow 41641/udp

# Allow SSH (important!)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

### 11. Access from Your Local Machine

```bash
# SSH via Tailscale
ssh clawdis@100.x.x.x

# Use CLI via SSH tunnel
ssh -L 18789:127.0.0.1:18789 clawdis@100.x.x.x

# In another terminal
clawdis health
clawdis status --deep
```

## Option 2: Docker Deployment

For any cloud provider that supports Docker.

### Dockerfile

Create `Dockerfile` in the Clawdis repo:

```dockerfile
FROM node:22-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Create app user
RUN useradd -r -m -s /bin/bash clawdis
USER clawdis
WORKDIR /home/clawdis

# Clone and build Clawdis
RUN git clone https://github.com/steipete/clawdis.git
WORKDIR /home/clawdis/clawdis
RUN pnpm install && pnpm build

# Expose ports
EXPOSE 18789 18790

# Start gateway
CMD ["pnpm", "clawdis", "gateway", "--port", "18789"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  clawdis-gateway:
    build: .
    container_name: clawdis-gateway
    restart: unless-stopped
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - NODE_ENV=production
    volumes:
      - clawdis-data:/home/clawdis/.clawdis
      - clawdis-workspace:/home/clawdis/clawd
    ports:
      - "127.0.0.1:18789:18789"  # Gateway WS (loopback only)
      - "0.0.0.0:18790:18790"    # Bridge (for nodes)
    healthcheck:
      test: ["CMD", "pnpm", "clawdis", "health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  clawdis-data:
  clawdis-workspace:
```

### Deploy with Docker Compose

```bash
# Create .env file
cat > .env << EOF
ANTHROPIC_API_KEY=sk-ant-...
EOF

# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose exec clawdis-gateway pnpm clawdis health
```

## Tailscale Integration for Secure Access

### Option 1: Tailscale Serve (Recommended)

Expose the Gateway dashboard on your tailnet only:

```json5
{
  "gateway": {
    "bind": "loopback",
    "tailscale": {
      "mode": "serve"
    }
  }
}
```

Then access via `https://<hostname>.<tailnet>.ts.net/ui/`

### Option 2: Tailscale Funnel (Public Access)

**Warning**: This exposes your gateway publicly. Use with strong authentication.

```json5
{
  "gateway": {
    "bind": "loopback",
    "tailscale": {
      "mode": "funnel"
    },
    "auth": {
      "mode": "password",
      "password": "strong-random-password"
    }
  }
}
```

Or set via environment:

```bash
export CLAWDIS_GATEWAY_PASSWORD="strong-random-password"
```

## Monitoring and Logging

### View Logs

**systemd**:

```bash
sudo journalctl -u clawdis-gateway.service -f
sudo journalctl -u clawdis-gateway.service --since "1 hour ago"
```

**Docker**:

```bash
docker-compose logs -f clawdis-gateway
```

### Health Checks

Create a monitoring script `/usr/local/bin/check-clawdis.sh`:

```bash
#!/bin/bash
set -e

HEALTH=$(clawdis health --json 2>/dev/null || echo '{"ok":false}')
OK=$(echo "$HEALTH" | jq -r '.ok // false')

if [ "$OK" != "true" ]; then
  echo "Gateway unhealthy: $HEALTH"
  # Restart service
  sudo systemctl restart clawdis-gateway.service
  # Send alert (optional)
  # curl -X POST https://your-alert-webhook ...
fi
```

Make it executable and add to cron:

```bash
sudo chmod +x /usr/local/bin/check-clawdis.sh
sudo crontab -e

# Add:
*/5 * * * * /usr/local/bin/check-clawdis.sh
```

### Log Rotation

Create `/etc/logrotate.d/clawdis`:

```
/var/log/clawdis/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 clawdis clawdis
    sharedscripts
    postrotate
        systemctl reload clawdis-gateway.service > /dev/null 2>&1 || true
    endscript
}
```

## Backup and Restore

### What to Back Up

- `~/.clawdis/credentials/` - WhatsApp/provider credentials
- `~/.clawdis/clawdis.json` - Configuration
- `~/.clawdis/workspace/` - Agent memory and skills
- `~/.clawdis/sessions/` - Session data

### Backup Script

```bash
#!/bin/bash
BACKUP_DIR="/home/clawdis/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/clawdis_backup_$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

tar czf "$BACKUP_FILE" \
  ~/.clawdis/credentials/ \
  ~/.clawdis/clawdis.json \
  ~/.clawdis/workspace/ \
  ~/.clawdis/sessions/

# Keep only last 7 backups
find "$BACKUP_DIR" -name "clawdis_backup_*.tar.gz" -mtime +7 -delete

echo "Backup created: $BACKUP_FILE"
```

### Restore

```bash
tar xzf clawdis_backup_20250101_120000.tar.gz -C ~/
sudo systemctl restart clawdis-gateway.service
```

## Updating Clawdis

```bash
# Stop the service
sudo systemctl stop clawdis-gateway.service

# Update code
sudo su - clawdis
cd ~/clawdis
git pull
pnpm install
pnpm build

# Restart service
exit
sudo systemctl start clawdis-gateway.service
```

## Troubleshooting

### Service Won't Start

```bash
# Check service status
sudo systemctl status clawdis-gateway.service

# View recent logs
sudo journalctl -u clawdis-gateway.service -n 100

# Test manually
sudo su - clawdis
cd ~/clawdis
pnpm clawdis gateway --port 18789 --verbose
```

### WhatsApp Session Expired

```bash
# Re-link WhatsApp (see step 6)
sudo systemctl stop clawdis-gateway.service
sudo su - clawdis
rm -rf ~/.clawdis/credentials/
clawdis login
exit
sudo systemctl start clawdis-gateway.service
```

### Out of Memory

```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head

# Increase swap (Oracle Cloud)
sudo dd if=/dev/zero of=/swapfile bs=1G count=4
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Network Issues

```bash
# Check Tailscale status
tailscale status

# Restart Tailscale
sudo systemctl restart tailscaled
sudo tailscale up

# Test connectivity
ping 100.x.x.x  # Your Tailscale IP
nc -zv 127.0.0.1 18789  # Gateway port
```

## Cost Estimates

### Oracle Cloud Always Free

- **Cost**: $0/month
- **Specs**: 4 OCPU ARM, 24GB RAM, 200GB storage
- **Perfect for**: Single-user personal assistant

### AWS EC2 (t4g.small)

- **Cost**: ~$12/month (ARM-based)
- **Specs**: 2 vCPU, 2GB RAM
- **Good for**: Light usage, testing

### DigitalOcean Droplet

- **Cost**: $6-12/month
- **Specs**: 1-2 vCPU, 1-2GB RAM
- **Good for**: Simple deployments

### Google Cloud Platform (e2-micro)

- **Cost**: $7/month (free tier available)
- **Specs**: 1 vCPU, 1GB RAM
- **Good for**: Budget deployments

## Security Best Practices

1. **Use Tailscale** for all remote access (not public IPs)
2. **Enable UFW firewall** and allow only essential ports
3. **Regular updates**: `sudo apt update && sudo apt upgrade`
4. **Secure credentials**: Use environment variables, not config files
5. **Backup regularly**: Automate backups to external storage
6. **Monitor logs**: Set up alerts for errors
7. **Use strong passwords** if exposing via Funnel
8. **Disable password SSH**: Use key-based authentication only

## Next Steps

- **[Deployment Patterns](./DEPLOYMENT_PATTERNS.md)**: Choose the right architecture
- **[Configuration Reference](./configuration.md)**: Fine-tune your setup
- **[Tailscale Guide](./tailscale.md)**: Advanced Tailscale configuration
- **[Security Guide](./security.md)**: Harden your deployment

---

**Your personal AI assistant is now running 24/7 in the cloud!** 🦞
