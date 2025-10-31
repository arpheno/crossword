## 🎯 After Cloning This Repo

### Quick Start
```bash
make bootstrap
```

### What Gets Set Up
- [x] uv package manager (installed automatically if missing)
- [x] Python 3.13 virtual environment in `.venv/`
- [x] All production dependencies
- [x] All development dependencies (pytest, coverage, etc.)
- [x] Lockfile for reproducible builds (`uv.lock`)

### Verify Installation
```bash
make test      # Should pass all tests
make run       # Should start server on http://localhost:5000
```

### Common Next Steps

1. **Start developing:**
   ```bash
   source .venv/bin/activate  # Optional: activate venv
   make run                   # Start dev server
   ```

2. **Run tests while developing:**
   ```bash
   make test        # Run once
   make test-cov    # With coverage report
   ```

3. **Add a new dependency:**
   ```bash
   uv add package-name           # Production dependency
   uv add --dev package-name     # Dev dependency
   ```

4. **Update dependencies:**
   ```bash
   make deps-update
   ```

### Troubleshooting

**"uv: command not found"**
```bash
# Install uv manually
curl -LsSf https://astral.sh/uv/install.sh | sh
# or
brew install uv
```

**"make: command not found"** (Windows)
- Use Git Bash or WSL
- Or run commands directly: `uv sync --all-extras`

**Virtual environment not activating**
- You don't need to activate! Commands use `uv run` automatically
- But if you want: `source .venv/bin/activate` (Unix) or `.venv\Scripts\activate` (Windows)

### Available Commands
Run `make help` to see all available targets.
