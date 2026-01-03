import { useToast } from "@/components/ui/use-toast";
import {
  UpdateGroupChatProfileValues,
  UpdateUserProfileValues,
} from "@/lib/validation";
import {
  InfiniteData,
  QueryFilters,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  deleteGroupChatAvatar,
  deleteUserAvatar,
  updateGroupChatProfile,
  updateUserProfile,
} from "./actions";
import {
  RoomData,
  RoomsSection,
  LocalUpload,
  PostsPage,
} from "@/lib/types";
import { useUploadThing } from "@/lib/uploadthing";
import kyInstance from "@/lib/ky";
import { useSession } from "../../SessionProvider";
import { t } from "@/context/LanguageContext";
import { useProgress } from "@/context/ProgressContext";

async function uploadAvatar(file: File): Promise<LocalUpload[] | null> {
  return new Promise<LocalUpload[] | null>(async (resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
  
      const response = await kyInstance.post('/api/upload/avatar', {
          body: formData,
          throwHttpErrors: false,
      }).json<LocalUpload[] | null>();
  
      if (!response?.[0]?.serverData?.avatarUrl) {
          resolve(null)
      }
      
      return resolve(response);
      
  })
}
async function uploadGroupAvatar({
  file,
  roomId,
}: {
  file: File;
  roomId: string;
}): Promise<LocalUpload[] | null> {
  return new Promise<LocalUpload[] | null>(async (resolve) => {
    const formData: FormData = new FormData();
    formData.append("avatar", file);
    formData.append("id", roomId);

    const response = await kyInstance
      .post("/api/upload/group-chat-avatar", {
        body: formData,
        throwHttpErrors: false,
      })
      .json<LocalUpload[] | null>();

    if (!response?.[0]?.serverData?.avatarUrl) {
      resolve(null);
    }

    return resolve(response);
  });
}

export function useUpdateProfileMutation() {
  const { toast } = useToast();
  const { startNavigation: navigate } = useProgress();
  const queryClient = useQueryClient();
  const { startUpload: startAvatarUpload } =
    useUploadThing("avatar");

  const { profileUpdated, profileUpdateError } = t([
    "profileUpdated",
    "profileUpdateError",
  ]);

  async function upload(file: File) {
    // const uploadResult = null;
    const uploadResult = await uploadAvatar(file);

    if (!uploadResult?.[0]) {
      const utUpload = startAvatarUpload([file]);
      return utUpload;
    }
    return uploadResult;
  }

  const mutation = useMutation({
    mutationFn: async ({
      values,
      avatar,
    }: {
      values: UpdateUserProfileValues;
      avatar?: File;
    }) => {
      return Promise.all([
        updateUserProfile(values),
        avatar ? upload(avatar) : Promise.resolve(undefined),
      ]);
    },
    onSuccess: async ([ updatedUser, uploadResult ]) => {
      const newAvatarUrl = uploadResult?.[0]?.serverData.avatarUrl as string | null;

      const queryFilter: QueryFilters = {
        queryKey: ["post-feed"],
      };

      await queryClient.cancelQueries(queryFilter);

      queryClient.setQueriesData<InfiniteData<PostsPage, string | null>>(
        queryFilter,
        (oldData) => {
          if (!oldData) return;
          return {
            pageParams: oldData.pageParams,
            pages: oldData.pages.map((page) => ({
              nextCursor: page.nextCursor,
              posts: page.posts.map((post) => {
                if (post.user.id === updatedUser.id) {
                  return {
                    ...post,
                    user: {
                      ...updatedUser,
                      avatarUrl: newAvatarUrl,
                    },
                  };
                }
                return post;
              }),
            })),
          };
        },
      );
      navigate();

      toast({
        description: profileUpdated,
      });
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        description: profileUpdateError,
      });
    },
  });

  return mutation;
}

export function useDeleteAvatarMutation() {
  const { toast } = useToast();

  const { profilePicDeleted, profilePicDeleteError } = t(
    ["profilePicDeleted", "profilePicDeleteError"],
  );

  const { startNavigation: navigate } = useProgress();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: deleteUserAvatar,
    onSuccess: async (updatedUser) => {
      const queryFilter: QueryFilters = {
        queryKey: ["post-feed"],
      };

      await queryClient.cancelQueries(queryFilter);

      queryClient.setQueriesData<InfiniteData<PostsPage, string | null>>(
        queryFilter,
        (oldData) => {
          if (!oldData) return;
          return {
            pageParams: oldData.pageParams,
            pages: oldData.pages.map((page) => ({
              nextCursor: page.nextCursor,
              posts: page.posts.map((post) => {
                if (post.user.id === updatedUser?.id) {
                  return {
                    ...post,
                    user: {
                      ...updatedUser,
                      avatarUrl: null,
                    },
                  };
                }
                return post;
              }),
            })),
          };
        },
      );
      navigate();

      toast({
        description: profilePicDeleted,
      });
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        description: profilePicDeleteError,
      });
    },
  });

  return mutation;
}

