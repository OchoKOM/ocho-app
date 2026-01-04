import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateRequest } from "@/auth";
import argon2 from "argon2";

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await validateRequest();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { password } = await req.json();
    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 },
      );
    }

    const userId = user.id;

    // Get user with password hash
    const userWithHash = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!userWithHash?.passwordHash) {
      return NextResponse.json(
        { error: "Account cannot be deleted" },
        { status: 400 },
      );
    }

    // Verify password
    const isValidPassword = await argon2.verify(
      userWithHash.passwordHash,
      password,
    );
    if (!isValidPassword) {
      return NextResponse.json({ error: "Invalid password" }, { status: 400 });
    }

    // Store user data in OldUserData table before deletion
    const userData = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        passwordHash: true,
        email: true,
        birthday: true,
      },
    });

    if (userData) {
      await prisma.oldUserData.create({
        data: {
          userId,
          password: userData.passwordHash || "",
          email: userData.email || "",
          birthday: userData.birthday || new Date(),
        },
      });
    }

    // Delete all user-related data in the correct order to respect foreign key constraints
    await prisma.$transaction(async (tx) => {
      // Delete reactions
      await tx.reaction.deleteMany({ where: { userId } });

      // Delete reads
      await tx.read.deleteMany({ where: { userId } });

      // Delete last messages
      await tx.lastMessage.deleteMany({ where: { userId } });

      // Delete bookmarks
      await tx.bookmark.deleteMany({ where: { userId } });

      // Delete likes
      await tx.like.deleteMany({ where: { userId } });

      // Delete comment likes
      await tx.commentLike.deleteMany({ where: { userId } });

      // Delete comments (replies will be cascade deleted)
      await tx.comment.deleteMany({ where: { userId } });

      // Delete posts (this will cascade delete comments, likes, etc.)
      await tx.post.deleteMany({ where: { userId } });

      // Delete search history
      await tx.searchHistory.deleteMany({ where: { userId } });

      // Delete notifications
      await tx.notification.deleteMany({
        where: {
          OR: [{ recipientId: userId }, { issuerId: userId }],
        },
      });

      // Delete follows
      await tx.follow.deleteMany({
        where: {
          OR: [{ followerId: userId }, { followingId: userId }],
        },
      });

      // Delete room memberships
      await tx.roomMember.deleteMany({ where: { userId } });

      // Delete messages
      await tx.message.deleteMany({
        where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      });

      // Delete sessions
      await tx.session.deleteMany({ where: { userId } });

      // Delete verified users
      await tx.verifiedUsers.deleteMany({ where: { userId } });

      // Delete auth codes
      await tx.authCode.deleteMany({ where: { userId } });

      // Finally delete the user
      await tx.user.delete({ where: { id: userId } });
    });

    return NextResponse.json({
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
