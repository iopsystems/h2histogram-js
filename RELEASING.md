# Releasing

`h2histogram` is published to [npm](https://www.npmjs.com/package/h2histogram)
by the [`npm-publish.yml`](.github/workflows/npm-publish.yml) GitHub Actions
workflow. The workflow runs on every push to `main` and publishes **only when
the head commit message matches `Release <version>` and the `package.json`
version has changed**. It authenticates with the `NPM_AUTH_TOKEN` repository
secret.

## Cutting a release

1. **Bump the version** in [`package.json`](package.json) following
   [semantic versioning](https://semver.org/) (e.g. `1.2.0` → `1.2.1` for fixes,
   `1.3.0` for backwards-compatible features). Do this on a branch and open a PR.
2. **Land a `Release <version>` commit on `main`.** The publish trigger keys off
   the commit *message*, so the commit that updates `package.json` (or the squash
   merge) must be titled exactly:

   ```
   Release 1.2.0
   ```

   When it hits `main`, the workflow builds and runs `yarn publish`, then creates
   a `v1.2.0` git tag.
3. **Verify.** Within a minute or so:

   ```bash
   npm view h2histogram version   # -> 1.2.0
   npm install h2histogram
   ```

> **Versions are immutable on npm.** A published version can never be
> re-uploaded, only [deprecated](https://docs.npmjs.com/deprecating-and-undeprecating-packages-or-package-versions).
> If you ship a bad release, bump the version and cut a new one.

## The `h2-histogram` → `h2histogram` rename (one-time)

This package was previously published as
[`h2-histogram`](https://www.npmjs.com/package/h2-histogram). After the first
`h2histogram` release, deprecate the old package so installs surface a pointer
(run once, from an account with publish rights to the old package):

```bash
npm deprecate h2-histogram "renamed to h2histogram — install h2histogram instead"
```

This does not unpublish the old package (existing installs keep working); it just
attaches a deprecation warning that npm prints on install.
