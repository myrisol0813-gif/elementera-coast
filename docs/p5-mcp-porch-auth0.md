# P5 MCP Porch: single-owner Auth0 contract

This document is a configuration contract, not a credential file. Never place a real tenant value, subject, email, client secret, access token, or Cloudflare value in Git or chat.

## Security shape

- Cloudflare Pages is the OAuth resource server and exposes the stable Streamable HTTP endpoint at `/mcp`.
- Auth0 is the authorization server. It signs RS256 access tokens and publishes JWKS.
- ChatGPT is an OAuth public client using authorization code + PKCE, or a predefined client configured in the ChatGPT plugin connection.
- Coast web login remains separate. The Coast password and `__Host-coast_session` cookie are never accepted as MCP credentials.
- Every MCP tool call validates signature, issuer, audience, expiry, subject, verified email, and the tool's exact scope.
- `initialize`, `tools/list`, `/mcp/manifest`, `/mcp/health`, and protected-resource metadata are public discovery only. They return no private Coast content.

## Auth0 tenant

1. Create or select a dedicated Auth0 tenant for the private Coast.
2. In the enabled database connection, turn on **Disable Sign Ups**.
3. Disable every social or enterprise connection that is not intentionally used by Xiaohan.
4. Create the allowed user manually in Auth0, or add the user through an invitation-only Auth0 Organization. Do not enable public self-service membership.
5. Keep the allowed Auth0 `sub` and verified email in Cloudflare dashboard configuration only.
6. Enable MFA for the owner account if the chosen Auth0 plan and login flow support it.

## Auth0 API and scopes

Create one Auth0 API whose identifier exactly matches the MCP audience configured for Coast. Use RS256.

Create only these API permissions:

- `read:coast`
- `write:soil`
- `write:radio`
- `write:lighthouse`

Grant all four permissions only to Xiaohan's invited user or private owner role. Do not create maintenance, deletion, publishing, album, or summary-run permissions in this phase.

The ChatGPT OAuth connection requests scopes from each tool descriptor. Auth0 must return the granted values in the standard space-delimited `scope` claim.

## Verified email claims

Auth0 API access tokens do not always contain email by default. Add an Auth0 Post Login Action scoped to this Coast application/API that places the verified owner identity in namespaced access-token claims:

```js
exports.onExecutePostLogin = async (event, api) => {
  api.accessToken.setCustomClaim(
    "https://elementeracoast.com/email",
    event.user.email
  );
  api.accessToken.setCustomClaim(
    "https://elementeracoast.com/email_verified",
    event.user.email_verified === true
  );
};
```

The Coast resource server rejects the token unless both the namespaced email and a literal `true` verified-email claim are present and allowlisted.

## Auth0 application

1. Create a dedicated application for the ChatGPT Coast connection; do not reuse the Coast website login.
2. Use authorization code + PKCE.
3. Add only the exact ChatGPT callback URL displayed by the plugin connection screen.
4. Keep public registration disabled at the database connection and Organization layers.
5. Configure the application credentials in the ChatGPT plugin connection UI. Do not commit or paste them into Coast source.
6. After the public `/mcp` endpoint is deployed, connect it in ChatGPT developer mode and refresh its discovered metadata.

## Cloudflare dashboard contract

The resource server reads these configuration names. Their real values belong only in the Cloudflare Pages project dashboard:

- `COAST_MCP_AUTH0_ISSUER`
- `COAST_MCP_AUTH0_AUDIENCE`
- `COAST_MCP_ALLOWED_SUBJECTS`
- `COAST_MCP_ALLOWED_EMAILS`
- `COAST_MCP_EMAIL_CLAIM` (optional when using the documented claim)
- `COAST_MCP_EMAIL_VERIFIED_CLAIM` (optional when using the documented claim)

These values are not accepted from request bodies. The allowlists are comma-separated only to permit explicit future invitations; a single-owner deployment contains one subject and one email.

## Verification before connecting ChatGPT

1. Confirm `/mcp/health` returns only service/version/transport information.
2. Confirm `/mcp/manifest` lists exactly eight approved tools.
3. Confirm `tools/list` works without a token and every listed tool advertises an OAuth scope.
4. Confirm a private tool call without a token returns an OAuth challenge.
5. Confirm a token for another subject or email is rejected.
6. Confirm a token missing one write scope cannot call that write tool.
7. Confirm `write_official_soil`, `send_radio_message`, and `write_lighthouse_letter` store `actor=myri`, `surface=official_mcp`, `symbol=≋`, the submitted `model_label`, and a generated `ChatGPTxxx≋` display author.
8. Confirm official MCP usage remains `null`.
