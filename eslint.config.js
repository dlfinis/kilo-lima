import pluginVue from 'eslint-plugin-vue'
import vueTsEslintConfig from '@vue/eslint-config-typescript'

export default [
  {
    name: 'app/files-to-ignore',
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/pnpm-lock.yaml',
      'public/**',
      // One-off scratch debug scripts that aren't part of the build —
      // left on disk by hand during puppeteer sessions.
      'debug.mjs',
      'verify.mjs',
      'verify-routes.mjs',
    ],
  },
  ...pluginVue.configs['flat/essential'],
  ...vueTsEslintConfig(),
  {
    files: ['**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
]
