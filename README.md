# Noa-Chan Assist

Noa-Chan Assist is an AI-powered desktop application built with Tauri, Svelte, and a Bun-powered Node.js backend. It utilizes OpenRouter to provide intelligent, autonomous assistance, featuring a proactive mode, system notifications, memory management, and various tools.

## Features
- **Interactive Desktop Chat:** A clean, modern UI powered by Svelte and Tauri.
- **Local Memory Systems:** Long-term memory and vector-based semantic search for past conversations.
- **Proactive Interaction:** Noa-chan will organically check in on you if you've been idle, complete with adjustable intervals.
- **System Tool Execution:** Ability to run terminal commands, manage files, read the active window, and more.
- **Customizable Fallbacks:** Fully robust API system that automatically falls back through free OpenRouter models if one fails.

---

## 🚀 Setup and Installation Tutorial

To run this repository out of the box on a new machine, follow these instructions carefully.

### 1. Prerequisites
You must have the following installed on your system:
- [Bun](https://bun.sh/) (JavaScript runtime and package manager)
- [Node.js](https://nodejs.org/) (Required by some backend dependencies)
- [Rust](https://www.rust-lang.org/tools/install) (Required to compile the Tauri desktop application)
- C++ Build Tools (On Windows, install Visual Studio with "Desktop development with C++" workload for Rust compilation)

### 2. Clone the Repository
Clone the repository to your local machine:
```sh
git clone https://github.com/rwbu69/noachanassist.git
cd noachanassist
```

### 3. Install Dependencies
You need to install dependencies for both the backend root and the frontend desktop app:
```sh
# Install backend dependencies
bun install

# Install frontend dependencies
cd desktop-app
bun install

# Return to root directory
cd ..
```

### 4. Running the Application (Development Mode)
Noa-Chan uses a sidecar architecture. The backend is compiled into a standalone binary by Bun, which is then launched automatically by the Tauri frontend.

To start the application, simply run:
```sh
bun run dev
```

**What this command does:**
1. It runs `bun build` to compile the backend (`src/index.js`) into an executable file (`noa-backend-x86_64-pc-windows-msvc.exe`) inside the Tauri directory.
2. It launches the Svelte Vite development server.
3. It builds and launches the Tauri window.

### 5. Configuration
When the app opens for the first time:
1. Open the **Settings** menu.
2. Enter your [OpenRouter API Key](https://openrouter.ai/).
3. Configure your username, weather city, proactive mode interval, and any custom models.
4. Click **[ SAVE ]**.

The backend will instantly sync and Noa-chan will greet you!
