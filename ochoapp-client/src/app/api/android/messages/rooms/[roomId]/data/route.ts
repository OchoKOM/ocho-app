import { getCurrentUser } from "@/app/api/android/auth/utils";
import { ApiResponse } from "@/app/api/android/utils/dTypes";
import prisma from "@/lib/prisma";
import {
  RoomData,
  getMessageDataInclude,
  getUserDataSelect,
  MessageData,
} from "@/lib/types";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ roomId: string }>;
  },
) {
  const {roomId} = await params
  try {

    const { user: loggedInUser, message } = await getCurrentUser();
    if (!loggedInUser) {
        return NextResponse.json({
        success: false,
        message: message || "Utilisateur non authentifié.",
        name: "unauthorized",
        } as ApiResponse<null>);
    }

    const user = await prisma.user.findFirst({
      where: {
        id: loggedInUser.id,
      },
      select: getUserDataSelect(loggedInUser.id, loggedInUser.username),
    });

    if (!user) {
      return NextResponse.json({
        success: false,
        message: message || "Utilisateur non authentifié.",
        name: "unauthorized",
        } as ApiResponse<null>);
    }
    const userId = user.id;

    // Vérifier si on récupère des messages d'un canal ou des messages sauvegardés
    if (roomId === `saved-${user.id}`) {
      const existingSavedMsgs = await prisma.message.findMany({
        where: {
          senderId: {
            equals: userId,
          },
          type: {
            equals: "SAVED",
          },
        },
        include: getMessageDataInclude(user.id),
        take: 1,
        orderBy: { createdAt: "desc" },
      });
      if (existingSavedMsgs[0]) {
        const existingSavedMsg: MessageData = existingSavedMsgs[0];
        const createInfo = await prisma.message.findFirst({
          where: {
            senderId: {
              equals: userId,
            },
            type: {
              equals: "SAVED",
            },
          },
          include: getMessageDataInclude(user.id),
          take: 1,
          orderBy: { createdAt: "asc" },
        });
    
        const newRoom: RoomData = {
          id: `saved-${userId}`,
          name: null,
          description: null,
          groupAvatarUrl: null,
          privilege: "MANAGE",
          members: [
            {
              user,
              userId,
              type: "OWNER",
              joinedAt: user.createdAt,
              leftAt: null,
            },
          ],
          maxMembers: 300,
          messages: [existingSavedMsg],
          isGroup: false,
          createdAt: createInfo?.createdAt || new Date(),
        };
        return NextResponse.json<ApiResponse<RoomData>>({
          success: true,
          data: newRoom,
        });
      }
    
      const createInfo: MessageData = await prisma.message.create({
        data: {
          content: `create-${user.id}`,
          senderId: userId,
          type: "SAVED",
        },
        include: getMessageDataInclude(user.id),
      });
      const existingSavedMsg: MessageData = existingSavedMsgs[0];
      const newRoom: RoomData = {
        id: `saved-${userId}`,
        name: null,
        description: null,
        groupAvatarUrl: null,
        privilege: "MANAGE",
        members: [
          {
            user,
            userId,
            type: "OWNER",
            joinedAt: user.createdAt,
            leftAt: null,
          },
        ],
        maxMembers: 300,
        messages: [existingSavedMsg],
        isGroup: false,
        createdAt: createInfo?.createdAt || new Date(),
      };
    return NextResponse.json<ApiResponse<RoomData>>({
        success: true,
        data: newRoom,
    });
    } else {
      const roomData = await prisma.room.findFirst({
        where: {
          id: roomId,
        },
      });

      if (!roomData) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          data: null,
          message: "Canal non trouvé.",
            name: "not_found",
        });
      }
      // Récupérer les membres d'un canal spécifique
      const membersData = await prisma.roomMember.findMany({
        where: {
          roomId,
        },
      });
      const membersToFilter = await Promise.all(
        membersData.map(async (member) => {
          if (!member.userId || !member) {
            return null; // retournez null si aucune userId
          }

          const user = await prisma.user.findUnique({
            where: {
              id: member.userId,
            },
            select: getUserDataSelect(userId),
          });

          return {
            user,
            userId: member.userId,
            type: member.type,
            joinedAt: member.joinedAt,
            leftAt: member.leftAt,
          };
        }),
      );
      const messages: MessageData[] = []
      const members = membersToFilter.filter((member) => member !== null);
      const room: RoomData = {
        ...roomData,
        members,
        messages,
      };
        return NextResponse.json<ApiResponse<RoomData>>({
            success: true,
            data: room,
        });
    }

  } catch (error) {
    console.error("Erreur lors de la récupération des données du canal :", error);
    return NextResponse.json({
      success: false,
      message: "Erreur interne du serveur",
      name: "server-error",
      data: null,
      error: error instanceof Error ? error.message : String(error),
    } as ApiResponse<null>);
  }
}
