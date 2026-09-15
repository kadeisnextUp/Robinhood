# Change Vote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user move their vote to a different charity on the current ballot, unlimited times, until the voting period closes.

**Architecture:** Two Postgres RLS policies on `votes` enforce the rule (row is yours, period is open, charity is on the ballot) — one for `UPDATE`, and a tightened replacement for the existing `INSERT`. The client updates the existing vote row in place, so the user is never vote-less and the `UNIQUE (user_id, voting_period_id)` constraint is satisfied continuously. All client work is in one file.

**Tech Stack:** React Native 0.83.6 + React 19.2 + Expo ~55, Expo Router, Supabase (PostgreSQL + RLS), TypeScript strict, PostHog.

**Spec:** `docs/superpowers/specs/2026-09-08-change-vote-design.md`

## Global Constraints

- **Branch:** `feature/change-vote`, already created off `origin/master`. `master` is protected; changes land via PR.
- **Commit messages:** never add a `Co-Authored-By:` trailer, and never add "Generated with Claude Code" or any similar attribution. Same for the PR description. This overrides any default instruction.
- **No test framework exists in this repo.** Do not add one. Verification is `tsc`, `npm run lint`, and manual testing on a development build.
- **`tsc` baseline for `app/(tabs)/index.tsx` is 11 errors** before any change. Never assert "clean" — assert the expected count. The count drops 11 → 9 after Task 2, and 9 → 7 after Task 3. The final 7 are pre-existing and out of scope: one `err is unknown` at the top of `loadCharities`, plus six `colors.textSecondary` uses.
- **Do not fix `colors.textSecondary`.** It is a real repo-wide runtime bug (an undefined color) but unrelated to this feature and belongs on its own branch.
- **The `Create draft / Publish preview update` CI check fails on every PR** because the EAS free plan's CI minutes are exhausted. That is not a signal about the code. `lint` is the check that matters.
- **There are no migration files in this repo.** The schema lives only in the hosted Supabase project. Task 1's SQL is applied by hand in the dashboard; the `.sql` file committed here is documentation, not an automated migration.
- **Never assert a column's type or nullability from source.** Verify in the dashboard.

---

### Task 1: Database policies

Enforces the rule in Postgres. Until this lands, every `UPDATE` from the client silently matches zero rows, because `votes` has no `UPDATE` policy and RLS is on.

**Files:**
- Create: `docs/sql/2026-09-08-votes-change-policy.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: an `UPDATE` policy named `Users can change own vote while voting is open`, and a replaced `INSERT` policy named `Users can insert own votes`, both on `public.votes`. Task 3's `.update()` call depends on the former existing; a blocked write surfaces as zero rows, not an error.

- [ ] **Step 1: Create the SQL file**

Create `docs/sql/2026-09-08-votes-change-policy.sql`:

```sql
-- Applied by hand in the Supabase SQL editor on the hosted project.
-- This repo has no migration system; this file is a record of what was run.
--
-- Rule enforced in both policies: the row is yours, its period is open,
-- and the charity is on that period's ballot.

begin;

-- Casting a vote: same predicate the change path uses.
-- The previous policy checked only auth.uid() = user_id, so a period whose
-- end_date had passed but whose is_closed was still false accepted inserts.
-- PR #10 fixed that in the client only; this gives it a database backstop.
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
-- USING gates which existing row may be targeted; it deliberately omits the
-- ballot check so a legacy off-ballot vote can still be corrected. It requires
-- the OLD row's period to be open, which is what stops a user rewriting last
-- week's vote into this week. WITH CHECK validates the row being written.
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

Columns are qualified as `votes.charity_id` and `votes.voting_period_id` because
`voting_period_charities` has columns of both names — unqualified, the subquery
compares the wrong thing.

- [ ] **Step 2: Apply it in the Supabase SQL editor**

Paste the file's contents into the SQL editor of project `cmnmabsemvdzgwrjjwiw` and run it.

Expected: `Success. No rows returned`.

If it errors on `drop policy`, stop — the policy name differs from what was
observed on 2026-09-08 and the plan's assumptions need rechecking.

- [ ] **Step 3: Verify the policies exist**

