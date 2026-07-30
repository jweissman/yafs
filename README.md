# yafs

See [the product and architecture decision record](docs/ADR.md) for the working
vision, use cases, and milestone acceptance criteria.

A tiny virtual filesystem service with some interesting properties

- Organize content structurally with symlinks and union mounts
- Accessible over ftp/telnet/ssh with a simple CLI interpreter
- `.yafsmeta` dotfile which can hint plugins to activate in directories
  * `agents` plugin turns every text file in the folder into a prompt for a long-lived interactive agentic workflow
  * `git` plugin shallow-clones and readonly-mirrors a repo/branch (keeping it up to date)
  * `github` plugin can setup a cached mirror over PRs and issues from a gh repo
  * `docker` plugin treats subdirectories as image-names and executes them, mounting whatever content is provided
