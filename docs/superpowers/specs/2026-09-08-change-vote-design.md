# Let users change their vote

**Date:** 2026-09-08
**Status:** Approved, ready for implementation plan

## Problem

A vote is final the moment it is cast. `app/(tabs)/index.tsx` inserts a row into
`votes` and then disables every button on the screen for the rest of the week. A
user who mis-taps, or who reads a charity's description more carefully
afterwards, has no recourse until the next period opens.

## Goal

Let a user move their vote to a different charity on the current ballot, as many
times as they like, until the voting period closes.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Interaction | Direct switch | Tapping another charity moves the vote in one step. The user is never in a vote-less state. |
| Limit | Unlimited while the period is open | It is still one vote, so the tally is never distorted. A cap would not stop deadline sniping anyway, since anyone can simply wait to vote in the first place. |
| Enforcement | RLS policy + client `UPDATE` | Mirrors how a vote is already cast (direct client insert). Postgres enforces the rule, so a modified client cannot bypass it. No new edge function, no deploy. |
| Scope | Tighten `INSERT` too | Casting and changing a vote obey identical rules. |

Explicitly out of scope: withdrawing a vote entirely (leaving the user with no
vote), any per-week cap on changes, and any freeze window before close.

## Observed database state

Confirmed by querying the hosted project on 2026-09-08. This repo has no
migrations, so this was verified rather than inferred.

- RLS is **enabled** on `votes`.
- Policies: `Public can view votes` (SELECT, `true`), `Users can view own votes`
  (SELECT, `auth.uid() = user_id`), `Users can insert own votes` (INSERT,
  `auth.uid() = user_id`).
- **No `UPDATE` policy and no `DELETE` policy exist**, so updates are denied by
  default. This feature is blocked on a schema change, not just app code.
- Constraints: `UNIQUE (user_id, voting_period_id)`, plus FKs on `charity_id`,
  `user_id`, and `voting_period_id`.

The unique constraint means there is exactly one vote row per user per period,
so "change your vote" has an unambiguous target.

### The pre-existing gap this closes

The current `INSERT` policy checks only `auth.uid() = user_id`. It does not
verify that the period is open or that the charity is on the ballot.

An off-ballot vote is largely inert: `close-voting-period` tallies by walking
`voting_period_charities` and counting votes per charity on the ballot
(`supabase/functions/close-voting-period/index.ts:212-226`), so such a vote
cannot win. The gap with real teeth is that a period whose `end_date` has passed
but whose `is_closed` is still `false` will still accept an insert at the
database level. PR #10 fixed that in the client only; the database never got the
rule.

## Design

### 1. Database

Run in the Supabase SQL editor. The rule enforced in both policies: **the row is
yours, its period is open, and the charity is on that period's ballot.**

```sql
begin;

-- Casting a vote: same predicate the change path uses.
drop policy if exists "Users can insert own votes" on public.votes;

create policy "Users can insert own votes"
on public.votes
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.voting_periods p
    join public.voting_period_charities vpc on vpc.voting_period_id = p.id
    where p.id = votes.voting_period_id
      and vpc.charity_id = votes.charity_id
      and p.is_closed = false
      and p.start_date <= now()
      and p.end_date > now()
  )
);

-- Changing a vote.
create policy "Users can change own vote while voting is open"
on public.votes
for update
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.voting_periods p
    where p.id = votes.voting_period_id
      and p.is_closed = false
      and p.start_date <= now()
      and p.end_date > now()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.voting_periods p
    join public.voting_period_charities vpc on vpc.voting_period_id = p.id
    where p.id = votes.voting_period_id
      and vpc.charity_id = votes.charity_id
      and p.is_closed = false
      and p.start_date <= now()
      and p.end_date > now()
  )
);

commit;
```

Deliberate details:

- **Columns are qualified as `votes.charity_id` / `votes.voting_period_id`.**
  Inside those subqueries a bare `charity_id` is ambiguous, because
  `voting_period_charities` has columns of both names.
- **`USING` omits the ballot check; `WITH CHECK` includes it.** `USING` gates
  which existing row may be targeted, `WITH CHECK` validates the row being
  written. Leaving the ballot test out of `USING` lets a user holding a legacy
  off-ballot vote correct it, while `WITH CHECK` guarantees the destination is
  legitimate.
- **No trigger is needed to pin `voting_period_id`.** The obvious hole is
  rewriting last week's vote into this week. `USING` requires the *old* row's
  period to be open, so a closed period's row cannot be targeted at all.
  Ownership is tested on both sides, so a vote cannot be handed to another user.
- **Still no `DELETE` policy.** Direct-switch updates in place, so the user is
  never vote-less and the unique constraint is satisfied continuously.

**Assumption to confirm by test:** those subqueries read `voting_periods` and
`voting_period_charities`, and policy subqueries are subject to *those* tables'
RLS. Both are already read by the client in `loadCharities`, so permissive
SELECT policies must exist — but that is inference. The negative test below is
what proves voting still works after this lands.

