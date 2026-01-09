import { validateRequest } from "@/auth";
import prisma from "@/lib/prisma";
import { NotificationCountInfo } from "@/lib/types";

export async function GET() {
  try {
    const { user } = await validateRequest();

    if (!user) {
      return Response.json({ error: "Action non autorisée" }, { status: 401 });
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

    return Response.json(data);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
