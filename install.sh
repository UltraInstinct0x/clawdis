#!/usr/bin/env bash
#
# Clawdis Universal Installer
# One-liner: curl -fsSL https://raw.githubusercontent.com/UltraInstinct0x/clawdis/main/install.sh | bash
#
# Supports: macOS, Linux (Debian/Ubuntu, RHEL/Fedora, Arch)
# Requires: bash, curl or wget
#

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

CLAWDIS_REPO="${CLAWDIS_REPO:-https://github.com/UltraInstinct0x/clawdis.git}"
CLAWDIS_DIR="${CLAWDIS_DIR:-$HOME/clawdis}"
MIN_NODE_VERSION=22
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────────────

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
  echo -e "\n${CYAN}${BOLD}▶ $1${NC}"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

version_gte() {
  # Returns 0 if version $1 >= $2
  printf '%s\n%s\n' "$2" "$1" | sort -V -C
}

get_node_major_version() {
  if command_exists node; then
    node -v | sed 's/v//' | cut -d. -f1
  else
    echo "0"
  fi
}

detect_os() {
  case "$(uname -s)" in
    Darwin) echo "macos" ;;
    Linux) echo "linux" ;;
    *) echo "unknown" ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    arm64|aarch64) echo "arm64" ;;
    *) echo "unknown" ;;
  esac
}

detect_package_manager() {
  if command_exists apt-get; then
    echo "apt"
  elif command_exists dnf; then
    echo "dnf"
  elif command_exists yum; then
    echo "yum"
  elif command_exists pacman; then
    echo "pacman"
  elif command_exists brew; then
    echo "brew"
  else
    echo "unknown"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Installation Functions
# ─────────────────────────────────────────────────────────────────────────────

install_node_nvm() {
  log_info "Installing Node.js via nvm..."

  if [ ! -d "$HOME/.nvm" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi

  # Load nvm
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  nvm install "$MIN_NODE_VERSION"
  nvm use "$MIN_NODE_VERSION"

  log_success "Node.js $(node -v) installed via nvm"
}

install_node_fnm() {
  log_info "Installing Node.js via fnm..."

  if ! command_exists fnm; then
    curl -fsSL https://fnm.vercel.app/install | bash
    export PATH="$HOME/.local/share/fnm:$PATH"
    eval "$(fnm env)"
  fi

  fnm install "$MIN_NODE_VERSION"
  fnm use "$MIN_NODE_VERSION"

  log_success "Node.js $(node -v) installed via fnm"
}

install_node_brew() {
  log_info "Installing Node.js via Homebrew..."
  brew install node@22

  # Link if needed
  if ! command_exists node; then
    brew link --overwrite node@22
  fi

  log_success "Node.js $(node -v) installed via Homebrew"
}

install_node() {
  local os
  os=$(detect_os)

  if [ "$os" = "macos" ] && command_exists brew; then
    install_node_brew
  elif command_exists fnm; then
    install_node_fnm
  else
    install_node_nvm
  fi
}

install_pnpm() {
  log_info "Installing pnpm..."

  if command_exists corepack; then
    corepack enable
    corepack prepare pnpm@latest --activate
  else
    npm install -g pnpm
  fi

  log_success "pnpm $(pnpm --version) installed"
}

install_git() {
  local pm
  pm=$(detect_package_manager)

  log_info "Installing Git..."

  case "$pm" in
    apt) sudo apt-get update && sudo apt-get install -y git ;;
    dnf) sudo dnf install -y git ;;
    yum) sudo yum install -y git ;;
    pacman) sudo pacman -S --noconfirm git ;;
    brew) brew install git ;;
    *) log_error "Cannot install git automatically. Please install manually." && exit 1 ;;
  esac

  log_success "Git installed"
}

clone_or_update_repo() {
  if [ -d "$CLAWDIS_DIR/.git" ]; then
    log_info "Updating existing clawdis installation..."
    cd "$CLAWDIS_DIR"
    git fetch origin
    git pull --rebase origin main
  else
    log_info "Cloning clawdis repository..."
    git clone "$CLAWDIS_REPO" "$CLAWDIS_DIR"
    cd "$CLAWDIS_DIR"
  fi

  log_success "Repository ready at $CLAWDIS_DIR"
}

build_clawdis() {
  log_info "Installing dependencies..."
  pnpm install

  log_info "Building clawdis..."
  pnpm build

  log_success "Build complete"
}

