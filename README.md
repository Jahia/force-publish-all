# Force Publication Module

## Overview

This module provides a GraphQL mutation to force the publication of a whole subtree in Jahia 
by first deleting everything in the live workspace and then republishing the entire subtree.

## Technologies Used

- Java
- JavaScript
- Node.js
- React
- Maven
- Yarn
- NPM

## Prerequisites

- Java 11
- Node.js v20.18.1
- Yarn v1.22.22
- Maven 3.6.3 or higher

## Building the Project

To build the project, run:

```sh
mvn clean install
```

## Running the Project

To run the project, deploy the module inside your Jahia instance:
https://academy.jahia.com/documentation/jahia-cms/jahia-8.1/developer/module-development/deploying-a-module-using-maven

## Usage

### GraphQL Mutation

The main functionality provided by this module is the `forcePublish` mutation. This mutation can be used to force the publication of a whole sub-tree.

#### Example Mutation

```graphql
mutation {
    jcr {
        mutateNode(pathOrId:"/sites/digitall/home/about") {
            forcePublish
        }
    }
}
```
