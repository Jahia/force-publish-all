import {DocumentNode} from 'graphql';

/**
 * Live-delete semantics of forcePublish (S4, S7, S8).
 *
 * The delete step runs SYNCHRONOUSLY inside the mutation (only the republication job is
 * async), so live-state assertions made immediately after the mutation resolves observe
 * the delete step alone. Every test creates its own fixtures under /sites/digitall/contents
 * and cleans them up in both workspaces — no shared digitall content is modified.
 */
describe('Force Publish All - live-delete step', () => {
    const siteKey = 'digitall';
    const contentsPath = `/sites/${siteKey}/contents`;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const forcePublishAll: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/forcePublishAll.graphql');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const forcePublishAllLive: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/forcePublishAllLive.graphql');
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

    function assertAbsentFromLive(path: string) {
        return cy
            .apollo({query: getNode, variables: {path, workspace: 'LIVE'}, errorPolicy: 'ignore'})
            .then((res: GetNodeResult) => {
                expect(Boolean(res?.data?.jcr?.nodeByPath?.uuid), `node ${path} must be absent from LIVE`).to.eq(false);
            });
    }

    function deleteNodeIfExists(path: string, workspace: 'EDIT' | 'LIVE') {
        // ErrorPolicy 'all' swallows the error raised when the node no longer exists
        return cy.apollo({mutation: deleteNode, variables: {path, workspace}, errorPolicy: 'all'});
    }

    before(() => {
        cy.login();
    });

    afterEach(() => {
        // Each test uses a fixture folder named after itself — clean both workspaces
        ['fpa-s4', 'fpa-s7', 'fpa-s8'].forEach(name => {
            deleteNodeIfExists(`${contentsPath}/${name}`, 'EDIT');
            deleteNodeIfExists(`${contentsPath}/${name}`, 'LIVE');
        });
    });

    it('destroys live-only (UGC) descendant content and never restores it', () => {
        const parentPath = `${contentsPath}/fpa-s4`;

        // Arrange: published folder with one child, plus a second child existing in LIVE only
        cy.apollo({mutation: addNode, variables: {parentPath: contentsPath, name: 'fpa-s4', nodeType: 'jnt:contentFolder'}});
        cy.apollo({mutation: addNode, variables: {parentPath, name: 'child-edit', nodeType: 'jnt:contentFolder'}});
        cy.apollo({mutation: publishNode, variables: {path: parentPath, languages: ['en']}});
        waitForNodeInLive(parentPath);
        cy.apollo({
            mutation: addNode,
            variables: {parentPath, name: 'child-live-only', nodeType: 'jnt:contentFolder', workspace: 'LIVE'}
        });
        cy.apollo({query: getNode, variables: {path: `${parentPath}/child-live-only`, workspace: 'LIVE'}})
            .its('data.jcr.nodeByPath.uuid')
            .should('be.a', 'string');
        cy.apollo({query: getNode, variables: {path: `${parentPath}/child-live-only`, workspace: 'EDIT'}, errorPolicy: 'ignore'}).then(
            (res: GetNodeResult) => {
                expect(Boolean(res?.data?.jcr?.nodeByPath?.uuid), 'live-only child must not exist in EDIT').to.eq(false);
            }
        );

        // Act
        cy.apollo({mutation: forcePublishAll, variables: {path: parentPath}})
            .its('data.jcr.mutateNode.forcePublish')
            .should('eq', true);

        // Assert: the delete step is synchronous — the live-only child is already gone
        assertAbsentFromLive(`${parentPath}/child-live-only`);

        // The EDIT content is republished by the async job...
        waitForNodeInLive(parentPath);
        waitForNodeInLive(`${parentPath}/child-edit`);

        // ...but the live-only child is destroyed for good
        assertAbsentFromLive(`${parentPath}/child-live-only`);
    });

    it('rejects a forcePublish on the LIVE workspace with GqlJcrWrongInputException and zero side effects', () => {
        const parentPath = `${contentsPath}/fpa-s7`;

        // Arrange: a published node whose live copy we can observe
        cy.apollo({mutation: addNode, variables: {parentPath: contentsPath, name: 'fpa-s7', nodeType: 'jnt:contentFolder'}});
        cy.apollo({mutation: publishNode, variables: {path: parentPath, languages: ['en']}});
        waitForNodeInLive(parentPath);
        cy.apollo({query: getNode, variables: {path: parentPath, workspace: 'LIVE'}})
            .its('data.jcr.nodeByPath.uuid')
            .as('fpaS7LiveUuid');

        // Act: the same mutation, but against jcr(workspace: LIVE)
        cy.apollo({mutation: forcePublishAllLive, variables: {path: parentPath}, errorPolicy: 'all'}).then(
            (res: {
                errors?: readonly { message: string }[]
                data?: { jcr?: { mutateNode?: { forcePublish?: boolean } } }
            }) => {
                // Assert: the constructor guard fires
                const messages = (res.errors || []).map(error => error.message).join(' | ');
                expect(messages).to.contain('Publication fields can only be used with nodes from EDIT workspace');
                expect(res?.data?.jcr?.mutateNode?.forcePublish).to.not.eq(true);
            }
        );

        // Assert: no delete, no job — the live node is still there, same uuid
        cy.get('@fpaS7LiveUuid').then(liveUuid => {
            cy.apollo({query: getNode, variables: {path: parentPath, workspace: 'LIVE'}})
                .its('data.jcr.nodeByPath.uuid')
                .should('eq', liveUuid);
        });
    });

    it('leaves a same-path different-UUID live node untouched by the synchronous delete step', () => {
        const parentPath = `${contentsPath}/fpa-s8`;
        const itemPath = `${parentPath}/item`;

        // Arrange: publish item, then delete + recreate it in EDIT only (same path, new uuid)
        cy.apollo({mutation: addNode, variables: {parentPath: contentsPath, name: 'fpa-s8', nodeType: 'jnt:contentFolder'}});
        cy.apollo({mutation: addNode, variables: {parentPath, name: 'item', nodeType: 'jnt:contentFolder'}});
        cy.apollo({mutation: publishNode, variables: {path: parentPath, languages: ['en']}});
        waitForNodeInLive(itemPath);
        cy.apollo({query: getNode, variables: {path: itemPath, workspace: 'LIVE'}})
            .its('data.jcr.nodeByPath.uuid')
            .then((oldLiveUuid: string) => {
                cy.apollo({mutation: deleteNode, variables: {path: itemPath, workspace: 'EDIT'}});
                cy.apollo({mutation: addNode, variables: {parentPath, name: 'item', nodeType: 'jnt:contentFolder'}})
                    .its('data.jcr.addNode.uuid')
                    .then((newUuid: string) => {
                        expect(newUuid).to.not.eq(oldLiveUuid);

                        // Act: forcePublish the NEW node occupying the same path
                        cy.apollo({mutation: forcePublishAll, variables: {path: itemPath}})
                            .its('data.jcr.mutateNode.forcePublish')
                            .should('eq', true);

                        // Assert IMMEDIATELY after the mutation: delete-by-UUID (of the new uuid)
                        // found nothing to delete, so the old live node survived the delete step.
                        // The final state after the async job is deliberately NOT asserted
                        // (conflict outcome is Jahia-version dependent).
                        cy.apollo({query: getNode, variables: {path: itemPath, workspace: 'LIVE'}})
                            .its('data.jcr.nodeByPath.uuid')
                            .should('eq', oldLiveUuid);
                    });
            });
    });
});
