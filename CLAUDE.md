# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See `AGENTS.md` for additional Expo/EAS-specific documentation links and AI agent guidelines.

## What This App Does

A mobile charity voting platform in active development where users vote weekly on 5 rotating charities. Donation pools (direct PayPal donations) and ad revenue go entirely to the weekly winning charity. Charities have fairness rules: max 2 wins/year, 6-month cooldown after first win. The project is built publicly with a repository on GitHub. For the MVP all that is left is to finalize the donation process by a user and putting ads in the app. Currently working on connecting paypal to the app.

## Commands

```bash
npx expo start                  # Start dev server
npx expo start --clear          # Clear cache and start
npx expo install <package>      # Install with compatible versions
npx expo install --fix          # Fix incompatible package versions
npx expo doctor                 # Check project health
npm run lint                    # Run ESLint
npm run draft                   # Preview build + OTA update (EAS workflow)
npm run development-builds      # Create development builds (EAS workflow)
npm run deploy                  # Deploy to production (EAS workflow)
```

No unit test framework is configured. Manual testing uses development builds (`eas build:dev`). After adding config plugins or native packages, a new development build is required.

## Architecture

**Stack:** React Native 0.81.4 + Expo 54 + Expo Router (file-based routing) + Supabase (PostgreSQL, Auth, Edge Functions) + PayPal payments + EAS CI/CD.

**Routing structure:**
- `app/_layout.tsx` — Root layout wrapping entire app in `<AuthProvider>`
- `app/(auth)/` — Login and signup screens (unauthenticated)
- `app/(tabs)/` — Main tab screens: vote (home), donate, poll, receipts, profile
- `app/admin.tsx` — Admin panel for managing voting periods and charity counts
- `app/settings.tsx` — User settings

**Auth:** `contexts/authContext.tsx` provides session via `useContext(AuthContext)`. The `useRequireAuth()` hook (`hooks/useRequiredAuth.ts`) gates voting and donating — redirects to `/(auth)/login` if no session. Session persisted via AsyncStorage.

**Backend (Supabase Edge Functions — Deno runtime):**
- `create-voting-period` — Selects 5 charities (excluding last 3 periods' charities) and opens a new 7-day voting period
- `close-voting-period` — Closes expired periods, counts votes, sets winner
- `create-paypal-order` — Validates amount ≥ $1.00, creates PayPal order (sandbox), returns approval URL
- `capture-paypal-order` — Captures PayPal payment, writes to `user_donations` table

**PayPal donation flow:**
1. Donate screen → `create-paypal-order` edge function → PayPal approval URL
2. Deep link redirect to `charityfund://donate/success`
3. `capture-paypal-order` edge function → records to `user_donations`

**Key database tables:** `voting_periods`, `voting_period_charities`, `charities`, `votes`, `user_donations`

**Theme/styling:** `src/theme/` (colors, typography, spacing). UI components in `src/components/`.


## Environment Variables

Required in `.env`:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` (edge functions — sandbox currently)
- `SUPABASE_SERVICE_ROLE_KEY` (edge functions)

## EAS Build Profiles

Defined in `eas.json`: `development`, `development-simulator`, `preview`, `production` (auto-increment version).
