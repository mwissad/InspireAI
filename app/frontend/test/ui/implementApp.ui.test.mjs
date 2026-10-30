import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { closeBrowser, lowContrast, openUi, onStep, startMvp, toAppAccess } from './uiSupport.mjs';

const { appShellCatalog } = createRequire(import.meta.url)('../../../backend/lib/appShell.js');
const SHELL = appShellCatalog();
const OWNER = ['owner', 'example.com'].join('@');
const SHOTS = process.env.WIZARD_SHOTS || '';

test.after(closeBrowser);

const next = (page) => page.getByRole('button', { name: 'Next' }).click();
const footerErrors = (page) => page.locator('[role="alert"] p').allTextContents();

async function toDelivery(page) {
  await onStep(page, 'Choose');
  await next(page);
  await onStep(page, 'Data');
  await next(page);
  await onStep(page, 'Results');
  await next(page);
  await onStep(page, 'Delivery');
}

async function startWhenReady(page) {
  await startMvp(page);
  await page.getByRole('heading', { name: 'Build', exact: true }).waitFor();
}

function submittedSpec(made) {
  const inserts = made.sqlCalls.filter((c) => String(c.sql).includes('INSERT INTO') && (c.parameters || []).some((p) => p.name === 'spec'));
  assert.equal(inserts.length, 1);
  return JSON.parse(inserts[0].parameters.find((p) => p.name === 'spec').value);
}

const rgb = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return `rgb(${parseInt(full.slice(0, 2), 16)}, ${parseInt(full.slice(2, 4), 16)}, ${parseInt(full.slice(4, 6), 16)})`;
};

