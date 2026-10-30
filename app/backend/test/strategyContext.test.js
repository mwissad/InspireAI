const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const libUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', 'strategyContext.js')).href;
const load = () => import(libUrl);

const PLAN_EXAMPLE = {
  schema_version: 1,
  levels: ['Strategic Pillar', 'Business Objective'],
  strategy: [
    {
      name: 'Customer',
      children: [
        {
          name: 'Grow repeat purchases',
          kpis: [{ name: 'Repeat purchase rate', definition: 'Share of customers with 2+ orders in 90 days', unit: '%', direction: 'increase' }],
          key_results: [{ statement: 'Raise repeat purchase rate from 18% to 24%', kpi: 'Repeat purchase rate' }],
        },
      ],
    },
    { name: 'Operations', children: ['Cut stockouts', 'Lower delivery cost'] },
  ],
  priorities: ['Grow revenue', 'Protect margin'],
  sponsors: [{ role: 'Chief Customer Officer', reports_to: 'Chief Executive Officer', owns: ['Customer'] }],
  labels: { priority: 'Business Priority', kpi: 'KPI' },
};

test('an empty editor sends an empty string', async () => {
  const lib = await load();
  assert.equal(lib.serializeStrategy(lib.emptyStrategy()), '');
  assert.equal(lib.parseStrategicContext('').mode, 'empty');
  assert.deepEqual(lib.validateStrategicContextText(''), []);
});

test('the plan example round-trips and validates', async () => {
  const lib = await load();
  const parsed = lib.parseStrategicContext(JSON.stringify(PLAN_EXAMPLE));
  assert.equal(parsed.mode, 'tree');
  assert.deepEqual(lib.validateStrategy(parsed.model), []);
  const out = JSON.parse(lib.serializeStrategy(parsed.model));
  assert.equal(out.schema_version, 1);
  assert.deepEqual(out.levels, ['Pillar', 'Objective'], 'the layers are always Pillar, Objective, Initiative, Project');
  assert.deepEqual(out.strategy[1].children.map((c) => c.name), ['Cut stockouts', 'Lower delivery cost']);
  assert.deepEqual(out.strategy[0].children[0].key_results, [{ statement: 'Raise repeat purchase rate from 18% to 24%', kpi: 'Repeat purchase rate' }]);
  assert.deepEqual(out.sponsors, [{ role: 'Chief Customer Officer', reports_to: 'Chief Executive Officer', owns: ['Customer'] }]);
  assert.equal(out.labels, undefined, 'the App no longer renames Inspire terms');
  assert.deepEqual(lib.parseStrategicContext(lib.serializeStrategy(parsed.model)).model, parsed.model, 'a second round trip is stable');
});

test('the layers follow the depth of the tree and are never asked for', async () => {
  const lib = await load();
  const levels = (tree) => JSON.parse(lib.serializeStrategy(lib.parseStrategicContext(JSON.stringify(tree)).model)).levels;
  assert.deepEqual(lib.STRATEGY_LAYERS, ['Pillar', 'Objective', 'Initiative', 'Project']);
  assert.deepEqual(levels({ strategy: ['A', 'B'] }), ['Pillar']);
  assert.deepEqual(levels({ levels: ['Theme', 'Goal', 'Program'], strategy: [{ name: 'A', children: [{ name: 'B', children: ['C'] }] }] }),
    ['Pillar', 'Objective', 'Initiative']);
  assert.equal(levels({ priorities: ['Grow revenue'] }), undefined, 'priorities alone send no layers');
  assert.deepEqual(lib.validateStrategy(lib.parseStrategicContext(JSON.stringify({ strategy: [{ name: 'A', children: ['B'] }] })).model), []);
});

test('no message the App shows mentions JSON or a file path', async () => {
  const lib = await load();
  const messages = [
    ...lib.validateStrategicContextText('{not json'),
    ...lib.validateStrategicContextText('[1, 2]'),
    ...lib.validateStrategy(lib.parseStrategicContext(JSON.stringify({
      strategy: Array.from({ length: 150 }, (_, i) => ({ name: `E${i}`, description: 'd'.repeat(6200) })),
    })).model),
  ];
  assert.equal(messages.length, 3, messages.join(' | '));
  assert.match(messages[0], /could not be read/);
  for (const message of messages) assert.doesNotMatch(message, /json|file path/i, message);
});

test('a tree stored by the agent reads back with its KPI links and without ids', async () => {
  const lib = await load();
  const stored = {
    schema_version: 1, source: 'customer', levels: ['Pillar'],
    strategy: [{ id: 'S1', name: 'Customer', level: 'Pillar', description: '',
      kpis: [{ id: 'K1', name: 'Repeat rate', definition: '', unit: '%', direction: 'increase' }],
      key_results: [{ id: 'R1', statement: 'Lift it', kpi_id: 'K1', baseline: '', target: '', due: '' }], children: [] }],
    priorities: ['Grow revenue'], sponsors: [{ id: 'SP1', role: 'CCO', name: '', reports_to: '', owns: [] }], labels: {},
  };
  const out = JSON.parse(lib.serializeStrategy(lib.parseStrategicContext(JSON.stringify(stored)).model));
  assert.deepEqual(out.strategy[0].key_results, [{ statement: 'Lift it', kpi: 'Repeat rate' }]);
  assert.equal(JSON.stringify(out).includes('"id"'), false);
  assert.equal(out.source, undefined);
});

