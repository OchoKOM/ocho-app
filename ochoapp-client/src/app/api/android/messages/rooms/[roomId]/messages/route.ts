import { getCurrentUser } from "@/app/api/android/auth/utils";
import { ApiResponse } from "@/app/api/android/utils/dTypes";
import { validateRequest } from "@/auth";
import prisma from "@/lib/prisma";
import {
  getMessageDataInclude,
  getUserDataSelect,
  MessageData,
  MessagesSection,
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
    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const pageSize = 10;

    
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


    let messages: MessageData[];

    // Vérifier si on récupère des messages d'un canal ou des messages sauvegardés
    if (roomId === `saved-${user.id}`) {
      // Récupérer les messages sauvegardés (envoyés à soi-même)
      messages = await prisma.message.findMany({
        where: {
          senderId: userId,
          type: "SAVED",
        },
        include: getMessageDataInclude(user.id),
        orderBy: { createdAt: "desc" },
        take: pageSize + 1,
        cursor: cursor ? { id: cursor } : undefined,
      });
      if (messages[0]) {
        // modifier les types des messages qui n'ont pas "created" comme contenu et qui ne sont pas en premier message en "CONTENT"
        messages = messages.map((message) => {
          if (message.content !== `create-${user.id}`) {
            message.type = "CONTENT";
          }
          return message;
        });
      }
    } else {
      // Récupérer les messages d'un canal spécifique
      const room = await prisma.room.findFirst({
        where: {
          id: roomId,
        },
      });
      if (!room) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          data: null,
            message: "Canal non trouvé.",
            name: "not_found",
        });
      }

      messages = await prisma.message.findMany({
        where: { roomId },
        include: getMessageDataInclude(user.id),
        orderBy: { createdAt: "desc" },
        take: pageSize + 1, // Récupère une page supplémentaire pour vérifier s'il y a une page suivante
        cursor: cursor ? { id: cursor } : undefined,
      });
    }

    const nextCursor =
      messages.length > pageSize ? messages[pageSize].id : null;
    const roomData = await prisma.room.findUnique({
      where: { id: roomId },
    });

    const isGroup = roomData?.isGroup;

    if (isGroup) {
      const member = await prisma.roomMember.findUnique({
        where: {
          roomId_userId: {
            roomId,
            userId: user.id,
          },
        },
      });
      if (!member) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          data: null,
            message: "Utilisateur non trouvé.",
            name: "not_found",
        });
      }
      if (member.type === "BANNED") {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          data: null,
            message: "Utilisateur banni.",
            name: "banned",
        });
      }

      const leftDate = member.leftAt;
      if (leftDate) {
        // Filters messages dates older than leftdate
        messages = messages.filter((message) => message.createdAt < leftDate);
      }
    }
    messages =  messages.map(message=>{
      const formattedMsg: MessageData = {
        ...message
      } 
      return formattedMsg
    })

    const data: MessagesSection = {
      messages: messages.slice(0, pageSize),
      nextCursor,
    };

    return NextResponse.json<ApiResponse<MessagesSection>>({
        success: true,
        data,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des messages :", error);
    return NextResponse.json({
      success: false,
      message: "Erreur interne du serveur",
      name: "server-error",
      data: null,
      error: error instanceof Error ? error.message : String(error),
    } as ApiResponse<null>);
  }
}