setup_symlink() {
  log_info "Setting up clawdis command..."

  mkdir -p "$INSTALL_DIR"

  # Create wrapper script
  local wrapper="$INSTALL_DIR/clawdis"
  cat > "$wrapper" << EOF
#!/usr/bin/env bash
exec node "$CLAWDIS_DIR/dist/index.js" "\$@"
EOF
  chmod +x "$wrapper"

  # Check if INSTALL_DIR is in PATH
  if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    log_warn "$INSTALL_DIR is not in your PATH"
    log_info "Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo -e "  ${CYAN}export PATH=\"\$PATH:$INSTALL_DIR\"${NC}"
  fi

  log_success "clawdis command installed at $wrapper"
}

run_setup() {
  log_info "Running initial setup..."

  cd "$CLAWDIS_DIR"

  # Use tsx to run setup directly
  npx tsx src/index.ts setup

  log_success "Initial setup complete"
}

# ─────────────────────────────────────────────────────────────────────────────
# Main Installation Flow
# ─────────────────────────────────────────────────────────────────────────────

main() {
  echo -e "${BOLD}${CYAN}"
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║                   Clawdis Universal Installer                 ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"

  local os arch
  os=$(detect_os)
  arch=$(detect_arch)

  log_info "Detected: $os ($arch)"

  if [ "$os" = "unknown" ]; then
    log_error "Unsupported operating system: $(uname -s)"
    exit 1
  fi

  # ─────────────────────────────────────────────────────────────────────────
  # Step 1: Check/Install Git
  # ─────────────────────────────────────────────────────────────────────────

  log_step "Checking Git..."

  if command_exists git; then
    log_success "Git $(git --version | cut -d' ' -f3) found"
  else
    install_git
  fi

  # ─────────────────────────────────────────────────────────────────────────
  # Step 2: Check/Install Node.js
  # ─────────────────────────────────────────────────────────────────────────

  log_step "Checking Node.js..."

  node_version=$(get_node_major_version)

  if [ "$node_version" -ge "$MIN_NODE_VERSION" ]; then
    log_success "Node.js v$(node -v | sed 's/v//') found (>= $MIN_NODE_VERSION required)"
  else
    if [ "$node_version" -gt 0 ]; then
      log_warn "Node.js v$(node -v | sed 's/v//') is too old (>= $MIN_NODE_VERSION required)"
    fi
    install_node
  fi

  # ─────────────────────────────────────────────────────────────────────────
  # Step 3: Check/Install pnpm
  # ─────────────────────────────────────────────────────────────────────────

  log_step "Checking pnpm..."

  if command_exists pnpm; then
    log_success "pnpm $(pnpm --version) found"
  else
    install_pnpm
  fi

  # ─────────────────────────────────────────────────────────────────────────
  # Step 4: Clone/Update Repository
  # ─────────────────────────────────────────────────────────────────────────

  log_step "Setting up clawdis repository..."

  clone_or_update_repo

  # ─────────────────────────────────────────────────────────────────────────
  # Step 5: Build
  # ─────────────────────────────────────────────────────────────────────────

  log_step "Building clawdis..."

  build_clawdis

  # ─────────────────────────────────────────────────────────────────────────
  # Step 6: Create symlink
  # ─────────────────────────────────────────────────────────────────────────

  log_step "Installing clawdis command..."

  setup_symlink

  # ─────────────────────────────────────────────────────────────────────────
  # Step 7: Run setup
  # ─────────────────────────────────────────────────────────────────────────

  log_step "Running initial setup..."

  run_setup

  # ─────────────────────────────────────────────────────────────────────────
  # Done!
  # ─────────────────────────────────────────────────────────────────────────

  echo ""
  echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  Installation complete!${NC}"
  echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${BOLD}Next steps:${NC}"
  echo ""
  echo -e "  1. ${CYAN}clawdis login${NC}        # Link your WhatsApp (scan QR code)"
  echo -e "  2. ${CYAN}clawdis doctor${NC}       # Check system health"
  echo -e "  3. ${CYAN}clawdis gateway${NC}      # Start the gateway server"
  echo ""
  echo -e "  For help: ${CYAN}clawdis --help${NC}"
  echo ""

  # Remind about PATH if needed
  if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo -e "${YELLOW}  Note: Restart your shell or run:${NC}"
    echo -e "  ${CYAN}export PATH=\"\$PATH:$INSTALL_DIR\"${NC}"
    echo ""
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Unattended mode support
# ─────────────────────────────────────────────────────────────────────────────

if [ "${1:-}" = "--unattended" ] || [ "${CLAWDIS_UNATTENDED:-}" = "1" ]; then
  export NONINTERACTIVE=1
fi

# Run main
main "$@"
