import prisma from "@/lib/prisma";
import { getPostDataIncludes } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";
import {
  ApiResponse,
  Post,
  PostsIdsPage,
  User,
  VerifiedUser,
} from "../../../utils/dTypes";
import { getCurrentUser } from "../../../auth/utils";

export async function GET(req: NextRequest) {
  try {
    const { user, message } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({
        success: false,
        message: message || "Utilisateur non authentifié.",
        name: "unauthorized",
      } as ApiResponse<null>);
    }
    const currentUserId = user.id;

    const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
    const pageSize = 5;

    // Récupérer les favoris de l'utilisateur
    const bookmarks = await prisma.bookmark.findMany({
      where: {
        userId: currentUserId,
      },
      // Inclure les données du post et de l'auteur pour chaque favori
      include: {
        post: {
          include: getPostDataIncludes(currentUserId),
        },
      },
      orderBy: { createdAt: "desc" },
      take: pageSize + 1,
      cursor: cursor ? { id: cursor } : undefined,
    });

    // Extraire les posts des objets de favoris
    const posts = bookmarks.map((bookmark) => bookmark.post);

    // Convertir les posts pour correspondre au type 'Post'
    const finalPosts = posts.slice(0, pageSize).map((post) => {
        return post.id
    });

    const nextCursor =
      bookmarks.length > pageSize ? bookmarks[pageSize].id : null;

    const postsData: PostsIdsPage = {
      posts: finalPosts,
      nextCursor,
    };

    return NextResponse.json({
      success: true,
      message: "Favoris récupérés avec succès",
      data: postsData,
    } as ApiResponse<PostsIdsPage>);
  } catch (error) {
    console.error(error);
    return NextResponse.json({
      success: false,
      message: "Erreur interne du serveur",
      name: "server-error",
      data: null,
    } as ApiResponse<null>);
  }
}
