import assert from 'node:assert/strict';
import test from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { ConsoleShell } from './operator-console';

const createSchedulerStatus = () => ({
  activeRun: null,
  nextScheduledRunAt: '2026-04-05T01:00:00.000Z',
  startupGraceActive: false,
  maxRunDurationMs: 30 * 60 * 1000,
});

test('ConsoleShell keeps the Runs nav item active for run detail pages', () => {
  const markup = renderToStaticMarkup(
    <ConsoleShell
      title="Run detail"
      subtitle="Scheduled run · 5 Apr 2026, 12:58 pm"
      activePath="/runs"
      currentUser="ed"
      mode="live"
      schedulerStatus={createSchedulerStatus()}
    >
      <div>content</div>
    </ConsoleShell>
  );

  assert.match(markup, /<a[^>]*class="console-nav__link is-active"[^>]*href="\/runs"/);
  assert.doesNotMatch(
    markup,
    /<a[^>]*class="console-nav__link is-active"[^>]*href="\/candidates"/
  );
});
