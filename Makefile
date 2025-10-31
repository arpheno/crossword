.PHONY: help install dev sync test test-cov lint format clean run docker-build docker-run check-uv

# Default target
.DEFAULT_GOAL := help

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

check-uv: ## Check if uv is installed
	@command -v uv >/dev/null 2>&1 || { \
		echo "$(RED)Error: uv is not installed!$(NC)"; \
		echo "$(YELLOW)Install it with:$(NC)"; \
		echo "  curl -LsSf https://astral.sh/uv/install.sh | sh"; \
		echo "  or: brew install uv"; \
		exit 1; \
	}

help: ## Show this help message
	@echo "$(BLUE)Crossword App - Available targets:$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)First time setup: make setup$(NC)"

install: check-uv ## Install dependencies with uv
	@echo "$(BLUE)Installing dependencies...$(NC)"
	uv sync

dev: check-uv ## Install with dev dependencies
	@echo "$(BLUE)Installing with dev dependencies...$(NC)"
	uv sync --all-extras

sync: dev ## Sync all dependencies (alias for dev)

venv: check-uv ## Create virtual environment
	@echo "$(BLUE)Creating virtual environment with uv...$(NC)"
	@if [ -d ".venv" ]; then \
		echo "$(YELLOW).venv already exists, skipping creation$(NC)"; \
	else \
		uv venv; \
		echo "$(GREEN)Virtual environment created!$(NC)"; \
	fi

test: ## Run tests
	@echo "$(BLUE)Running tests...$(NC)"
	uv run pytest tests/ -v

test-cov: ## Run tests with coverage
	@echo "$(BLUE)Running tests with coverage...$(NC)"
	uv run pytest tests/ --cov=src --cov-report=term-missing --cov-report=html

test-watch: ## Run tests in watch mode
	@echo "$(BLUE)Running tests in watch mode...$(NC)"
	uv run pytest-watch tests/

lint: ## Run linting checks
	@echo "$(BLUE)Running linting checks...$(NC)"
	@echo "$(YELLOW)Note: Add ruff or flake8 to pyproject.toml for linting$(NC)"

format: ## Format code (add ruff/black if needed)
	@echo "$(BLUE)Formatting code...$(NC)"
	@echo "$(YELLOW)Note: Add ruff or black to pyproject.toml for formatting$(NC)"

clean: ## Clean up cache and build files
	@echo "$(BLUE)Cleaning up...$(NC)"
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".coverage" -exec rm -f {} + 2>/dev/null || true
	find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	rm -rf .uv_cache 2>/dev/null || true
	@echo "$(GREEN)Cleaned!$(NC)"

run: ## Run the Flask development server
	@echo "$(BLUE)Starting Flask development server...$(NC)"
	uv run python run.py

run-prod: ## Run with uvicorn (production mode)
	@echo "$(BLUE)Starting production server with uvicorn...$(NC)"
	uv run uvicorn src.crossword.app:app --host 0.0.0.0 --port 5000

shell: ## Open Python shell with project context
	@echo "$(BLUE)Opening Python shell...$(NC)"
	uv run python

docker-build: ## Build Docker image
	@echo "$(BLUE)Building Docker image...$(NC)"
	docker build -t crossword-app .

docker-run: ## Run Docker container
	@echo "$(BLUE)Running Docker container...$(NC)"
	docker run -p 5000:5000 crossword-app

deps-update: ## Update dependencies
	@echo "$(BLUE)Updating dependencies...$(NC)"
	uv lock --upgrade

deps-list: ## List installed dependencies
	@echo "$(BLUE)Installed dependencies:$(NC)"
	uv pip list

deps-tree: ## Show dependency tree
	@echo "$(BLUE)Dependency tree:$(NC)"
	uv pip tree

check: test lint ## Run all checks (tests + linting)

setup: check-uv venv dev ## Complete setup: create venv and install deps
	@echo ""
	@echo "$(GREEN)════════════════════════════════════════$(NC)"
	@echo "$(GREEN)  Setup complete! 🎉$(NC)"
	@echo "$(GREEN)════════════════════════════════════════$(NC)"
	@echo ""
	@echo "$(BLUE)Next steps:$(NC)"
	@echo "  $(GREEN)make run$(NC)      - Start the development server"
	@echo "  $(GREEN)make test$(NC)     - Run tests"
	@echo "  $(GREEN)make help$(NC)     - Show all available commands"
	@echo ""

bootstrap: ## Bootstrap project from scratch (installs uv if missing)
	@echo "$(BLUE)Bootstrapping project...$(NC)"
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "$(YELLOW)uv not found. Installing uv...$(NC)"; \
		if command -v brew >/dev/null 2>&1; then \
			echo "$(BLUE)Using Homebrew to install uv...$(NC)"; \
			brew install uv; \
		elif command -v curl >/dev/null 2>&1; then \
			echo "$(BLUE)Using installer script...$(NC)"; \
			curl -LsSf https://astral.sh/uv/install.sh | sh; \
			echo "$(YELLOW)Please restart your shell or run: source ~/.bashrc (or ~/.zshrc)$(NC)"; \
		else \
			echo "$(RED)Error: Cannot install uv automatically. Please install manually:$(NC)"; \
			echo "  https://github.com/astral-sh/uv"; \
			exit 1; \
		fi; \
	else \
		echo "$(GREEN)uv is already installed$(NC)"; \
	fi
	@$(MAKE) setup

.PHONY: all
all: clean dev test ## Clean, install, and test
