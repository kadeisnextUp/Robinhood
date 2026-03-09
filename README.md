# [REDACTED] - Charity Voting App

A mobile application that democratizes charitable giving through community voting and ad-supported donations.

## Overview

[REDACTED] allows users to vote weekly on their favorite charities from a rotating list. Donations are pooled from ad revenue (users watch ads to contribute) and direct contributions, with all funds going to the winning charity each week. Full transparency is provided through public donation receipts.

## Features

- **Weekly Charity Voting**: Vote for 1 of 5 featured charities each week
- **Ad-Supported Donations**: Watch ads to contribute without spending money
- **Direct Donations**: Option to donate from your own pocket
- **Community Curation**: 2 of 5 weekly charities come from user suggestions with upvoting
- **Transparent Donations**: Public history of all donations with proof/receipts
- **Fair Rotation**: Charities can only win twice per year with cooldown periods

## Tech Stack

### Frontend
- **React Native** with Expo
- **Expo Router** for file-based navigation
- Cross-platform (iOS & Android)

### Backend
- **Supabase** (PostgreSQL database, Authentication, Storage)

### Payment & Monetization (Planned not final)
- **Stripe** for direct donations
- **Google AdMob** for ad revenue

### Target Platforms
- iOS (App Store)
- Android (Google Play Store)





## Development Roadmap

### Month 1: React Native Fundamentals 
- [x] Project setup
- [x] Basic UI components
- [x] Home screen with charity list

### Month 2: Supabase Integration
- [x] Database schema design
- [x] Supabase authentication
- [x] CRUD operations for charities and votes

### Month 3: Core Features
- [x] Voting mechanism (one vote per user per week)
- [x] Weekly rotation logic
- [ ] AdMob integration
- [ ] Vote tracking and results

### Month 4: Payments & Advanced Features
- [ ] Stripe integration for donations
- [ ] Charity suggestion system
- [ ] Upvoting mechanism
- [x] Admin tools for weekly management

### Month 5: Polish & Launch
- [ ] UI/UX improvements
- [ ] Testing (unit, integration, user)
- [ ] App Store submission (iOS)
- [ ] Google Play submission (Android)
- [ ] Privacy policy & terms of service


## Key Features & Rules

### Charity Selection
- 5 charities featured each week
- 2 from top user suggestions (upvoted)
- 3 from curated list (US-based 501(c)(3) organizations)

### Charity Eligibility
- Can win maximum twice per year
- 6-month cooldown after first win
- Ineligible for rest of year after second win
- Resets January 1st

### Voting Rules
- One vote per user per week
- Email verification required
- Voting period: 7 days (week-long rounds)

### Donation Methods
- Watch ads (primary): Users watch rewarded video ads
- Direct donations: Optional monetary contributions
- No maximum donation amount or frequency
- Vote and donation are separate actions

## Contributing

This is a personal learning project, but suggestions and feedback are welcome!


## Acknowledgments

- Built with [Expo](https://expo.dev/)
- Database by [Supabase](https://supabase.com/)

---

**Note**: This is in active development. Features and structure may change as the project evolves.