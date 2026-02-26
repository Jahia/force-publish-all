/**
 * Shared test configuration for tests
 * This file contains common constants used across multiple test files
 */

export interface SiteConfig {
    key: string
    config: {
        templateSet: string
        serverName: string
        locale: string
    }
}
