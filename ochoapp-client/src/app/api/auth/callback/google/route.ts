import { google, lucia } from "@/auth";
import kyInstance from "@/lib/ky";
import prisma from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { OAuth2RequestError } from "arctic";
import { generateIdFromEntropySize } from "lucia";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";



export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");

    const cookieCall = await cookies()

    const storedState = cookieCall.get("state")?.value;
    const storedCodeVerifier = cookieCall.get("code_verifier")?.value;

    if (
        !code || !state || !storedState || !storedCodeVerifier || state !== storedState
    ) {
        return new Response(null, { status: 400 })
    }

    try {
        const tokens = await google.validateAuthorizationCode(code, storedCodeVerifier);

        const googleUser = await kyInstance
            .get("https://www.googleapis.com/oauth2/v1/userinfo/", {
                headers: {
                    Authorization: `Bearer ${tokens.accessToken}`
                }
            })
            .json<{ id: string; name: string; email: string; }>();

        const existingUser = await prisma.user.findUnique({
            where: { googleId: googleUser.id }
        })

        if (existingUser) {
            const session = await lucia.createSession(existingUser.id, {});
            const sessionCookie = lucia.createSessionCookie(session.id);

            cookieCall.set(
                sessionCookie.name,
                sessionCookie.value,
                sessionCookie.attributes
            )

            // Set custom cookie indicating third-party auth
            cookieCall.set("third_party_auth", "google", {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 60 * 60 * 24 * 30, // 30 days
            });

            return new Response(null, {
                status: 302,
                headers: {
                    Location: "/",
                }
            })

        }

        const userId = generateIdFromEntropySize(10);
        

        async function validatedUsername() {
            const baseUsername = slugify(googleUser.name);
            let validatedUsername = baseUsername;
        
            // Chercher tous les noms d'utilisateur qui commencent par le nom de base
            const similarUsernames = await prisma.user.findMany({
                where: {
                    username: {
                        startsWith: baseUsername,
                    }
                },
                select: { username: true }
            });
        
            if (similarUsernames.length === 0) {
                // Si aucun nom d'utilisateur similaire, le nom est disponible
                return validatedUsername;
            }
        
            // Extraire uniquement les suffixes numériques
            const usernameSet = new Set(similarUsernames.map(u => u.username));
            let number = 1;
            
            // Trouver le premier suffixe disponible
            while (usernameSet.has(validatedUsername)) {
                validatedUsername = `${baseUsername}${number}`;
                number++;
            }
        
            return validatedUsername;
        }
        
        const username = await validatedUsername();
        const email = googleUser.email;


        await prisma.user.create({
            data: {
                id: userId,
                username,
                email,
                displayName: googleUser.name,
                googleId: googleUser.id
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
        cookieCall.set("third_party_auth", "google", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 30, // 30 days
        });

        return new Response(null, {
            status: 302,
            headers: {
                Location: "/",
            }
        })
    } catch (error) {
        console.error(error);

        if (error instanceof OAuth2RequestError) {
            return new Response(null, {
                status: 400,
            })
        }
        return new Response(null, {
            status: 500,
        })
    }
}