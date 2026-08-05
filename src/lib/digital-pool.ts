const FIREBASE_API_KEY =
  process.env.DIGITAL_POOL_FIREBASE_API_KEY ||
  "AIzaSyAkwJtuG13xbMW96QOfXPvF58Oq7ELtCzA";
const GRAPHQL_URL =
  process.env.DIGITAL_POOL_GRAPHQL_URL ||
  "https://proxy.digitalpool.com/graphql";

export type DigitalPoolAuth = {
  uid: string;
  email: string;
  displayName: string | null;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type DigitalPoolProfile = {
  id: number;
  uid: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
};

async function firebaseSignIn(
  email: string,
  password: string,
): Promise<DigitalPoolAuth> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://digitalpool.com",
        Referer: "https://digitalpool.com/",
      },
      body: JSON.stringify({
        email: email.trim(),
        password,
        returnSecureToken: true,
      }),
      cache: "no-store",
    },
  );
  const data = (await response.json()) as {
    localId?: string;
    email?: string;
    displayName?: string;
    idToken?: string;
    refreshToken?: string;
    expiresIn?: string;
    error?: { message?: string };
  };
  if (!response.ok || !data.idToken || !data.refreshToken || !data.localId) {
    throw new Error(
      data.error?.message?.replace(/_/g, " ") ||
        "Digital Pool login failed.",
    );
  }
  return {
    uid: data.localId,
    email: data.email || email.trim(),
    displayName: data.displayName || null,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
  };
}

export async function refreshDigitalPoolToken(
  refreshToken: string,
): Promise<DigitalPoolAuth> {
  const response = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://digitalpool.com",
        Referer: "https://digitalpool.com/",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
    },
  );
  const data = (await response.json()) as {
    user_id?: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: string;
    error?: { message?: string };
  };
  if (!response.ok || !data.id_token || !data.refresh_token || !data.user_id) {
    throw new Error(
      data.error?.message?.replace(/_/g, " ") ||
        "Digital Pool session expired. Reconnect in Settings.",
    );
  }
  return {
    uid: data.user_id,
    email: "",
    displayName: null,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
}

export async function digitalPoolGraphql<T>(
  idToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      Origin: "https://digitalpool.com",
      Referer: "https://digitalpool.com/",
      "x-client-environment": "prod",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
    error?: string;
    message?: string;
  };
  if (!response.ok || payload.errors?.length || payload.error) {
    throw new Error(
      payload.errors?.[0]?.message ||
        payload.message ||
        payload.error ||
        "Digital Pool request failed.",
    );
  }
  if (!payload.data) {
    throw new Error("Digital Pool returned no data.");
  }
  return payload.data;
}

export async function loginDigitalPool(
  email: string,
  password: string,
): Promise<{ auth: DigitalPoolAuth; profile: DigitalPoolProfile }> {
  const auth = await firebaseSignIn(email, password);
  // Touch user row + load Hasura profile (same as Digital Pool web login).
  const data = await digitalPoolGraphql<{
    update_users: {
      returning: Array<{
        id: number;
        uid: string;
        email: string;
        first_name: string | null;
        last_name: string | null;
        role: string | null;
      }>;
    };
  }>(
    auth.idToken,
    `
    mutation update_users($uid: String, $timestamp: timestamptz!, $token: String) {
      update_users(
        where: { uid: { _eq: $uid }, _and: { uid: { _neq: "" } } }
        _set: { last_seen: $timestamp, token: $token }
      ) {
        returning {
          id
          uid
          email
          first_name
          last_name
          role
        }
      }
    }
    `,
    {
      uid: auth.uid,
      timestamp: new Date().toISOString(),
      token: auth.idToken,
    },
  );

  const row = data.update_users.returning[0];
  if (!row) {
    throw new Error(
      "Digital Pool login worked, but no user profile was found. Open digitalpool.com once, then try again.",
    );
  }

  const name =
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    auth.displayName;

  return {
    auth: {
      ...auth,
      email: row.email || auth.email,
      displayName: name,
    },
    profile: {
      id: row.id,
      uid: row.uid,
      email: row.email || auth.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
    },
  };
}
