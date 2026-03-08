import type { OAuthCredentials } from "../types";

/**
 * Obtains an OAuth2 access token using a refresh token.
 */
export async function getAccessToken(creds: OAuthCredentials): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(
      `failed to obtain access token (HTTP ${response.status} ${response.statusText})`
    );
  }

  const json = await response.json();
  const accessToken = json.access_token as string | undefined;

  if (!accessToken) {
    throw new Error("failed to obtain access token (missing access_token in response)");
  }

  return accessToken;
}
