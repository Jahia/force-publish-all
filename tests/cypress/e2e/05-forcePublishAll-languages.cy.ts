import {DocumentNode} from 'graphql';
import {createSite, deleteSite} from '@jahia/cypress';

/**
 * Language scope of forcePublish (S9): only the site's ACTIVE LIVE languages are published.
 * Uses a throwaway site (en + fr, fr flagged inactive in live) so digitall is untouched.
 */
describe('Force Publish All - active live languages', () => {
    const siteKey = 'fpa-lang';
    const sitePath = `/sites/${siteKey}`;
    const targetPath = `${sitePath}/contents`;
    const textPath = `${targetPath}/fpa-s9-text`;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const forcePublishAll: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/forcePublishAll.graphql');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const addNode: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/addNode.graphql');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const setSiteInactiveLiveLanguages: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/mutation/setSiteInactiveLiveLanguages.graphql');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const getNodeWithProperty: DocumentNode = require('graphql-tag/loader!../fixtures/graphql/query/getNodeWithProperty.graphql');

    type GetPropertyResult = {
        data?: { jcr?: { nodeByPath?: { uuid: string; property?: { value: string } | null } | null } }
    }

    function waitForPropertyInLive(path: string, property: string, language: string, timeout = 60000) {
        return cy.waitUntil(
            () =>
                cy
                    .apollo({
                        query: getNodeWithProperty,
                        variables: {path, workspace: 'LIVE', property, language},
                        errorPolicy: 'ignore'
                    })
                    .then((res: GetPropertyResult) => Boolean(res?.data?.jcr?.nodeByPath?.property?.value)),
            {
                timeout,
                interval: 2000,
                errorMsg: `Property ${property}[${language}] of ${path} never appeared in LIVE workspace`
            }
        );
    }

    before(() => {
        cy.login();
        createSite(siteKey, {languages: 'en,fr', templateSet: 'dx-base-demo-templates', serverName: 'localhost', locale: 'en'});
        // Flag fr as INACTIVE in live: it must never be published
        cy.apollo({mutation: setSiteInactiveLiveLanguages, variables: {sitePath, languages: ['fr']}});
        // A text content carrying BOTH an en and a fr translation in EDIT
        cy.apollo({
            mutation: addNode,
            variables: {
                parentPath: targetPath,
                name: 'fpa-s9-text',
                nodeType: 'jnt:text',
                properties: [
                    {name: 'text', language: 'en', value: 'English content S9'},
                    {name: 'text', language: 'fr', value: 'Contenu français S9'}
                ]
            }
        });
    });

    after(() => {
        cy.login();
        deleteSite(siteKey);
    });

    it('publishes only the active live languages (inactive fr never reaches LIVE)', () => {
        // Act: forcePublish the contents folder carrying the bilingual text node
        cy.apollo({mutation: forcePublishAll, variables: {path: targetPath}})
            .its('data.jcr.mutateNode.forcePublish')
            .should('eq', true);

        // Assert: the en translation is published...
        waitForPropertyInLive(textPath, 'text', 'en');
        cy.apollo({query: getNodeWithProperty, variables: {path: textPath, workspace: 'LIVE', property: 'text', language: 'en'}})
            .its('data.jcr.nodeByPath.property.value')
            .should('eq', 'English content S9');

        // ...while the fr translation (inactive live language) is absent from LIVE
        cy.apollo({
            query: getNodeWithProperty,
            variables: {path: textPath, workspace: 'LIVE', property: 'text', language: 'fr'},
            errorPolicy: 'ignore'
        }).then((res: GetPropertyResult) => {
            expect(res?.data?.jcr?.nodeByPath?.property?.value, 'fr content must not reach LIVE').to.be.undefined;
        });
    });
});
