.PHONY: setup setup-app setup-brain dev test build clean

# One-time setup: installs JS deps and the Python brain's virtualenv.
setup: setup-app setup-brain

setup-app:
	cd app && npm install

setup-brain:
	cd brain && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt

# Opens the Boogeyman window. Starts Vite, builds Rust, and Rust spawns the Python brain.
dev:
	cd app && npm run tauri dev

test:
	cd brain && .venv/bin/pytest -q
	cd app/src-tauri && cargo clippy -- -D warnings
	cd app && npm run build

# Release build (.deb + AppImage). Bundling the Python brain comes in Phase 4.
build:
	cd app && npm run tauri build

clean:
	rm -rf app/dist app/src-tauri/target brain/.venv