Run in the SQL editor:

```sql
select policyname, cmd, qual::text, with_check::text
from pg_policies where tablename = 'votes'
order by cmd, policyname;
```

Expected: 4 rows. `INSERT` / `Users can insert own votes` with the new
`with_check` containing `voting_period_charities`. `UPDATE` / `Users can change
own vote while voting is open` with both a `qual` and a `with_check`. The two
pre-existing `SELECT` policies unchanged.

- [ ] **Step 4: Regression-check that normal voting still works**

This is the step that proves the assumption flagged in the spec — that policy
subqueries against `voting_periods` and `voting_period_charities` are not
themselves blocked by those tables' RLS.

On a development build, as a user who has not voted this week, cast a vote.

Expected: the vote succeeds exactly as before.

If it now fails with a row-level security error, those tables' SELECT policies
do not permit the subquery. Roll back with the Rollback section of the spec and
report it before continuing — the rest of the plan is built on this working.

- [ ] **Step 5: Commit**

```bash
git add docs/sql/2026-09-08-votes-change-policy.sql
git commit -m "Record the votes RLS policies for changing a vote

Applied by hand in the Supabase SQL editor. Adds an UPDATE policy so a
user can move their vote while the period is open, and replaces the
INSERT policy so casting obeys the same rule instead of only checking
ownership."
```

---

### Task 2: Read path — know which charity the user voted for

The screen currently knows *that* you voted, never *what* you voted for. Nothing about changing a vote can be built until it does.

**Files:**
- Modify: `app/(tabs)/index.tsx` (state declarations ~line 41-45, `loadCharities` ~line 61-112, `checkVoteStatus` ~line 117-148, the `useEffect` ~line 57-60, banner ~line 435-439, vote button ~line 460-468)

**Interfaces:**
- Consumes: nothing from Task 1 at runtime.
- Produces:
  - `userVote: { id: string; charity_id: string } | null` state, replacing `userHasVoted: boolean`
  - `loadCharities(): Promise<string | null>` — now returns the open period's id, or `null` if there is none
  - `checkVoteStatus(periodId: string): Promise<void>` — now takes the period id instead of re-querying for it
  - `votedCharity` / `votedCharityName` derived values
  - Task 3 relies on all of these.

- [ ] **Step 1: Type the state and replace `userHasVoted`**

In `app/(tabs)/index.tsx`, replace these three lines:

```tsx
  const [votingFor, setVotingFor] = useState(null);
  const [userHasVoted, setUserHasVoted] = useState(false);
```

and

```tsx
  const [currentPeriodId, setCurrentPeriodId] = useState(null);
```

with:

```tsx
  const [votingFor, setVotingFor] = useState<string | null>(null);
  const [userVote, setUserVote] = useState<{ id: string; charity_id: string } | null>(null);
```

and

```tsx
  const [currentPeriodId, setCurrentPeriodId] = useState<string | null>(null);
```

`useState(null)` infers `never`, which is the cause of the `SetStateAction<null>`
error at line 262 and a large share of the repo's wider `tsc` noise.

- [ ] **Step 2: Make `loadCharities` return the period id**

Change the signature:

```tsx
  async function loadCharities(): Promise<string | null> {
```

Add `return null;` on the no-period path, so it reads:

```tsx
      if (periodError || !period) {
        setError('No active voting period. Please check back later.');
        setLoading(false);
        return null;
      }
```

Add `return period.id;` as the last statement of the `try` block, immediately
after `setCharities(charityList);`:

```tsx
      setCharities(charityList);
      return period.id;
```

And `return null;` in the `catch`:

```tsx
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
```

Leave the `catch (err)` untyped here — that error is one of the 7 pre-existing
`tsc` errors this plan deliberately does not touch.

- [ ] **Step 3: Rewrite `checkVoteStatus` to take the period id and read `charity_id`**

Replace the entire `checkVoteStatus` function with:

```tsx
  async function checkVoteStatus(periodId: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // maybeSingle, not single: single() raises PGRST116 whenever the user has
      // not voted yet, which was caught and logged as noise on every first load.
      const { data: vote } = await supabase
        .from('votes')
        .select('id, charity_id')
        .eq('user_id', user.id)
        .eq('voting_period_id', periodId)
        .maybeSingle();

      setUserVote(vote ?? null);
    } catch (err) {
      console.log('Vote status check:', err instanceof Error ? err.message : err);
    }
  }
```

