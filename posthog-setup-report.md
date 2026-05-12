<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Fund-It Expo app. The integration covers the full user journey: authentication, charity discovery and voting, PayPal donations, and account management. PostHog was already partially wired in from a prior session — this run confirmed the full configuration, installed missing peer dependencies (`expo-application`, `expo-device`, `expo-localization`), set the correct environment variable values, and verified complete event coverage across all screens.

**Summary of integration:**
- `posthog-react-native` SDK installed; `src/config/posthog.ts` configured using `expo-constants` / `app.config.js` extras
- `PostHogProvider` wraps the app in `app/_layout.tsx` with manual screen tracking via `posthog.screen()`
- Missing Expo peer dependencies installed: `expo-application`, `expo-device`, `expo-localization`
- `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` set in `.env` with correct project values
- `posthog.identify()` called on login and signup with user ID, email, and username
- `posthog.reset()` called on sign-out and account deletion

| Event | Description | File |
|---|---|---|
| `user_signed_up` | User successfully creates a new account | `app/(auth)/signup.tsx` |
| `user_logged_in` | User successfully logs in (via email or username) | `app/(auth)/login.tsx` |
| `charity_vote_cast` | User casts a vote for a charity in the active voting period | `app/(tabs)/index.tsx` |
| `charity_search_performed` | User searches for a charity by name or EIN | `app/(tabs)/index.tsx` |
| `charity_nomination_submitted` | User nominates a charity for admin review | `app/(tabs)/index.tsx` |
| `donation_initiated` | User starts a PayPal donation flow | `app/(tabs)/donate.tsx` |
| `donation_completed` | User completes a PayPal donation successfully | `app/(tabs)/donate.tsx` |
| `donation_cancelled` | User cancels a PayPal donation mid-flow | `app/(tabs)/donate.tsx` |
| `leaderboard_viewed` | User loads the weekly charity vote leaderboard | `app/(tabs)/poll.tsx` |
| `receipts_viewed` | User views the past donation receipts screen | `app/(tabs)/receipts.tsx` |
| `username_changed` | User successfully updates their username | `app/(tabs)/profile.tsx` |
| `password_changed` | User successfully changes their password | `app/change-password.tsx` |
| `user_signed_out` | User signs out of their account | `app/settings.tsx` |
| `account_deleted` | User permanently deletes their account | `app/settings.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](https://us.posthog.com/project/421123/dashboard/1576426)
- [Signups & Logins over time](https://us.posthog.com/project/421123/insights/jUz9N4rT) — track user acquisition day by day
- [Donation funnel](https://us.posthog.com/project/421123/insights/qrxMYmdM) — see what % of donation attempts complete vs drop off
- [Votes cast per day](https://us.posthog.com/project/421123/insights/yjdNU8iz) — monitor weekly voting engagement
- [Charity search to nomination funnel](https://us.posthog.com/project/421123/insights/UlEL0HkQ) — measure charity discovery → nomination conversion
- [Signup to first vote funnel](https://us.posthog.com/project/421123/insights/Z3kwqCso) — track user activation rate (30-day window)

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-expo/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
