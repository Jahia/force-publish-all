import React from 'react';
import {render, fireEvent, act} from '@testing-library/react';
import {ForcePublishAllActionComponent} from './ForcePublishAllComponent';
import ForcePublishAll from './ForcePublishAll';
import {useMutation} from '@apollo/react-hooks';
import {useNodeChecks} from '@jahia/data-helper';
import {ComponentRendererContext, registry} from '@jahia/ui-extender';

// --- Mocks -----------------------------------------------------------------

// Hoisted, stable cache-flush spy: the mock previously created a fresh spy per
// useApolloClient() call, which made flush assertions impossible.
const mockFlushNodeEntryByPath = jest.fn();

jest.mock('@apollo/react-hooks', () => ({
    useMutation: jest.fn(),
    useApolloClient: jest.fn(() => ({
        cache: {flushNodeEntryByPath: mockFlushNodeEntryByPath}
    }))
}));

jest.mock('@jahia/data-helper', () => ({
    useNodeChecks: jest.fn(() => ({
        loading: false,
        checksResult: true,
        node: {path: '/sites/digitall/home'}
    }))
}));

jest.mock('@jahia/ui-extender', () => {
    const React2 = require('react');
    return {
        ComponentRendererContext: React2.createContext({}),
        registry: {
            get: jest.fn(),
            find: jest.fn(() => [])
        }
    };
});

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key})
}));

// Lightweight moonstone Button mock that forwards label + handlers.
// Matches real <button> semantics: a disabled button never fires onClick
// (fireEvent dispatches events even on disabled elements, unlike a browser).
jest.mock('@jahia/moonstone', () => ({
    Button: ({label, onClick, disabled, ...props}) => {
        const React3 = require('react');
        return React3.createElement(
            'button',
            {onClick: disabled ? undefined : onClick, disabled, 'data-label': label, ...props},
            label
        );
    },
    CloudUpload: () => null
}));

// --- Helpers ---------------------------------------------------------------

const buildRenderer = () => {
    const props = {};
    return {
        render: jest.fn((id, Component, p) => {
            Object.assign(props, p);
        }),
        setProperties: jest.fn((id, patch) => {
            Object.assign(props, patch);
        }),
        destroy: jest.fn(),
        getProps: () => props
    };
};

// A Render prop that simply exposes its onClick so the test can "click" the action.
const RenderStub = ({onClick}) => (
    <button type="button" data-testid="action-trigger" onClick={onClick}>action</button>
);

const renderAction = renderer => {
    const utils = render(
        <ComponentRendererContext.Provider value={renderer}>
            <ForcePublishAllActionComponent path="/sites/digitall/home" render={RenderStub}/>
        </ComponentRendererContext.Provider>
    );
    fireEvent.click(utils.getByTestId('action-trigger'));
    return utils;
};

// Build the dialog element from the props currently captured by the renderer,
// so a test can re-render the same dialog instance after a setProperties patch.
const dialogElement = renderer => {
    const p = renderer.getProps();
    return (
        <ForcePublishAll
            isOpen={p.isOpen}
            path={p.path}
            isLoading={p.isLoading}
            status={p.status}
            onClose={p.onClose}
            onConfirm={p.onConfirm}
            onExit={p.onExit || (() => {})}
        />
    );
};

// Render the dialog directly with the props captured by the renderer.
const renderDialog = renderer => render(dialogElement(renderer));

beforeEach(() => {
    jest.clearAllMocks();
    // Restore the registry defaults that individual tests may have overridden.
    registry.find.mockImplementation(() => []);
    registry.get.mockImplementation(() => undefined);
});

