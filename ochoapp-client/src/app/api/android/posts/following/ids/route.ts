// api/android/posts/following/route.ts
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

    // Récupération des posts
    const posts = await prisma.post.findMany({
      where: {
        AND: [
          {
            user: {
              followers: {
                some: {
                  followerId: user.id,
                },
              },
              NOT: {
                id: user.id,
              },
            },
          },
        ],
      },
      include: getPostDataIncludes(user.id),
      orderBy: { createdAt: "desc" },
      take: pageSize + 1,
      cursor: cursor ? { id: cursor } : undefined,
    });

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

    const nextCursor = posts.length > pageSize ? posts[pageSize].id : null;

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
