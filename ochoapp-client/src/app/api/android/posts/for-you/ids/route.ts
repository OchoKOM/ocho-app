
import prisma from "@/lib/prisma";
import { getPostDataIncludes, UserData } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";
import {
  ApiResponse,
  calculateRelevanceScore,
  PostsIdsPage,
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

    const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
    const pageSize = 5;

    // Récupérer les trois derniers posts triés par date
    const latestPosts = await prisma.post.findMany({
      include: getPostDataIncludes(user.id),
      orderBy: {
        createdAt: "desc",
      },
      take: !cursor ? 3 : 0,
    });

    // Récupérer les posts suivants triés par pertinence
    const relevantPosts = await prisma.post.findMany({
      include: getPostDataIncludes(user.id),
      orderBy: [
        {
          relevanceScore: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: pageSize + 1,
      cursor: cursor ? { id: cursor } : undefined,
      where: {
        id: {
          notIn: latestPosts.map(post => post.id), // Exclure les posts déjà récupérés
        },
      },
    });

    const posts = [...latestPosts, ...relevantPosts];

    const postsWithScores = posts.slice(0, pageSize).map((post) => ({
      ...post,
      relevanceScore: calculateRelevanceScore(
        post,
        user,
        posts[0]?.id || undefined,
      ),
    }));

    const sortedPosts = postsWithScores
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .map((post) => {
        return post.id;
      });

    const nextCursor = posts.length > pageSize + latestPosts.length ? posts[pageSize + latestPosts.length].id : null;

    const data: PostsIdsPage = {
      posts: sortedPosts,
      nextCursor,
    };

    return NextResponse.json({
      success: true,
      message: "Posts retrieved successfully",
      data,
    } as ApiResponse<PostsIdsPage>);
  } catch (error) {
    console.error(error);

    return NextResponse.json({
      success: false,
      message: "Internal server error",
      name: "server-error",
      data: null,
    } as ApiResponse<null>);
  }
}
