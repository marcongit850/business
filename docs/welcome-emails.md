# Welcome emails

## Application thank-you

The Worker sends this when a new application row is stored, for Business Leaders, Builders, and Tourism. Edit the copy in `src/application-email.js`. This message is not the MailerLite approval message below.

The send uses the `EMAIL` binding and runs in `ctx.waitUntil`. A mail failure is logged and does not change the application response. An invalid applicant email is not mailed. A submission that fails before it is stored is not mailed. The notice to marc@whpinc.com is a separate message and does not use this copy.

From and Reply-To:

- business: Walton County Business Leaders <hello@waltonleaders.org>
- builders: Walton County Builders Network <hello@waltonbuildersnetwork.org>
- tourism: Walton County Tourism Network <hello@waltontourism.org>

Subject: Thanks for applying to <Network Name>

The greeting uses the first word of the applicant's name. If that name is empty, the greeting is "Hi there,".

```
Hi <first name>,

Thank you for applying to join <Network Name>. We're a brand new organization, and we're working hard to reach our first 500 members.

We'll review your application and get back to you shortly.

<Network Name>
```

The HTML version uses the same words, with navy text (#001840) and a gold rule (#d0a040). Names and network names are HTML-escaped.

## MailerLite approval messages

Paste one message into each network's automation. The automation should start when someone is added to that network's approved group. Set the from name and from address on the automation in MailerLite. This Worker does not choose a from address for these messages.

Sign-in links are sent from hello@waltonleaders.org to the address on the application. See `docs/member-hub.md`.

## Business Leaders approved

Subject: You are approved for Walton County Business Leaders

Hello,

Your request to join Walton County Business Leaders is approved.

We're a brand new organization, and we're working hard to reach our first 500 members. Thanks for being one of them!

Sign in from any browser:

1. Go to https://waltonleaders.org/login
2. Enter the email address you used on your application
3. Open the sign-in link we send you

The link works once and expires after about 15 minutes.

Walton County Business Leaders

## Builders approved

Subject: You are approved for Walton County Builders Network

Hello,

Your request to join Walton County Builders Network is approved.

We're a brand new organization, and we're working hard to reach our first 500 members. Thanks for being one of them!

Sign in from any browser:

1. Go to https://waltonleaders.org/login
2. Enter the email address you used on your application
3. Open the sign-in link we send you

The link works once and expires after about 15 minutes.

Walton County Builders Network

## Tourism approved

Subject: You are approved for Walton County Tourism Network

Hello,

Your request to join Walton County Tourism Network is approved.

We're a brand new organization, and we're working hard to reach our first 500 members. Thanks for being one of them!

Sign in from any browser:

1. Go to https://waltonleaders.org/login
2. Enter the email address you used on your application
3. Open the sign-in link we send you

The link works once and expires after about 15 minutes.

Walton County Tourism Network
