# Force Publication Module

## Overview

This module provides a GraphQL mutation to force the publication of a whole subtree in Jahia
by first deleting everything in the live workspace and then republishing the entire subtree.

> **DESTRUCTIVE OPERATION:** The live subtree is fully removed before republication.
> There is no transactional rollback. If the subsequent publication job fails, live content
> will be absent until a successful publication is triggered manually.

## Technologies Used

- Java 11
- JavaScript / React
- Node.js
- Maven
- Yarn / NPM

## Prerequisites

- Java 11
- Node.js v20.18.1
- Yarn v1.22.22
- Maven 3.6.3 or higher

## Building the Project

Full build (Java + frontend):

```sh
mvn clean install
```

Java compilation and tests only (skips the Node/Yarn frontend build):

```sh
JAVA_HOME=/usr/lib/jvm/graalvm-jdk-17.0.12+8.1 mvn clean test -P java-only
```

## Running the Project

Deploy the module inside your Jahia instance:
https://academy.jahia.com/documentation/jahia-cms/jahia-8.1/developer/module-development/deploying-a-module-using-maven

## Usage

### Required Permissions

The `forcePublish` mutation requires **both** of the following node-level permissions on the
target node. These match the permissions declared in the React UI component
(`requiredPermission: ['publish', 'site-admin']`):

| Permission   | Purpose                                                          |
|--------------|------------------------------------------------------------------|
| `publish`    | Baseline Jahia content-publication permission                    |
| `site-admin` | Site administration — required because this operation bypasses   |
|              | the normal publication workflow and deletes live content         |

Calls that lack either permission receive an `AccessDeniedException` and the operation is not
performed.

### Operation Semantics

1. **Live delete:** The entire JCR subtree rooted at the target node is deleted from the LIVE
   workspace using a system session. This step **bypasses the normal publication workflow**.
   - If the node does not yet exist in LIVE (`ItemNotFoundException` / `PathNotFoundException`),
     the delete is silently skipped and publication proceeds normally.
   - Any other `RepositoryException` during the delete is logged with full context (UUID + path)
     and causes the operation to **abort** — the publication job is NOT scheduled when the
     live-delete fails.

2. **Republication:** A `PublicationJob` is scheduled immediately to republish the full subtree
   from EDIT to LIVE. The job collects all non-deleted node UUIDs (including translation nodes
   and deleted-translation nodes) using `ComplexPublicationService`.

### Failure / Rollback Behavior

There is **no automatic rollback**. If the publication job scheduled in step 2 fails after the
live-delete in step 1 has succeeded, the content will be absent from the live workspace until
a new publication (force or standard) is triggered successfully.

Operators should monitor the Jahia scheduler / background-job log for `PublicationJob` failures
after using this mutation.

### GraphQL Mutation

```graphql
mutation {
    jcr {
        mutateNode(pathOrId: "/sites/digitall/home/about") {
            forcePublish
        }
    }
}
```

Returns `true` when the publication job has been successfully scheduled.

### Thrown Exceptions

| Exception                 | Cause                                                                 |
|---------------------------|-----------------------------------------------------------------------|
| `AccessDeniedException`   | Caller lacks `publish` or `site-admin` permission on the target node  |
| `JahiaRuntimeException`   | Required OSGi service unavailable, live-delete failed, or unexpected  |
|                           | `RepositoryException` / `SchedulerException`                          |
