# Contributing to Career-Ops

Thanks for your interest in contributing!

## Before Submitting a PR

**Please open an issue first to discuss the change you'd like to make.** This helps us align on direction before you invest time coding.

PRs without a corresponding issue may be closed if they don't align with the project's architecture or goals.

### What makes a good PR
- Fixes a bug listed in Issues
- Addresses a feature request that was discussed and approved
- Includes a clear description of what changed and why
- Follows the existing code style and project philosophy (simple, minimal, quality over quantity)

## Quick Start

1. Open an issue to discuss your idea
2. Fork the repo
3. Create a branch (`git checkout -b feature/my-feature`)
4. Make your changes
5. Test with a fresh clone (see [docs/SETUP.md](docs/SETUP.md))
6. Commit and push
7. Open a Pull Request referencing the issue

## What to Contribute

**Good first contributions:**
- Add companies to `portals.yml`
- Improve documentation
- Report bugs via [Issues](https://github.com/anomalyco/career-ops/issues)

**Bigger contributions:**
- New evaluation dimensions or scoring logic
- Frontend UI improvements
- New services in backend
- Script improvements

## Guidelines

- Keep the codebase clean and minimal
- Test any new functionality
- Don't commit personal data (cv.md, profile.yml, applications.md, reports/)

## Development

```bash
# Backend
cd server && node src/index.js

# Frontend
cd client && npm run dev

# Health check
curl http://localhost:3001/health
```

## Need Help?

- [Open an issue](https://github.com/anomalyco/career-ops/issues)
- [Read the architecture docs](docs/ARCHITECTURE.md)