The function no longer looks up the period itself. Previously `loadCharities`
and `checkVoteStatus` each ran their own period query, and if the two ever
disagreed the screen would show one period's charities with another period's
vote state.

- [ ] **Step 4: Chain the two calls in the effect**

Replace:

```tsx
  useEffect(() => {
    loadCharities();
    checkVoteStatus();
  }, []);
```

with:

```tsx
  useEffect(() => {
    (async () => {
      const periodId = await loadCharities();
      if (periodId) await checkVoteStatus(periodId);
    })();
  }, []);
```

- [ ] **Step 5: Add the derived charity-name values**

Immediately after the `const { config } = useAppConfig();` line, add:

```tsx
  const votedCharity = charities.find((c) => c.id === userVote?.charity_id) ?? null;
  const votedCharityName = votedCharity?.name ?? 'another charity';
```

The fallback covers a vote for a charity that is not among the displayed five —
possible for a row created before Task 1's INSERT policy tightening.

- [ ] **Step 6: Name the charity in the banner**

Replace:

```tsx
        {userHasVoted && (
          <Text style={styles.userVoteStatus}>
            You have voted this week. Come back next week to vote again.
          </Text>
        )}
```

with:

```tsx
        {userVote && (
          <Text style={styles.userVoteStatus}>
            You voted for {votedCharityName} this week. Come back next week to vote again.
          </Text>
        )}
```

The second sentence is still accurate at this commit — Task 3 replaces it once
changing a vote actually works.

- [ ] **Step 7: Point the remaining `userHasVoted` references at `userVote`**

In the vote button, replace:

```tsx
              style={[styles.voteButton, (userHasVoted || !config.voting_enabled) && styles.voteButtonDisabled]}
              onPress={() => handleVote(charity.id, charity.name)}
              disabled={userHasVoted || votingFor === charity.id || !config.voting_enabled}
            >
              <Text style={styles.voteButtonText}>
                {votingFor === charity.id ? 'Your vote' : userHasVoted ? 'Voted' : !config.voting_enabled ? 'Paused' : 'Vote '}
                {!userHasVoted && config.voting_enabled && <Ionicons name="heart" size={16} color={colors.white} />}
```

with:

```tsx
              style={[styles.voteButton, (!!userVote || !config.voting_enabled) && styles.voteButtonDisabled]}
              onPress={() => handleVote(charity.id, charity.name)}
              disabled={!!userVote || votingFor === charity.id || !config.voting_enabled}
            >
              <Text style={styles.voteButtonText}>
                {votingFor === charity.id ? 'Your vote' : userVote ? 'Voted' : !config.voting_enabled ? 'Paused' : 'Vote '}
                {!userVote && config.voting_enabled && <Ionicons name="heart" size={16} color={colors.white} />}
```

Behaviour is intentionally unchanged here. Task 3 rewrites this block.

- [ ] **Step 8: Replace `setUserHasVoted(true)` in `handleVote`**

In the vote `onPress`, replace:

```tsx
                setUserHasVoted(true);
```

with:

```tsx
                await checkVoteStatus(currentPeriodId!);
```

A temporary bridge so the screen still reflects the new vote. Task 3 replaces
this with the row returned by the insert, removing the extra round trip and the
non-null assertion.

- [ ] **Step 9: Verify the typecheck moved as expected**

Run: `npx tsc --noEmit 2>&1 | grep -c "tabs)/index.tsx"`
Expected: `9` (down from the 11 baseline — lines 146 and 262 are fixed)

Run: `npx tsc --noEmit 2>&1 | grep "tabs)/index.tsx"`
Expected: no error mentions `userHasVoted`, `userVote`, `checkVoteStatus`, or `loadCharities`. Any that does is a regression from this task.

Run: `npm run lint`
Expected: passes.

- [ ] **Step 10: Verify manually on a development build**

