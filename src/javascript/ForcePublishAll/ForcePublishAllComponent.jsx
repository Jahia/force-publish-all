import React, {useContext} from 'react';
import ForcePublishAll from './ForcePublishAll';
import {ComponentRendererContext, registry} from '@jahia/ui-extender';
import {useNodeChecks} from '@jahia/data-helper';
import PropTypes from 'prop-types';
import {ForcePublishAllMutation} from './forcePublishAll.gql-mutation';
import {useApolloClient, useMutation} from '@apollo/react-hooks';

const triggerRefetch = (name, queryParams) => {
    const refetch = registry.get('refetcher', name);
    if (!refetch) {
        return;
    }

    if (queryParams) {
        refetch.refetch(queryParams);
    } else {
        refetch.refetch();
    }
};

const triggerRefetchAll = () => {
    registry.find({type: 'refetcher'}).forEach(refetch => triggerRefetch(refetch.key));
};

export const ForcePublishAllActionComponent = ({path, render: Render, loading: Loading, ...others}) => {
    const componentRenderer = useContext(ComponentRendererContext);
    const res = useNodeChecks({path}, {...others, requiredPermission: ['publish', 'site-admin']});
    const client = useApolloClient();
    const [mutation, {loading: mutationLoading}] = useMutation(ForcePublishAllMutation);
    if (res.loading) {
        return (Loading && <Loading {...others}/>) || false;
    }

    // Pure cancel: close the dialog WITHOUT mutating.
    const handleClose = () => {
        componentRenderer.setProperties('forcePublishAllDialog', {isOpen: false});
    };

    // Confirm: run the destructive mutation, with explicit error handling.
    const handleConfirm = () => {
        // Drive isLoading via setProperties so the Confirm button actually disables
        // while the mutation is in flight (the value captured at render() time is stale).
        componentRenderer.setProperties('forcePublishAllDialog', {status: null, errorMessage: null, isLoading: true});
        return mutation({
            variables: {
                path: path
            }
        }).then(result => {
            if (result && result.errors && result.errors.length > 0) {
                componentRenderer.setProperties('forcePublishAllDialog', {status: 'error', isLoading: false});
                return;
            }

            client.cache.flushNodeEntryByPath(path);
            triggerRefetchAll();
            componentRenderer.setProperties('forcePublishAllDialog', {status: 'success', isOpen: false, isLoading: false});
        }).catch(() => {
            componentRenderer.setProperties('forcePublishAllDialog', {status: 'error', isLoading: false});
        });
    };

    return (
        <Render
            {...others}
            isVisible={res.checksResult}
            onClick={() => {
                componentRenderer.render('forcePublishAllDialog', ForcePublishAll, {
                    isOpen: true,
                    isLoading: mutationLoading,
                    status: null,
                    path: res.node.path,
                    onConfirm: handleConfirm,
                    onClose: handleClose,
                    onExit: () => {
                        componentRenderer.destroy('forcePublishAllDialog');
                    }
                });
            }}
        />
    );
};

ForcePublishAllActionComponent.propTypes = {
    path: PropTypes.string,
    render: PropTypes.func.isRequired,
    loading: PropTypes.func
};
