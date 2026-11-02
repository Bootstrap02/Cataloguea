# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
# Betking-Automation

## Local browser automation proof of concept

Install project dependencies with `npm install`, then run `npm run automation:poc`.
The proof of concept opens the local fixture in a visible Chrome/Chromium browser
and saves a diagnostic screenshot under the ignored `automation/artifacts/` directory.

## Real BetKing read-only inspection

Run `npm run automation:betking:inspect` to open
`https://m.betking.com/en-ng/virtuals/scheduled/leagues/kings-league` in a
visible persistent Chromium profile and inspect the page through the BetKing
adapter. This command is separate from `automation:poc`, which continues to
open only the local fixture. It reports the observed rounds, fixtures, markets,
odds, consent overlays, and access state; it does not select a betting outcome
or submit a wager.

The profile defaults to `~/.cataloguea/betking-profile`; override it with the
absolute `AUTOMATION_BETKING_PROFILE_DIR` path if needed. On a visible terminal,
if sign-in is required, sign in yourself in the browser and press Enter within
the bounded two-minute wait. Credentials are never entered by automation.
Profile data can contain authentication state and must remain private; it is
outside the repository and must not be copied into source control. The
inspection can pause for a user-controlled sign-in with
`npm run automation:betking:inspect -- --manual-login`; without that flag it
uses the existing persistent profile and reports an authentication gate.
The inspection only dismisses a detected consent overlay when it offers an exact
visible choice to reject optional cookies or allow necessary cookies only.
Otherwise, it leaves the overlay unchanged and reports which market tabs could
not be inspected.

### Local automation configuration

Automation defaults to the `local` environment, visible Chrome, a 15-second
browser-launch timeout, a 5-second page timeout, and at most three recovery
attempts. Optional environment overrides are validated by
`automation/config.js`:

| Variable | Default | Limit |
| --- | --- | --- |
| `AUTOMATION_ENVIRONMENT` | `local` | `local` or `test` only |
| `AUTOMATION_BROWSER_HEADLESS` | `false` | `true` or `false` |
| `AUTOMATION_BROWSER_CHANNEL` | `chrome` | `chrome` or `chromium` |
| `AUTOMATION_BROWSER_LAUNCH_TIMEOUT_MS` | `15000` | 1–120000 |
| `AUTOMATION_PAGE_TIMEOUT_MS` | `5000` | 1–120000 |
| `AUTOMATION_NAVIGATION_TIMEOUT_MS` | `10000` | 1–120000 |
| `AUTOMATION_NAVIGATION_WAIT_TIMEOUT_MS` | `500` | 1–120000 |
| `AUTOMATION_CONDITION_TIMEOUT_MS` | `5000` | 1–120000 |
| `AUTOMATION_BETKING_MANUAL_LOGIN_TIMEOUT_MS` | `120000` | 1–120000 |
| `AUTOMATION_ACTION_TIMEOUT_MS` | `1000` | 1–120000 |
| `AUTOMATION_RECOVERY_MAX_ATTEMPTS` | `3` | 1–10 |
| `AUTOMATION_RECOVERY_BASE_DELAY_MS` | `100` | 1–120000 |
| `AUTOMATION_BETKING_PROFILE_DIR` | `~/.cataloguea/betking-profile` | absolute path |

The frontend backend URL already uses `REACT_APP_CATALOGUEA_API_BASE` and
defaults to the existing Render `/betking` endpoint. CRA environment variables
are bundled into browser code, so they must never contain secrets. `.env*` files
are ignored by Git. Automation's live-site feature remains disabled and is not
configurable through environment variables. Pass `diagnosticScreenshotPath` to
an automation controller run to opt into a local screenshot on failure.

## Stage 18 final acceptance summary

Status: PASS for local deterministic validation and strategy safety checks.

Architecture:
- The existing Solo Matrix strategy remains the source of truth for stake and settlement logic.
- Browser automation is isolated to a local visible Chrome fixture and uses explicit controller/state-machine checkpoints.
- Recovery and persistence work only on local-run artifacts; no live betting action is created automatically.

Strategy boundary:
- Stake calculations are not duplicated in automation; strategy-owned instructions are consumed as-is.
- Settlement remains gated on verified result and persisted state.
- Duplicate action and duplicate settlement protection remain active.

Backend and browser:
- Local persistence writes checkpoints and result receipts through the runtime store.
- Browser lifecycle, selectors, navigation, observation, cleanup, and bounded retries are verified by the automation tests.
- No live BetKing automation is enabled or bypassed; the real-site path remains read-only and blocked by compliance constraints.

Testing:
- `npm run build` — passed.
- `npm run automation:poc` — passed.
- `npm run automation:test` — passed (97/97 assertions).
- `git diff --check` — passed.

Real-site status:
- BetKing accessibility is not treated as automatic or permitted by default.
- The project deliberately avoids any live-market interaction, CAPTCHA bypass, or automated wagering path.
- The automation layer is safe to operate only against local fixtures and observed local state until explicit live-site clearance is documented.
