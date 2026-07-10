import {DocumentNode} from 'graphql';
import {createUser, deleteUser, grantRoles} from '@jahia/cypress';

/**
 * Permission enforcement of forcePublish (S5, S6, S6a).
 *
 * Users (created for this file, deleted in after()):
 * - fpa-editor:    'editor-in-chief' on digitall -> has 'publish', NOT 'site-admin'
 * - fpa-nobody:    'editor' on digitall          -> can read EDIT (so the mutation reaches the
 *                                                   permission guard) but has NO 'publish'
 * - fpa-siteadmin: 'editor-in-chief' + 'site-administrator' -> both required permissions
 */
describe('Force Publish All - permissions', () => {
    const siteKey = 'digitall';
    const sitePath = `/sites/${siteKey}`;
    const contentsPath = `${sitePath}/contents`;
    const targetPath = `${sitePath}/home/about`;
    const password = 'password';

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const forcePublishAll: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/forcePublishAll.graphql');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const publishNode: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/publishNode.graphql');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const addNode: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/addNode.graphql');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const deleteNode: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/deleteNode.graphql');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const getNode: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/query/getNode.graphql');

    type GetNodeResult = { data?: { jcr?: { nodeByPath?: { uuid: string } | null } } }
    type MutationResult = {
        errors?: readonly { message: string }[]
        data?: { jcr?: { mutateNode?: { forcePublish?: boolean } } }
    }

    // Runs a GraphQL operation authenticated as the given user. This makes the user's
    // client current for subsequent cy.apollo() calls — call resetToRootClient() before
    // any follow-up root operation.
    const apolloAs = (username: string, options: Parameters<Cypress.Chainable['apollo']>[0]) =>
        cy.apolloClient({username, password}).apollo(options);

    const resetToRootClient = () => cy.apolloClient();

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

    function deleteNodeIfExists(path: string, workspace: 'EDIT' | 'LIVE') {
        return cy.apollo({mutation: deleteNode, variables: {path, workspace}, errorPolicy: 'all'});
    }

    before(() => {
        cy.login();
        createUser('fpa-editor', password);
        grantRoles(sitePath, ['editor-in-chief'], 'fpa-editor', 'USER');
        createUser('fpa-nobody', password);
        grantRoles(sitePath, ['editor'], 'fpa-nobody', 'USER');
        createUser('fpa-siteadmin', password);
        grantRoles(sitePath, ['editor-in-chief', 'site-administrator'], 'fpa-siteadmin', 'USER');
    });

    after(() => {
        cy.login();
        resetToRootClient();
        // Restore the ACL on the S6a fixture before deleting it, then remove all fixtures
        cy.executeGroovy('groovy/setAclInheritanceBreak.groovy', {
            NODE_PATH: `${contentsPath}/fpa-s6a/denied`,
            ACL_BREAK: 'false'
        });
        ['fpa-s6', 'fpa-s6a'].forEach(name => {
            deleteNodeIfExists(`${contentsPath}/${name}`, 'EDIT');
            deleteNodeIfExists(`${contentsPath}/${name}`, 'LIVE');
        });
        deleteUser('fpa-editor');
        deleteUser('fpa-nobody');
        deleteUser('fpa-siteadmin');
    });

    it('rejects callers with AccessDenied messages naming the missing permission, with zero live impact', () => {
        // Arrange: a published node whose live copy we can prove untouched afterwards
        cy.apollo({mutation: publishNode, variables: {path: targetPath, languages: ['en']}});
        waitForNodeInLive(targetPath);
        cy.apollo({query: getNode, variables: {path: targetPath, workspace: 'LIVE'}})
            .its('data.jcr.nodeByPath.uuid')
            .then((liveUuid: string) => {
                // Act 1: user with 'publish' but without 'site-admin'
                apolloAs('fpa-editor', {mutation: forcePublishAll, variables: {path: targetPath}, errorPolicy: 'all'}).then(
                    (res: MutationResult) => {
                        const messages = (res.errors || []).map(error => error.message).join(' | ');
                        expect(messages).to.contain('Permission \'site-admin\' is required');
                        expect(messages).to.contain(targetPath);
                        expect(res?.data?.jcr?.mutateNode?.forcePublish).to.not.eq(true);
                    }
                );

                // Act 2: user without 'publish' — checked FIRST (F4 ordering)
                apolloAs('fpa-nobody', {mutation: forcePublishAll, variables: {path: targetPath}, errorPolicy: 'all'}).then(
                    (res: MutationResult) => {
                        const messages = (res.errors || []).map(error => error.message).join(' | ');
                        expect(messages).to.contain('Permission \'publish\' is required');
                        expect(res?.data?.jcr?.mutateNode?.forcePublish).to.not.eq(true);
                    }
                );

                // Assert: no side effect at all — same live node, same uuid
                resetToRootClient();
                cy.apollo({query: getNode, variables: {path: targetPath, workspace: 'LIVE'}})
                    .its('data.jcr.nodeByPath.uuid')
                    .should('eq', liveUuid);
            });
    });

    it('succeeds for a non-root user holding both publish and site-admin', () => {
        const nodePath = `${contentsPath}/fpa-s6`;

        // Arrange: small dedicated node, published as root
        cy.apollo({mutation: addNode, variables: {parentPath: contentsPath, name: 'fpa-s6', nodeType: 'jnt:contentFolder'}});
        cy.apollo({mutation: publishNode, variables: {path: nodePath, languages: ['en']}});
        waitForNodeInLive(nodePath);

        // Act: forcePublish as the non-root user carrying both permissions
        apolloAs('fpa-siteadmin', {mutation: forcePublishAll, variables: {path: nodePath}})
            .its('data.jcr.mutateNode.forcePublish')
            .should('eq', true);

        // Assert: the node comes back to LIVE
        resetToRootClient();
        waitForNodeInLive(nodePath);
    });

    it('silently loses live descendants the caller cannot publish while still returning true', () => {
        const parentPath = `${contentsPath}/fpa-s6a`;

        // Arrange: parent with two published children, then break ACL inheritance on
        // 'denied' so fpa-siteadmin loses every permission (incl. publish) there.
        cy.apollo({mutation: addNode, variables: {parentPath: contentsPath, name: 'fpa-s6a', nodeType: 'jnt:contentFolder'}});
        cy.apollo({mutation: addNode, variables: {parentPath, name: 'allowed', nodeType: 'jnt:contentFolder'}});
        cy.apollo({mutation: addNode, variables: {parentPath, name: 'denied', nodeType: 'jnt:contentFolder'}});
        cy.apollo({mutation: publishNode, variables: {path: parentPath, languages: ['en']}});
        waitForNodeInLive(`${parentPath}/allowed`);
        waitForNodeInLive(`${parentPath}/denied`);
        cy.executeGroovy('groovy/setAclInheritanceBreak.groovy', {
            NODE_PATH: `${parentPath}/denied`,
            ACL_BREAK: 'true'
        });

        // Act: forcePublish the parent as the restricted (non-root) caller — still true
        apolloAs('fpa-siteadmin', {mutation: forcePublishAll, variables: {path: parentPath}})
            .its('data.jcr.mutateNode.forcePublish')
            .should('eq', true);

        // Assert: the parent and the allowed child are republished first...
        resetToRootClient();
        waitForNodeInLive(parentPath);
        waitForNodeInLive(`${parentPath}/allowed`);

        // ...but 'denied' was live-deleted by the root system session and filtered out
        // of the republication (CHECK_PERMISSIONS=true): silent live data loss.
        cy.apollo({query: getNode, variables: {path: `${parentPath}/denied`, workspace: 'LIVE'}, errorPolicy: 'ignore'}).then(
            (res: GetNodeResult) => {
                expect(
                    Boolean(res?.data?.jcr?.nodeByPath?.uuid),
                    'the denied child must have disappeared from LIVE'
                ).to.eq(false);
            }
        );
    });
});
