-- Applied by hand in the Supabase SQL editor on the hosted project.
-- This repo has no migration system; this file is a record of what was run.
--
-- Apply only AFTER deploying the close-voting-period version that uses
-- nextPeriodWindow(now) from schedule.ts. The previous version dated any period
-- created after a close to the following Monday, so a daily run that closed a
-- period Monday missed would have opened a round up to six days in the future.
--
-- No secrets are written here: both statements rewrite or copy the existing job
-- commands, which already carry the x-cron-secret header.

begin;

-- 1. Timeout. net.http_post defaults to timeout_milliseconds := 5000, and past close
-- runs only reached the next-period insert 2.2 to 2.9 seconds in, with several
-- steps still to go. Give it 30s.
select cron.alter_job(
  jobid,
  command := replace(
    command,
    'body := ''{}''::jsonb',
    'body := ''{}''::jsonb, timeout_milliseconds := 30000'
  )
)
from cron.job
where jobname in ('close-voting-period-edt', 'close-voting-period-est')
  and command not like '%timeout_milliseconds%';

-- 2. Daily retry, 06:05 UTC (after both Monday jobs). The function closes only
-- periods whose end_date has passed and creates a period only when none is open,
-- so on a normal day this does nothing. After a bad Monday the app gets a round
-- back within a day instead of a week.
select cron.schedule(
  'close-voting-period-daily',
  '5 6 * * *',
  (select command from cron.job where jobname = 'close-voting-period-edt')
);

commit;

-- Check: all three jobs, with the timeout, and nothing else changed.
select jobname, schedule, active,
       command like '%timeout_milliseconds := 30000%' as has_timeout,
       command like '%x-cron-secret%' as sends_cron_secret
from cron.job
where jobname like 'close-voting-period%'
order by jobname;
