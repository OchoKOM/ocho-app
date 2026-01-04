import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/auth";
import prisma from "@/lib/prisma";
import argon2 from "argon2";
import { z } from "zod";
import CryptoJS from "crypto-js";

const updateUserSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/).optional(),
  displayName: z.string().min(1).max(50).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  currentPassword: z.string().optional(),
  birthday: z.string().datetime().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await validateRequest();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validatedData = updateUserSchema.parse(body);

    const userId = user.id;
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastUsernameChange: true, username: true, passwordHash: true }
    });

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify current password if password update is requested and user has a password
    if (validatedData.password && dbUser.passwordHash) {
      if (!validatedData.currentPassword) {
        return NextResponse.json({
          error: "Current password is required to change password"
        }, { status: 400 });
      }

      const isCurrentPasswordValid = await argon2.verify(dbUser.passwordHash, validatedData.currentPassword);
      if (!isCurrentPasswordValid) {
        return NextResponse.json({
          error: "Current password is incorrect"
        }, { status: 400 });
      }
    }

    // Check username change restriction (once per month)
    if (validatedData.username && validatedData.username !== user.username) {
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      if (user.lastUsernameChange && user.lastUsernameChange > oneMonthAgo) {
        return NextResponse.json({
          error: "Username can only be changed once per month"
        }, { status: 400 });
      }
    }

    // Check if new username is already taken
    if (validatedData.username && validatedData.username !== user.username) {
      const existingUser = await prisma.user.findUnique({
        where: { username: validatedData.username }
      });

      if (existingUser) {
        return NextResponse.json({
          error: "Username already taken"
        }, { status: 400 });
      }
    }

    // Prepare update data
    const updateData: any = {};

    if (validatedData.username) {
      updateData.username = validatedData.username;
      updateData.lastUsernameChange = new Date();
    }

    if (validatedData.displayName) {
      const secretKey = process.env.INTERNAL_SERVER_SECRET;
      if (!secretKey) {
        throw new Error("INTERNAL_SERVER_SECRET environment variable is not set");
      }
      updateData.displayName = CryptoJS.AES.encrypt(validatedData.displayName, secretKey).toString();
    }

    if (validatedData.email) {
      const secretKey = process.env.INTERNAL_SERVER_SECRET;
      if (!secretKey) {
        throw new Error("INTERNAL_SERVER_SECRET environment variable is not set");
      }
      updateData.email = CryptoJS.AES.encrypt(validatedData.email, secretKey).toString();
    }

    if (validatedData.password) {
      updateData.passwordHash = await argon2.hash(validatedData.password);
    }

    if (validatedData.birthday) {
      updateData.birthday = new Date(validatedData.birthday);
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        birthday: true,
        lastUsernameChange: true
      }
    });

    return NextResponse.json({
      message: "User updated successfully",
      user: updatedUser
    });

  } catch (error) {
    console.error("User update error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: "Validation error",
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      error: "Internal server error"
    }, { status: 500 });
  }
}
