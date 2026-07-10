import React from 'react';
import {render} from '@testing-library/react';
import ForcePublishAll from './ForcePublishAll';
import enBundle from '../../../main/resources/javascript/locales/en.json';
import frBundle from '../../../main/resources/javascript/locales/fr.json';

// --- Mocks -----------------------------------------------------------------

// Translation mock backed by the REAL locale bundles so these tests double as a
// key-drift guard between the components and both en.json / fr.json.
const mockI18nState = {language: 'en'};

const mockTranslate = (key, options) => {
    const bundles = {
        en: require('../../../main/resources/javascript/locales/en.json'),
        fr: require('../../../main/resources/javascript/locales/fr.json')
    };
    const value = key
        .split('.')
        .reduce((section, part) => (section ? section[part] : undefined), bundles[mockI18nState.language]);
    if (typeof value !== 'string') {
        return key;
    }

    return value.replace(/{{(\w+)}}/g, (match, name) =>
        (options && options[name] !== undefined) ? String(options[name]) : match);
};

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options) => mockTranslate(key, options)
    })
}));

// Lightweight moonstone Button mock that forwards label + handlers (same shape
// as the ForcePublishAllComponent spec).
jest.mock('@jahia/moonstone', () => ({
    Button: ({label, onClick, disabled, ...props}) => {
        const React2 = require('react');
        return React2.createElement(
            'button',
            {onClick: disabled ? undefined : onClick, disabled, 'data-label': label, ...props},
            label
        );
    },
    CloudUpload: () => null
}));

// --- Helpers ---------------------------------------------------------------

const TARGET_PATH = '/sites/digitall/home/about';

// Every locale key the ForcePublishAll UI relies on (register.jsx action label
// + all dialog strings). Guards against locale-key drift in BOTH bundles.
const KEYS_USED_BY_COMPONENTS = [
    'label.action.forcePublishAll',
    'dialog.title',
    'dialog.consequence',
    'dialog.path',
    'dialog.cancel',
    'dialog.confirm',
    'dialog.success',
    'dialog.error'
];

const lookup = (bundle, key) => key.split('.').reduce((section, part) => (section ? section[part] : undefined), bundle);

const baseProps = () => ({
    isOpen: true,
    path: TARGET_PATH,
    isLoading: false,
    status: null,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    onExit: jest.fn()
});

beforeEach(() => {
    jest.clearAllMocks();
    mockI18nState.language = 'en';
});

// The real @material-ui/core Dialog renders into a portal attached to
// document.body under jsdom, so every query below goes through baseElement.
describe('ForcePublishAll dialog', () => {
    it('exposes an alertdialog with correct aria wiring and data-cm-role hooks', () => {
        const {baseElement} = render(<ForcePublishAll {...baseProps()}/>);

        const dialog = baseElement.querySelector('[role="alertdialog"]');
        expect(dialog).not.toBeNull();
        expect(dialog.getAttribute('aria-labelledby')).toBe('force-publish-all-title');
        expect(dialog.getAttribute('aria-describedby')).toBe('force-publish-all-description force-publish-all-path');

        // The referenced elements exist and carry the title, consequence and path.
        expect(baseElement.querySelector('#force-publish-all-title').textContent).toBe(enBundle.dialog.title);
        expect(baseElement.querySelector('#force-publish-all-description').textContent).toBe(enBundle.dialog.consequence);
        expect(baseElement.querySelector('#force-publish-all-path').textContent)
            .toBe(enBundle.dialog.path.replace('{{path}}', TARGET_PATH));

        // Stable test hooks for the e2e suite.
        expect(baseElement.querySelector('[data-cm-role="force-publish-dialog"]')).not.toBeNull();
        const confirmButton = baseElement.querySelector('[data-cm-role="force-publish-button"]');
        expect(confirmButton).not.toBeNull();
        expect(confirmButton.textContent).toBe(enBundle.dialog.confirm);

        // The polite live region exists (and is empty while there is no status).
        const liveRegion = baseElement.querySelector('output[aria-live="polite"][aria-atomic="true"]');
        expect(liveRegion).not.toBeNull();
        expect(liveRegion.textContent).toBe('');
    });

    it('announces the success message in the polite live region when status is success', () => {
        // Only visible during the close transition (D1: success closes the dialog),
        // but the live region must still announce it for assistive technology.
        const {baseElement} = render(<ForcePublishAll {...baseProps()} status="success"/>);

        const liveRegion = baseElement.querySelector('output[aria-live="polite"][aria-atomic="true"]');
        expect(liveRegion).not.toBeNull();
        expect(liveRegion.textContent).toBe(enBundle.dialog.success);
    });

    it('announces the error message in the polite live region when status is error', () => {
        const {baseElement} = render(<ForcePublishAll {...baseProps()} status="error"/>);

        const liveRegion = baseElement.querySelector('output[aria-live="polite"][aria-atomic="true"]');
        expect(liveRegion).not.toBeNull();
        expect(liveRegion.textContent).toBe(enBundle.dialog.error);
    });

    it('renders the French dialog strings when the i18n language is fr', () => {
        mockI18nState.language = 'fr';

        const {baseElement} = render(<ForcePublishAll {...baseProps()}/>);

        expect(baseElement.querySelector('#force-publish-all-title').textContent).toBe(frBundle.dialog.title);
        expect(baseElement.querySelector('#force-publish-all-description').textContent).toBe(frBundle.dialog.consequence);
        expect(baseElement.querySelector('#force-publish-all-path').textContent)
            .toBe(frBundle.dialog.path.replace('{{path}}', TARGET_PATH));
        expect(baseElement.querySelector('[data-cm-role="force-publish-button"]').textContent)
            .toBe(frBundle.dialog.confirm);

        // Cancel button carries the French label too.
        const buttons = Array.from(baseElement.querySelectorAll('button[data-label]'));
        expect(buttons.map(button => button.textContent)).toContain(frBundle.dialog.cancel);
    });

    it('resolves the action label from the fr bundle', () => {
        mockI18nState.language = 'fr';
        expect(mockTranslate('label.action.forcePublishAll')).toBe('Tout forcer la publication');
    });

    it('finds every locale key used by the components in both the en and fr bundles', () => {
        KEYS_USED_BY_COMPONENTS.forEach(key => {
            const enValue = lookup(enBundle, key);
            const frValue = lookup(frBundle, key);
            expect(typeof enValue).toBe('string');
            expect(enValue.length).toBeGreaterThan(0);
            expect(typeof frValue).toBe('string');
            expect(frValue.length).toBeGreaterThan(0);
        });
    });
});
