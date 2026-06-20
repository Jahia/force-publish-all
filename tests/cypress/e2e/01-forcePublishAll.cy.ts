import { DocumentNode } from 'graphql'

describe('Force Publish All', () => {
    const siteKey = 'digitall'
    const targetPath = `/sites/${siteKey}/home/about`

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const forcePublishAll: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/forcePublishAll.graphql')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const publishNode: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/publishNode.graphql')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const getNode: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/query/getNode.graphql')

    /**
     * The forcePublish job is dispatched to the Quartz scheduler asynchronously.
     * Poll the LIVE workspace until the node is present (or the timeout expires).
     */
    function waitForNodeInLive(path: string, timeout = 60000) {
        return cy.waitUntil(
            () =>
                cy
                    .apollo({
                        query: getNode,
                        variables: { path, workspace: 'LIVE' },
                        errorPolicy: 'ignore',
                    })
                    .then((res: { data?: { jcr?: { nodeByPath?: { uuid: string } | null } } }) => {
                        return Boolean(res?.data?.jcr?.nodeByPath?.uuid)
                    }),
            { timeout, interval: 2000, errorMsg: `Node ${path} never appeared in LIVE workspace` },
        )
    }

    before(() => {
        cy.login()
    })

    it('node under test exists in EDIT workspace', () => {
        cy.apollo({ query: getNode, variables: { path: targetPath, workspace: 'EDIT' } })
            .its('data.jcr.nodeByPath')
            .should((node: { uuid: string; path: string }) => {
                expect(node, `node ${targetPath} must exist in EDIT before the suite runs`).to.not.be.null
                expect(node.path).to.equal(targetPath)
                expect(node.uuid).to.be.a('string')
            })
    })

    it('forcePublish returns true on a published sub-tree', () => {
        // Ensure the sub-tree is published first so the "delete in live then re-publish" path is exercised.
        // Chain each step so the wait only runs after the preceding mutation/query has resolved.
        cy.apollo({ mutation: publishNode, variables: { path: targetPath, languages: ['en'] } })
            .then(() => waitForNodeInLive(targetPath))
            .then(() =>
                cy
                    .apollo({ mutation: forcePublishAll, variables: { path: targetPath } })
                    .its('data.jcr.mutateNode.forcePublish')
                    .should('eq', true),
            )
            // After forcePublish, the node should once again be available in LIVE
            .then(() => waitForNodeInLive(targetPath))
    })

    it('forcePublish returns true on an unpublished node and publishes it to LIVE', () => {
        // Pick a deeper sub-tree to keep the first test idempotent
        const subPath = `/sites/${siteKey}/home/about/history`

        cy.apollo({ query: getNode, variables: { path: subPath, workspace: 'EDIT' } })
            .its('data.jcr.nodeByPath')
            .should('not.be.null')
            .then(() =>
                cy
                    .apollo({ mutation: forcePublishAll, variables: { path: subPath } })
                    .its('data.jcr.mutateNode.forcePublish')
                    .should('eq', true),
            )
            .then(() => waitForNodeInLive(subPath))
    })

    it('forcePublish fails on a path that does not exist', () => {
        const missingPath = `/sites/${siteKey}/home/does-not-exist-${Date.now()}`
        cy.apollo({
            mutation: forcePublishAll,
            variables: { path: missingPath },
            errorPolicy: 'all',
        }).then((res: { errors?: unknown[]; data?: { jcr?: { mutateNode?: unknown } } }) => {
            // Either the GraphQL request reports an error, or mutateNode is null
            const errored = Array.isArray(res.errors) && res.errors.length > 0
            const noMutateNode = !res?.data?.jcr?.mutateNode
            expect(errored || noMutateNode).to.eq(true)
        })
    })
})
