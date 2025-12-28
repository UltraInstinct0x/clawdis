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

# Will be set to the absolute path of the node binary
NODE_BIN=""

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

get_node_major_version() {
  local node_cmd="${1:-node}"
  if command_exists "$node_cmd"; then
    "$node_cmd" -v 2>/dev/null | sed 's/v//' | cut -d. -f1
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
  log_info "Installing Node.js $MIN_NODE_VERSION via nvm..."

  export NVM_DIR="$HOME/.nvm"

  if [ ! -d "$NVM_DIR" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi

  # Load nvm
  # shellcheck source=/dev/null
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  nvm install "$MIN_NODE_VERSION"
  nvm use "$MIN_NODE_VERSION"
  nvm alias default "$MIN_NODE_VERSION"

  # Get the absolute path to the node binary
  NODE_BIN="$NVM_DIR/versions/node/$(nvm current)/bin/node"

  if [ ! -x "$NODE_BIN" ]; then
    # Fallback: find it
    NODE_BIN=$(which node)
  fi

  log_success "Node.js $(node -v) installed via nvm"
  log_info "Node binary: $NODE_BIN"
}

install_node_brew() {
  log_info "Installing Node.js via Homebrew..."
  brew install node@22

  # Link if needed
  if ! command_exists node; then
    brew link --overwrite node@22 2>/dev/null || true
  fi

  NODE_BIN=$(which node)
  log_success "Node.js $(node -v) installed via Homebrew"
}

install_node() {
  local os
  os=$(detect_os)

  if [ "$os" = "macos" ] && command_exists brew; then
    install_node_brew
  else
    install_node_nvm
  fi
}

find_node_binary() {
  # Try to find the best node binary

  # 1. Check nvm
  if [ -d "$HOME/.nvm" ]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    local nvm_node
    nvm_node="$NVM_DIR/versions/node/$(nvm current 2>/dev/null)/bin/node" 2>/dev/null || true
    if [ -x "$nvm_node" ]; then
      local ver
      ver=$("$nvm_node" -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
      if [ "$ver" -ge "$MIN_NODE_VERSION" ]; then
        NODE_BIN="$nvm_node"
        return 0
      fi
    fi
  fi

  # 2. Check fnm
  if [ -d "$HOME/.local/share/fnm" ]; then
    export PATH="$HOME/.local/share/fnm:$PATH"
    eval "$(fnm env 2>/dev/null)" 2>/dev/null || true
  fi

  # 3. Check regular node
  if command_exists node; then
    local ver
    ver=$(get_node_major_version node)
    if [ "$ver" -ge "$MIN_NODE_VERSION" ]; then
      NODE_BIN=$(which node)
      return 0
    fi
  fi

  return 1
}

install_pnpm() {
  log_info "Installing pnpm..."

  # Use the correct node
  if [ -n "$NODE_BIN" ]; then
    local npm_bin
    npm_bin="$(dirname "$NODE_BIN")/npm"
    if [ -x "$npm_bin" ]; then
      "$npm_bin" install -g pnpm
    else
      npm install -g pnpm
    fi
  else
    npm install -g pnpm
  fi

  log_success "pnpm installed"
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

install_ffmpeg() {
  local pm
  pm=$(detect_package_manager)
  local os
  os=$(detect_os)

  log_info "Installing FFmpeg (for audio/video processing)..."

  case "$pm" in
    apt) sudo apt-get update && sudo apt-get install -y ffmpeg ;;
    dnf) sudo dnf install -y ffmpeg ;;
    yum) sudo yum install -y ffmpeg ;;
    pacman) sudo pacman -S --noconfirm ffmpeg ;;
    brew) brew install ffmpeg ;;
    *)
      log_warn "Cannot install ffmpeg automatically."
      log_info "Please install manually for audio/video support."
      return 0
      ;;
  esac

  log_success "FFmpeg installed"
}

clone_or_update_repo() {
  if [ -d "$CLAWDIS_DIR/.git" ]; then
    log_info "Updating existing clawdis installation..."
    cd "$CLAWDIS_DIR"
    git fetch origin
    git reset --hard origin/main
  else
    log_info "Cloning clawdis repository..."
    rm -rf "$CLAWDIS_DIR"
    git clone "$CLAWDIS_REPO" "$CLAWDIS_DIR"
    cd "$CLAWDIS_DIR"
  fi

  log_success "Repository ready at $CLAWDIS_DIR"
}

build_clawdis() {
  cd "$CLAWDIS_DIR"

  # Find pnpm - might be in nvm bin dir
  local pnpm_bin="pnpm"
  if [ -n "$NODE_BIN" ]; then
    local maybe_pnpm
    maybe_pnpm="$(dirname "$NODE_BIN")/pnpm"
    if [ -x "$maybe_pnpm" ]; then
      pnpm_bin="$maybe_pnpm"
    fi
  fi

  log_info "Installing dependencies..."
  "$pnpm_bin" install

  log_info "Building clawdis..."
  "$pnpm_bin" build

  log_success "Build complete"
}

