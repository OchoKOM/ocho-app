import { RoomData } from "@/lib/types";
import RoomPreview from "./RoomPreview";
import InfiniteScrollContainer from "@/components/InfiniteScrollContainer";
import { useSession } from "../SessionProvider";
import RoomsLoadingSkeleton from "./skeletons/RoomSkeleton";
import { useEffect, useState, useCallback, useRef } from "react";
import { useActiveRoom } from "@/context/ChatContext";
import { Frown, Loader2, MessageSquare, Search, SquarePen } from "lucide-react";
import { usePathname } from "next/navigation";
import { t } from "@/context/LanguageContext";
import { useProgress } from "@/context/ProgressContext";
import { useSocket } from "@/components/providers/SocketProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import kyInstance from "@/lib/ky";

interface SidebarProps {
  activeRoom: (room: RoomData) => void;
  selectedRoomId: string | null;
  onRoomSelect: (roomId: string) => void;
  onNewChat: () => void;
  onCloseChat: () => void;
}

// Structure attendue pour la mise à jour de liste (doit correspondre à RoomsSection dans types.ts)
interface RoomListPayload {
  rooms: RoomData[];
  nextCursor?: string | null;
}

export default function SideBar({
  activeRoom,
  selectedRoomId,
  onRoomSelect,
  onNewChat,
  onCloseChat,
}: SidebarProps) {
  const { user: loggedinUser } = useSession();
  const { activeRoomId, setActiveRoomId } = useActiveRoom();
  const pathname = usePathname();
  const { startNavigation: navigate } = useProgress();
  const { chats, startNewChat, noChat, dataError } = t();

  // --- SOCKET & STATE ---
  const { socket, isConnected } = useSocket();
  const [rooms, setRooms] = useState<RoomData[]>([]);

  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [status, setStatus] = useState<"pending" | "success" | "error">(
    "pending",
  );

  const roomsRef = useRef<RoomData[]>([]);
  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const fetchedCursorsRef = useRef<Set<string | null>>(new Set());

  const userId = loggedinUser.id;
  const queryClient = useQueryClient();

  const queryKey = ["rooms", "sidebar", userId];

  // --- REQUÊTE HTTP (PRIORITAIRE) ---
  const {
    data: httpRooms,
    isLoading: isHttpLoading,
    isError: isHttpError,
  } = useQuery({
    queryKey: queryKey,
    queryFn: () => kyInstance.get("/api/room-list").json<RoomData[]>(),
    staleTime: 1000 * 60 * 5, // 5 minutes de cache
  });

  // --- SYNCHRONISATION HTTP -> STATE LOCAL ---
  useEffect(() => {
    if (httpRooms) {
      setRooms((prev) => {
        // Si on a déjà des données via socket, on évite de les écraser brutalement
        // sauf si la liste locale est vide
        if (prev.length > 0) return prev;
        return httpRooms;
      });
      setStatus("success");
      setIsLoading(false);
    } else if (isHttpError) {
      // Gérer l'erreur si nécessaire
    }
  }, [httpRooms, isHttpError]);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  // 1. Fonction pour demander des rooms au serveur (Socket)
  const fetchRooms = useCallback(
    (nextCursor: string | null = null) => {
      if (!socket || !isConnected) return;
      if (isFetchingMore) return;

      if (fetchedCursorsRef.current.has(nextCursor)) return;

      fetchedCursorsRef.current.add(nextCursor);
      setIsFetchingMore(true);

      socket.emit("get_rooms", {
        cursor: nextCursor,
        limit: 15,
      });
    },
    [socket, isConnected, isFetchingMore],
  );

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Handler pour la réponse initiale ou pagination (get_rooms)
    const handleRoomsResponse = (response: {
      rooms: RoomData[];
      nextCursor: string | null;
    }) => {
      setRooms((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        const newRooms = response.rooms.filter((r) => !existingIds.has(r.id));

        const updatedList =
          prev.length === 0 ? response.rooms : [...prev, ...newRooms];

        // Mise à jour du cache React Query seulement si c'est le chargement initial
        if (!cursor && prev.length === 0) {
          queryClient.setQueryData(queryKey, updatedList);
        }

        return updatedList;
      });

      setCursor(response.nextCursor);
      setHasMore(!!response.nextCursor);
      setStatus("success");
      setIsLoading(false);
      setIsFetchingMore(false);
    };

    // Handler 1: Mise à jour via LISTE (envoi/suppression message)
    // Le backend renvoie { rooms: RoomData[], nextCursor: ... }
    const handleRoomListUpdate = (payload: RoomListPayload) => {
      console.log("Socket: room_list_updated", payload);

      setRooms((prev) => {
        // Les rooms renvoyées par le backend sont déjà triées (les plus récentes en premier)
        const newTopRooms = payload.rooms;
        const newIds = new Set(newTopRooms.map((r) => r.id));

        // On garde les anciennes rooms qui ne sont PAS dans la nouvelle mise à jour
        const keptOldRooms = prev.filter((r) => !newIds.has(r.id));

        // On fusionne : nouvelles rooms en haut + anciennes rooms en bas
        const newList = [...newTopRooms, ...keptOldRooms];

        // Sync du cache
        queryClient.setQueryData(queryKey, newList);

        return newList;
      });
    };

    // Handler 2: Mise à jour via SINGLE ROOM (création)
    // Le backend renvoie un objet RoomData unique
    const handleSingleRoomUpdate = (newRoom: RoomData) => {
      console.log("Socket: single room update", newRoom);

      setRooms((prev) => {
        // On retire la room si elle existe déjà (pour la remonter)
        const otherRooms = prev.filter((r) => r.id !== newRoom.id);
        const newList = [newRoom, ...otherRooms];

        queryClient.setQueryData(queryKey, newList);
        return newList;
      });
    };

    const handleError = () => {
      if (roomsRef.current.length === 0) {
        setStatus("error");
      }
      setIsLoading(false);
      setIsFetchingMore(false);
    };

    // --- BINDING DES EVENTS ---
    socket.on("rooms_list_data", handleRoomsResponse);

    // CAS 1: Liste complète mise à jour (Send/Delete message)
    socket.on("room_list_updated", handleRoomListUpdate);

    // CAS 2: Nouvelle room unique (Create chat)
    socket.on("new_room_created", handleSingleRoomUpdate);
    // Ajout de room_ready pour que le créateur voit aussi la room s'ajouter
    socket.on("room_ready", handleSingleRoomUpdate);

    socket.on("error_fetching_rooms", handleError);

    // Initial fetch
    if (rooms.length === 0 && !isHttpLoading) {
      fetchRooms(null);
    }

    return () => {
      socket.off("rooms_list_data", handleRoomsResponse);
      socket.off("room_list_updated", handleRoomListUpdate);
      socket.off("new_room_created", handleSingleRoomUpdate);
      socket.off("room_ready", handleSingleRoomUpdate);
      socket.off("error_fetching_rooms", handleError);
    };
  }, [
    socket,
    isConnected,
    queryClient,
    queryKey,
    cursor,
    isHttpLoading,
    fetchRooms,
    rooms.length,
  ]);

  // --- GESTION DES REJOINTES DE ROOMS ---
  useEffect(() => {
    if (status !== "success" || !socket) return;

    // Optimisation: ne rejoindre que les nouvelles rooms
    const roomsToJoin = rooms.filter((r) => !joinedRoomsRef.current.has(r.id));

    if (roomsToJoin.length > 0) {
      roomsToJoin.forEach((room) => {
        socket.emit("join_room", room.id);
        joinedRoomsRef.current.add(room.id);
      });
    }
  }, [rooms, status, socket]);

  function handleRoomSelect(room: RoomData) {
    onCloseChat();
    onRoomSelect(room.id);
    activeRoom(room);
    setActiveRoomId(room.id);
  }

  if (status === "success" && !activeRoomId && pathname === "/messages/chat") {
    navigate("/messages");
  }

  const showSkeleton = (isLoading || isHttpLoading) && rooms.length === 0;

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between p-4 text-lg font-bold shadow-sm max-sm:bg-card/50">
        <span>{chats}</span>
        <span
          className="cursor-pointer hover:text-primary max-sm:hidden"
          title={startNewChat}
          onClick={onNewChat}
        >
          <SquarePen />
        </span>
      </div>

      <InfiniteScrollContainer
        className="relative flex max-w-full flex-1 flex-col space-y-5 overflow-y-auto bg-card/30 sm:bg-background/50"
        onBottomReached={() => {
          if (hasMore && !isFetchingMore && !showSkeleton) {
            fetchRooms(cursor);
          }
        }}
      >
        {showSkeleton && <RoomsLoadingSkeleton />}

        {status === "success" && !showSkeleton && !rooms.length && (
          <div className="flex w-full flex-1 select-none items-center px-3 py-8 text-center italic text-muted-foreground">
            <div className="my-8 flex w-full flex-col items-center gap-2 text-center text-muted-foreground">
              <MessageSquare size={150} />
              <h2 className="text-xl">
                {noChat.split("[pen]")[0]}
                <SquarePen className="inline" />
                {noChat.split("[pen]")[1]}
              </h2>
            </div>
          </div>
        )}

        {status === "error" && rooms.length === 0 && (
          <div className="flex w-full flex-1 select-none items-center px-3 py-8 text-center italic text-muted-foreground">
            <div className="my-8 flex w-full select-none flex-col items-center gap-2 text-center text-muted-foreground">
              <Frown size={150} />
              <h2 className="text-xl">{dataError}</h2>
            </div>
          </div>
        )}

        {rooms.length > 0 && (
          <ul className="">
            {rooms.map((room, index) => (
              <RoomPreview
                key={room.id} // Utiliser room.id est plus sûr que index pour les listes dynamiques
                room={room}
                active={selectedRoomId === room.id}
                onSelect={() => handleRoomSelect(room)}
              />
            ))}
          </ul>
        )}

        {isFetchingMore && (
          <ul>
            <li className="flex w-full justify-center p-4">
              <Loader2 className="mx-auto animate-spin" />
            </li>
          </ul>
        )}
      </InfiniteScrollContainer>

      <div className="fixed bottom-20 right-5 flex gap-2 sm:absolute sm:bottom-5">
        <div
          className="flex aspect-square h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-muted-foreground/60 text-muted shadow-md hover:bg-muted-foreground hover:shadow-lg hover:shadow-muted-foreground/30 dark:text-muted-foreground dark:bg-muted"
          // Pour les recherches
        >
          <Search />
        </div>
        <div
          className="flex aspect-square h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary-foreground hover:text-primary hover:shadow-lg hover:shadow-primary/30"
          onClick={onNewChat}
          title={startNewChat}
        >
          <SquarePen />
        </div>
      </div>
    </div>
  );
}
