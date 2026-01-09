import prisma from "@/lib/prisma";
import { NotificationCountInfo } from "@/lib/types";
import { getCurrentUser } from "../../../auth/utils";
import { ApiResponse } from "../../../utils/dTypes";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { user, message } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({
        success: false,
        message: message || "Utilisateur non authentifié.",
        name: "unauthorized",
      } as ApiResponse<null>);
    }

    const unreadCount = await prisma.room.count({
      where: {
        members: {
          some: {
            AND: [
              { userId: user.id },
              {
                joinedAt: {
                  lte: new Date(),
                },
              },
              { OR: [{ leftAt: { lt: new Date() } }, { leftAt: null }] },
            ],
          },
        },
        messages: {
          some: {
            AND: [
              { type: { not: "CREATE" } },
              {
                reads: {
                  none: {
                    userId: user.id,
                  },
                },
              },
              {
                OR: [
                  {
                    AND: [
                      { senderId: { not: user.id } },
                      {
                        type: {
                          not: "REACTION",
                        },
                      },
                    ],
                  },
                  {
                    AND: [
                      {
                        type: "REACTION",
                      },
                      {
                        OR: [{ recipientId: user.id }, { senderId: user.id }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    });

    const data: NotificationCountInfo = {
      unreadCount,
    };
    return NextResponse.json({
      success: true,
      data,
    } as ApiResponse<NotificationCountInfo>);
  } catch (error) {
    console.error(
      "Erreur lors de la récupération du nombre de rooms non lues :",
      error,
    );
    return NextResponse.json({
      success: false,
      message: "Erreur interne du serveur",
      name: "server-error",
      data: null,
      error: error instanceof Error ? error.message : String(error),
    } as ApiResponse<null>);
  }
}
