import prisma from "@/lib/prisma";
import { getUserDataSelect } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../auth/utils";
import { ApiResponse } from "../../../utils/dTypes";

export async function GET(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ filter: string | undefined }>;
  },
) {
  const { filter } = await params;

  try {
    const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
    const searchQuery = req.nextUrl.searchParams.get("q") || undefined;
    const pageSize = 10; // Définissez la taille de la page

    // Valider la requête et obtenir l'utilisateur connecté

    const { user: loggedInUser, message } = await getCurrentUser();
    if (!loggedInUser) {
      return NextResponse.json({
        success: false,
        message: message || "Utilisateur non authentifié.",
        name: "unauthorized",
      } as ApiResponse<null>);
    }

    const user = await prisma.user.findFirst({
      where: {
        id: loggedInUser.id,
      },
      select: getUserDataSelect(loggedInUser.id, loggedInUser.username),
    });

    if (!user) {
      return NextResponse.json({
        success: false,
        message: message || "Utilisateur non authentifié.",
        name: "unauthorized",
      } as ApiResponse<null>);
    }
    const userId = user.id;

    if (searchQuery) {
      const sanitizedQuery = searchQuery.replace(/[%_]/g, "\\$&");
      const users = await prisma.user.findMany({
        where: {
          OR: [
            {
              displayName: {
                contains: sanitizedQuery,
                mode: "insensitive",
              },
            },
            {
              username: {
                contains: sanitizedQuery,
                mode: "insensitive",
              },
            },
          ],
        },
        take: pageSize + 1, // Prendre un élément supplémentaire pour vérifier s'il y a une page suivante
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { id: "asc" },
        select: getUserDataSelect(user.id),
      });

      const nextCursor = users.length > pageSize ? users[pageSize].id : null;
      const usersPage =
        users.length > pageSize ? users.slice(0, pageSize) : users;

      return NextResponse.json<
        ApiResponse<{ users: typeof usersPage; nextCursor: string | null }>
      >({
        success: true,
        data: { users: usersPage, nextCursor },
      });
    }

    switch (filter) {
      case "friends": {
        // Récupérer les amis paginés
        const friends = await prisma.user.findMany({
          where: {
            AND: [
              { followers: { some: { followerId: user.id } } },
              { following: { some: { followingId: user.id } } },
            ],
          },
          take: pageSize + 1, // Prendre un élément supplémentaire pour vérifier s'il y a une page suivante
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { id: "asc" },
          select: getUserDataSelect(user.id),
        });

        const nextCursor =
          friends.length > pageSize ? friends[pageSize].id : null;
        const friendsPage =
          friends.length > pageSize ? friends.slice(0, pageSize) : friends;
        return NextResponse.json<
          ApiResponse<{ users: typeof friendsPage; nextCursor: string | null }>
        >({
          success: true,
          data: { users: friendsPage, nextCursor },
        });
      }
      case "followers": {
        const followers = await prisma.user.findMany({
          where: {
            AND: [
              { followers: { some: { followerId: user.id } } },
              { NOT: { following: { some: { followingId: user.id } } } },
            ],
          },
          take: pageSize + 1,
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { id: "asc" },
          select: getUserDataSelect(user.id),
        });

        const nextCursor =
          followers.length > pageSize ? followers[pageSize].id : null;
        const followersPage =
          followers.length > pageSize
            ? followers.slice(0, pageSize)
            : followers;
        return NextResponse.json<
          ApiResponse<{
            users: typeof followersPage;
            nextCursor: string | null;
          }>
        >({
          success: true,
          data: { users: followersPage, nextCursor },
        });
      }
      case "following": {
        // Récupérer les suivis
        const following = await prisma.user.findMany({
          where: {
            AND: [
              { following: { some: { followingId: user.id } } },
              { NOT: { followers: { some: { followerId: user.id } } } },
            ],
          },
          take: pageSize + 1,
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { id: "asc" },
          select: getUserDataSelect(user.id),
        });

        const nextCursor =
          following.length > pageSize ? following[pageSize].id : null;
        const followingPage =
          following.length > pageSize
            ? following.slice(0, pageSize)
            : following;
        return NextResponse.json<
          ApiResponse<{
            users: typeof followingPage;
            nextCursor: string | null;
          }>
        >({
          success: true,
          data: { users: followingPage, nextCursor },
        });
      }
      default: {
        // Récupérer des suggestions (utilisateurs non suivis et ne suivant pas l'utilisateur)
        const suggestions = await prisma.user.findMany({
          where: {
            AND: [
              { followers: { none: { followerId: user.id } } },
              { following: { none: { followingId: user.id } } },
              { id: { not: user.id } },
            ],
          },
          take: pageSize + 1,
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { id: "asc" },
          select: getUserDataSelect(user.id),
        });

        const nextCursor =
          suggestions.length > pageSize ? suggestions[pageSize].id : null;
        const suggestionsPage =
          suggestions.length > pageSize
            ? suggestions.slice(0, pageSize)
            : suggestions;
        return NextResponse.json<
          ApiResponse<{
            users: typeof suggestionsPage;
            nextCursor: string | null;
          }>
        >({
          success: true,
          data: { users: suggestionsPage, nextCursor },
        });
      }
    }
  }  catch (error) {
    console.error("Erreur lors de la récupération des lectures du message :", error);
    return NextResponse.json({
      success: false,
      message: "Erreur interne du serveur",
      name: "server-error",
      data: null,
      error: error instanceof Error ? error.message : String(error),
    } as ApiResponse<null>);
  }
}
