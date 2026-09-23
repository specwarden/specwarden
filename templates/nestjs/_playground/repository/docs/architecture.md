# Architecture

## A module reaches the database only through its repository

Every feature is a Nest module under `src/modules/<feature>/`. A controller calls a
service; a service calls a repository; only the repository and the entity it maps import
`typeorm`. A service that builds a query itself is a query nobody reviews as one.

## Migrations are expand, then contract

A deploy runs old and new code side by side for a few minutes. A migration that drops or
renames a column the old code still reads breaks the half of the fleet that has not
restarted yet — so a column is added in one deploy and removed in a later one.
