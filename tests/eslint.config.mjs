// ESLint flat config for the Cypress tests (replaces the former .eslintrc.json + .eslintignore).
// eslint-plugin-cypress >= 6 only ships flat configs, so the legacy "plugin:cypress/recommended" preset no longer exists.
// Shared configs that are still eslintrc-style (@jahia, @typescript-eslint v7) are loaded through FlatCompat.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FlatCompat} from '@eslint/eslintrc';
import cypress from 'eslint-plugin-cypress';
import chaiFriendly from 'eslint-plugin-chai-friendly';
import tsParser from '@typescript-eslint/parser';

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({baseDirectory});

export default [
    {
        // Former .eslintignore (node_modules) + generated output. The former `--ext .ts` linted TypeScript only,
        // so JavaScript files stay out of scope.
        ignores: ['node_modules/**', 'results/**', 'run-artifacts/**', 'artifacts/**', '**/*.js', '**/*.cjs', '**/*.mjs']
    },
    ...compat.extends('@jahia'),
    cypress.configs.recommended,
    ...compat.extends('plugin:@typescript-eslint/recommended'),
    chaiFriendly.configs.recommendedFlat,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            // The @jahia "es6" env pins ecmaVersion to 6 under FlatCompat, which silently disables
            // comma-dangle on function arguments; the legacy setup ran with a modern ecmaVersion.
            ecmaVersion: 'latest'
        },
        rules: {
            'react/boolean-prop-naming': ['error', {rule: '^((is|has)[A-Z]([A-Za-z0-9]?)+|disabled|readOnly|autoFocus)'}],
            '@typescript-eslint/no-shadow': ['error'],
            'no-warning-comments': ['error', {terms: ['fixme']}]
        }
    }
];