test('a path is kept as a path', async () => {
  const lib = await load();
  const parsed = lib.parseStrategicContext('  /Volumes/main/s/v/strategy.json ');
  assert.equal(parsed.mode, 'path');
  assert.equal(parsed.path, '/Volumes/main/s/v/strategy.json');
});

test('every rule the agent stops the run for is caught here', async () => {
  const lib = await load();
  const problems = (tree) => lib.validateStrategy(lib.parseStrategicContext(JSON.stringify(tree)).model);
  assert.match(problems({ strategy: ['A', 'a'] }).join(' '), /appears twice/);
  const deep = { name: 'L1', children: [{ name: 'L2', children: [{ name: 'L3', children: [{ name: 'L4', children: ['L5'] }] }] }] };
  assert.match(problems({ strategy: [deep] }).join(' '), /5 levels deep; the most is 4/);
  assert.match(problems({ strategy: [{ name: 'A', kpis: [{ name: 'K', direction: 'up' }] }] }).join(' '), /direction must be one of/);
  assert.match(problems({ strategy: [{ name: 'A', kpis: [{ name: ' ' }] }] }).join(' '), /empty name/);
  assert.match(problems({ strategy: [{ name: 'A', key_results: [{ statement: '' }] }] }).join(' '), /empty name/);
  assert.match(problems({ strategy: [''] }).join(' '), /empty name/);
  assert.match(problems({ strategy: ['x'.repeat(301)] }).join(' '), /longer than 300/);
  assert.match(problems({ strategy: Array.from({ length: 201 }, (_, i) => `E${i}`) }).join(' '), /more than 200 entries/);
  assert.match(problems({ sponsors: [{ role: '', name: 'Ann' }] }).join(' '), /no role/);
  assert.deepEqual(problems({ strategy: ['A', 'B'] }), [], 'a flat list is valid');
  assert.match(lib.validateStrategicContextText('{not json').join(' '), /could not be read/);
  assert.match(lib.validateStrategicContextText('[1, 2]').join(' '), /could not be read/);
});

test('the size limit is the agent limit in bytes', async () => {
  const lib = await load();
  const big = { strategy: Array.from({ length: 150 }, (_, i) => ({ name: `E${i}`, description: 'd'.repeat(6200) })) };
  assert.match(lib.validateStrategy(lib.parseStrategicContext(JSON.stringify(big)).model).join(' '), /limit is 900000/);
});

const BUILT_IN = ['Increase Revenue', 'Reduce Cost', 'Mitigate Risk'];

test('saved priorities split into the built-in chips and the user own entries', async () => {
  const lib = await load();
  assert.deepEqual(
    lib.splitPriorities(['increase revenue', 'Improve on-time delivery', ' ', 'Reduce Cost', 'IMPROVE ON-TIME DELIVERY', 'Increase Revenue'], BUILT_IN),
    { builtIn: ['Increase Revenue', 'Reduce Cost'], custom: ['Improve on-time delivery'] },
  );
  assert.deepEqual(lib.splitPriorities(undefined, BUILT_IN), { builtIn: [], custom: [] });
  assert.deepEqual(lib.splitPriorities(['Grow online sales'], []), { builtIn: [], custom: ['Grow online sales'] });
});

test('own priorities travel in the strategy together with the selected chips', async () => {
  const lib = await load();
  assert.equal(lib.withPriorities('', []), '', 'no strategy and no own priority sends nothing');
  const onlyPriorities = JSON.parse(lib.withPriorities('', ['Increase Revenue', 'Improve on-time delivery', 'increase revenue', ' ']));
  assert.deepEqual(onlyPriorities.priorities, ['Increase Revenue', 'Improve on-time delivery']);
  assert.equal(onlyPriorities.strategy, undefined);

  const tree = lib.serializeStrategy(lib.parseStrategicContext(JSON.stringify(PLAN_EXAMPLE)).model);
  const merged = JSON.parse(lib.withPriorities(tree, ['Reduce Cost', 'Grow online sales']));
  assert.deepEqual(merged.priorities, ['Reduce Cost', 'Grow online sales'], 'the merged list replaces the saved priorities');
  assert.equal(merged.strategy.length, 2, 'the strategy tree is kept');
  assert.equal(merged.sponsors.length, 1, 'the sponsors are kept');

  const stripped = JSON.parse(lib.withPriorities(tree, []));
  assert.equal(stripped.priorities, undefined, 'without own priorities the chips go through widget 07 only');
  assert.equal(stripped.strategy.length, 2);
});

test('a strategy file path or unreadable text is passed through unchanged, so validation still reports it', async () => {
  const lib = await load();
  assert.equal(lib.withPriorities(' /Workspace/Users/me/strategy.json ', ['Grow online sales']), '/Workspace/Users/me/strategy.json');
  assert.equal(lib.withPriorities('{not json', ['Grow online sales']), '{not json');
  assert.match(lib.validateStrategicContextText(lib.withPriorities('{not json', [])).join(' '), /could not be read/);
});
