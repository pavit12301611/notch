import js from '@eslint/js';
import globals from 'globals';

export default [
    {ignores: ['node_modules/**', '.generated/**', 'dist/**']},
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {...globals.es2021, ...globals.node,
                imports: 'readonly', log: 'readonly', logError: 'readonly', console: 'readonly'},
        },
        rules: {
            'no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
            'no-undef': 'error',
            'no-constant-condition': ['error', {checkLoops: false}],
            'prefer-const': 'error',
            'eqeqeq': ['error', 'always'],
        },
    },
];
