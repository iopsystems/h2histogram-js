# Releasing

`h2-histogram` is published to [npm](https://www.npmjs.com/package/h2-histogram)
by the [`npm-publish.yml`](.github/workflows/npm-publish.yml) GitHub Actions
workflow. The workflow runs on pushes to `main` and publishes **only when the
head commit message starts with `Release `** (e.g. the squash-merge of a release
PR). It authenticates with the `NPM_AUTH_TOKEN` repository secret, which must be
a token allowed to publish this package.

## Cutting a release

1. **Bump the version** in [`package.json`](package.json) following
   [semantic versioning](https://semver.org/) (e.g. `1.2.0` → `1.2.1` for fixes,
   `1.3.0` for backwards-compatible features). Do this on a branch and open a PR.
2. **Land a `Release <version>` commit on `main`.** The publish trigger keys off
   the commit *message*, so the commit that lands on `main` (e.g. the squash-merge
   title) must start with `Release `:

   ```
   Release 1.2.0
   ```

   When it hits `main`, the workflow installs, runs the tests, runs
   `npm publish --access public`, and pushes a `v<version>` git tag.
3. **Verify.** Within a minute or so:

   ```bash
   npm view h2-histogram version   # -> 1.2.0
   npm install h2-histogram
   ```

> **Versions are immutable on npm.** A published version can never be
> re-uploaded, only [deprecated](https://docs.npmjs.com/deprecating-and-undeprecating-packages-or-package-versions).
> If you ship a bad release, bump the version and cut a new one.

## Publishing manually

If you need to publish outside CI (e.g. from a maintainer's machine):

```bash
npm install
npm test
npm publish --access public   # add --otp=<code> if your account enforces 2FA
```
