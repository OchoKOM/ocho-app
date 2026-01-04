"use server";

import { facebook, lucia } from "@/auth";
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

    if (!code) {
        return new Response(null, { status: 400 });
    }

    try {
        const { accessToken } = await facebook.validateAuthorizationCode(code);

        const facebookUser = await kyInstance
            .get(`https://graph.facebook.com/me?access_token=${accessToken}&fields=id,name,picture`)
            .json<{
                id: string;
                name: string;
                picture: {
                    data: {
                        url: string;
                    };
                };
            }>();

        const existingUser = await prisma.user.findUnique({
            where: { facebookId: facebookUser.id },
        });

        const cookieCall = await cookies();

        if (existingUser) {
            const session = await lucia.createSession(existingUser.id, {});
            const sessionCookie = lucia.createSessionCookie(session.id);
            cookieCall.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

            // Set custom cookie indicating third-party auth
            cookieCall.set("third_party_auth", "facebook", {
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
            const baseUsername = slugify(facebookUser.name);
            let validatedUsername = baseUsername;

            const similarUsernames = await prisma.user.findMany({
                where: {
                    username: {
                        startsWith: baseUsername,
                    },
                },
                select: { username: true },
            });

            if (similarUsernames.length === 0) {
                return validatedUsername;
            }

            const usernameSet = new Set(similarUsernames.map((u) => u.username));
            let number = 1;

            while (usernameSet.has(validatedUsername)) {
                validatedUsername = `${baseUsername}${number}`;
                number++;
            }

            return validatedUsername;
        }

        const username = await validatedUsername();

        // Étape 1: Récupérer l'image de Facebook
        const avatarResponse = await kyInstance.get(facebookUser.picture.data.url);
        const avatarBlob = await avatarResponse.blob();

        // Fonction pour uploader l'avatar via fetch
        async function uploadAvatar(blob: Blob): Promise<string | null> {
            const file = new File([blob], `avatar-${userId}.webp`, { type: "image/webp" });
            const formData = new FormData();
            formData.append("avatar", file);

            const response = await kyInstance.post('/api/upload/avatar', {
                body: formData,
                throwHttpErrors: false,
            }).json<LocalUpload[] | null>();

            if (!response?.[0]?.serverData?.avatarUrl) {
                return (null)
            }
            const result = response[0].appUrl
            return result;
        }

        const avatarUrl = await uploadAvatar(avatarBlob);

        // Enregistrement de l'utilisateur dans la base de données
        await prisma.user.create({
            data: {
                id: userId,
                username,
                avatarUrl,
                displayName: facebookUser.name,
                facebookId: facebookUser.id,
            },
        });

        const session = await lucia.createSession(userId, {});
        const sessionCookie = lucia.createSessionCookie(session.id);
        cookieCall.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

        // Set custom cookie indicating third-party auth
        cookieCall.set("third_party_auth", "facebook", {
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
            return new Response(null, { status: 400 });
        }
        return new Response(null, { status: 500 });
    }
}
