import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { user, session } = await validateRequest();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    // Fetch user data
    const userData = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        birthday: true,
        bio: true,
        avatarUrl: true,
        createdAt: true,
        lastSeen: true,
        // Exclude sensitive data like passwordHash
      }
    });

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch user's posts
    const posts = await prisma.post.findMany({
      where: { userId },
      select: {
        id: true,
        content: true,
        createdAt: true,
        gradient: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    // Fetch user's comments
    const comments = await prisma.comment.findMany({
      where: { userId },
      select: {
        id: true,
        content: true,
        createdAt: true,
        postId: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    // Fetch user's likes
    const likes = await prisma.like.findMany({
      where: { userId },
      select: {
        postId: true,
      }
    });

    // Fetch user's bookmarks
    const bookmarks = await prisma.bookmark.findMany({
      where: { userId },
      select: {
        postId: true,
        createdAt: true,
      }
    });

    // Fetch user's search history
    const searchHistory = await prisma.searchHistory.findMany({
      where: { userId },
      select: {
        query: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    // Compile all user data
    const exportData = {
      user: userData,
      posts: posts,
      comments: comments,
      likes: likes,
      bookmarks: bookmarks,
      searchHistory: searchHistory,
      exportDate: new Date().toISOString(),
      note: "This export contains your public data and activity. Sensitive information like passwords is not included."
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="user-data.json"'
      }
    });

  } catch (error) {
    console.error("Export data error:", error);
    return NextResponse.json({
      error: "Internal server error"
    }, { status: 500 });
  }
}
