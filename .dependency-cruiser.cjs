/**
 * dependency-cruiser config — vibetime monorepo
 *
 * Primary mission: enforce DEC-006 (`packages/core` is pure TS, zero runtime deps).
 * Three-layer defense (RESEARCH §E): TS `types: []` + this config + package.json check.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-must-be-pure',
      severity: 'error',
      comment:
        'core has no UI / runtime / fs / DB-client dependencies. DEC-006. See .planning/intel/decisions.md.',
      from: { path: '^packages/core/' },
      to: {
        path: [
          'node_modules',
          '^node:',
          '^(fs|path|child_process|os|crypto|http|https|stream|net|dgram|cluster|worker_threads)$',
          '^(electron|react|react-dom|jotai|echarts|tailwindcss|coss-ui)',
          '^(better-sqlite3|bun:sqlite)'
        ]
      }
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No circular deps anywhere in the monorepo.',
      from: {},
      to: { circular: true }
    }
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node']
    },
    doNotFollow: { path: 'node_modules' }
  }
}
