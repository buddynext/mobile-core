# @buddynext/mobile-core

The shared React Native shell used by every Wbcom app: auth, gate, API clients,
theme, contribution registry and UI primitives.

## Why this is its own repo

It used to live inside `buddynext-app` at `packages/mobile-core`, and every app
consumed it with a relative path:

```json
"@wbcom/mobile-core": "file:../buddynext-app/packages/mobile-core"
```

That works on a laptop with both repos checked out side by side, and nowhere
else. **EAS cloud builds upload only the app directory**, so `../buddynext-app`
does not exist on the build server and the dependency cannot resolve — no app
in the portfolio could produce a store build. Six apps depended on that path.

There was also no version boundary: whatever was on disk was what all six apps
got, so a breaking change here landed in six products at once with nothing to
stage it behind.

## Install

Scoped to `@buddynext` because GitHub Packages requires the npm scope to match
the repository owner. Add to the consuming app's `.npmrc`:

```
@buddynext:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

then depend on a real version:

```json
"@buddynext/mobile-core": "^1.0.0"
```

CI and EAS need `NPM_TOKEN` set to a GitHub token with `read:packages`.

## Publishing

Ships TypeScript source — there is no build step, and every consumer transpiles
it through `babel-preset-expo`. Bump the version, then:

```
npm publish
```

Breaking changes get a major bump. The point of the version boundary is that
apps adopt on their own schedule, so do not expect consumers to track `latest`.

## History

Extracted from `buddynext-app` with `git subtree split`, so the full commit
history and `git blame` are preserved.
