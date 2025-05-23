.PHONY: test-frontend

test-frontend:
	@echo "Running frontend JavaScript tests..."
	npm test -- --run # --run ensures Vitest runs once and exits

# If you have backend tests (e.g., pytest), you can add a target for them too
# .PHONY: test-backend
# test-backend:
# 	@echo "Running backend Python tests..."
# 	poetry run pytest

# And a target to run all tests
# .PHONY: test
# test:
# 	test-backend
# 	test-frontend 