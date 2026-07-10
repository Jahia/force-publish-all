import React from 'react';
import {render, act} from '@testing-library/react';
import ForcePublishAll from './ForcePublishAll';

// --- Mocks -----------------------------------------------------------------

// Prop-contract tests: @material-ui/core is mocked so the props ForcePublishAll
// hands to the Dialog (transitionDuration, onExited, ...) can be asserted
// directly — the real Dialog keeps them internal to its transition machinery.
const mockCapturedDialogProps = [];

jest.mock('@material-ui/core', () => ({
    Dialog: props => {
        mockCapturedDialogProps.push(props);
        return null;
    },
    DialogTitle: () => null,
    DialogContent: () => null,
    DialogActions: () => null
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key})
}));

jest.mock('@jahia/moonstone', () => ({
    Button: () => null,
    CloudUpload: () => null
}));

// --- Helpers ---------------------------------------------------------------

const lastDialogProps = () => mockCapturedDialogProps[mockCapturedDialogProps.length - 1];

const baseProps = () => ({
    isOpen: true,
    path: '/sites/digitall/home/about',
    isLoading: false,
    status: null,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    onExit: jest.fn()
});

const setMatchMedia = matches => {
    window.matchMedia = jest.fn(query => ({
        matches: matches && query === '(prefers-reduced-motion: reduce)',
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn()
    }));
};

beforeEach(() => {
    jest.clearAllMocks();
    mockCapturedDialogProps.length = 0;
});

afterEach(() => {
    // Jsdom has no native matchMedia — remove whatever the test installed.
    delete window.matchMedia;
});

describe('ForcePublishAll dialog prop contract', () => {
    it('sets transitionDuration to 0 when prefers-reduced-motion is reduce', () => {
        setMatchMedia(true);

        render(<ForcePublishAll {...baseProps()}/>);

        expect(lastDialogProps().transitionDuration).toBe(0);
    });

    it('leaves the default transitionDuration when no reduced-motion preference is set', () => {
        setMatchMedia(false);

        render(<ForcePublishAll {...baseProps()}/>);

        expect(lastDialogProps().transitionDuration).toBeUndefined();
    });

    it('restores focus to the trigger element and calls onExit when the dialog exits', () => {
        // Arrange: the element that owns focus when the dialog opens.
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();
        expect(document.activeElement).toBe(trigger);

        const props = baseProps();
        render(<ForcePublishAll {...props}/>);

        // Steal focus away, as the real Dialog would while it is open.
        const other = document.createElement('button');
        document.body.appendChild(other);
        other.focus();
        expect(document.activeElement).toBe(other);

        // Act: jsdom fires no transition events, so invoke the Dialog's onExited
        // callback (wired to restoreFocus) manually.
        act(() => {
            lastDialogProps().onExited();
        });

        // Assert: focus is back on the trigger and the teardown callback ran.
        expect(document.activeElement).toBe(trigger);
        expect(props.onExit).toHaveBeenCalledTimes(1);

        trigger.remove();
        other.remove();
    });
});