### 2. Client (`app/(tabs)/index.tsx`)

**State.** `userHasVoted: boolean` becomes
`userVote: { id: string; charity_id: string } | null`. Everything else follows
from this: the screen currently knows *that* you voted but not *what* you voted
for, which is the missing fact. Type the `useState` explicitly rather than
`useState(null)`, which infers `never` and is the source of much of the repo's
existing `tsc` noise.

**`checkVoteStatus`.** Select `id, charity_id`; switch `.single()` to
`.maybeSingle()`, since `.single()` raises PGRST116 whenever the user has not
voted yet, caught and logged as noise on every first load.

It also stops running its own period query. Today `loadCharities` and
`checkVoteStatus` each independently look up the open period; if those disagree,
the screen shows one period's charities with another period's vote state.
`loadCharities` returns the period id and the effect chains
`checkVoteStatus(periodId)`, giving one source of truth.

**`handleVote`.** Three branches:

- no existing vote — today's insert path, untouched
- same charity — no-op (the button is disabled anyway)
- different charity — confirm `Change your vote from ${previousName} to
  ${charityName}?`, then
  `.update({ charity_id }).eq('id', userVote.id).select('id, charity_id')`

`previousName` comes from the loaded `charities` array, with a fallback for a
vote whose charity is not among the displayed five.

**The `.select()` is load-bearing.** A blocked `INSERT` raises error `42501`. A
blocked `UPDATE` raises nothing — it matches zero rows and reports success. If
the period closes between screen load and tap, a change without `.select()`
would show a success message for a write that never happened. An empty array
means "Voting for this week has ended", followed by a reload. The insert path
needs no `.select()`, but maps `42501` to that same message, since the tightened
INSERT policy makes a just-expired period a reachable failure rather than a
theoretical one.

**Buttons.** `isMyVote` renders `Your Vote ✓`, disabled, `colors.success` fill
with `colors.secondary` text (~8.9:1 contrast; white on that green is ~2.2:1 and
fails). In-flight renders `Saving…` — today it confusingly reads "Your vote"
while the request is still in the air. Every other card renders `Vote ♥` and,
critically, stays **enabled** while the user holds a vote elsewhere.

**Banner.** "You have voted this week. Come back next week to vote again."
becomes "You voted for {name}. Tap another charity to change your vote."

**Analytics.** New `charity_vote_changed` with `from_charity_id`,
`to_charity_id`, `voting_period_id`, alongside the existing `charity_vote_cast`
for first votes, so switching is measurable separately from turnout.

### 3. Unaffected

`poll.tsx`, `profile.tsx`, and `close-voting-period` need no changes. The tally
counts rows per charity at read time, and the row count per user is unchanged.

## Verification

No test framework is configured, so verification is static checks plus manual
testing on a development build.

**Typecheck baseline.** `npx tsc --noEmit 2>&1 | grep "tabs)/index.tsx"` reports
**11 errors today**, before any change. "Clean" therefore cannot mean zero.
Measured on 2026-09-08:

| Line | Error | Fate |
| --- | --- | --- |
| 111 | `err` is `unknown` (`loadCharities` catch) | Stays — untouched code |
| 146 | `err` is `unknown` (`checkVoteStatus` catch) | **Fixed** — this catch is rewritten |
| 262 | `string` not assignable to `SetStateAction<null>` (`setVotingFor`) | **Fixed** — `useState<string \| null>(null)` |
| 267 | `user` is possibly `null` | **Fixed** — guarded before use |
| 283 | `err` is `unknown` (vote catch) | **Fixed** — this catch is rewritten |
| 338, 395, 524, 558, 563, 624 | `colors.textSecondary` does not exist | Stay — repo-wide known issue, unrelated to this feature |

So the acceptance criterion is **7 errors remaining**, all pre-existing: line 111
plus the six `colors.textSecondary` uses. Any error on a line this feature
touches is a regression. `colors.textSecondary` is a genuine runtime bug (an
undefined color), but it is out of scope here and should be fixed repo-wide on
its own branch.

- `npm run lint` passes

Manual, happy path:

1. Cast a vote; the chosen card turns green and reads `Your Vote ✓`
2. Other cards still read `Vote ♥` and remain tappable
3. Switch; the dialog names both the old and new charity
4. Poll tab shows the count moved from one charity to the other
5. Profile still totals one vote (the unique constraint holds)
6. Force-quit and reopen; the correct card is still green, proving
   `checkVoteStatus` reads `charity_id` back

Manual, negative path — this exercises the silent-failure path and matters most:

1. Set the open period's `end_date` into the past via SQL
2. Try to switch: expect "Voting for this week has ended", **not** a success
   message
3. As a user with no vote yet, try to cast one: expect the same message, proving
   the INSERT tightening works
4. Restore `end_date`

## Rollback

Drop the `UPDATE` policy and restore the original INSERT policy
(`with check (auth.uid() = user_id)`). The client change is inert without them:
every `UPDATE` silently matches zero rows, which the code already surfaces as
"Voting for this week has ended".
