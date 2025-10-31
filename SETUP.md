# Quick Start with uv

This project uses [uv](https://github.com/astral-sh/uv) for fast, reliable Python package management.

## First Time Setup (Fresh Clone)

**Option 1: Automatic (Recommended)**
```bash
make bootstrap
```
This will:
- Install uv automatically if it's missing (via Homebrew or curl)
- Create the virtual environment
- Install all dependencies

**Option 2: Manual**
```bash
# Install uv first
curl -LsSf https://astral.sh/uv/install.sh | sh
# or on macOS:
brew install uv

# Then setup the project
make setup
```

## Prerequisites

Install uv:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Or on macOS:
```bash
brew install uv
```

## Setup

```bash
# Quick setup (creates venv and installs deps)
make setup

# Or step by step:
make venv    # Create virtual environment
make dev     # Install all dependencies including dev tools
```

## Common Commands

```bash
make help        # Show all available commands
make run         # Run the development server
make test        # Run tests
make test-cov    # Run tests with coverage
make clean       # Clean cache and build files
make deps-update # Update dependencies
```

## Development Workflow

1. **First time setup:**
   ```bash
   make setup
   ```

2. **Run the app:**
   ```bash
   make run
   ```

3. **Run tests:**
   ```bash
   make test
   ```

4. **Update dependencies:**
   ```bash
   make deps-update
   ```

## Makefile Targets

Run `make help` to see all available targets:

- `install` - Install dependencies with uv
- `dev` - Install with dev dependencies
- `test` - Run tests
- `test-cov` - Run tests with coverage
- `run` - Run the Flask development server
- `clean` - Clean up cache and build files
- `docker-build` - Build Docker image
- `docker-run` - Run Docker container

## Manual uv Commands

If you prefer to use uv directly:

```bash
# Create virtual environment
uv venv

# Activate virtual environment
source .venv/bin/activate  # On macOS/Linux
.venv\Scripts\activate     # On Windows

# Install dependencies
uv sync

# Install with dev dependencies
uv sync --all-extras

# Run a command in the virtual environment
uv run python run.py
uv run pytest

# Add a new dependency
uv add <package-name>

# Add a dev dependency
uv add --dev <package-name>

# Update dependencies
uv lock --upgrade
```
