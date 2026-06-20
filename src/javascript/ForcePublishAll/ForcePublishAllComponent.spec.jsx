import React from 'react';
import {render, fireEvent} from '@testing-library/react';
import {ForcePublishAllActionComponent} from './ForcePublishAllComponent';
import ForcePublishAll from './ForcePublishAll';
import {useMutation} from '@apollo/react-hooks';
import {ComponentRendererContext} from '@jahia/ui-extender';

// --- Mocks -----------------------------------------------------------------

jest.mock('@apollo/react-hooks', () => ({
    useMutation: jest.fn(),
    useApolloClient: jest.fn(() => ({
        cache: {flushNodeEntryByPath: jest.fn()}
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
jest.mock('@jahia/moonstone', () => ({
    Button: ({label, onClick, disabled, ...props}) => {
        const React3 = require('react');
        return React3.createElement(
            'button',
            {onClick, disabled, 'data-label': label, ...props},
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

// Render the dialog directly with the props captured by the renderer.
const renderDialog = renderer => {
    const p = renderer.getProps();
    return render(
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

beforeEach(() => {
    jest.clearAllMocks();
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
});
