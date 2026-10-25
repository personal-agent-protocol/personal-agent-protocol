# Security Policy

## Reporting Security Issues

If you discover a security vulnerability in the Personal Agent Protocol or this repository, report
it through
[GitHub's private vulnerability reporting](https://github.com/personal-agent-protocol/personal-agent-protocol/security/advisories/new).

Don't report security vulnerabilities through public GitHub issues, discussions, or pull requests.

## What to Include

To help us triage and respond, include:

- A description of the vulnerability, and the part of the docs or code it affects
- Steps to reproduce it, or how an attacker could use it
- The potential impact
- Any suggested fixes (optional)

## What's in Scope

These are security vulnerabilities when they come from the specification, an extension, the agent
kit, or this site:

- **Protocol-level vulnerabilities**: flaws in the specification or an extension that enable
  attacks regardless of implementation
- **Token theft or reuse**: ways to get, replay, or use a token or assertion meant for someone else
- **Acting without approval**: ways to act on a User's account without the User's approval
- **Linking Users**: ways for Companies to link a User's activity across Companies
- **Kit vulnerabilities**: problems in the agent kit, including its validator, that could lead
  implementers to ship an insecure implementation
- **Site vulnerabilities**: vulnerabilities in this site

This list is not exhaustive.

This policy covers only this project's specification and code. Report a vulnerability in a
particular implementation of the protocol to whoever maintains it.

## What Isn't a Vulnerability

The specification's
[security considerations](https://personalagentprotocol.org/docs/spec#security) describe the risks
the protocol accepts and the trust each party places in the others. Behavior the specification
describes as intended is not a vulnerability. To question it, open a regular
[feedback](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/new?template=1-feedback.yml)
issue.

Design problems that have already been discussed in the open, such as a known class of OAuth
attack, or a weakness raised in a public issue or a published paper, are also welcome as feedback
issues. If you aren't sure whether something has been discussed in public, report it privately.
