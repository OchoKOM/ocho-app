"use client";

import { CommentsPage, PostData } from "@/lib/types";
import CommentInput from "./CommentInput";
import { useInfiniteQuery } from "@tanstack/react-query";
import kyInstance from "@/lib/ky";
import CommentsLoadingSkeleton from "./CommentsLoadingSkeleton";
import Comment from "./Comment";
import { Button } from "../ui/button";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "../ui/use-toast";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Draggable from "../Draggable";
import { t } from "@/context/LanguageContext";
import { useProgress } from "@/context/ProgressContext";

interface CommentsProps {
  post: PostData;
  onClose: () => void;
}

export default function Comments({ post, onClose }: CommentsProps) {
  const [targetComment, setTargetComment] = useState<string | null>(null);
  const [isDraggable, setIsDraggable] = useState(false);
  const {startNavigation: navigate} = useProgress();
  const router = useRouter();

  const {
    showPreviousComments,
    noComments,
    noLongerAvailablecomment,
    dataError,
    comments: commentsText,
    comment: commentText,
  } = t(
    [  "showPreviousComments", "noComments", "noLongerAvailablecomment", "dataError", "comments", "comment"]
  );

  const searchParams = useSearchParams();
  const comment = searchParams.get("comment");

  const { toast } = useToast();
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ["comments", post.id],
    queryFn: ({ pageParam }) =>
      kyInstance
        .get(`/api/posts/${post.id}/comments`, {
          searchParams: new URLSearchParams({
            cursor: pageParam ? String(pageParam) : "",
            comment: targetComment ? String(targetComment) : "",
          }),
        })
        .json<CommentsPage>(),
    initialPageParam: null as string | null,
    getNextPageParam: (firstPage) => firstPage.previousCursor,
  });

  useEffect(() => {
    const handleResize = () => {
      setIsDraggable(window.innerWidth < 640); // Active draggable si largeur < 640px
    };

    handleResize(); // Vérifie la taille initiale
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let previousWidth = window?.innerWidth || 0;

    const handleResize = () => {
      const currentWidth = window?.innerWidth || 0;
      if (currentWidth !== previousWidth) {
        previousWidth = currentWidth;
        onClose(); // Appelle la fonction uniquement pour les redimensionnements horizontaux
      }
    };

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const comments = data?.pages.flatMap((page) => page.comments) || [];

  useEffect(() => {
    if (
      status === "success" &&
      comment &&
      !comments.find((c) => c.id === comment)
    ) {
      toast({
        variant: "destructive",
        description: noLongerAvailablecomment,
      });
      navigate(`/posts/${post.id}`);
      onClose();
    }
    if (
      status === "success" &&
      comment &&
      comments.find((c) => c.id === comment)
    ) {
      setTargetComment(comment);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, comment, data, comments]);

  return (
    <Draggable
      draggable={isDraggable}
      direction="down"
      className="group/comments bottom-0 left-0 z-20 w-full max-sm:fixed max-sm:rounded-e-sm"
      contentClassName="max-sm:bg-background max-sm:pt-2 sm:space-y-3 max-sm:rounded-s-sm max-sm:flex max-sm:flex-col-reverse"
      onDrag={(number) => {
        if (number > 200) {
          onClose();
        }
      }}
    >
      <CommentInput post={post} />
      {isFetchingNextPage && (
        <Loader2 className="mx-auto my-3 animate-spin sm:hidden" />
      )}
      {hasNextPage && !isFetchingNextPage && status === "success" && (
        <Button
          variant="link"
          className="mx-auto block sm:hidden"
          disabled={isFetching}
          onClick={() => fetchNextPage()}
        >
          {showPreviousComments}
        </Button>
      )}
      {status === "pending" && <CommentsLoadingSkeleton />}
      {status === "success" && !comments.length && !hasNextPage && (
        <p className="w-full py-4 text-center text-muted-foreground max-sm:flex max-sm:h-[50vh] max-sm:items-center max-sm:justify-center">
          {noComments}
        </p>
      )}
      {status === "error" && (
        <p className="w-full py-4 text-center text-muted-foreground max-sm:flex max-sm:h-[50vh] max-sm:items-center max-sm:justify-center">
          {dataError}
        </p>
      )}
      <div
        className={cn(
          "divide-y-2",
          (status === "pending" ||
            (status === "success" && !comments.length && !hasNextPage) ||
            status === "error") &&
            "hidden",
        )}
      >
        <div className="relative top-0 flex w-full items-center justify-between px-3 py-2 font-bold sm:hidden">
          {status === "success" && !!comments.length && (
            <p>{`${comments.length} ${comments.length > 1 ? commentsText : commentText}`}</p>
          )}
          <div className="" onClick={onClose}>
            <X />
          </div>
        </div>
        <div
          className="space-y-1 overflow-y-auto py-1 max-sm:h-[70vh] max-sm:bg-card/50"
          style={{ overflowAnchor: "auto" }}
        >
          {comments.map((comment) => (
            <Comment
              key={comment.id}
              comment={comment}
              isTarget={!!targetComment?.trim() && comment.id === targetComment}
            />
          ))}
        </div>
        {isFetchingNextPage && (
          <Loader2 className="mx-auto my-3 animate-spin max-sm:hidden" />
        )}
        {hasNextPage && !isFetchingNextPage && status === "success" && (
          <Button
            variant="link"
            className="mx-auto block max-sm:hidden"
            disabled={isFetching}
            onClick={() => fetchNextPage()}
          >
            {showPreviousComments}
          </Button>
        )}
      </div>
    </Draggable>
  );
}
