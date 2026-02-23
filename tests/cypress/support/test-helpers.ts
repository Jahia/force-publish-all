import { addNode, enableModule, deleteSite, createSite } from '@jahia/cypress'
import { FORCE_PUBLISH_ALL_MODULE_ID, SiteConfig } from './constants'
import { JContent } from '@jahia/jcontent-cypress/dist/page-object/jcontent'
import { createKeepeekContent } from './graphql-utils'
import { JCONTENT_SELECTORS } from '../page-object/picker'

/**
 * Shared test suite for Keepeek Image rendering tests
 * This function creates a complete test suite for testing image rendering with different templates
 *
 * @param siteConfig - Site configuration (JSP or TSX)
 * @param testNumber - Test number for identification (e.g., '05.0', '06.0')
 * @param templateType - Template type for description (e.g., 'JSP', 'TSX')
 */
export function createImageRenderingTestSuite(siteConfig: SiteConfig, testNumber: string, templateType: string) {
    describe(`Keepicker Module - Test ${testNumber}: Create Keepeek Image and Configure Views with ${templateType} template`, () => {
        let keepeekUUID: string

        // Get Keepeek DAM Image ID from environment variable
        const keepeekDamId = Cypress.env('KPK_KEEPEEK_DAM_IMAGE_ID') || '23739'

        // FileReference content configuration
        const CONTENT = {
            path: `/sites/${siteConfig.key}/contents`,
            name: 'fileReference2KeepeekImage',
            title: `Keepeek Image ${keepeekDamId}`,
            type: 'jnt:fileReference',
            searchKey: 'fileReference2KeepeekImage',
        }

        /**
         * Helper function to configure reference view and verify images
         */
        const configureAndVerifyReferenceView = (
            viewName: string,
            dimension: string,
            size: string,
            toggleReferenceViewOption: boolean = true,
        ) => {
            cy.log(`🔄 Configuring reference view to ${viewName}...`)

            const jcontent = JContent.visit(siteConfig.key, 'en', 'content-folders/contents').switchToListMode()

            // Edit content to configure reference view
            cy.log('✅ Verifying content in table and edit...')
            jcontent.getTable().getRowByLabel(CONTENT.title).should('exist')
            const contentEditor = jcontent.editComponentByText(CONTENT.title)

            // Open Layout section
            cy.log('📐 Opening Layout section...')
            contentEditor.openSection('layout')

            // Toggle Reference view option if needed
            if (toggleReferenceViewOption) {
                cy.log('📂 Toggling Reference view option...')
                contentEditor.toggleOption('jmix:renderableReference', 'Reference view')
            }

            // Get reference view picker field
            cy.log(`🔍 Getting reference view field...`)
            const picker = contentEditor.getChoiceListField('jmix:renderableReference_j:referenceView')

            // Select view
            cy.log(`📏 Selecting ${viewName} view...`)
            picker.selectValue(viewName)

            contentEditor.closeSection('layout')

            // Save content
            cy.log('💾 Saving content...')
            contentEditor.save()

            // Verify images contain dimension parameter in src
            const dimensionParam = `${dimension}=${size}`
            const imageId1 = dimension === 'w' ? 'keepickerTestImageW' : 'keepickerTestImageH'
            const imageId2 = dimension === 'w' ? 'keepickerTestImageWidth' : 'keepickerTestImageHeight'

            jcontent.getTable().getRowByLabel(CONTENT.title).contextMenu().select('Preview')

            // Verify first image
            cy.log(`🔍 Verifying ${imageId1}${size}...`)
            cy.get(JCONTENT_SELECTORS.previewIframe).its('0.contentDocument.body').should('be.visible')
            cy.get(JCONTENT_SELECTORS.previewIframe)
                .its('0.contentDocument.body')
                .find(`img#${imageId1}${size}`)
                .should('be.visible')
                .should('have.attr', 'src')
                .should('include', dimensionParam)

            // Verify second image
            cy.log(`🔍 Verifying ${imageId2}${size}...`)
            cy.get(JCONTENT_SELECTORS.previewIframe).its('0.contentDocument.body').should('be.visible')
            cy.get(JCONTENT_SELECTORS.previewIframe)
                .its('0.contentDocument.body')
                .find(`img#${imageId2}${size}`)
                .should('be.visible')
                .should('have.attr', 'src')
                .should('include', dimensionParam)

            cy.log(`✅ Reference view configured and verified with ${dimensionParam}`)
        }

        // Setup before all tests
        before('Setup: Enable module and create Keepeek content', () => {
            createSite(siteConfig.key, siteConfig.config)
            enableModule(FORCE_PUBLISH_ALL_MODULE_ID, siteConfig.key)
            // Create Keepeek content as prerequisite for tests
            createKeepeekContent(keepeekDamId).then((uuid) => {
                keepeekUUID = String(uuid)
            })
        })

        // Login before each test
        beforeEach('Login to Jahia', () => {
            cy.login()
        })

        // Logout after each test
        afterEach('Logout from Jahia', () => {
            cy.logout()
        })

        // Clean up after all tests
        after('Clean up site', () => {
            deleteSite(siteConfig.key)
        })

        // Test: Create fileReference content and verify image rendering
        it('Should create fileReference and verify image is rendered', () => {
            // Create fileReference content
            cy.log('📝 Creating jnt:fileReference content in content folder...')
            addNode({
                parentPathOrId: CONTENT.path,
                primaryNodeType: CONTENT.type,
                name: CONTENT.name,
                properties: [
                    { name: 'jcr:title', value: CONTENT.title },
                    { name: 'j:node', value: keepeekUUID },
                ],
            })
            cy.log('✅ FileReference created')

            // Access jContent
            cy.log('🌐 Accessing jContent...')
            const jcontent = JContent.visit(siteConfig.key, 'en', 'content-folders/contents').switchToListMode()

            // Verify content and image
            cy.log('✅ Verifying content in table...')
            jcontent.getTable().getRowByLabel(CONTENT.title).should('exist')
            jcontent.getTable().getRowByLabel(CONTENT.title).contextMenu().select('Preview')
            cy.get(JCONTENT_SELECTORS.previewIframe).its('0.contentDocument.body').should('be.visible')
            cy.get(JCONTENT_SELECTORS.previewIframe)
                .its('0.contentDocument.body')
                .find(`img[alt="${keepeekDamId}"]`)
                .should('exist')
                .and('be.visible')

            cy.log('✅ Step 2 completed: fileReference created and image verified')
        })

        // Test: Configure reference view to resized.w1024
        it('Should edit fileReference and configure reference view to resized.w1024', () => {
            configureAndVerifyReferenceView('resized.w1024', 'w', '1024', true)
            cy.log('✅ Step 3 completed: Reference view configured and verified with w=1024')
        })

        // Test: Configure reference view to resized.h768
        it('Should edit fileReference and configure reference view to resized.h768', () => {
            configureAndVerifyReferenceView('resized.h768', 'h', '768', false)
            cy.log('✅ Step 4 completed: Reference view configured and verified with h=768')
        })
    })
}

