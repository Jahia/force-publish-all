import {DocumentNode} from 'graphql';
import {createUser, deleteUser, grantRoles} from '@jahia/cypress';

/**
 * JContent UI behavior of the Force Publish All action (S10, S11, S12).
 *
 * Selectors are anchored on the module's own data-cm-role test hooks
 * ([data-cm-role="force-publish-dialog"] / [data-cm-role="force-publish-button"]) and on
 * jContent's data-sel-role action hooks; jContent DOM details may need adjustment across
 * jContent versions.
 */
describe('Force Publish All - jContent UI', () => {
    const siteKey = 'digitall';
    const sitePath = `/sites/${siteKey}`;
    const contentsPath = `${sitePath}/contents`;
    const password = 'password';
    const actionLabel = 'Force Publish All';
    const openMenuSelector = '.moonstone-menu:not(.moonstone-hidden)';
    const successMessage = 'The selected path and all its descendants have been published.';

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const publishNode: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/publishNode.graphql');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const addNode: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/addNode.graphql');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const deleteNode: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/deleteNode.graphql');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const getNode: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/query/getNode.graphql');

    type GetNodeResult = { data?: { jcr?: { nodeByPath?: { uuid: string } | null } } }

    function waitForNodeInLive(path: string, timeout = 60000) {
        return cy.waitUntil(
            () =>
                cy
                    .apollo({
                        query: getNode,
                        variables: {path, workspace: 'LIVE'},
                        errorPolicy: 'ignore'
                    })
                    .then((res: GetNodeResult) => Boolean(res?.data?.jcr?.nodeByPath?.uuid)),
            {timeout, interval: 2000, errorMsg: `Node ${path} never appeared in LIVE workspace`}
        );
    }

    function openPublishMenu() {
        cy.get('[data-sel-role="publishMenu"]', {timeout: 30000}).should('be.visible').click();
        return cy.get(openMenuSelector, {timeout: 10000}).should('be.visible');
    }

    before(() => {
        cy.login();
        createUser('fpa-ui-editor', password);
        grantRoles(sitePath, ['editor-in-chief'], 'fpa-ui-editor', 'USER');
        // S12 fixture: dedicated published folder
        cy.apollo({mutation: addNode, variables: {parentPath: contentsPath, name: 'fpa-s12', nodeType: 'jnt:contentFolder'}});
        cy.apollo({mutation: publishNode, variables: {path: `${contentsPath}/fpa-s12`, languages: ['en']}});
        waitForNodeInLive(`${contentsPath}/fpa-s12`);
    });

    after(() => {
        cy.login();
        deleteUser('fpa-ui-editor');
        ['EDIT', 'LIVE'].forEach(workspace => {
            cy.apollo({mutation: deleteNode, variables: {path: `${contentsPath}/fpa-s12`, workspace}, errorPolicy: 'all'});
        });
    });

    it('shows Force Publish All as the LAST entry of the Publish menu and Cancel fires no mutation', () => {
        // Count forcePublish GraphQL operations leaving the browser
        let forcePublishRequests = 0;
        cy.intercept('POST', '**/modules/graphql*', req => {
            if (JSON.stringify(req.body).includes('forcePublish')) {
                forcePublishRequests++;
            }
        });

        cy.login();
        cy.visit(`/jahia/jcontent/${siteKey}/en/pages/home/about`);

        // The action is registered on publishMenu:99 — last position
        openPublishMenu().find('.moonstone-menuItem').last().should('contain.text', actionLabel);

        // Act: open the confirmation dialog
        cy.get(openMenuSelector).find('.moonstone-menuItem').contains(actionLabel).click();

        // Assert: dialog content (title, warning, path, both buttons)
        cy.get('[data-cm-role="force-publish-dialog"]').should('be.visible');
        cy.get('[data-cm-role="force-publish-dialog"]').should('contain.text', 'Force Publish All');
        cy.get('[data-cm-role="force-publish-dialog"]').should(
            'contain.text',
            'This will force-publish the selected path and ALL its descendants. This cannot be undone.'
        );
        cy.get('[data-cm-role="force-publish-dialog"]').should('contain.text', `${sitePath}/home/about`);
        cy.get('[data-cm-role="force-publish-button"]').should('be.visible');

        // Cancel closes the dialog without firing the mutation
        cy.get('[data-cm-role="force-publish-dialog"]').contains('button', 'Cancel').click();
        cy.get('[data-cm-role="force-publish-dialog"]').should('not.exist');
        cy.then(() => {
            expect(forcePublishRequests, 'no forcePublish mutation must have been sent').to.eq(0);
        });
    });

    it('hides the action (not just disabled) from a user lacking site-admin', () => {
        cy.login('fpa-ui-editor', password);
        cy.visit(`/jahia/jcontent/${siteKey}/en/pages/home/about`);

        // Sanity: the Publish menu itself renders for an editor-in-chief...
        openPublishMenu().find('.moonstone-menuItem').should('have.length.greaterThan', 0);

        // ...but the Force Publish All entry is absent
        cy.get(openMenuSelector).find('.moonstone-menuItem').contains(actionLabel).should('not.exist');
        cy.logout();
    });

    it('closes the dialog with NO snackbar and republishes the node when Confirm is clicked', () => {
        cy.login();
        cy.visit(`/jahia/jcontent/${siteKey}/en/content-folders/contents/fpa-s12`);

        openPublishMenu().find('.moonstone-menuItem').contains(actionLabel).click();
        cy.get('[data-cm-role="force-publish-dialog"]').should('be.visible');

        // Act
        cy.get('[data-cm-role="force-publish-button"]').click();

        // Success closes the dialog (single state update, D1) — no snackbar/toast ever shows.
        cy.get('[data-cm-role="force-publish-dialog"]').should('not.exist');
        // eslint-disable-next-line cypress/no-unnecessary-waiting
        cy.wait(2000);
        cy.contains(successMessage).should('not.exist');

        // The node is republished by the async job
        waitForNodeInLive(`${contentsPath}/fpa-s12`);
    });
});
