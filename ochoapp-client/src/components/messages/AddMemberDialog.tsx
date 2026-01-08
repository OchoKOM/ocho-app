"use client";

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogHeader,
} from "../ui/dialog";
import { RoomData, UserData, UsersPage } from "@/lib/types";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { t } from "@/context/LanguageContext";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import kyInstance from "@/lib/ky";
import { XIcon, SearchIcon, Frown, Meh } from "lucide-react";
import LoadingButton from "../LoadingButton";
import { Skeleton } from "../ui/skeleton";
import UserAvatar from "../UserAvatar";
import UsersList from "./UsersList";
import { Input } from "../ui/input";
import { useSocket } from "@/components/providers/SocketProvider"; // Import du socket
import { useToast } from "../ui/use-toast";

interface AddMemberDialogProps {
  room: RoomData;
  className?: string;
  children: React.ReactNode;
}

export default function AddMemberDialog({
  room,
  className,
  children,
}: AddMemberDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { addMembers } = t();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        asChild
        className={cn("cursor-pointer", className)}
        title={addMembers}
      >
        {children}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{addMembers}</DialogTitle>
        </DialogHeader>
        <AddMemberForm onAdd={() => setIsOpen(false)} room={room} />
      </DialogContent>
    </Dialog>
  );
}

interface AddMemberFormProps {
  onAdd: () => void;
  room: RoomData;
}

export function AddMemberForm({ onAdd, room }: AddMemberFormProps) {
  const [query, setQuery] = useState<string>("");
  const [inputValue, setInputValue] = useState<string>("");
  const [selectedUsers, setSelectedUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(false); // État de chargement local
  
  const queryClient = useQueryClient();
  const { socket } = useSocket(); // Hook socket
  const { toast } = useToast();
  const { add, availableUsers, noAvailableUser, dataError, searchUsers } = t();

  const addUser = (user: UserData) => {
    if (!selectedUsers.find((selected) => selected.id === user.id)) {
      setSelectedUsers([...selectedUsers, user]);
    } else {
      removeUser(user);
    }
  };

  const removeUser = (user: UserData) => {
    setSelectedUsers(
      selectedUsers.filter((selected) => selected.id !== user.id),
    );
  };

  const {
    data,
    fetchNextPage,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ["group", "users", "add", "search", room.id],
    queryFn: ({ pageParam }) =>
      kyInstance
        .get("/api/users/search", {
          searchParams: {
            q: query || "",
            roomId: room.id,
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        })
        .json<UsersPage>(),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    gcTime: 0,
    staleTime: Infinity,
  });

  const userQuery = {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  };

  const users = data?.pages?.flatMap((page) => page?.users) || [];

  const handleSubmit = () => {
    if (!socket) return;
    setLoading(true);

    const membersIds = selectedUsers.map((member) => member.id);

    socket.emit("group_add_members", { roomId: room.id, members: membersIds }, (res: any) => {
      setLoading(false);
      
      if (res.success) {
        // Optionnel : Mise à jour optimiste ou invalider la query comme avant
        // Le socket enverra "room_updated" ou "added_to_group" mais on invalide ici pour être sûr
        const queryKey = ["chat", room.id];
        queryClient.invalidateQueries({ queryKey });

        setSelectedUsers([]);
        setQuery("");
        onAdd();
      } else {
        console.error(res.error);
        toast({
          variant: "destructive",
          description: res.error || dataError,
        });
      }
    });
  };

  return (
    <div className="w-full max-w-full space-y-4 overflow-hidden">
      {!!selectedUsers.length && (
        <>
          <div className="sticky top-0 flex w-full animate-scale gap-2 overflow-y-auto p-3 px-4">
            {selectedUsers.map((user, index) => (
              <div
                className="flex flex-shrink-0 flex-col items-center gap-1"
                key={index}
                onClick={() => removeUser(user)}
              >
                <div className="relative animate-scale">
                  <UserAvatar userId={user.id} avatarUrl={user.avatarUrl} size={48} />
                  <div className="absolute bottom-0 right-0 flex cursor-pointer items-center justify-center rounded-full bg-muted p-0.5 outline-2 outline-background">
                    <XIcon size={15} />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {user.displayName.split(" ")[0]}
                </span>
              </div>
            ))}
          </div>
          <div className="sticky top-0 flex w-full animate-scale gap-2 px-2">
            <LoadingButton
              onClick={handleSubmit}
              loading={loading}
              disabled={!selectedUsers.length}
              className="w-full rounded-lg"
            >
              {add} {!!selectedUsers.length && ` (${selectedUsers.length})`}
            </LoadingButton>
          </div>
        </>
      )}
      <div>
        <form
          className="relative p-1"
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setQuery(inputValue);
          }}
        >
          <Input
            placeholder={searchUsers}
            className="rounded-3xl pe-10 ps-4"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <SearchIcon
            className="absolute right-3 top-1/2 size-5 -translate-y-1/2 transform text-muted-foreground hover:text-primary"
            onClick={() => setQuery(inputValue)}
          />
        </form>
      </div>

      <div className="space-y-2">
        {status === "error" && (
          <div className="my-8 flex w-full flex-col items-center gap-2 text-center text-muted-foreground">
            <Frown size={100} />
            <h2 className="text-xl">{dataError}</h2>
          </div>
        )}
        {status === "pending" && !!query && <UsersListSkeleton />}
        {status === "success" && !users.length && !hasNextPage && (
          <div className="my-8 flex w-full flex-col items-center gap-2 text-center text-muted-foreground">
            <Meh size={100} />
            <h2 className="text-xl">
              {noAvailableUser}
            </h2>
          </div>
        )}
        {status !== "success" && !query && <UsersListSkeleton />}
        <ul className="max-h-[300px] flex-1 justify-center overflow-y-auto">
          <UsersList
            query={userQuery}
            onSelect={addUser}
            title={availableUsers}
            selectedUsers={selectedUsers}
            canSelect={status === "success"}
          />
        </ul>
      </div>
    </div>
  );
}

function UsersListSkeleton() {
  return (
    <ul className="max-h-[60vh] flex-1 animate-pulse overflow-y-auto">
      <li className="cursor-pointer p-3 px-4">
        <div className="flex flex-shrink-0 items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3.5 w-[60%] min-w-20 rounded" />
            <Skeleton className="h-3 w-[80%] rounded" />
          </div>
        </div>
      </li>
      <li className="cursor-pointer p-3 px-4">
        <div className="flex flex-shrink-0 items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3.5 w-[60%] min-w-24 rounded" />
          </div>
        </div>
      </li>
      <li className="cursor-pointer p-3 px-4">
        <div className="flex flex-shrink-0 items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3.5 w-[60%] min-w-24 rounded" />
            <Skeleton className="h-3 w-[70%] rounded" />
          </div>
        </div>
      </li>
      <li className="cursor-pointer p-3 px-4">
        <div className="flex flex-shrink-0 items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3.5 w-[60%] min-w-24 rounded" />
            <Skeleton className="h-3 w-[50%] rounded" />
          </div>
        </div>
      </li>
    </ul>
  );
}