export function useUpdateGroupChatMutation({
  roomId,
}: {
  roomId: string;
}) {
  const { toast } = useToast();

  const { startUpload: startAvatarUpload } =
    useUploadThing("group-chat-avatar");
  const { user } = useSession();

  const { groupUpdated, groupUpdateError } = t(
    ["groupUpdated", "groupUpdateError"],
  );

  const { startNavigation: navigate } = useProgress();
  const queryClient = useQueryClient();

  async function upload(file: File) {
    // const uploadResult = null;
    const uploadResult = await uploadGroupAvatar({ file, roomId });

    if (!uploadResult?.[0]) {
      const utUpload = startAvatarUpload([file], { roomId });
      return utUpload;
    }
    return uploadResult;
  }

  const mutation = useMutation({
    mutationFn: async ({
      values,
      avatar,
    }: {
      values: UpdateGroupChatProfileValues;
      avatar?: File;
    }) => {
      return Promise.all([
        updateGroupChatProfile(values),
        avatar ? upload(avatar) : Promise.resolve(undefined),
      ]);
    },
    onSuccess: async ([updatedGroup, uploadResult]) => {
      const newAvatarUrl = uploadResult?.[0]?.serverData.avatarUrl;

      const queryFilter: QueryFilters = {
        queryKey: ["chat", updatedGroup.id],
      };

      const chatListQueryFilter: QueryFilters = {
        queryKey: ["chat-rooms", user.id],
      };

      await queryClient.cancelQueries(chatListQueryFilter);
      queryClient.setQueriesData<InfiniteData<RoomsSection, string | null>>(
        chatListQueryFilter,
        (oldData) => {
          if (!oldData) return;
          return {
            pageParams: oldData.pageParams,
            pages: oldData.pages.map((page) => ({
              nextCursor: page.nextCursor,
              rooms: page.rooms.map((room) => {
                if (room.id === updatedGroup?.id) {
                  return {
                    ...room,
                    name: updatedGroup.name,
                    description: updatedGroup.description,
                    groupAvatarUrl: newAvatarUrl || null,
                  };
                }
                return room;
              }),
            })),
          };
        },
      );
      await queryClient.cancelQueries(queryFilter);

      queryClient.setQueriesData<RoomData>(queryFilter, (oldData) => {
        if (!oldData) return;
        return {
          ...oldData,
          name: updatedGroup.name,
          description: updatedGroup.description,
          groupAvatarUrl: updatedGroup.groupAvatarUrl,
        };
      });
      navigate();

      toast({
        description: groupUpdated,
      });
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        description: groupUpdateError,
      });
    },
  });

  return mutation;
}
export function useDeleteGroupChatAvatarMutation() {
  const { toast } = useToast();
  const { user } = useSession();
  const { groupIconDeleted, groupIconDeleteError } = t([
    "groupIconDeleted",
    "groupIconDeleteError",
  ]);

  const { startNavigation: navigate } = useProgress();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: deleteGroupChatAvatar,
    onSuccess: async (updatedGroup) => {
      const queryFilter: QueryFilters = {
        queryKey: ["chat", updatedGroup?.id],
      };

      const chatListQueryFilter: QueryFilters = {
        queryKey: ["chat-rooms", user.id],
      };

      await queryClient.cancelQueries(chatListQueryFilter);
      queryClient.setQueriesData<InfiniteData<RoomsSection, string | null>>(
        chatListQueryFilter,
        (oldData) => {
          if (!oldData) return;
          return {
            pageParams: oldData.pageParams,
            pages: oldData.pages.map((page) => ({
              nextCursor: page.nextCursor,
              rooms: page.rooms.map((room) => {
                if (room.id === updatedGroup?.id) {
                  return {
                    ...room,
                    groupAvatarUrl: null,
                  };
                }
                return room;
              }),
            })),
          };
        },
      );
      await queryClient.cancelQueries(queryFilter);

      queryClient.setQueriesData<RoomData>(queryFilter, (oldData) => {
        if (!oldData) return;
        return {
          ...oldData,
          groupAvatarUrl: null,
        };
      });
      navigate();

      toast({
        description: groupIconDeleted,
      });
    },
    onError: (error) => {
      console.error(error);
      toast({
        variant: "destructive",
        description: groupIconDeleteError,
      });
    },
  });

  return mutation;
}
