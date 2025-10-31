# Crossword Puzzle App

A web application for solving crossword puzzles that works both online and offline.

## 🚀 Quick Start (Fresh Clone)

```bash
# One command to rule them all
make bootstrap
```

This will automatically:
- ✅ Install uv (if not already installed)
- ✅ Create a virtual environment
- ✅ Install all dependencies

Then run:
```bash
make run    # Start the app
make test   # Run tests
```

**📖 See [QUICKSTART.md](QUICKSTART.md) for detailed setup instructions and troubleshooting.**

## 📋 Manual Setup

If you prefer manual setup or already have uv installed:

```bash
# 1. Install uv (if needed)
curl -LsSf https://astral.sh/uv/install.sh | sh
# or: brew install uv

# 2. Setup the project
make setup

# 3. Run the app
make run
```

See [SETUP.md](SETUP.md) for detailed documentation.

## 🛠️ Development Commands

```bash
make help        # Show all available commands
make run         # Run development server
make test        # Run tests
make test-cov    # Run tests with coverage
make clean       # Clean cache files
make deps-update # Update dependencies
```

## Setup Local Dependencies

For offline support, the application requires local copies of Vue.js and Axios. Follow these steps to set up the local dependencies:

1. Create the libraries directory:
```bash
mkdir -p src/crossword/static/lib
```

2. Download the required libraries:
```bash
# Download Vue.js
curl -o src/crossword/static/lib/vue.js https://cdn.jsdelivr.net/npm/vue@2.6.14/dist/vue.js

# Download Axios
curl -o src/crossword/static/lib/axios.min.js https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js
```

These steps ensure that the application works properly in offline mode by using local copies of the required JavaScript libraries instead of CDN versions. 