# Tests

Two options are available to run the tests, you can either run everything in Docker or only run Jahia in Docker and run the tests using your local node.

### Run all in Docker

Once you have a built test container, the entirety of the tests, from environment provisioning to report generation, can be executed using a single command.

```bash
# Build the test container
> bash ci.build.sh
# Execute the tests
> bash ci.startup.sh
```

This is this exact process that will be used by the CI platform to execute the tests. And although it's definitely the easiest way of going through one run, it's also the method you're the less likely to use on a day-to-day.

The primary reason for this method to be "somewhat" reserved to the CI platform, is that it doesn't make it easy to develop new tests or debug one single test.

IMPORTANT: If you are using this method locally, do not forget that you will need to **rebuild the test container** (`bash ci.build.sh`) every time a change is done in the `tests/` folder, otherwise your change will not make their way to the container.

### Run the tests on a local node

This is the method you will be using the most when developing or debugging tests, and the major point of attention here concerns the use of the `env.run.sh` script.

As a reminder, the purpose of the `env.run.sh` script is to provision the environment **AND** execute the tests, in most cases you'd want to provision the environment only once, but run the tests multiple times.

```bash
# Fetch the necessary javascript dependencies
> yarn
# Run the docker environment, but without the tests
> ./ci.startup.sh notests
# Provision the environment and run the tests in headless once
> ./env.run.sh
# For bash
> ./set-env.sh
> yarn run e2e:debug
```

Do *NOT* forget to load your environment variables using `source set-env.sh` prior to running Cypress, as well as **every time you open a new terminal**.

### What the tests cover

`cypress/e2e/01-forcePublishAll.cy.ts` exercises the `forcePublish` GraphQL mutation exposed by this module against the `digitall` demo site:

- `forcePublish` succeeds on an already-published sub-tree (verifies the delete-in-live-then-republish path).
- `forcePublish` succeeds on an unpublished sub-tree and the node ends up in the LIVE workspace.
- `forcePublish` fails gracefully on a non-existent path.

Publication is dispatched to the Quartz scheduler asynchronously, so each assertion polls the LIVE workspace via `cy.waitUntil` until the node becomes visible (60s timeout).