/**
 * Shared test suite for Keepeek Video rendering tests
 * This function creates a complete test suite for testing video rendering with different templates
 *
 * @param siteConfig - Site configuration (JSP or TSX)
 * @param testNumber - Test number for identification (e.g., '05.1', '06.1')
 * @param templateType - Template type for description (e.g., 'JSP', 'TSX')
 */
export function createVideoRenderingTestSuite(siteConfig: SiteConfig, testNumber: string, templateType: string) {
    describe(`Keepicker Module - Test ${testNumber}: Create Keepeek Video and Test Video Player view with ${templateType} template`, () => {
        let keepeekUUID: string

        // Get Keepeek DAM Video ID from environment variable
        const keepeekDamId = Cypress.env('KPK_KEEPEEK_DAM_VIDEO_ID') || '15484'

        // FileReference content configuration
        const CONTENT = {
            path: `/sites/${siteConfig.key}/contents`,
            name: 'fileReference2KeepeekVideo',
            title: `Keepeek Video ${keepeekDamId}`,
            type: 'jnt:fileReference',
            searchKey: 'fileReference2KeepeekVideo',
        }

        /**
         * Helper function to configure reference view for video
         */
        const configureReferenceView = (viewName: string, toggleReferenceViewOption: boolean = true) => {
            cy.log(`🔄 Configuring reference view to ${viewName}...`)

            // Navigate to content-folders/contents in list mode
            cy.log('🌐 Accessing jContent content-folders/contents in list mode...')
            const jcontent = JContent.visit(siteConfig.key, 'en', 'content-folders/contents').switchToListMode()

            // Edit content to configure reference view
            cy.log('✅ Verifying content in table and edit...')
            jcontent.getTable().getRowByLabel(CONTENT.title).should('exist')
            const contentEditor = jcontent.editComponentByText(CONTENT.title)

            // Open Layout section
            cy.log('📐 Opening Layout section...')
            contentEditor.openSection('layout')

            // Toggle Reference view option if needed
            if (toggleReferenceViewOption) {
                cy.log('📂 Toggling Reference view option...')
                contentEditor.toggleOption('jmix:renderableReference', 'Reference view')
            }

            // Get reference view picker field
            cy.log(`🔍 Getting reference view field...`)
            const picker = contentEditor.getChoiceListField('jmix:renderableReference_j:referenceView')

            // Select view
            cy.log(`📏 Selecting ${viewName} view...`)
            picker.selectValue(viewName)

            contentEditor.closeSection('layout')

            // Save content
            cy.log('💾 Saving content...')
            contentEditor.save()

            cy.log(`✅ Reference view configured to ${viewName}`)
        }

        // Setup before all tests
        before('Setup: Enable module and create Keepeek content', () => {
            createSite(siteConfig.key, siteConfig.config)
            enableModule(FORCE_PUBLISH_ALL_MODULE_ID, siteConfig.key)
            // Create Keepeek content as prerequisite for tests
            createKeepeekContent(keepeekDamId).then((uuid) => {
                keepeekUUID = String(uuid)
            })
        })

        // Login before each test
        beforeEach('Login to Jahia', () => {
            cy.login()
        })

        // Logout after each test
        afterEach('Logout from Jahia', () => {
            cy.logout()
        })

        // Clean up after all tests
        after('Clean up site', () => {
            deleteSite(siteConfig.key)
        })

        // Test: Create fileReference content and verify Keepeek player rendering
        it('Should create fileReference and verify Keepeek player is rendered', () => {
            // Create fileReference content
            cy.log('📝 Creating jnt:fileReference content in pagecontent...')
            addNode({
                parentPathOrId: CONTENT.path,
                primaryNodeType: CONTENT.type,
                name: CONTENT.name,
                properties: [
                    { name: 'jcr:title', value: CONTENT.title },
                    { name: 'j:node', value: keepeekUUID },
                ],
            })
            cy.log('✅ FileReference created')

            // Access jContent
            cy.log('🌐 Accessing jContent...')
            const jcontent = JContent.visit(siteConfig.key, 'en', 'content-folders/contents').switchToListMode()

            // Verify content and open preview
            cy.log('✅ Verifying content in table...')
            jcontent.getTable().getRowByLabel(CONTENT.title).should('exist')
            jcontent.getTable().getRowByLabel(CONTENT.title).contextMenu().select('Preview')

            // Verify Keepeek video player component in iframe
            cy.log('🔍 Verifying kpk-video component...')
            cy.get(JCONTENT_SELECTORS.previewIframe).its('0.contentDocument.body').should('be.visible')
            cy.get(JCONTENT_SELECTORS.previewIframe)
                .its('0.contentDocument.body')
                .find('kpk-video#kpkvid')
                .should('exist')
                .and('be.visible')
                .and('have.class', 'hydrated')

            // Verify video element inside kpk-video Shadow DOM
            cy.log('🔍 Verifying video element in Shadow DOM...')
            cy.get(JCONTENT_SELECTORS.previewIframe)
                .its('0.contentDocument.body')
                .find('kpk-video#kpkvid')
                .within(() => {
                    cy.get('video#video_html5_api').should('exist')
                })

            // Verify poster image in Shadow DOM
            cy.log('🔍 Verifying poster image in Shadow DOM...')
            cy.get(JCONTENT_SELECTORS.previewIframe)
                .its('0.contentDocument.body')
                .find('kpk-video#kpkvid')
                .within(() => {
                    cy.get('.vjs-poster').should('exist').and('have.attr', 'style').and('include', keepeekDamId)
                })

            cy.log('✅ Step 2 completed: fileReference created and Keepeek player verified')
        })

        // Test: Configure reference view to player.html5 and verify rendering
        it('Should configure reference view to player.html5 and verify HTML5 player', () => {
            // Configure reference view to player.html5
            configureReferenceView('player.html5', true)

            // Access jContent
            cy.log('🌐 Accessing jContent...')
            const jcontent = JContent.visit(siteConfig.key, 'en', 'content-folders/contents').switchToListMode()

            // Verify content and open preview
            cy.log('✅ Verifying content in table...')
            jcontent.getTable().getRowByLabel(CONTENT.title).should('exist')
            jcontent.getTable().getRowByLabel(CONTENT.title).contextMenu().select('Preview')

            // Verify HTML5 video player in iframe
            cy.log('🔍 Verifying HTML5 video element...')
            cy.get(JCONTENT_SELECTORS.previewIframe).its('0.contentDocument.body').should('be.visible')
            cy.get(JCONTENT_SELECTORS.previewIframe)
                .its('0.contentDocument.body')
                .find('video')
                .should('exist')
                .and('be.visible')
                .should('have.attr', 'poster')
                .should('include', keepeekDamId)

            // Verify video has source elements
            cy.log('🔍 Verifying video sources...')
            cy.get(JCONTENT_SELECTORS.previewIframe)
                .its('0.contentDocument.body')
                .find('video source')
                .should('have.length.at.least', 1)

            cy.get(JCONTENT_SELECTORS.previewIframe)
                .its('0.contentDocument.body')
                .find('video source')
                .first()
                .should('have.attr', 'src')
                .should('include', keepeekDamId)

            cy.log('✅ Step 3 completed: HTML5 player verified')
        })
    })
}
