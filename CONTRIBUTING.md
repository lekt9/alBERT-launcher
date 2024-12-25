# Contributing to alBERT-launcher

First off, thank you for considering contributing to alBERT-launcher! It's people like you that make alBERT-launcher such a great tool.

## Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct, which is to treat all contributors with respect and maintain a harassment-free experience for everyone.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the issue list as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* Use a clear and descriptive title
* Describe the exact steps which reproduce the problem
* Provide specific examples to demonstrate the steps
* Describe the behavior you observed after following the steps
* Explain which behavior you expected to see instead and why
* Include screenshots if possible

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* A clear and descriptive title
* A detailed description of the proposed enhancement
* Examples of how the enhancement would be used
* Any potential drawbacks or considerations

### Pull Requests

* Fill in the required template
* Do not include issue numbers in the PR title
* Include screenshots and animated GIFs in your pull request whenever possible
* Follow the TypeScript and React styleguides
* Include thoughtfully-worded, well-structured tests
* Document new code
* End all files with a newline

## Development Process

1. Fork the repo and create your branch from `main`
2. Run `pnpm install` to install dependencies
3. Make your changes
4. Run tests with `pnpm test`
5. Push to your fork and submit a pull request

## Project Structure

- `/src/main` - Electron main process code
- `/src/renderer` - React frontend code
- `/src/preload` - Preload scripts for Electron

## Setup Development Environment

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

## Style Guide

* Use TypeScript for all new code
* Follow the existing code style
* Use meaningful variable names
* Comment complex logic
* Keep functions small and focused

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
