Prepare a new release for SelfClawy.

Steps:
1. Check `git log --oneline` since last version tag
2. Read CHANGELOG.md to see what version we're on
3. Determine next version (patch/minor/major based on changes)
4. Update version in dashboard/package.json
5. Add CHANGELOG.md entry with all changes since last version
6. Update README.md badges/features if anything major changed
7. Run `cd dashboard && npm test` to confirm green
8. Commit with message: `chore: release v{VERSION}`
9. Report what changed and the new version number — do NOT push or tag without user confirmation

Version rules:
- Patch (x.x.N): bug fixes, small tweaks
- Minor (x.N.0): new features, new routes
- Major (N.0.0): breaking changes, complete redesigns
