import gql from 'graphql-tag';
import {DocumentNode} from 'graphql'
import { getNodeByPath } from '@jahia/cypress'


describe('Force Publish All', () => {
    const sitePath = Cypress.env('sitePath');
    const jcontentPath = Cypress.env('jcontentPath');
    const graphqlEndpoint = Cypress.env('graphqlEndpoint');
    let addPage: DocumentNode
    let getPage: DocumentNode

    addPage = require(`graphql-tag/loader!../fixtures/graphql/jcr/mutation/addPage.graphql`)
    getPage = require(`graphql-tag/loader!../fixtures/graphql/jcr/query/getNodeByPath.graphql`)

    it('shows action, opens dialog, calls mutation, and publishes to live', function () {
        cy.login();
        cy.apollo({
            mutation: addPage, variables: {
                "parentPath": "/sites/digitall/home/about",
                "nodeName": "testForcePublishAll",
                "pageTitle": "testForcePublishAll Title",
                "templateName": "home"
            },
        }).then((response) => {
            cy.visit('/jahia/jcontent/digitall/en/pages/home/about?params=(sub:!f)');
            cy.get('#moonstone-secondaryNav_wrapper div.moonstone-selected span.flexFluid').rightclick();
            cy.get('[data-registry-key="action:publishMenu"]').last().trigger('mouseover');
            cy.get('[data-registry-key="action:forcePublishAll"]').first().should('have.text', 'Force Publish All');
            cy.get('[data-registry-key="action:forcePublishAll"]').first().click();
            cy.get('[data-cm-role="force-publish-button"]').click();

            cy.log('Wait 5s until data has been published')
            cy.wait(5000);
            getNodeByPath('/sites/digitall/home/about/testForcePublishAll',['jcr:uuid'],'en',null,'LIVE').its('data.jcr.nodeByPath.uuid').as('pageUuid')
            cy.get('@pageUuid').then((uuid) => expect(uuid).not.to.be.empty)
        });
    });

});

