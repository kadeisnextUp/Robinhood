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