test('the App starts on with its Genie Agent locked on and the alert off, App access starts on the App\'s service principal, per-user hides record decisions, and App look previews every style, layout and palette', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page, made } = ui;
  try {
    await toDelivery(page);
    const genie = page.getByRole('checkbox', { name: /^Genie Agent/ });
    const box = (name) => page.getByRole('checkbox', { name: new RegExp(`^${name}`) });
    assert.deepEqual([await box('Dashboard').isChecked(), await genie.isChecked(), await box('App ').isChecked(), await box('Alert').isChecked()],
      [true, true, true, false], 'the dashboard, Genie Agent and App start on, the alert off');
    assert.equal(await genie.isDisabled(), true, 'the App locks the Genie Agent');
    await page.locator('[data-output="genie_space"]').getByText('Ask Genie in the App needs a Genie Agent.').waitFor();
    await toAppAccess(page);
    const access = page.getByRole('region', { name: 'App access' });
    const perUser = access.getByRole('radio', { name: /^Sensitive data: each person signs in as themselves \(per-user\)/ });
    const internal = access.getByRole('radio', { name: /^Internal data: the App uses its own service principal/ });
    assert.deepEqual([await perUser.isChecked(), await internal.isChecked()], [false, true], 'the App starts reading as its service principal');
    await access.getByText('Everyone sees the same rows, read with the App\'s own access.', { exact: false }).waitFor();
    assert.deepEqual(await access.getByRole('checkbox').evaluateAll((boxes) => boxes.map((b) => [b.closest('label').querySelector('span span').textContent, b.checked])),
      [['Let people edit data', false], ['Record decisions', false], ['Send alerts', false]], 'every option starts off, and none is a download');
    await access.locator('label', { hasText: 'Record decisions' })
      .getByText('They own, track and dismiss each flagged record (the action tracker).', { exact: false }).waitFor();
    assert.equal(await access.locator('label', { hasText: 'Let people edit data' }).getByText('action tracker', { exact: false }).count(), 0);
    const offers = access.getByRole('note', { name: 'What every App offers' });
    await offers.getByText('Refresh now: in a shared App anyone who can open it can refresh it; in an App where each person sees only their own data, only you can. '
      + 'One refresh runs at a time.', { exact: true }).waitFor();
    await offers.getByText('The App offers no data downloads.', { exact: true }).waitFor();
    await access.getByRole('checkbox', { name: /^Record decisions/ }).check();
    await perUser.check();
    assert.equal(await access.getByRole('checkbox', { name: /^Record decisions/ }).count(), 0, 'per-user hides record decisions');
    assert.equal(await access.getByRole('checkbox', { name: /^Send alerts/ }).count(), 0, 'per-user hides alerts');
    const hidden = access.getByRole('note', { name: 'Why some options are hidden' });
    await hidden.getByText(/: it offers no recorded decisions, no alerts and no chart image export\.$/).waitFor();
    assert.doesNotMatch(await hidden.textContent(), /download/i);
    await offers.getByText('The App offers no data downloads.', { exact: true }).waitFor();
    const replace = access.getByRole('radiogroup', { name: 'Should a new run replace edited records?' });
    assert.equal(await replace.count(), 0, 'the replace question waits for edits');
    await access.getByRole('checkbox', { name: /^Let people edit data/ }).check();
    await replace.waitFor();
    assert.deepEqual([await replace.getByRole('radio', { name: /^No \(default\)/ }).isChecked(), await replace.getByRole('radio', { name: /^Yes/ }).isChecked()],
      [true, false], 'a new run keeps edited records by default');
    await next(page);
    await onStep(page, 'App look');
    const look = page.getByRole('region', { name: 'App look' });
    assert.deepEqual(await look.locator('[data-preview^="style-"]').evaluateAll((els) => els.map((e) => e.dataset.preview)), ['style-a', 'style-b', 'style-c']);
    assert.deepEqual(await look.locator('[data-preview^="layout-"]').evaluateAll((els) => els.map((e) => e.dataset.preview)),
      ['layout-sidebar', 'layout-tabs', 'layout-home']);
    await look.getByText('Only style A matches the Lakeview dashboard look.').waitFor();
    const lookTab = (name) => look.getByRole('tab', { name, exact: true }).click();
    assert.equal(await look.getByRole('radio', { name: /^Style A/ }).isChecked(), true, 'style A is the default');
    await lookTab('Layout');
    assert.equal(await look.getByRole('radio', { name: /^Sidebar/ }).isChecked(), true, 'the sidebar is the default');
    await lookTab('Palette');
    assert.deepEqual(await look.locator('[data-swatch]').evaluateAll((els) => els.map((e) => e.dataset.swatch)), SHELL.palettes, 'the 13 shell palettes, in order');
    assert.equal(await look.getByRole('radio', { name: 'Default', exact: true }).isChecked(), true);
    const mode = look.getByRole('group', { name: 'Light or dark' });
    assert.equal(await mode.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed'), 'true');
    const nordic = SHELL.palette_colors.find((p) => p.id === 'nordic');
    await lookTab('Style');
    await look.getByText('Style C', { exact: true }).click();
    await lookTab('Palette');
    await look.getByText('Nordic', { exact: true }).click();
    await mode.getByRole('button', { name: 'Dark' }).click();
    await lookTab('Layout');
    await look.getByText('Home cards', { exact: true }).click();
    assert.equal(await look.locator('[data-preview="layout-home"]').evaluate((el) => getComputedStyle(el).backgroundColor), rgb(nordic.dark.base.bg),
      'the previews draw with the palette and the mode picked');
    assert.equal(await look.locator('[data-preview="style-c"]').evaluate((el) => getComputedStyle(el).backgroundColor), rgb(nordic.dark.base.card));
    await lookTab('Charts');
    await look.locator('[data-chart-kind="split"] input').check();
    await look.locator('[data-app-sample][data-sample-charts="trend,bars,split,pareto"]').waitFor();
    await lookTab('Pages');
    const alertsTile = look.locator('[data-app-page="alerts"]');
    assert.deepEqual([await alertsTile.getByRole('switch').isChecked(), await alertsTile.getByRole('switch').isDisabled()], [false, true],
      'a per-user App has Alerts off and locked');
    await look.getByText(/^Alerts are off: /).waitFor();
    await look.locator('[data-app-page="runs"]').getByRole('switch').uncheck();
    await startWhenReady(page);
    const spec = submittedSpec(made);
    assert.deepEqual([spec.outputs.app, spec.outputs.genie_space, spec.outputs.app_access], [true, true, 'user']);
    assert.deepEqual(spec.outputs.app_look, { style: 'c', layout: 'home', palette: 'nordic', theme: 'dark' });
    assert.deepEqual(spec.outputs.app_options, { modify: true, replace_edits: false, decisions: false, alerts: false });
    assert.deepEqual(spec.outputs.app_charts, ['trend', 'bars', 'split', 'pareto'], 'the build gets the kinds of chart picked');
    assert.deepEqual(spec.outputs.app_pages, { runs: false, impact: true }, 'and the pages turned off');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('App look has Style, Palette, Layout, Charts and Pages tabs over a sample page that follows every pick, lists only the pages this App gets, and reads at 4.5 to 1 in every style, palette, mode and page', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' } });
  const { page } = ui;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await toDelivery(page);
    await toAppAccess(page);
    await next(page);
    await onStep(page, 'App look');
    const look = page.getByRole('region', { name: 'App look' });
    const tabs = look.getByRole('tablist', { name: 'App look sections' });
    const tab = (name) => tabs.getByRole('tab', { name, exact: true });
    const sample = look.locator('[data-app-sample]');
    const shown = (attrs) => look.locator(`[data-app-sample]${Object.entries(attrs).map(([k, v]) => `[data-${k}="${v}"]`).join('')}`).waitFor();
    await look.locator('[data-swatch="mono"]').waitFor({ state: 'attached' });
    assert.deepEqual(await tabs.getByRole('tab').allTextContents(), ['Style', 'Palette', 'Layout', 'Charts', 'Pages']);
    assert.equal(await tab('Style').getAttribute('aria-selected'), 'true');
    assert.equal(await look.getByRole('tabpanel').count(), 1, 'only the chosen tab panel shows');
    await shown({ 'app-sample': 'fix', 'sample-style': 'a', 'sample-layout': 'sidebar', 'sample-palette': 'default', 'sample-theme': 'light' });
    assert.equal(await sample.getAttribute('role'), 'img');
    assert.equal(await sample.getAttribute('aria-label'), 'Sample App page: Things to fix, in Style A, Sidebar, the Default palette and Light mode');
    for (const text of ['To fix', 'Could save', 'Fixed so far', 'Saved so far', 'Why Inspire flagged it', 'Value fell 38% below its 8 week average', 'Ask Genie', 'Shared view']) {
      await sample.getByText(text, { exact: true }).first().waitFor();
    }
    await look.getByText(/^Sample data\. Your App shows the records of this use case in the look you pick\.$/).waitFor();

    const def = SHELL.palette_colors.find((p) => p.id === 'default');
    const topBar = () => sample.locator(':scope > div').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.equal(await topBar(), rgb(def.light.base.card), 'style A draws a plain top bar');
    await look.getByText('Style B', { exact: true }).click();
    await shown({ 'sample-style': 'b' });
    assert.equal(await topBar(), rgb(def.light.base['brand-wash']), 'style B tints the top bar');
    await tab('Palette').click();
    await look.getByRole('group', { name: 'Light or dark' }).getByRole('button', { name: 'Dark' }).click();
    await shown({ 'sample-style': 'b', 'sample-theme': 'dark' });
    assert.equal(await sample.evaluate((el) => getComputedStyle(el).backgroundColor), rgb(def.dark.base.bg), 'the sample draws in the mode picked');

    await tab('Palette').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await tab('Layout').getAttribute('aria-selected'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Layout', 'the arrow keys move focus with the tab');
    await page.keyboard.press('End');
    assert.equal(await tab('Pages').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await tab('Style').getAttribute('aria-selected'), 'true', 'the arrows wrap');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await tab('Pages').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await tab('Style').getAttribute('aria-selected'), 'true');

    await tab('Layout').click();
    await look.getByText('Top tabs', { exact: true }).click();
    await shown({ 'sample-layout': 'tabs', 'app-sample': 'fix' });
    assert.equal(await sample.getByText('Use case', { exact: true }).count(), 0, 'top tabs drop the side menu');
    await look.getByText('Home cards', { exact: true }).click();
    await shown({ 'sample-layout': 'home' });
    await sample.getByText('128 to fix · $412K at stake', { exact: true }).waitFor();

    await tab('Charts').click();
    await shown({ 'app-sample': 'charts', 'sample-charts': 'trend,bars,pareto' });
    await look.getByText(/^Pick the kinds of chart the App draws, at least 3\. Genie draws one of each/).waitFor();
    const kinds = () => look.locator('[data-chart-kind]').evaluateAll((els) => els.map((e) => {
      const input = e.querySelector('input');
      return [e.dataset.chartKind, input.checked, input.disabled];
    }));
    assert.deepEqual(await kinds(), [['trend', true, true], ['bars', true, true], ['split', false, false], ['pareto', true, true], ['scatter', false, false]],
      'Inspire\'s pick starts ticked, and none of the 3 can be unticked');
    assert.deepEqual(await look.locator('[data-chart-kind] .font-semibold').allTextContents(),
      ['Trend over time', 'Bars by segment', 'Share of a whole', 'Biggest first', 'Two measures']);
    await look.getByText("Inspire's pick: trend over time, bars by segment and biggest first.", { exact: true }).waitFor();
    assert.equal(await look.getByRole('button', { name: "Use Inspire's pick" }).count(), 0);
    assert.equal(await sample.getByText('Explain', { exact: true }).count(), 3, 'every sample chart has its Explain button');
    await look.locator('[data-chart-kind="scatter"] input').check();
    await shown({ 'sample-charts': 'trend,bars,pareto,scatter' });
    await sample.getByText('Money against records', { exact: true }).waitFor();
    assert.deepEqual((await kinds()).map(([, on, locked]) => [on, locked]), [[true, false], [true, false], [false, false], [true, false], [true, false]]);
    await look.getByText('Keep at least 3 kinds.', { exact: true }).waitFor();
    await look.locator('[data-chart-kind="trend"] input').uncheck();
    await shown({ 'sample-charts': 'bars,pareto,scatter' });
    assert.equal(await look.locator('[data-chart-kind="bars"] input').isDisabled(), true, 'back at 3, none can be unticked');
    await look.getByRole('button', { name: "Use Inspire's pick" }).click();
    await shown({ 'sample-charts': 'trend,bars,pareto' });
    for (const kind of ['split', 'scatter']) await look.locator(`[data-chart-kind="${kind}"] input`).check();
    await shown({ 'sample-charts': 'trend,bars,split,pareto,scatter' });
    assert.equal(await sample.getByText('Explain', { exact: true }).count(), 5);

    await tab('Pages').click();
    const pages = look.getByRole('group', { name: 'Pages of the App' });
    const pageNames = () => pages.getByRole('button').allTextContents();
    const blurb = look.locator('[data-page-blurb]');
    const pageState = () => look.locator('[data-app-page]').evaluateAll((els) => els.map((e) => {
      const toggle = e.querySelector('[role="switch"]');
      return [e.dataset.appPage, toggle ? (toggle.checked ? 'on' : 'off') : e.querySelector('p').textContent, e.querySelector('button').disabled];
    }));
    assert.deepEqual(await pageNames(), ['Things to fix', 'Runs', 'Alerts', 'Impact', 'Ask Genie']);
    assert.deepEqual(await pageState(), [['fix', 'Always on', false], ['runs', 'on', false], ['alerts', 'off', true], ['impact', 'on', false], ['genie', 'Always on', false]],
      'Things to fix and Ask Genie are always on, and Alerts waits for Send alerts');
    assert.equal(await pages.getByRole('button', { name: /^Things to fix/ }).getAttribute('aria-pressed'), 'true');
    assert.match(await blurb.textContent(), /^What needs action: the totals, the charts you pick, and every flagged record with the reason Inspire flagged it\.$/,
      'no edits and no decisions while those App options are off');
    await look.locator('[data-app-page="impact"]').getByRole('switch').uncheck();
    await shown({ 'app-sample': 'fix' });
    assert.equal(await sample.getByText('Impact', { exact: true }).count(), 0, 'the sample drops Impact when it is off');
    assert.equal(await pages.getByRole('button', { name: /^Impact/ }).isDisabled(), true);
    await look.locator('[data-app-page="impact"]').getByRole('switch').check();
    await sample.getByText('Impact', { exact: true }).first().waitFor();
    await look.locator('[data-app-page="alerts"]').getByRole('switch').check();
    assert.equal(await pages.getByRole('button', { name: /^Alerts/ }).isDisabled(), false, 'the Alerts switch turns on Send alerts');
    await look.locator('[data-app-page="alerts"]').getByRole('switch').uncheck();
    await pages.getByRole('button', { name: /^Runs/ }).click();
    await shown({ 'app-sample': 'runs' });
    assert.equal(await blurb.textContent(), 'Every run of the notebook: when it ran, the data it read and the records it flagged.');
    await sample.getByText('What it covered', { exact: true }).waitFor();
    await pages.getByRole('button', { name: /^Ask Genie/ }).click();
    await shown({ 'app-sample': 'genie' });
    await sample.getByText('Why is R-1042 flagged?', { exact: true }).waitFor();
    await tab('Style').click();
    await shown({ 'app-sample': 'fix' });
    await tab('Pages').click();
    await shown({ 'app-sample': 'genie' });

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await onStep(page, 'App access');
    const access = page.getByRole('region', { name: 'App access' });
    await access.getByRole('checkbox', { name: /^Record decisions/ }).check();
    await access.getByRole('checkbox', { name: /^Send alerts/ }).check();
    await next(page);
    await onStep(page, 'App look');
    await tab('Pages').click();
    assert.deepEqual(await pageNames(), ['Things to fix', 'Runs', 'Alerts', 'Impact', 'Ask Genie']);
    assert.equal(await pages.getByRole('button', { name: /^Things to fix/ }).getAttribute('aria-pressed'), 'true');
    assert.match(await blurb.textContent(), /People own, track and dismiss each flagged record\.$/);
    for (const name of ['Style', 'Palette', 'Layout', 'Charts', 'Pages']) {
      await tab(name).click();
      const box = await measure(page, `app-look-all-options-${name.toLowerCase()}`);
      assert.ok(box.scroll <= box.client + 1, `${name} with every App option on: the step needs no scroll (${box.scroll} > ${box.client})`);
    }

    const clipped = () => sample.evaluate((root) => {
      const out = new Set();
      for (const el of root.querySelectorAll('*')) {
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const bottom = el.getBoundingClientRect().bottom;
        for (let a = el.parentElement; a; a = a.parentElement) {
          const edge = a.getBoundingClientRect().bottom;
          if ((a === root || getComputedStyle(a).overflowY !== 'visible') && bottom > edge + 1) out.add(`${el.textContent.trim().slice(0, 40)} +${Math.round(bottom - edge)}px`);
          if (a === root) break;
        }
      }
      return [...out];
    });
    const cut = [];
    for (const layout of ['Sidebar', 'Top tabs', 'Home cards']) {
      for (const style of ['A', 'B', 'C']) {
        await tab('Style').click();
        await look.getByText(`Style ${style}`, { exact: true }).click();
        await tab('Layout').click();
        await look.getByText(layout, { exact: true }).click();
        await shown({ 'app-sample': 'fix', 'sample-style': style.toLowerCase() });
        for (const line of await clipped()) cut.push(`${layout}/${style}/fix ${line}`);
        await tab('Charts').click();
        await shown({ 'app-sample': 'charts' });
        for (const line of await clipped()) cut.push(`${layout}/${style}/charts ${line}`);
        await tab('Pages').click();
        for (const control of ['Runs', 'Alerts', 'Impact', 'Ask Genie', 'Things to fix']) {
          await pages.getByRole('button', { name: new RegExp(`^${control}`) }).click();
          await shown({ 'app-sample': { Runs: 'runs', Alerts: 'alerts', Impact: 'impact', 'Ask Genie': 'genie', 'Things to fix': 'fix' }[control] });
          for (const line of await clipped()) cut.push(`${layout}/${style}/${control} ${line}`);
        }
      }
    }
    assert.deepEqual(cut, [], 'no sample text is cut off at the bottom, in any layout, style or page');

    const views = [['fix', 'Palette'], ['charts', 'Charts'], ['runs', 'Runs'], ['alerts', 'Alerts'], ['impact', 'Impact'], ['genie', 'Ask Genie']];
    const low = [];
    let measured = 0;
    for (const style of ['a', 'b', 'c']) {
      for (const theme of ['light', 'dark']) {
        for (const palette of SHELL.palettes) {
          await tab('Style').click();
          await look.getByText(`Style ${style.toUpperCase()}`, { exact: true }).click();
          await tab('Palette').click();
          await look.getByRole('group', { name: 'Light or dark' }).getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light' }).click();
          await look.locator(`[data-swatch="${palette}"]`).click();
          for (const [view, control] of views) {
            if (view === 'charts') await tab('Charts').click();
            else if (view !== 'fix') {
              if (await tab('Pages').getAttribute('aria-selected') !== 'true') await tab('Pages').click();
              await pages.getByRole('button', { name: new RegExp(`^${control}`) }).click();
            }
            await shown({ 'app-sample': view, 'sample-style': style, 'sample-theme': theme, 'sample-palette': palette });
            const result = await lowContrast(page, ['[data-app-sample]']);
            measured += result.checked;
            assert.ok(result.checked >= 15, `${style}/${theme}/${palette}/${view}: measured ${result.checked} elements`);
            for (const line of result.low) low.push(`${style}/${theme}/${palette}/${view} ${line}`);
          }
        }
      }
    }
    console.log(`App look sample: ${3 * 2 * SHELL.palettes.length * views.length} pages, ${measured} text elements measured, ${low.length} below 4.5:1`);
    assert.deepEqual(low, [], 'every sample text reads at 4.5:1 or better');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('the App reads Lakebase by default when the workspace has it, a per-user App reads Delta tables, a 403 says why, and a 404 says why with no choice', async () => {
  const probe = (data, status) => ({ me: { userName: OWNER, displayName: 'Owner' }, responses: { 'GET /api/2.0/postgres/projects': [data, status] } });
  const toAccess = async (page) => {
    await toDelivery(page);
    await page.getByRole('checkbox', { name: /^App / }).check();
    await toAppAccess(page);
    return page.getByRole('region', { name: 'App access' });
  };
  const choice = (access) => access.getByRole('group', { name: 'Where does the App read its data?' });
  const radios = async (group) => group.getByRole('radio').evaluateAll((els) => els.map((e) => [e.value, e.checked, e.disabled]));
  const toStart = async (page) => {
    await next(page);
    await onStep(page, 'App look');
    await startWhenReady(page);
  };

  let ui = await openUi('wizard', probe({ projects: [] }, 200));
  try {
    const access = await toAccess(ui.page);
    const group = choice(access);
    await group.getByRole('status').waitFor({ state: 'detached' });
    await group.getByText('Lakebase (Loads instantly)', { exact: true }).waitFor();
    await group.getByText('Delta Tables (Takes a few seconds to load)', { exact: true }).waitFor();
    assert.equal(await access.getByRole('radio', { name: /^Internal data/ }).isChecked(), true, 'the App reads as its service principal with no click');
    assert.deepEqual(await radios(group), [['lakebase', true, false], ['delta', false, false]], 'Lakebase is the default, with no click');
    await access.getByRole('radio', { name: /^Sensitive data/ }).check();
    assert.deepEqual(await radios(group), [['lakebase', false, true], ['delta', true, false]], 'a per-user App reads Delta tables');
    await group.getByRole('note', { name: 'Why Lakebase is off' }).getByText(/does not carry Unity Catalog row filters, column masks or grants/).waitFor();
    await access.getByRole('radio', { name: /^Internal data/ }).check();
    assert.deepEqual(await radios(group), [['lakebase', true, false], ['delta', false, false]], 'back to a shared App, Lakebase comes back');
    await toStart(ui.page);
    assert.equal(submittedSpec(ui.made).outputs.app_backend, 'lakebase');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }

  ui = await openUi('wizard', probe({ projects: [] }, 200));
  try {
    const access = await toAccess(ui.page);
    await access.getByRole('radio', { name: /^Internal data/ }).check();
    await choice(access).getByRole('status').waitFor({ state: 'detached' });
    await choice(access).getByText('Delta Tables (Takes a few seconds to load)', { exact: true }).click();
    await toStart(ui.page);
    assert.equal(submittedSpec(ui.made).outputs.app_backend, 'delta', 'a pick of Delta is kept');
  } finally {
    await ui.close();
  }

  ui = await openUi('wizard', probe({ message: 'PERMISSION_DENIED: Lakebase is not enabled for this user' }, 403));
  try {
    const access = await toAccess(ui.page);
    await access.getByRole('radio', { name: /^Internal data/ }).check();
    const group = choice(access);
    await group.getByRole('note', { name: 'Why Lakebase is off' })
      .getByText('Lakebase is on in this workspace, but you cannot use it: PERMISSION_DENIED: Lakebase is not enabled for this user').waitFor();
    assert.deepEqual(await radios(group), [['lakebase', false, true], ['delta', true, false]]);
    await toStart(ui.page);
    assert.equal(submittedSpec(ui.made).outputs.app_backend, 'delta');
  } finally {
    await ui.close();
  }

  ui = await openUi('wizard', probe({ error_code: 'ENDPOINT_NOT_FOUND' }, 404));
  try {
    const access = await toAccess(ui.page);
    await access.getByRole('radio', { name: /^Internal data/ }).check();
    const group = choice(access);
    await group.getByRole('note', { name: 'Why the App reads Delta tables' })
      .getByText('The App reads Delta tables through the SQL warehouse, because this workspace does not have Lakebase.', { exact: true }).waitFor();
    assert.equal(await group.getByRole('radio').count(), 0, 'a workspace without Lakebase shows no choice, only the reason');
    await toStart(ui.page);
    assert.equal(submittedSpec(ui.made).outputs.app_backend, 'delta');
  } finally {
    await ui.close();
  }
});

test('Where results live picks a catalog and a schema from Unity Catalog, offers the default back, and Next checks the table live', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' }, catalogs: ['main', 'sales'], schemas: { main: ['inspire', 's'], sales: ['mvp', 'gold'] } });
  const { page, made } = ui;
  try {
    await onStep(page, 'Choose');
    await next(page);
    await onStep(page, 'Data');
    assert.equal(await page.getByLabel('Output table').count(), 0, 'the result table left the Data step');
    await next(page);
    await onStep(page, 'Results');
    const step = page.getByRole('region', { name: 'Where the result table lives' });
    await step.getByRole('heading', { name: 'Where should the result table live?' }).waitFor();
    const catalog = step.getByLabel('Catalog');
    const schema = step.getByLabel('Schema');
    await catalog.locator('option[value="sales"]').waitFor({ state: 'attached' });
    assert.deepEqual([await catalog.inputValue(), await schema.inputValue(), await step.getByLabel('Table name').inputValue()], ['main', 'inspire', 'n01_u01_s42_out']);
    await step.getByText("Inspire's default").waitFor();
    await step.getByRole('note', { name: 'Moving the result table' }).getByText('Moving the table later copies its history to the new table and keeps the old one.').waitFor();
    await catalog.selectOption('sales');
    assert.equal(await schema.inputValue(), '', 'a new catalog asks for its schema again');
    await schema.locator('option[value="gold"]').waitFor({ state: 'attached' });
    assert.deepEqual(await schema.locator('option').evaluateAll((os) => os.map((o) => o.value)), ['', 'gold', 'mvp']);
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page), ['pick a catalog and a schema, and name the result table']);
    await schema.selectOption('mvp');
    await step.getByLabel('Table name').fill('churn_out');
    await step.getByText('sales.mvp.churn_out', { exact: true }).waitFor();
    made.state.access = [];
    await next(page);
    await page.locator('[role="alert"]').waitFor();
    assert.deepEqual(await footerErrors(page), ['catalog sales does not exist or you have no access to it']);
    await onStep(page, 'Results');
    await step.getByRole('button', { name: 'Use the default, main.inspire.n01_u01_s42_out' }).click();
    assert.deepEqual([await catalog.inputValue(), await schema.inputValue()], ['main', 'inspire']);
    made.state.access = [
      { level: 'catalog', privilege: 'OWNER', principal: 'admins', mine: 'false', me: OWNER },
      { level: 'catalog', privilege: 'USE_CATALOG', principal: 'account users', mine: 'true', me: OWNER },
      { level: 'schema', privilege: 'OWNER', principal: OWNER, mine: 'true', me: OWNER },
    ];
    await catalog.selectOption('sales');
    await schema.locator('option[value="mvp"]').waitFor({ state: 'attached' });
    await schema.selectOption('mvp');
    await next(page);
    await onStep(page, 'Delivery');
    await startWhenReady(page);
    assert.equal(submittedSpec(made).config.result_table, 'sales.mvp.n01_u01_s42_out');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

const target = (sid, uc, name, outputs, version = 1) => ({
  session_id: sid, use_case_id: uc, spec_version: version, status: 'ready', updated_at: '2026-10-26T00:00:00Z', asset_status: null,
  spec_json: JSON.stringify({ use_case_id: uc, use_case_name: name, outputs }), dashboard_id: null, genie_space_id: null, app_name: null,
});

const MERGE_STATE = {
  me: { userName: OWNER, displayName: 'Owner' },
  registry: [
    { ...target('42', 'N01-U02', 'Forecast demand', { app: true, app_access: 'sp', app_look: { style: 'b', layout: 'tabs', palette: 'ocean', theme: 'light' } }),
      app_name: 'ops-desk', dashboard_id: 'd1' },
    { ...target('42', 'N01-U03', 'Score suppliers', { app: true, app_access: 'user' }), app_name: 'care-desk' },
    { ...target('42', 'N01-U04', 'Plan stock', { app: true, app_access: 'sp' }), app_name: 'someone-else' },
  ],
  appsByName: {
    'ops-desk': { name: 'ops-desk', description: 'Inspire use case N01-U02 (session 42): Forecast demand' },
    'care-desk': { name: 'care-desk', description: 'Inspire use case N01-U03 (session 42): Score suppliers' },
    'someone-else': { name: 'someone-else', description: 'A tool the team built by hand' },
    'predict-churn': null,
  },
};

const JOIN_NOTE = 'The App this use case joins';
const appTile = (page) => page.locator('[data-output="app"] label').first().textContent();
const stepLabels = (page) => page.locator('ol li').allTextContents();
const ownersShown = async (page) => {
  const toggle = page.getByRole('button', { name: 'Advanced settings' });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  return page.getByLabel('App owners (comma separated)').count();
};

const PLACE_UC = { id: 'N01-U01', use_case: 'Predict churn', business_domain: 'Customer', genie_instruction: '## Parameters\n| top_k | text | 25 | Top K |\n' };
const PLACE_SCOPE = [
  { session_id: '42', use_case_id: 'N01-U02', business: 'Acme', domain: 'Customer' },
  { session_id: '42', use_case_id: 'N01-U03', business: 'Acme', domain: 'Finance' },
  { session_id: '42', use_case_id: 'N01-U05', business: 'Acme', domain: 'Customer' },
  { session_id: '77', use_case_id: 'N04-U01', business: 'Globex', domain: 'Customer' },
];
const placeStep = (page) => page.getByRole('region', { name: 'App placement' });
const placeTargets = (page) => placeStep(page).locator('[data-app-target]').evaluateAll((items) => items.map((li) => [li.dataset.appTarget, li.querySelector('[data-fit]').textContent]));
const policy = (page, name) => placeStep(page).getByRole('radiogroup', { name: 'How Inspire organizes Apps' }).getByRole('radio', { name });
const targetRadio = (page, id) => placeStep(page).locator(`[data-app-target="${id}"] input[type="radio"]`);

test('the App is picked on its own App placement step: Delivery only ticks it, and the step lists the Apps Inspire built with their fit and creates or joins', async () => {
  const ui = await openUi('wizard', { ...MERGE_STATE, useCase: PLACE_UC, useCaseScope: PLACE_SCOPE });
  const { page, made } = ui;
  try {
    await toDelivery(page);
    const dash = page.locator('[data-merge="dashboard"]');
    await dash.getByRole('button', { name: 'Create new' }).waitFor();
    assert.equal(await dash.getByRole('button', { name: 'Create new' }).getAttribute('aria-pressed'), 'true', 'Create new is the default');
    await page.getByRole('checkbox', { name: /^App / }).check();
    assert.equal(await page.locator('[data-merge="app"]').count(), 0, 'Delivery no longer picks the App');
    assert.equal(await page.getByLabel('App name').count(), 0, 'the App name lives on App placement');
    assert.match(await appTile(page), /You pick where it goes next\.$/);
    const genie = page.locator('[data-merge="genie_space"]');
    await genie.getByText('Inspire has built none yet').waitFor();
    assert.ok((await stepLabels(page)).some((s) => /App placement/.test(s)));
    await next(page);
    await onStep(page, 'App placement');
    await placeStep(page).locator('[data-app-target]').first().waitFor();
    assert.deepEqual(await placeTargets(page), [['ops-desk', 'Recommended'], ['care-desk', 'Not recommended']],
      'only Apps Inspire built, the best fit first, never one whose description is not an Inspire owner tag');
    assert.match(await placeStep(page).locator('[data-app-target="care-desk"]').textContent(),
      /It holds only Finance use cases, not Customer, so the people who use it could see another domain's data or use cases unrelated to their work\./);
    await placeStep(page).getByRole('note', { name: JOIN_NOTE }).waitFor();
    assert.equal(await targetRadio(page, 'ops-desk').isChecked(), true,
      'an App built before App placement that holds only this business and domain is that domain App, so it is joined by default');
    await placeStep(page).getByRole('radio', { name: /^Create a new App/ }).check();
    await page.getByLabel('App name').waitFor();
    assert.equal(await policy(page, /^One App per business domain \(default\)/).isChecked(), true);
    assert.equal(await page.getByLabel('App name').inputValue(), 'inspire-acme-customer', 'the new App is named for the business and the domain');
    await policy(page, /^One App per use case/).check();
    assert.equal(await page.getByLabel('App name').inputValue(), 'predict-churn');
    await policy(page, /^One App for all use cases/).check();
    assert.equal(await page.getByLabel('App name').inputValue(), 'inspire-hub-acme');
    await targetRadio(page, 'ops-desk').check();
    assert.equal(await placeStep(page).getByRole('note', { name: JOIN_NOTE }).textContent(),
      'It keeps the look of ops-desk (Style B, Top tabs, the Ocean palette and Light mode), its sign-in and its data source, '
      + 'so everyone who opens it sees the same rows. For your own, choose Create new.');
    assert.equal(await page.getByLabel('App name').count(), 0, 'a joined App keeps its own name');
    const steps = await stepLabels(page);
    assert.ok(!steps.some((s) => /App access|App look/.test(s)), `no App access or App look step: ${steps.join(', ')}`);
    await next(page);
    await onStep(page, 'Vibes');
    await page.getByRole('button', { name: 'Back' }).click();
    await onStep(page, 'App placement');
    await placeStep(page).getByRole('radio', { name: /^Create a new App/ }).check();
    await page.getByLabel('App name').waitFor();
    await policy(page, /^One App per use case/).check();
    await next(page);
    await onStep(page, 'App access');
    await page.getByRole('region', { name: 'App access' }).getByRole('radio', { name: /^Sensitive data/ }).check();
    await page.getByRole('button', { name: 'Back' }).click();
    await onStep(page, 'App placement');
    assert.equal(await targetRadio(page, 'ops-desk').isDisabled(), true, 'with per-user chosen, the service-principal App cannot be picked');
    assert.match(await placeStep(page).locator('[data-app-target="ops-desk"]').textContent(), /ops-desk signs everyone in with its own service principal/);
    await targetRadio(page, 'care-desk').check();
    assert.equal(await placeStep(page).getByRole('note', { name: JOIN_NOTE }).textContent(),
      'It keeps the look of care-desk, its sign-in and its data source, so each person sees only the rows their own access allows. '
      + 'For your own, choose Create new.', 'never a guessed look, and no shared rows');
    await next(page);
    await onStep(page, 'Vibes');
    await startWhenReady(page);
    const spec = submittedSpec(made);
    assert.deepEqual([spec.outputs.app_access, spec.outputs.app_name, spec.outputs.merge, spec.outputs.app_owners, spec.outputs.app_placement],
      ['user', 'care-desk', { app: 'care-desk', dashboard: '', genie_space: '' }, [], 'use_case']);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('a new use case joins the App made for its domain by default, Create new stays put once chosen, and another business or domain is marked Not recommended', async () => {
  const domainLook = { style: 'c', layout: 'home', palette: 'earth', theme: 'dark' };
  const domainState = {
    ...MERGE_STATE,
    useCase: PLACE_UC,
    useCaseScope: PLACE_SCOPE,
    registry: [
      { ...target('77', 'N04-U01', 'Route trucks', { app: true, app_access: 'sp', app_placement: 'domain' }), app_name: 'globex-desk' },
      ...MERGE_STATE.registry,
      { ...target('42', 'N01-U05', 'Price promos', { app: true, app_access: 'sp', app_look: domainLook, app_placement: 'domain' }), app_name: 'inspire-acme-customer' },
    ],
    appsByName: { ...MERGE_STATE.appsByName,
      'inspire-acme-customer': { name: 'inspire-acme-customer', description: 'Inspire use case N01-U05 (session 42): Price promos' },
      'globex-desk': { name: 'globex-desk', description: 'Inspire use case N04-U01 (session 77): Route trucks' } },
  };
  const ui = await openUi('wizard', domainState);
  const { page, made } = ui;
  try {
    await toDelivery(page);
    await page.getByRole('checkbox', { name: /^App / }).check();
    await next(page);
    await onStep(page, 'App placement');
    await placeStep(page).getByRole('note', { name: JOIN_NOTE }).waitFor();
    assert.equal(await targetRadio(page, 'inspire-acme-customer').isChecked(), true, 'the App of this business and domain is joined by default');
    assert.match(await placeStep(page).getByRole('note', { name: JOIN_NOTE }).textContent(),
      /^It keeps the look of inspire-acme-customer \(Style C, Home cards, the Earth palette and Dark mode\), its sign-in and its data source/);
    assert.match(await placeStep(page).textContent(), /Last time for Acme: One App per business domain\./);
    const fits = await placeTargets(page);
    const rank = { Recommended: 0, 'Not recommended': 2 };
    assert.deepEqual(fits.map(([, fit]) => rank[fit] ?? 1), [...fits.map(([, fit]) => rank[fit] ?? 1)].sort(), `best fit first: ${JSON.stringify(fits)}`);
    assert.deepEqual(Object.fromEntries(fits), { 'inspire-acme-customer': 'Recommended', 'ops-desk': 'Recommended', 'care-desk': 'Not recommended', 'globex-desk': 'Not recommended' });
    assert.match(await placeStep(page).locator('[data-app-target="globex-desk"]').textContent(),
      /It holds use cases of Globex, another business, so the people who use it could see that business's data\./);
    await placeStep(page).getByRole('radio', { name: /^Create a new App/ }).check();
    await page.getByLabel('App name').waitFor();
    assert.equal(await page.getByLabel('App name').inputValue(), 'inspire-acme-customer-2', 'a new App never takes the name of one Inspire built');
    await page.waitForTimeout(800);
    assert.equal(await placeStep(page).getByRole('radio', { name: /^Create a new App/ }).isChecked(), true, 'the person chose Create new, so the default does not come back');
    await targetRadio(page, 'inspire-acme-customer').check();
    await next(page);
    await onStep(page, 'Vibes');
    await startWhenReady(page);
    const spec = submittedSpec(made);
    assert.deepEqual([spec.outputs.app_name, spec.outputs.merge.app, spec.outputs.app_placement], ['inspire-acme-customer', 'inspire-acme-customer', 'domain']);
    assert.deepEqual(spec.outputs.app_look, domainLook, 'the look of the use case that built the App, not the joiner listed first');
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
  const remembered = await openUi('wizard', { ...domainState, registry: [
    { ...target('42', 'N01-U02', 'Forecast demand', { app: true, app_access: 'sp', app_placement: 'use_case' }), app_name: 'ops-desk', updated_at: '2026-10-29T00:00:00Z' },
    ...domainState.registry.filter((r) => r.use_case_id !== 'N01-U02'),
  ] });
  try {
    await toDelivery(remembered.page);
    await remembered.page.getByRole('checkbox', { name: /^App / }).check();
    await next(remembered.page);
    await onStep(remembered.page, 'App placement');
    await placeStep(remembered.page).getByText('Last time for Acme: One App per use case.', { exact: false }).waitFor();
    assert.equal(await placeStep(remembered.page).getByRole('radio', { name: /^Create a new App/ }).isChecked(), true, 'one App per use case never joins');
    assert.equal(await policy(remembered.page, /^One App per use case/).isChecked(), true, 'the business last chose one App per use case');
    assert.equal(await remembered.page.getByLabel('App name').inputValue(), 'predict-churn');
    assert.deepEqual(remembered.pageErrors, []);
  } finally {
    await remembered.close();
  }
});

async function measure(page, name) {
  await page.waitForTimeout(250);
  const box = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect();
    const body = document.querySelector('[data-wizard-body]');
    return { top: dialog.top, bottom: dialog.bottom, height: Math.round(dialog.height), scroll: body.scrollHeight, client: body.clientHeight,
      page: document.scrollingElement.scrollHeight };
  });
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  }
  return box;
}

test('every wizard step fits a 1440x900 screen with nothing to scroll, the App steps included, and reads at 4.5:1 in light and dark', async () => {
  const ui = await openUi('wizard', { ...MERGE_STATE, me: { userName: OWNER, displayName: 'Owner' } });
  const { page } = ui;
  const heights = {};
  const fits = async (name) => {
    const box = await measure(page, name);
    heights[name] = box.height;
    assert.ok(box.top >= 0 && box.bottom <= 900, `${name}: the dialog sits inside the screen ${JSON.stringify(box)}`);
    assert.ok(box.scroll <= box.client + 1, `${name}: the step needs no scroll (${box.scroll} > ${box.client})`);
    assert.ok(box.page <= 900, `${name}: the page itself does not scroll (${box.page})`);
  };
  const readable = async (name) => {
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark', on), dark);
      await page.waitForTimeout(300);
      const result = await lowContrast(page, ['[role="dialog"]']);
      assert.ok(result.checked >= 10, `${name}: measured ${result.checked} elements`);
      assert.deepEqual(result.low, [], `${name} ${dark ? 'dark' : 'light'}`);
    }
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
  };
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await onStep(page, 'Choose');
    await page.getByRole('radio', { name: /^Notebook only/ }).check();
    await next(page);
    await onStep(page, 'Data');
    await fits('0-notebook-data');
    await next(page);
    await onStep(page, 'Notebook');
    await fits('0-notebook');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Back' }).click();
    await onStep(page, 'Choose');
    await page.getByRole('radio', { name: /^Full MVP/ }).check();
    await fits('1-choose');
    await next(page);
    await onStep(page, 'Data');
    await fits('2-data');
    await next(page);
    await onStep(page, 'Results');
    await page.getByRole('region', { name: 'Where the result table lives' }).getByLabel('Catalog').locator('option[value="main"]').waitFor({ state: 'attached' });
    await fits('3-results');
    await readable('results');
    const holdout = page.getByRole('group', { name: 'Measure impact' }).getByRole('checkbox', { name: /^Hold back a share of records/ });
    await holdout.check();
    await fits('3-results-holdout');
    await readable('results with the holdout on');
    await holdout.uncheck();
    await next(page);
    await onStep(page, 'Delivery');
    for (const name of [/^App /, /^Alert/]) await page.getByRole('checkbox', { name }).check();
    await page.locator('[data-merge="dashboard"]').getByRole('button', { name: 'Create new' }).waitFor();
    await page.getByText(`Emails ${OWNER} when`, { exact: false }).waitFor();
    await fits('4-delivery');
    await page.locator('[data-merge="dashboard"]').getByRole('button', { name: 'Add to an existing one' }).click();
    await fits('4-delivery-joining');
    await readable('delivery');
    await next(page);
    await onStep(page, 'App placement');
    await placeStep(page).locator('[data-app-target]').first().waitFor();
    await fits('5-app-placement');
    await readable('app placement');
    await placeStep(page).locator('[data-app-target] input[type="radio"]').first().check();
    await fits('5-app-placement-joining');
    await readable('app placement joining');
    await placeStep(page).getByRole('radio', { name: /^Create a new App/ }).check();
    await next(page);
    await onStep(page, 'App access');
    const access = page.getByRole('region', { name: 'App access' });
    await access.getByRole('radio', { name: /^Internal data/ }).check();
    await access.getByRole('checkbox', { name: /^Let people edit data/ }).check();
    await fits('5-app-access-internal');
    await access.getByRole('radio', { name: /^Sensitive data/ }).check();
    await fits('5-app-access-per-user');
    await readable('app access');
    await next(page);
    await onStep(page, 'App look');
    await page.locator('[data-swatch="mono"]').waitFor({ state: 'attached' });
    await fits('6-app-look');
    await readable('app look');
    const lookTabs = page.getByRole('tablist', { name: 'App look sections' });
    for (const name of ['Palette', 'Layout', 'Charts', 'Pages']) {
      await lookTabs.getByRole('tab', { name, exact: true }).click();
      await fits(`6-app-look-${name.toLowerCase()}`);
    }
    await page.getByRole('group', { name: 'Pages of the App' }).getByRole('button', { name: /^Things to fix/ }).waitFor();
    await readable('app look pages');
    await lookTabs.getByRole('tab', { name: 'Palette', exact: true }).click();
    await page.getByRole('group', { name: 'Light or dark' }).getByRole('button', { name: 'Dark' }).click();
    await fits('6-app-look-dark-palette');
    console.log(`wizard step heights at 1440x900: ${JSON.stringify(heights)}`);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});

test('Send alerts is a build setting of a shared App: off until ticked, then sent with the build', async () => {
  const ui = await openUi('wizard', { me: { userName: OWNER, displayName: 'Owner' }, responses: { 'GET /api/2.0/postgres/projects': [{ projects: [] }, 200] } });
  const { page, made } = ui;
  try {
    await toDelivery(page);
    await page.getByRole('checkbox', { name: /^App / }).check();
    await toAppAccess(page);
    const access = page.getByRole('region', { name: 'App access' });
    await access.getByRole('radio', { name: /^Internal data/ }).check();
    const alerts = access.getByRole('checkbox', { name: /^Send alerts/ });
    assert.equal(await alerts.isChecked(), false, 'alerts start off');
    await access.locator('label', { hasText: 'Send alerts' })
      .getByText('People set up email alerts on what the App shows, each on its own schedule, sent only to people in this workspace.', { exact: false }).waitFor();
    assert.doesNotMatch(await access.locator('label', { hasText: 'Send alerts' }).textContent(), /\u2014|\u2013/);
    await alerts.check();
    await next(page);
    await onStep(page, 'App look');
    await startWhenReady(page);
    assert.equal(submittedSpec(made).outputs.app_options.alerts, true);
    assert.deepEqual(ui.pageErrors, []);
  } finally {
    await ui.close();
  }
});
