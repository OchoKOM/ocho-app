import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateRequest } from "@/auth";

export async function GET() {
  try {
    const session = await validateRequest();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userPrivacies = await prisma.userPrivacy.findMany({
      where: { userId: session.user.id },
      include: { privacy: true },
    });

    const privacySettings = userPrivacies.reduce((acc, up) => {
      acc[up.privacy.type] = up.privacy.value;
      return acc;
    }, {} as Record<string, string>);

    return NextResponse.json(privacySettings);
  } catch (error) {
    console.error("Error fetching privacy settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await validateRequest();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type, value } = body;

    if (!type || !value) {
      return NextResponse.json(
        { error: "Type and value are required" },
        { status: 400 }
      );
    }

    // Find the privacy record
    const privacy = await prisma.privacy.findFirst({
      where: { type, value },
    });

    if (!privacy) {
      return NextResponse.json(
        { error: "Invalid privacy type or value" },
        { status: 400 }
      );
    }

    // Update or create user privacy
    await prisma.userPrivacy.upsert({
      where: {
        userId_privacyId: {
          userId: session.user.id,
          privacyId: privacy.id,
        },
      },
      update: {},
      create: {
        userId: session.user.id,
        privacyId: privacy.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating privacy settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
