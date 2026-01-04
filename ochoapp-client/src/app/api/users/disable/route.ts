import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/auth";
import prisma from "@/lib/prisma";
import argon2 from "argon2";

export async function POST(req: NextRequest) {
  try {
    const session = await validateRequest();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { password } = await req.json();
    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    const userId = session.user.id;

    // Get user with password hash
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true }
    });

    if (!user?.passwordHash) {
      return NextResponse.json({ error: "Account cannot be disabled" }, { status: 400 });
    }

    // Verify password
    const isValidPassword = await argon2.verify(user.passwordHash, password);
    if (!isValidPassword) {
      return NextResponse.json({ error: "Invalid password" }, { status: 400 });
    }

    // Disable account by setting password hash to null and marking as inactive
    // Note: In a real application, you might want to add an 'isActive' field to the schema
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: null,
        email: null, // Remove email to prevent login
        // You might also want to anonymize other data
      }
    });

    // Clear all sessions for this user
    await prisma.session.deleteMany({
      where: { userId }
    });

    return NextResponse.json({
      message: "Account disabled successfully"
    });

  } catch (error) {
    console.error("Disable account error:", error);
    return NextResponse.json({
      error: "Internal server error"
    }, { status: 500 });
  }
}
