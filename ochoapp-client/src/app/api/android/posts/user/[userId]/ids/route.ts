import prisma from "@/lib/prisma";
import { getPostDataIncludes } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";
import {
  ApiResponse,
  PostsIdsPage,
  User,
  VerifiedUser,
} from "../../../../utils/dTypes";
import { getCurrentUser } from "../../../../auth/utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  try {
     const { user, message } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({
        success: false,
        message: message || "Utilisateur non authentifié.",
        name: "unauthorized",
      } as ApiResponse<null>);
    }

    const currentUserId = user?.id;

    const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
    const pageSize = 5;

    // Récupérer les posts de l'utilisateur
    const posts = await prisma.post.findMany({
      where: {
        OR: [{ userId }, { user: { username: userId } }],
      },
      // Utiliser la fonction getPostDataIncludes pour la cohérence
      include: getPostDataIncludes(currentUserId),
      orderBy: { createdAt: "desc" },
      take: pageSize + 1,
      cursor: cursor ? { id: cursor } : undefined,
    });

    // Convertir les posts pour correspondre au type 'Post'
    const finalPosts = posts.slice(0, pageSize).map((post) => {
        return post.id;
    });

    const nextCursor = posts.length > pageSize ? posts[pageSize].id : null;

    const postsData: PostsIdsPage = {
      posts: finalPosts,
      nextCursor,
    };

    return NextResponse.json({
      success: true,
      message: "Posts de l'utilisateur récupérés avec succès",
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
