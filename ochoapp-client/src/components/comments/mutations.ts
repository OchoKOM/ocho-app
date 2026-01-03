import {
  InfiniteData,
  QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useToast } from "../ui/use-toast";
import { deleteComment, submitComment, submitReply } from "./action";
import { CommentsPage, RepliesPage } from "@/lib/types";
import { redirect, usePathname, useRouter } from "next/navigation";
import { t } from "@/context/LanguageContext";
import { useProgress } from "@/context/ProgressContext";

export function useSubmitCommentMutation(postId: string) {
  const { toast } = useToast();
  const { commentSent, unaBleToSendComment } = t([
    "commentSent", "unaBleToSendComment"
  ]);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: submitComment,
    onSuccess: async (newComment) => {
      const queryKey: QueryKey = ["comments", postId];

      await queryClient.cancelQueries({ queryKey });

      queryClient.setQueryData<InfiniteData<CommentsPage, string | null>>(
        queryKey,
        (oldData) => {
          const firstPage = oldData?.pages[0];

          if (firstPage) {
            return {
              pageParams: oldData.pageParams,
              pages: [
                {
                  previousCursor: firstPage.previousCursor,
                  comments: [newComment, ...firstPage.comments],
                },
                ...oldData.pages.slice(1),
              ],
            };
          }
        },
      );

      queryClient.invalidateQueries({
        queryKey,
        predicate(query) {
          return !query.state.data;
        },
      });

      toast({
        description: commentSent,
      });
    },
    onError(error) {
      console.error(error);
      toast({
        variant: "destructive",
        description: unaBleToSendComment,
      });
    },
  });

  return mutation;
}

export function useSubmitReplyMutation(commentId: string, firstLevelCommentId: string) {
  const { toast } = useToast();
  const { commentSent, unaBleToSendComment } = t([
    "commentSent", "unaBleToSendComment"]);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: submitReply,
    onSuccess: async (newComment) => {
      const queryKey: QueryKey = ["replies", firstLevelCommentId];

      await queryClient.cancelQueries({ queryKey });

      queryClient.setQueryData<InfiniteData<RepliesPage, string | null>>(
        queryKey,
        (oldData) => {
          const firstPage = oldData?.pages[0];

          if (firstPage) {
            return {
              pageParams: oldData.pageParams,
              pages: [
                {
                  previousCursor: firstPage.previousCursor,
                  replies: [newComment, ...firstPage.replies],
                },
                ...oldData.pages.slice(1),
              ],
            };
          }
        },
      );

      queryClient.invalidateQueries({
        queryKey,
        predicate(query) {
          return !query.state.data;
        },
      });

      toast({
        description: commentSent,
      });
    },
    onError(error) {
      console.error(error);
      toast({
        variant: "destructive",
        description: unaBleToSendComment,
      });
    },
  });

  return mutation;
}

export function useDeleteCommentMutation() {
  const { toast } = useToast();
  const { commentDeleted, unableToDeleteComment } = t([
    "commentDeleted", "unableToDeleteComment"]);
  const pathname = usePathname();
  const { startNavigation: navigate } = useProgress();

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: deleteComment,
    onSuccess: async (deletedComment) => {
      const queryKey: QueryKey = ["comments", deletedComment.postId];

      await queryClient.cancelQueries({ queryKey });

      queryClient.setQueryData<InfiniteData<CommentsPage, string | null>>(
        queryKey,
        (oldData) => {
          if (oldData) {
            return {
              pageParams: oldData.pageParams,
              pages: oldData.pages.map((page) => ({
                previousCursor: page.previousCursor,
                comments: page.comments.filter(
                  (c) => c.id !== deletedComment.id,
                ),
              })),
            };
          }
        },
      );
      toast({
        description: commentDeleted,
      });
    },
    onError(error) {
      console.error(error);
      toast({
        variant: "destructive",
        description: unableToDeleteComment,
      });
    },
  });

  return mutation;
}
export function useDeleteReplyMutation() {
  const { toast } = useToast();
  const { commentDeleted, unableToDeleteComment } = t([
    "commentDeleted", "unableToDeleteComment"]);
  const pathname = usePathname();
  const { startNavigation: navigate } = useProgress();

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: deleteComment,
    onSuccess: async (deletedComment) => {
      const queryKey: QueryKey = ["replies", deletedComment.firstLevelCommentId];

      await queryClient.cancelQueries({ queryKey });

      queryClient.setQueryData<InfiniteData<RepliesPage, string | null>>(
        queryKey,
        (oldData) => {
          if (oldData) {
            return {
              pageParams: oldData.pageParams,
              pages: oldData.pages.map((page) => ({
                previousCursor: page.previousCursor,
                replies: page.replies.filter(
                  (c) => c.id !== deletedComment.id,
                ),
              })),
            };
          }
        },
      );
      toast({
        description: commentDeleted,
      });
    },
    onError(error) {
      console.error(error);
      toast({
        variant: "destructive",
        description: unableToDeleteComment,
      });
    },
  });

  return mutation;
}
