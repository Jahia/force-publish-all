/**
 * Utility functions for handling GraphQL responses in Cypress tests
 */

/**
 * Validates a GraphQL response with custom troubleshooting information
 *
 * @param response - The GraphQL response object
 * @param errorContext - Main error context
 * @param troubleshootingSteps - Array of troubleshooting steps to display
 * @throws Error if response contains errors or missing data
 */
export function validateGraphQLResponseWithTroubleshooting(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response: any,
    errorContext: string,
    troubleshootingSteps: string[],
): void {
    if (response?.errors && response.errors.length > 0) {
        const errorMsg = response.errors[0]?.message || 'Unknown GraphQL error'
        const troubleshooting = [`${errorContext} failed: ${errorMsg}`, '', ...troubleshootingSteps].join('\n')
        throw new Error(troubleshooting)
    }

    if (!response?.data) {
        const troubleshooting = [
            `${errorContext} failed: No data returned from server`,
            '',
            ...troubleshootingSteps,
        ].join('\n')
        throw new Error(troubleshooting)
    }
}

/**
 * Creates Keepeek content via GraphQL
 * This is an auxiliary function used in test setup to prepare Keepeek content
 *
 * @param keepeekDamId - The Keepeek DAM asset ID
 * @returns Cypress Chainable that resolves to the UUID of the created content
 */
export function createKeepeekContent(keepeekDamId: string) {
    const edpMountPath = Cypress.env('KPK_EDP_MOUNT_PATH') || '/sites/systemsite/contents/dam-keepeek'
    const path = `${edpMountPath}/${keepeekDamId}`

    cy.log(`📝 Creating Keepeek content for asset ${keepeekDamId} at path: ${path}`)

    return (
        cy
            .apollo({
                queryFile: 'graphql/jcr/query/edpKeepeekCreateContent.graphql',
                variables: {
                    edpContentPath: path,
                },
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then((result: any) => {
                const troubleshootingSteps = [
                    'Check: 1) Keepeek configuration in site settings',
                    '       2) Keepeek service is accessible',
                    `       3) Asset ${keepeekDamId} exists in Keepeek DAM`,
                ]

                validateGraphQLResponseWithTroubleshooting(result, 'Keepeek content creation', troubleshootingSteps)

                const uuid = result?.data?.jcr?.nodeByPath?.uuid
                if (!uuid) {
                    const troubleshooting = [
                        'Keepeek content creation failed: No UUID returned',
                        '',
                        ...troubleshootingSteps,
                    ].join('\n')
                    throw new Error(troubleshooting)
                }

                cy.log(`✅ Keepeek content created successfully (UUID: ${uuid})`)

                // Return UUID wrapped in Cypress chain to avoid mixing async/sync
                return cy.wrap<string>(uuid)
            })
    )
}
