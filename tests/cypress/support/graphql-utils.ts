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

