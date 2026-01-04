import { github, lucia } from "@/auth";
import kyInstance from "@/lib/ky";
import prisma from "@/lib/prisma";
import { LocalUpload } from "@/lib/types";
import { slugify } from "@/lib/utils";
import { OAuth2RequestError } from "arctic";
import { generateIdFromEntropySize } from "lucia";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  const cookieCall = await cookies()

  const storedState = cookieCall.get("state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    console.log(code, state, storedState);

    return new Response(null, { status: 400 });
  }

  try {
    const tokens = await github.validateAuthorizationCode(code);

    const githubUser = await kyInstance
      .get("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      })
      .json<{ id: string; login: string; avatar_url: string }>();

    const githubId = githubUser.id.toString();
    const githubUsername = githubUser.login.toString();
    const githubAvatarUrl = githubUser.avatar_url;

    const existingUser = await prisma.user.findUnique({
      where: { githubId },
    });

    if (existingUser) {
      const session = await lucia.createSession(existingUser.id, {});
      const sessionCookie = lucia.createSessionCookie(session.id);

      cookieCall.set(
        sessionCookie.name,
        sessionCookie.value,
        sessionCookie.attributes,
      );

      // Set custom cookie indicating third-party auth
      cookieCall.set("third_party_auth", "github", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });

      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
        },
      });
    }

    const userId = generateIdFromEntropySize(10);

    async function validatedUsername() {
      const baseUsername = slugify(githubUsername);
      let validatedUsername = baseUsername;

      // Chercher tous les noms d'utilisateur qui commencent par le nom de base
      const similarUsernames = await prisma.user.findMany({
        where: {
          username: {
            startsWith: baseUsername,
          },
        },
        select: { username: true },
      });

      if (similarUsernames.length === 0) {
        // Si aucun nom d'utilisateur similaire, le nom est disponible
        return validatedUsername;
      }

      // Extraire uniquement les suffixes numériques
      const usernameSet = new Set(similarUsernames.map((u) => u.username));
      let number = 1;

      // Trouver le premier suffixe disponible
      while (usernameSet.has(validatedUsername)) {
        validatedUsername = `${baseUsername}${number}`;
        number++;
      }

      return validatedUsername;
    }

    const username = await validatedUsername();

    // Étape 1: Récupérer l'image de Github
    const avatarResponse = await kyInstance.get(githubAvatarUrl);
    const avatarBlob = await avatarResponse.blob();

    // Fonction pour uploader l'avatar via fetch
    async function uploadAvatar(blob: Blob): Promise<string | null> {
      const file = new File([blob], `avatar-${userId}.webp`, {
        type: "image/webp",
      });
      const formData = new FormData();
      formData.append("avatar", file);

      const response = await kyInstance
        .post(`${baseUrl}/api/upload/avatar`, {
          body: formData,
          throwHttpErrors: false,
        })
        .json<LocalUpload[] | null>();

      if (!response?.[0]?.serverData?.avatarUrl) {
        const avatar = await kyInstance
          .post(`${baseUrl}/api/uploadthing`, {
            body: formData,
            throwHttpErrors: false,
          })
          .json<LocalUpload[] | null>();

        console.log(avatar);

        return null;
      }
      const result = response[0].appUrl;
      return result;
    }

    const avatarUrl = await uploadAvatar(avatarBlob);

    await prisma.user.create({
      data: {
        id: userId,
        username,
        displayName: githubUsername,
        githubId,
        avatarUrl,
      },
    });

    const session = await lucia.createSession(userId, {});
    const sessionCookie = lucia.createSessionCookie(session.id);
    cookieCall.set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes,
    );

    // Set custom cookie indicating third-party auth
    cookieCall.set("third_party_auth", "github", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: "/",
      },
    });
  } catch (error) {
    console.error(error);

    if (error instanceof OAuth2RequestError) {
      return new Response(null, {
        status: 400,
      });
    }
    return new Response(null, {
      status: 500,
    });
  }
}