setup_symlink() {
  log_info "Setting up clawdis command..."

  mkdir -p "$INSTALL_DIR"

  # Create wrapper script with ABSOLUTE path to node
  local wrapper="$INSTALL_DIR/clawdis"
  cat > "$wrapper" << EOF
#!/usr/bin/env bash
exec "$NODE_BIN" "$CLAWDIS_DIR/dist/index.js" "\$@"
EOF
  chmod +x "$wrapper"

  log_success "clawdis command installed at $wrapper"
  log_info "Using node: $NODE_BIN"
}

setup_path() {
  # Add to PATH if not already there
  if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    # Detect shell config file
    local shell_rc=""
    if [ -n "${ZSH_VERSION:-}" ] || [ -f "$HOME/.zshrc" ]; then
      shell_rc="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
      shell_rc="$HOME/.bashrc"
    elif [ -f "$HOME/.bash_profile" ]; then
      shell_rc="$HOME/.bash_profile"
    fi

    if [ -n "$shell_rc" ]; then
      if ! grep -q "$INSTALL_DIR" "$shell_rc" 2>/dev/null; then
        echo "" >> "$shell_rc"
        echo "# Clawdis" >> "$shell_rc"
        echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$shell_rc"
        log_success "Added $INSTALL_DIR to PATH in $shell_rc"
      fi
    fi

    # Also export for current session
    export PATH="$PATH:$INSTALL_DIR"
  fi
}

run_setup() {
  log_info "Running initial setup..."

  cd "$CLAWDIS_DIR"

  # Run setup using our node and pnpm
  local pnpm_bin="pnpm"
  if [ -n "$NODE_BIN" ]; then
    local maybe_pnpm
    maybe_pnpm="$(dirname "$NODE_BIN")/pnpm"
    if [ -x "$maybe_pnpm" ]; then
      pnpm_bin="$maybe_pnpm"
    fi
  fi

  "$pnpm_bin" clawdis setup --quick

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

  log_step "Checking Node.js >= $MIN_NODE_VERSION..."

  if find_node_binary; then
    log_success "Node.js $($NODE_BIN -v) found at $NODE_BIN"
  else
    install_node
  fi

  # Verify we have a valid node
  if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
    log_error "Failed to find or install Node.js $MIN_NODE_VERSION+"
    exit 1
  fi

  # ─────────────────────────────────────────────────────────────────────────
  # Step 3: Check/Install pnpm
  # ─────────────────────────────────────────────────────────────────────────

  log_step "Checking pnpm..."

  # Check if pnpm exists in the node bin directory
  local pnpm_bin="$(dirname "$NODE_BIN")/pnpm"
  if [ -x "$pnpm_bin" ]; then
    log_success "pnpm found at $pnpm_bin"
  elif command_exists pnpm; then
    log_success "pnpm $(pnpm --version) found"
  else
    install_pnpm
  fi

  # ─────────────────────────────────────────────────────────────────────────
  # Step 4: Install FFmpeg (optional but recommended)
  # ─────────────────────────────────────────────────────────────────────────

  log_step "Checking FFmpeg..."

  if command_exists ffmpeg; then
    log_success "FFmpeg found"
  else
    install_ffmpeg || true
  fi

  # ─────────────────────────────────────────────────────────────────────────
  # Step 5: Clone/Update Repository
  # ─────────────────────────────────────────────────────────────────────────

  log_step "Setting up clawdis repository..."

  clone_or_update_repo

  # ─────────────────────────────────────────────────────────────────────────
  # Step 6: Build
  # ─────────────────────────────────────────────────────────────────────────

  log_step "Building clawdis..."

  build_clawdis

  # ─────────────────────────────────────────────────────────────────────────
  # Step 7: Create launcher with absolute node path
  # ─────────────────────────────────────────────────────────────────────────

  log_step "Installing clawdis command..."

  setup_symlink
  setup_path

  # ─────────────────────────────────────────────────────────────────────────
  # Step 8: Run setup
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
  echo -e "  1. ${CYAN}clawdis doctor${NC}       # Check system health"
  echo -e "  2. ${CYAN}clawdis login${NC}        # Link WhatsApp (optional)"
  echo -e "  3. ${CYAN}clawdis gateway${NC}      # Start the gateway server"
  echo ""
  echo -e "  For Discord: Add botToken to ~/.clawdis/clawdis.json"
  echo -e "  For help: ${CYAN}clawdis --help${NC}"
  echo ""

  # Test the installation
  log_step "Verifying installation..."
  if "$INSTALL_DIR/clawdis" --version >/dev/null 2>&1; then
    log_success "clawdis is working!"
  else
    log_warn "clawdis command may need a shell restart"
    log_info "Try: source ~/.bashrc && clawdis doctor"
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