describe('ForcePublishAllActionComponent', () => {
    it('triggers the mutation when Force Publish (confirm) is clicked', () => {
        const mutation = jest.fn(() => Promise.resolve({data: {}}));
        useMutation.mockReturnValue([mutation, {loading: false}]);
        const renderer = buildRenderer();

        renderAction(renderer);
        const dialog = renderDialog(renderer);

        fireEvent.click(dialog.getByText('dialog.confirm'));

        expect(mutation).toHaveBeenCalledTimes(1);
        expect(mutation).toHaveBeenCalledWith({variables: {path: '/sites/digitall/home'}});
    });

    it('does NOT trigger the mutation when Cancel is clicked', () => {
        const mutation = jest.fn(() => Promise.resolve({data: {}}));
        useMutation.mockReturnValue([mutation, {loading: false}]);
        const renderer = buildRenderer();

        renderAction(renderer);
        const dialog = renderDialog(renderer);

        fireEvent.click(dialog.getByText('dialog.cancel'));

        expect(mutation).not.toHaveBeenCalled();
        // Cancel only closes the dialog.
        expect(renderer.setProperties).toHaveBeenCalledWith('forcePublishAllDialog', {isOpen: false});
    });

    it('does NOT trigger the mutation when the dialog requests close (Escape/backdrop)', () => {
        const mutation = jest.fn(() => Promise.resolve({data: {}}));
        useMutation.mockReturnValue([mutation, {loading: false}]);
        const renderer = buildRenderer();

        renderAction(renderer);
        // OnClose is the pure cancel handler wired to the Dialog onClose.
        renderer.getProps().onClose();

        expect(mutation).not.toHaveBeenCalled();
    });

    it('shows error and does not report success when the mutation returns errors', async () => {
        const mutation = jest.fn(() => Promise.resolve({errors: [{message: 'boom'}]}));
        useMutation.mockReturnValue([mutation, {loading: false}]);
        const renderer = buildRenderer();

        renderAction(renderer);
        await renderer.getProps().onConfirm();

        // Error status was set...
        expect(renderer.setProperties).toHaveBeenCalledWith('forcePublishAllDialog', {status: 'error', isLoading: false});
        // ...and success (which would close the dialog) was never reported.
        const successCall = renderer.setProperties.mock.calls.find(
            ([, patch]) => patch && patch.status === 'success'
        );
        expect(successCall).toBeUndefined();
    });

    it('shows error and does not report success when the mutation rejects', async () => {
        const mutation = jest.fn(() => Promise.reject(new Error('network')));
        useMutation.mockReturnValue([mutation, {loading: false}]);
        const renderer = buildRenderer();

        renderAction(renderer);
        await renderer.getProps().onConfirm();

        expect(renderer.setProperties).toHaveBeenCalledWith('forcePublishAllDialog', {status: 'error', isLoading: false});
        const successCall = renderer.setProperties.mock.calls.find(
            ([, patch]) => patch && patch.status === 'success'
        );
        expect(successCall).toBeUndefined();
    });

    it('reports success after a successful mutation', async () => {
        const mutation = jest.fn(() => Promise.resolve({data: {jcr: {mutateNode: {forcePublish: true}}}}));
        useMutation.mockReturnValue([mutation, {loading: false}]);
        const renderer = buildRenderer();

        renderAction(renderer);
        await renderer.getProps().onConfirm();

        const successCall = renderer.setProperties.mock.calls.find(
            ([, patch]) => patch && patch.status === 'success'
        );
        expect(successCall).toBeDefined();
    });

    it('renders the action as not visible when permission checks fail', () => {
        // Visibility is driven solely by useNodeChecks (publish + site-admin).
        useNodeChecks.mockReturnValueOnce({loading: false, checksResult: false, node: {path: '/sites/digitall/home'}});
        useMutation.mockReturnValue([jest.fn(), {loading: false}]);
        const renderer = buildRenderer();
        const renderSpy = jest.fn(() => null);

        render(
            <ComponentRendererContext.Provider value={renderer}>
                <ForcePublishAllActionComponent path="/sites/digitall/home" render={renderSpy}/>
            </ComponentRendererContext.Provider>
        );

        expect(renderSpy).toHaveBeenCalled();
        expect(renderSpy.mock.calls[0][0].isVisible).toBe(false);
        // No dialog is ever registered on the renderer.
        expect(renderer.render).not.toHaveBeenCalled();
    });

    it('renders the Loading component (and not the action) while permission checks are loading', () => {
        useNodeChecks.mockReturnValueOnce({loading: true});
        useMutation.mockReturnValue([jest.fn(), {loading: false}]);
        const renderer = buildRenderer();
        const renderSpy = jest.fn(() => null);
        const loadingSpy = jest.fn(() => null);

        render(
            <ComponentRendererContext.Provider value={renderer}>
                <ForcePublishAllActionComponent path="/sites/digitall/home" render={renderSpy} loading={loadingSpy}/>
            </ComponentRendererContext.Provider>
        );

        // Loading passthrough: no visible-then-hidden flash of the action.
        expect(loadingSpy).toHaveBeenCalled();
        expect(renderSpy).not.toHaveBeenCalled();
    });

    it('disables the Confirm button and marks it aria-busy while the mutation is in flight', async () => {
        // Deferred promise so the mutation stays in flight until the test resolves it.
        let resolveMutation;
        const mutation = jest.fn(() => new Promise(resolve => {
            resolveMutation = resolve;
        }));
        useMutation.mockReturnValue([mutation, {loading: false}]);
        const renderer = buildRenderer();

        renderAction(renderer);
        const dialog = renderDialog(renderer);
        fireEvent.click(dialog.getByText('dialog.confirm'));

        // The very first patch switches the dialog to its in-flight state.
        expect(renderer.setProperties.mock.calls[0]).toEqual([
            'forcePublishAllDialog',
            {status: null, errorMessage: null, isLoading: true}
        ]);

        // Re-render the dialog from the patched props: Confirm is disabled + aria-busy.
        dialog.rerender(dialogElement(renderer));
        const confirmButton = dialog.getByText('dialog.confirm');
        expect(confirmButton.disabled).toBe(true);
        expect(confirmButton.getAttribute('aria-busy')).toBe('true');

        // Clicking the disabled button must not fire the mutation a second time.
        fireEvent.click(confirmButton);
        expect(mutation).toHaveBeenCalledTimes(1);

        // Resolving the mutation releases the in-flight state.
        await act(async () => {
            resolveMutation({data: {}});
        });
        const releaseCall = renderer.setProperties.mock.calls.find(
            ([, patch]) => patch && patch.isLoading === false
        );
        expect(releaseCall).toBeDefined();
    });

    it('flushes the Apollo cache entry for the path and refetches all refetchers before closing', async () => {
        const refetchers = [
            {key: 'contentRefetcher', refetch: jest.fn()},
            {key: 'pickerRefetcher', refetch: jest.fn()}
        ];
        registry.find.mockReturnValue(refetchers);
        registry.get.mockImplementation((type, key) => refetchers.find(entry => entry.key === key));
        const mutation = jest.fn(() => Promise.resolve({data: {}}));
        useMutation.mockReturnValue([mutation, {loading: false}]);
        const renderer = buildRenderer();

        renderAction(renderer);
        await renderer.getProps().onConfirm();

        expect(mockFlushNodeEntryByPath).toHaveBeenCalledTimes(1);
        expect(mockFlushNodeEntryByPath).toHaveBeenCalledWith('/sites/digitall/home');
        refetchers.forEach(entry => expect(entry.refetch).toHaveBeenCalledTimes(1));

        // The close patch happens strictly after the flush and every refetch.
        const closeCallIndex = renderer.setProperties.mock.calls.findIndex(
            ([, patch]) => patch && patch.isOpen === false
        );
        expect(closeCallIndex).toBeGreaterThan(-1);
        const closeOrder = renderer.setProperties.mock.invocationCallOrder[closeCallIndex];
        expect(closeOrder).toBeGreaterThan(mockFlushNodeEntryByPath.mock.invocationCallOrder[0]);
        refetchers.forEach(entry => expect(closeOrder).toBeGreaterThan(entry.refetch.mock.invocationCallOrder[0]));
    });

    it('skips refetcher entries that have no registered refetch and still closes the dialog', async () => {
        // One stale registry entry whose refetcher is gone must not break the flow.
        const liveRefetcher = {key: 'liveRefetcher', refetch: jest.fn()};
        registry.find.mockReturnValue([{key: 'staleRefetcher'}, liveRefetcher]);
        registry.get.mockImplementation((type, key) => (key === 'liveRefetcher' ? liveRefetcher : undefined));
        const mutation = jest.fn(() => Promise.resolve({data: {}}));
        useMutation.mockReturnValue([mutation, {loading: false}]);
        const renderer = buildRenderer();

        renderAction(renderer);
        await renderer.getProps().onConfirm();

        expect(liveRefetcher.refetch).toHaveBeenCalledTimes(1);
        const closeCall = renderer.setProperties.mock.calls.find(
            ([, patch]) => patch && patch.isOpen === false
        );
        expect(closeCall).toBeDefined();
    });

    it('reports error and keeps the dialog open when the cache flush throws after a successful mutation', async () => {
        mockFlushNodeEntryByPath.mockImplementationOnce(() => {
            throw new Error('no jContent cache');
        });
        const mutation = jest.fn(() => Promise.resolve({data: {}}));
        useMutation.mockReturnValue([mutation, {loading: false}]);
        const renderer = buildRenderer();

        renderAction(renderer);
        await renderer.getProps().onConfirm();

        expect(renderer.setProperties).toHaveBeenCalledWith('forcePublishAllDialog', {status: 'error', isLoading: false});
        // No success/close patch was ever applied: the dialog stays open.
        const successOrCloseCall = renderer.setProperties.mock.calls.find(
            ([, patch]) => patch && (patch.status === 'success' || patch.isOpen === false)
        );
        expect(successOrCloseCall).toBeUndefined();
        expect(renderer.getProps().isOpen).toBe(true);
    });

    it('keeps the dialog open after an error and allows a successful retry', async () => {
        const mutation = jest.fn()
            .mockImplementationOnce(() => Promise.resolve({errors: [{message: 'boom'}]}))
            .mockImplementationOnce(() => Promise.resolve({data: {}}));
        useMutation.mockReturnValue([mutation, {loading: false}]);
        const renderer = buildRenderer();

        renderAction(renderer);
        await renderer.getProps().onConfirm();

        // After the error the dialog is still open and Confirm is re-enabled.
        expect(renderer.getProps().isOpen).toBe(true);
        expect(renderer.getProps().isLoading).toBe(false);

        // Retry: the mutation fires again and this time reports success.
        await renderer.getProps().onConfirm();
        expect(mutation).toHaveBeenCalledTimes(2);
        const successCall = renderer.setProperties.mock.calls.find(
            ([, patch]) => patch && patch.status === 'success'
        );
        expect(successCall).toBeDefined();
    });

    it('closes the dialog in the same setProperties call that reports success', async () => {
        const mutation = jest.fn(() => Promise.resolve({data: {}}));
        useMutation.mockReturnValue([mutation, {loading: false}]);
        const renderer = buildRenderer();

        renderAction(renderer);
        await renderer.getProps().onConfirm();

        // Single atomic patch: there is never a render where status==='success'
        // while the dialog is still open (no snackbar exists in this module).
        const successCall = renderer.setProperties.mock.calls.find(
            ([, patch]) => patch && patch.status === 'success'
        );
        expect(successCall).toBeDefined();
        expect(successCall[1]).toEqual({status: 'success', isOpen: false, isLoading: false});
    });

    it('destroys the rendered dialog component on exit', () => {
        useMutation.mockReturnValue([jest.fn(), {loading: false}]);
        const renderer = buildRenderer();

        renderAction(renderer);
        renderer.getProps().onExit();

        expect(renderer.destroy).toHaveBeenCalledWith('forcePublishAllDialog');
    });
});
