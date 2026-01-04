import { PrismaAdapter } from "@lucia-auth/adapter-prisma";
import prisma from "./lib/prisma";
import { Lucia, Session, User } from "lucia";
import { cache } from "react";
import { cookies } from "next/headers";
import { Facebook, GitHub, Google } from "arctic";
import { VerifiedType } from "@prisma/client";

const adapter = new PrismaAdapter(prisma.session, prisma.user);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    expires: false,
    attributes: {
      secure: process.env.NODE_ENV === "production",
    },
  },
  getUserAttributes(databaseUserAttributes) {
    const followers = databaseUserAttributes.followers
      ? [...databaseUserAttributes.followers]
      : [];
    const following = databaseUserAttributes.following
      ? [...databaseUserAttributes.following]
      : [];
    const verified = databaseUserAttributes.verified
      ? [...databaseUserAttributes.verified]
      : [];

    return {
      id: databaseUserAttributes.id,
      username: databaseUserAttributes.username,
      displayName: databaseUserAttributes.displayName,
      avatarUrl: databaseUserAttributes.avatarUrl,
      googleId: databaseUserAttributes.googleId,
      facebookId: databaseUserAttributes.facebookId,
      bio: databaseUserAttributes.bio,
      birthday: databaseUserAttributes.birthday,
      followers,
      following,
      _count: {
        followers: databaseUserAttributes._count?.followers ?? 0,
        posts: databaseUserAttributes._count?.posts ?? 0,
      },
      verified,
      createdAt: databaseUserAttributes.createdAt,
      lastSeen: databaseUserAttributes.lastSeen,
      lastUsernameChange: databaseUserAttributes.lastUsernameChange,
    };
  },
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: DatabaseUserAttributes;
  }
}

interface DatabaseUserAttributes {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  googleId: string | null;
  facebookId: string | null;
  bio: string | null;
  birthday: Date | null;
  followers: {
    followerId: string;
  }[];
  following: {
    followerId: string;
  }[];
  _count: {
    followers: number;
    posts: number;
  };
  verified: {
    type: VerifiedType,
    expiresAt: Date,
  }[];
  createdAt: Date;
  lastSeen: Date;
  lastUsernameChange: Date | null | undefined;
}

export const google = new Google(
  process.env.GOOGLE_CLIENT_ID!,
  process.env.GOOGLE_CLIENT_SECRET!,
  `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback/google`,
);

export const facebook = new Facebook(
  process.env.FACEBOOK_CLIENT_ID!,
  process.env.FACEBOOK_CLIENT_SECRET!,
  `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback/facebook`,
);

export const github = new GitHub(
  process.env.GITHUB_CLIENT_ID!,
  process.env.GITHUB_CLIENT_SECRET!,
  {
    redirectURI: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback/github`,
  },
);

export const validateRequest = cache(
  async (): Promise<
    { user: User; session: Session } | { user: null; session: null }
  > => {
    const cookieCall = await cookies()
    const sessionId = cookieCall.get(lucia.sessionCookieName)?.value ?? null;
    if (!sessionId) return { user: null, session: null };

    const result = await lucia.validateSession(sessionId);

    try {
      if (result.session && result.session.fresh) {
        const sessionCookie = lucia.createSessionCookie(result.session.id);
        cookieCall.set(
          sessionCookie.name,
          sessionCookie.value,
          sessionCookie.attributes,
        );
      }
      if (!result.session) {
        const sessionCookie = lucia.createBlankSessionCookie();
        cookieCall.set(
          sessionCookie.name,
          sessionCookie.value,
          sessionCookie.attributes,
        );
      }
    } catch {}
    return result;
  },
);
