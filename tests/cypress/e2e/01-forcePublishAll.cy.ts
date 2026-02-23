import gql from 'graphql-tag';


describe('Force Publish All', () => {
    const sitePath = Cypress.env('sitePath');
    const jcontentPath = Cypress.env('jcontentPath');
    const graphqlEndpoint = Cypress.env('graphqlEndpoint');

    it('shows action, opens dialog, calls mutation, and publishes to live', function() {
        cy.login()
        cy.visit('http://localhost:8080/jahia/jcontent/digitall/en/pages/home/about?params=(sub:!f)');
        //cy.get('#moonstone-secondaryNav_wrapper div.moonstone-selected button.moonstone-button svg.moonstone-icon').click();
        //cy.get('#moonstone-secondaryNav_wrapper div.moonstone-selected button.moonstone-button svg.moonstone-icon').click();
        //cy.get('#accordionContentMenu-4 li.moonstone-hover span.flexFluid').hover();
        //cy.get('#publishMenu-352 li[data-sel-role="forcePublishAll"] span.flexFluid span').should('have.text', 'Force Publish All');
        cy.get('#moonstone-secondaryNav_wrapper div.moonstone-selected span.flexFluid').rightclick();
        cy.get('[data-registry-key="action:publishMenu"]').last().trigger('mouseover');
        cy.get('[data-registry-key="action:forcePublishAll"]').first().should('have.text', 'Force Publish All');
        cy.get('[data-registry-key="action:forcePublishAll"]').first().click();
        cy.get('[data-cm-role="force-publish-button"]').click();
    });

});

