# Introduction

## What is Personal Agent Protocol?

Personal Agent Protocol (Poppy for short) is an open protocol for how personal agents and companies work together. A company uses it to declare how personal agents can interact with it. A personal agent uses it to sign in safely and get access to a person's account, limited to what that person and the company agree to.

The goal is for the protocol to cover everything a company and a personal agent can do together, so each side implements it once and works with every other side that supports it.

## Why does it exist?

Personal agents are already here, and people like using them. They hand off everyday tasks, and many of those tasks end at a company. Companies are already seeing this traffic. Some block it, and others are deciding whether to.

Today it is all or nothing. Either the agent passes as the user, signing in with their password and clicking through pages built for people, or the company blocks it and it can't do anything. Neither works well. The user can't limit what the agent does once it's in, and the company can't tell an agent from a person or offer it a better path.

There need to be more points between those two extremes, so that companies and users can choose how agents work with them. An airline might let any agent search flights, let signed-in agents see the user's trips, and require the user's approval before buying a ticket. A user might let an agent see their trips but not change them.

As agents take on more of what people do online, the cost of all or nothing grows: companies spend more effort detecting agents, and agents spend more effort evading detection. Personal Agent Protocol gives both sides a way to work together, with more choice and control.

## Principles

- **Built on existing standards.** Personal Agent Protocol uses OAuth, JWTs, HTTPS, OpenAPI, and MCP wherever they fit, so teams can implement it with libraries and tools that already exist. It defines something new only where no standard covers the need.
- **Controls, not policy.** The protocol offers a range of options, and each side chooses what fits. A company decides whether agents can work anonymously or must sign the user in, which personal agents to allow, which channels to offer, and how much access to grant. A user decides how to sign in and what the agent can see and do in their account.
- **Secure and private.** We think Personal Agent Protocol can become part of the foundation of the internet, so it has to be trustworthy. A personal agent always identifies itself, but until the person signs in, the company knows them only by an ID that contains no personal information. The ID stays the same over time, so the company can recognize a returning user, but it is different at every company. Companies can choose which sign-in options meet their security needs, and access is limited to what was granted and can be revoked.
- **Progressive adoption.** A company can start with only a website, only APIs, or only an agent, and add more over time, without rebuilding its existing systems.
- **Extensible.** Discovery, identity, APIs, and conversations are building blocks that companies and industries can extend, for example to add payments, push notifications, or interactive elements.

---

Licensed under the [Apache License 2.0](https://personalagentprotocol.org/license).