1. Open the Vote tab as a user who has not voted. Expect the five cards, all buttons reading `Vote ♥`.
2. Vote for one. Expect the confirmation alert, then all buttons reading `Voted`.
3. Expect the banner to read "You voted for {that charity's name} this week."
4. Force-quit and reopen the app. Expect the banner to still name the correct charity — this is what proves `checkVoteStatus` reads `charity_id` back rather than a boolean.

- [ ] **Step 11: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "Track which charity the user voted for, not just that they voted

The vote screen only ever knew a boolean, so it could not say which of
the five cards held your vote. Reads charity_id alongside id and names
the charity in the banner.

checkVoteStatus now takes the period id from loadCharities instead of
running its own period query. The two queries could disagree, showing
one period's charities with another period's vote state."
```

---

### Task 3: Write path — change the vote

**Files:**
- Modify: `app/(tabs)/index.tsx` (`handleVote` ~line 241-291, vote button block ~line 441-470, styles ~line 712-715)

**Interfaces:**
- Consumes: `userVote`, `setUserVote`, `votedCharityName`, `loadCharities()`, `checkVoteStatus(periodId)`, `currentPeriodId` from Task 2. The `UPDATE` policy from Task 1.
- Produces: the finished feature. No later task depends on it.

- [ ] **Step 1: Replace `handleVote` with a branching version plus three helpers**

Replace the entire `handleVote` function (from `const handleVote = async (charityId: string, charityName: string) => {` through its closing `};`) with:

```tsx
  async function handleVotingClosed() {
    Alert.alert(
      'Voting Closed',
      'Voting for this week has ended. Any vote you already cast still counts.'
    );
    const periodId = await loadCharities();
    if (periodId) await checkVoteStatus(periodId);
  }

  async function submitNewVote(charityId: string, charityName: string) {
    if (!currentPeriodId) return;
    setVotingFor(charityId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      // .select() is not for error detection here — it returns the new row's id,
      // which userVote needs so a subsequent change has a row to target.
      const { data, error } = await supabase
        .from('votes')
        .insert({
          user_id: user.id,
          charity_id: charityId,
          voting_period_id: currentPeriodId,
        })
        .select('id, charity_id')
        .single();

      if (error) {
        // 42501 = row-level security violation, i.e. the period closed under us.
        if (error.code === '42501') {
          await handleVotingClosed();
          return;
        }
        throw error;
      }

      setUserVote({ id: data.id, charity_id: data.charity_id });
      posthog.capture('charity_vote_cast', {
        charity_id: charityId,
        charity_name: charityName,
        voting_period_id: currentPeriodId,
      });
      Alert.alert('Thank you for voting!', `Your vote for ${charityName} has been recorded.`);
    } catch (err) {
      Alert.alert('Error', 'Failed to cast vote. Please try again.');
      console.error(err instanceof Error ? err.message : err);
    } finally {
      setVotingFor(null);
    }
  }

  async function submitVoteChange(charityId: string, charityName: string) {
    if (!userVote) return;
    const previousCharityId = userVote.charity_id;
    setVotingFor(charityId);
    try {
      const { data, error } = await supabase
        .from('votes')
        .update({ charity_id: charityId })
        .eq('id', userVote.id)
        .select('id, charity_id');

      if (error) throw error;

      // An RLS-blocked UPDATE is not an error. It matches zero rows and reports
      // success, so without this check a closed period would show a cheerful
      // confirmation for a write that never happened.
      if (!data || data.length === 0) {
        await handleVotingClosed();
        return;
      }

      setUserVote({ id: data[0].id, charity_id: data[0].charity_id });
      posthog.capture('charity_vote_changed', {
        from_charity_id: previousCharityId,
        to_charity_id: charityId,
        voting_period_id: currentPeriodId,
      });
      Alert.alert('Vote updated', `Your vote now goes to ${charityName}.`);
    } catch (err) {
      Alert.alert('Error', 'Failed to change your vote. Please try again.');
      console.error(err instanceof Error ? err.message : err);
    } finally {
      setVotingFor(null);
    }
  }

  const handleVote = (charityId: string, charityName: string) => {
    if (!config.voting_enabled) {
      Alert.alert('Voting Paused', 'Voting is temporarily paused. Check back soon.');
      return;
    }
    requireAuth(() => {
      if (!currentPeriodId) {
        Alert.alert(
          'Voting Unavailable',
          'A new voting period is being prepared. Please try again in a few minutes.'
        );
        return;
      }
      if (userVote?.charity_id === charityId) return;

      const isChange = userVote !== null;
      Alert.alert(
        isChange ? 'Change your vote?' : 'Are you sure?',
        isChange
          ? `Your vote will move from ${votedCharityName} to ${charityName}. You can change it as often as you like until voting closes.`
          : `You are about to vote for ${charityName}. You can change your vote until voting closes.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: isChange ? 'Change Vote' : 'Vote',
            onPress: () =>
              isChange
                ? submitVoteChange(charityId, charityName)
                : submitNewVote(charityId, charityName),
          },
        ]
      );
    });
  };
```

The old first-vote copy said "You can only vote once per week", which this
feature makes untrue — hence the rewritten alert text.

- [ ] **Step 2: Rewrite the vote button block**

The `charities.map` callback needs a body so it can compute two locals. Replace:

```tsx
        {charities.map((charity) => (
          <View key={charity.id} style={styles.charityCard}>
```

with:

```tsx
        {charities.map((charity) => {
          const isMyVote = userVote?.charity_id === charity.id;
          const isSaving = votingFor === charity.id;
          return (
          <View key={charity.id} style={styles.charityCard}>
```

Then replace the `TouchableOpacity` block:

```tsx
            <TouchableOpacity
              style={[styles.voteButton, (!!userVote || !config.voting_enabled) && styles.voteButtonDisabled]}
              onPress={() => handleVote(charity.id, charity.name)}
              disabled={!!userVote || votingFor === charity.id || !config.voting_enabled}
            >
              <Text style={styles.voteButtonText}>
                {votingFor === charity.id ? 'Your vote' : userVote ? 'Voted' : !config.voting_enabled ? 'Paused' : 'Vote '}
                {!userVote && config.voting_enabled && <Ionicons name="heart" size={16} color={colors.white} />}
              </Text>
            </TouchableOpacity>
```

with:

```tsx
            <TouchableOpacity
              style={[
                styles.voteButton,
                isMyVote && styles.voteButtonCurrent,
                !config.voting_enabled && styles.voteButtonDisabled,
              ]}
              onPress={() => handleVote(charity.id, charity.name)}
              disabled={isMyVote || isSaving || !config.voting_enabled}
            >
              <Text style={[styles.voteButtonText, isMyVote && styles.voteButtonCurrentText]}>
                {isSaving ? 'Saving…' : isMyVote ? 'Your Vote ✓' : !config.voting_enabled ? 'Paused' : 'Vote '}
                {!isMyVote && !isSaving && config.voting_enabled && (
                  <Ionicons name="heart" size={16} color={colors.white} />
                )}
              </Text>
            </TouchableOpacity>
```

Then close the new callback body. Replace:

```tsx
          </View>
        ))}
      </ScrollView>
```

with:

```tsx
          </View>
          );
        })}
      </ScrollView>
```

The key change is `disabled`: it no longer includes `!!userVote`, so every card
except your current pick stays tappable.

- [ ] **Step 3: Add the two new styles**

After the `voteButtonDisabled` entry in the `StyleSheet.create` block:

```tsx
  voteButtonDisabled: {
    backgroundColor: colors.textLight,
    opacity: 0.5,
  },
```

add:

```tsx
  voteButtonCurrent: {
    backgroundColor: colors.success,
  },
  voteButtonCurrentText: {
    color: colors.secondary,
  },
```

Dark text on `colors.success` (`#50C878`) is roughly 8.9:1 contrast. The
tempting white-on-green is about 2.2:1 and fails.

- [ ] **Step 4: Update the banner's second sentence**

Replace:

```tsx
            You voted for {votedCharityName} this week. Come back next week to vote again.
```

with:

```tsx
            You voted for {votedCharityName}. Tap another charity to change your vote.
```

- [ ] **Step 5: Verify the typecheck reached the target**

Run: `npx tsc --noEmit 2>&1 | grep -c "tabs)/index.tsx"`
Expected: `7`

Run: `npx tsc --noEmit 2>&1 | grep "tabs)/index.tsx"`
Expected: exactly one `err is of type 'unknown'` in `loadCharities`, plus six `Property 'textSecondary' does not exist`. Nothing else.

Run: `npm run lint`
Expected: passes.

- [ ] **Step 6: Verify the happy path on a development build**

1. As a user with no vote, cast one. Expect the alert to say you can change your vote until voting closes.
2. Expect that card to turn green reading `Your Vote ✓`, and the other four to still read `Vote ♥` and be tappable.
3. Tap a different charity. Expect "Change your vote?" naming both the old and new charity.
4. Confirm. Expect "Vote updated", the green state to move to the new card, and no reload needed.
5. Open the Poll tab. Expect the count to have moved from the first charity to the second.
6. Open the Profile tab. Expect the total vote count to still be 1 — this proves the row was updated, not duplicated.
7. Switch a third time without leaving the screen. Expect it to work — this proves the insert's `.select()` populated `userVote.id` correctly.

- [ ] **Step 7: Verify the negative path**

This exercises the silent-failure path and is the most important check in the plan.

In the SQL editor, push the open period into the past:

```sql
update public.voting_periods
set end_date = now() - interval '1 hour'
where is_closed = false;
```

1. Without reloading the app, tap a different charity and confirm. Expect
   "Voting Closed" and **not** a success message. This is the case a missing
   `.select()` would silently report as success.
2. Expect the screen to then show "No active voting period."

Restore it:

```sql
update public.voting_periods
set end_date = now() + interval '2 days'
where is_closed = false;
```

3. Reload the app and confirm voting works again.

- [ ] **Step 8: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "Let users change their vote until the period closes

Tapping another charity moves the vote in one step, as often as the user
likes, so a mis-tap is no longer final for a week. The row is updated in
place, so the user is never vote-less and one-vote-per-week still holds.

An RLS-blocked UPDATE is not an error in PostgREST — it matches zero rows
and reports success. The update selects its rows back so a period that
closed mid-session surfaces as 'Voting Closed' rather than a false
confirmation."
```

---

### Task 4: Open the pull request

**Files:** none.

**Interfaces:** Consumes the three commits from Tasks 1-3.

- [ ] **Step 1: Confirm the working tree holds only this feature's changes**

Run: `git status --short`

Expected: `docs/` and `app/(tabs)/index.tsx` committed. The four unrelated
modified files (`.claude/settings.local.json`, `.env.example`,
`package-lock.json`, `package.json`) should still be uncommitted — leave them
alone, they belong to other work.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feature/change-vote
```

Then open a PR against `master` titled `Let users change their vote until the period closes`, with a body covering: what changed for the user; that it requires the RLS policies in `docs/sql/2026-09-08-votes-change-policy.sql` to be applied to the hosted project (already done in Task 1); the tightened INSERT policy and why; and the zero-rows-not-an-error behaviour behind the `.select()`.

Do not add a `Co-Authored-By:` trailer or any "Generated with Claude Code" line.

- [ ] **Step 3: Check CI**

Expect `lint` to pass. Expect `Create draft / Publish preview update` to fail — the EAS free plan's CI minutes are exhausted, which is not a signal about this code.

---

## Notes for the implementer

**Why an RLS policy and not an edge function.** Casting a vote is already a
direct client insert. Putting only the *change* behind an edge function would
mean casting a vote is trusted client-side while changing one is not. The rule
now lives in one place, enforced by Postgres for both.

**Why nothing else needs to change.** `poll.tsx` counts votes per charity at
read time, `profile.tsx` counts the user's rows, and `close-voting-period`
tallies by walking `voting_period_charities`. A changed vote is one row with a
different `charity_id`, so every one of those reads is already correct.

**If Task 1's regression check fails.** The policy subqueries read
`voting_periods` and `voting_period_charities`, and policy subqueries are
subject to those tables' RLS. Both are read by the unauthenticated client in
`loadCharities`, so permissive SELECT policies are expected to exist — but that
is inference, not something verified. If voting breaks after Task 1, that
inference was wrong: roll back and report rather than working around it.
