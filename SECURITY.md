# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration stores a KitchenOwl **long-lived token** in the Gladys
configuration (a `secret` field): anyone holding it can read and change the
shopping lists, recipes and meal plan of the user's households. It never
writes the token to the logs or to `/data`, which holds only the ids of the
items already seen on each list (`kitchenowl-state.json`). It talks to the
KitchenOwl address entered in the configuration, and to nothing else; the
option "Accept self-signed certificates" turns off the certificate check for
that address only.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and KitchenOwl itself (see its
[repository](https://github.com/TomBursch/kitchenowl)).
