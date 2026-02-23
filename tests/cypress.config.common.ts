import * as fs from 'fs';

export const baseConfig = {
    chromeWebSecurity: false,
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 60000,
    requestTimeout: 60000,
    responseTimeout: 60000,
    screenshotsFolder: './tests/results/screenshots',
    video: true,
    videosFolder: './tests/results/videos',
    viewportWidth: 1366,
    viewportHeight: 768,
    watchForFileChanges: false,
    experimentalMemoryManagement: true,
    numTestsKeptInMemory: 0,
    e2e: {
        specPattern: ['cypress/e2e/**/*.cy.{js,jsx,ts,tsx}'],
        supportFile: 'cypress/support/e2e.js',
        setupNodeEvents(on, config) {
            on('task', {
                readFileMaybe(filename) {
                    if (fs.existsSync(filename)) {
                        return fs.readFileSync(filename, 'utf8');
                    }

                    return null;
                }
            });

            on('after:spec', (spec, results) => {
                if (results?.video) {
                    const failures = results.tests.some(test =>
                        test.attempts.some(attempt => attempt.state === 'failed')
                    );
                    if (!failures) {
                        fs.promises.unlink(results.video).catch(() => {});
                    }
                }
            });

            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return require('./cypress/plugins/index.js')(on, config);
        },
        excludeSpecPattern: ['**/*.ignore.ts', '**/*performance.cy.ts'],
        baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:8080'
    },
    env: {
        jahiaUsername: process.env.CYPRESS_JAHIA_USERNAME || 'root',
        jahiaPassword: process.env.CYPRESS_JAHIA_PASSWORD || 'root',
        graphqlEndpoint: process.env.CYPRESS_GRAPHQL_ENDPOINT || '/graphql',
        jahiaToken: process.env.CYPRESS_JAHIA_TOKEN || '',
        loginUrl: process.env.CYPRESS_LOGIN_URL || '/cms/login',
        loginUserField: process.env.CYPRESS_LOGIN_USER_FIELD || 'username',
        loginPassField: process.env.CYPRESS_LOGIN_PASS_FIELD || 'password',
        jcontentPath: process.env.CYPRESS_JCONTENT_PATH || '/jahia/jcontent/digitall/en/pages/home/about',
        sitePath: process.env.CYPRESS_SITE_PATH || '/sites/digitall/home/about',
        publishWaitAttempts: process.env.CYPRESS_PUBLISH_WAIT_ATTEMPTS || 20,
        publishWaitIntervalMs: process.env.CYPRESS_PUBLISH_WAIT_INTERVAL_MS || 3000
    }
};
