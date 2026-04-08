# Setup Guide

## Prerequisites

- Node.js 18+ (for the backend and utility scripts)
- For the original Claude Code version: Claude Code installed and configured
- (Optional) Go 1.21+ (for the dashboard TUI)

## Quick Start (5 steps)

### 1. Clone and install

```bash
git clone https://github.com/anomalyco/career-ops.git
cd career-ops
npm install
npx playwright install chromium   # Required for PDF generation
```

### 2. Configure your profile

```bash
cp config/profile.example.yml config/profile.yml
```

Edit `config/profile.yml` with your personal details: name, email, target roles, narrative, proof points.

### 3. Add your CV

Create `cv.md` in the project root with your full CV in markdown format. This is the source of truth for all evaluations and PDFs.

(Optional) Create `article-digest.md` with proof points from your portfolio projects/articles.

### 4. Configure portals

```bash
cp templates/portals.example.yml portals.yml
```

Edit `portals.yml`:
- Update `title_filter.positive` with keywords matching your target roles
- Add companies you want to track in `tracked_companies`
- Customize `search_queries` for your preferred job boards

### 5. Start the backend

```bash
cd server
node src/index.js
```

Then in another terminal, start the frontend:

```bash
cd client
npm run dev
```

Open http://localhost:5173 to use the application.

## Available Endpoints

| Action | Endpoint |
|--------|---------|
| Evaluate an offer | POST /api/evaluate |
| Search for offers | POST /api/scan |
| Process pending URLs | POST /api/pipeline/process |
| Generate a PDF | POST /api/cvgen/pdf |
| Check tracker status | GET /api/stats |

## Verify Setup

```bash
node cv-sync-check.mjs      # Check configuration
node verify-pipeline.mjs     # Check pipeline integrity
```

## Build Dashboard (Optional)

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard            # Opens TUI pipeline viewer
```