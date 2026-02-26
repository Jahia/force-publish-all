import gql from 'graphql-tag';


describe('Force Publish All', () => {
    const sitePath = Cypress.env('sitePath');
    const jcontentPath = Cypress.env('jcontentPath');
    const graphqlEndpoint = Cypress.env('graphqlEndpoint');

    it('shows action, opens dialog, calls mutation, and publishes to live', function() {
        cy.login();
        cy.visit('/jahia/jcontent/digitall/en/pages/home/about?params=(sub:!f)');
        cy.get('#moonstone-secondaryNav_wrapper div.moonstone-selected span.flexFluid').rightclick();
        cy.get('[data-registry-key="action:publishMenu"]').last().trigger('mouseover');
        cy.get('[data-registry-key="action:forcePublishAll"]').first().should('have.text', 'Force Publish All');
        cy.get('[data-registry-key="action:forcePublishAll"]').first().click();
        cy.get('[data-cm-role="force-publish-button"]').click();
    });

});

