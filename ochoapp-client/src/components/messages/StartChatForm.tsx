"use client";

import { useState } from "react";
import kyInstance from "@/lib/ky";
import { Loader2, SearchIcon } from "lucide-react";
import { RoomData, UserData, UsersPage } from "@/lib/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "@/app/(main)/SessionProvider";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Input } from "../ui/input";
import UserAvatar from "../UserAvatar";
import { useCreateChatRoomMutation, useSaveMessageMutation } from "./mutations";
import LoadingButton from "../LoadingButton";
import { t } from "@/context/LanguageContext";

interface StartChatFormProps {
  onChatStart: (room: RoomData) => void;
}

export default function StartChatForm({ onChatStart }: StartChatFormProps) {
  const [query, setQuery] = useState<string>("");
  const [inputValue, setInputValue] = useState<string>("");
  const [selectedUsers, setSelectedUsers] = useState<UserData[]>([]);
  const [isGroup, setIsGroup] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [groupName, setGroupName] = useState("");
  const { user: loggedinUser } = useSession();

  const mutation = useCreateChatRoomMutation();
  const savedMsgsMutation = useSaveMessageMutation();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } =
    useInfiniteQuery({
      queryKey: ["users", "search", query],
      queryFn: ({ pageParam }) =>
        kyInstance
          .get("/api/users/search", {
            searchParams: {
              q: query || "", // Si aucune requête, recherche les utilisateurs suivis ou suggestions
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          })
          .json<UsersPage>(),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      gcTime: 0,
    });

  const users = data?.pages?.flatMap((page) => page?.users) || [];

  const handleUserSelect = (user: UserData) => {
    setIsSaved(user.id === loggedinUser.id)
    if (selectedUsers.some((u) => u.id === user.id)) {
      setSelectedUsers(selectedUsers.filter((u) => u.id !== user.id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleSubmit = () => {
    if(isSaved){
      savedMsgsMutation.mutate({}, { onSuccess: (data) => {
        // Réinitialiser le formulaire
        setSelectedUsers([]);
        setQuery("");
        setGroupName("");
        onChatStart(data.newRoom);
      },});
      return;
    }
    mutation.mutate(
      {
        name: isGroup ? groupName : null,
        isGroup,
        members: selectedUsers.map((user) => user.id),
      },
      {
        onSuccess: (data) => {
          // Réinitialiser le formulaire
          setSelectedUsers([]);
          setQuery("");
          setGroupName("");
          onChatStart(data.newRoom);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="flex cursor-pointer items-center gap-2 p-2 text-lg">
          <Switch
            checked={isGroup}
            onCheckedChange={() => {
              setIsSaved(isGroup)
              setIsGroup(!isGroup)
            }}
          />
          <span>Créer un groupe de discussion</span>
        </Label>
        {isGroup && (
          <Input
            type="text"
            placeholder="Nom du groupe"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="mt-2 w-full rounded-3xl border p-2 px-4"
          />
        )}
      </div>

      {!!selectedUsers.length && (
        <LoadingButton
          onClick={handleSubmit}
          loading={mutation.isPending || savedMsgsMutation.isPending}
          disabled={
            (!isGroup && selectedUsers.length !== 1) ||
            (isGroup && (!selectedUsers.length || !groupName))
          }
          className="w-full rounded-lg"
        >
          {isGroup ? "Créer le groupe" : (isSaved ? "Envoyez vous un message" :"Commencer la discussion")}
        </LoadingButton>
      )}
      <div>
        <form
          className="relative"
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setQuery(inputValue);
          }}
        >
          <Input
            placeholder="Rechercher des utilisateurs"
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
          <p className="my-8 w-full text-center text-destructive">
            Erreur lors de la récupération des données
          </p>
        )}
        {status === "pending" && !!query && (
          <p className="text-weak my-8 w-full text-center">
            Chargement en cours...
          </p>
        )}
        {status === "success" && !users.length && !hasNextPage && (
          <div className="flex h-full items-center">
            <p className="w-full select-none px-3 py-10 text-center italic text-muted-foreground">
              Aucun utilisateur disponible
            </p>
          </div>
        )}
        {status !== "success" && !query && (
          <div className="flex h-full items-center">
            <p className="w-full select-none px-3 py-10 text-center text-muted-foreground">
              Rechercher des utilisateurs...
            </p>
          </div>
        )}
        {status === "success" &&
          (isSaved ? (users.map((user) => {
            if (user.id === loggedinUser.id) {
              return (
                <div
                  key={user.id}
                  className={`cursor-pointer rounded-2xl p-2 ${
                    selectedUsers.some((u) => u.id === user.id)
                      ? "bg-accent"
                      : "bg-card shadow-sm hover:bg-accent"
                  }`}
                  onClick={() => handleUserSelect(user)}
                >
                  <div className="flex items-center space-x-2">
                    <UserAvatar userId={user.id} avatarUrl={user.avatarUrl} size={32} />
                    <div>
                      <p>
                        {user.displayName}
                        {user.id === loggedinUser.id && ` (${t().you})`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        @{user.username}
                      </p>
                    </div>
                  </div>
                </div>
              );
            }
          })) : (users.map((user) => {
            if (isGroup) {
              return (
                user.id !== loggedinUser.id && (
                  <div
                    key={user.id}
                    className={`cursor-pointer rounded-2xl p-2 ${
                      selectedUsers.some((u) => u.id === user.id)
                        ? "bg-accent"
                        : "bg-card shadow-sm hover:bg-accent"
                    }`}
                    onClick={() => handleUserSelect(user)}
                  >
                    <div className="flex items-center space-x-2">
                      <UserAvatar userId={user.id} avatarUrl={user.avatarUrl} size={32} />
                      <div>
                        <p>{user.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          @{user.username}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              );
            }
            return (
              <div
                key={user.id}
                className={`cursor-pointer rounded-2xl p-2 ${
                  selectedUsers.some((u) => u.id === user.id)
                    ? "bg-accent"
                    : "bg-card shadow-sm hover:bg-accent"
                }`}
                onClick={() => handleUserSelect(user)}
              >
                <div className="flex items-center space-x-2">
                  <UserAvatar userId={user.id} avatarUrl={user.avatarUrl} size={32} />
                  <div>
                    <p>
                      {user.displayName}
                      {user.id === loggedinUser.id && ` (${t().you})`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{user.username}
                    </p>
                  </div>
                </div>
              </div>
            );
          })))}
        {isFetchingNextPage && (
          <Loader2 className="mx-auto my-3 animate-spin" />
        )}
        {!isFetchingNextPage && hasNextPage && (
          <span
            className="cursor-pointer text-primary hover:underline"
            onClick={() => fetchNextPage()}
          >
            afficher plus
          </span>
        )}
      </div>
    </div>
  );
}
