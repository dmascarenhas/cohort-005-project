# Coding standards

## Fail with a thrown response, not a return value

A loader or an action that cannot continue throws. It does not return an
error shape for the component to unpack.

```ts
if (!course) throw data("Course not found", { status: 404 });
```

The route then has one success path. A returned error shape gives every
component a second path to forget about.

## Parse untrusted input with a schema

Form data, search parameters and request bodies get a zod schema before the
values reach any query. Do not read `formData.get("x") as string`. The cast
is a lie the type checker believes.

## Do not write `any`, and do not write `!`

Both switch the type checker off at the exact point you are least sure. If a
value can be missing, narrow it with a check. If you cannot name the type,
the shape is wrong — fix the shape.

## A comment states what the code beside it does now

Check every comment in the diff against the code it sits on: the branch it
labels, the function it describes, the limit it quotes. A comment that
promises behaviour the code lacks ("optimistic", "soft-deletes", "renders
Markdown", "2,000 characters" beside `max(5000)`) is a bug report waiting to
be believed. A diff adds comments only to code it changes; a new comment on
an untouched function describes code the author did not read.

## Code honours the GLOSSARY's definitions, not just its words

`GLOSSARY.md` defines what each domain term means, including who may see it.
When a definition says something is private to a role, no loader for
another role reads it. Check new queries and loaders against the
definitions of the terms they touch, including definitions added in the
same diff.
