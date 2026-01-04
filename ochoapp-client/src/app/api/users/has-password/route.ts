import { NextRequest, NextResponse } from "next/server";
import { lucia } from "@/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.cookies.get(lucia.sessionCookieName)?.value;

    if (!sessionId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { session, user } = await lucia.validateSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ hasPassword: !!dbUser.passwordHash });
  } catch (error) {
    console.error("Error checking password status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
