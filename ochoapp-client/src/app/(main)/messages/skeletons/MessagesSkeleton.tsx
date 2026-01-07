"use client"

import { Skeleton } from "@/components/ui/skeleton";

interface MessageLoadingSkeletonProps {
  sender: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}

export default function MessagesLoadingSkeleton() {
  return (
    <>
      <MessageLoadingSkeleton sender={false} size="md" />
      <MessageLoadingSkeleton sender={true} size="lg" />
      <MessageLoadingSkeleton sender={false} size="sm" />
      <MessageLoadingSkeleton sender={false} size="lg" />
      <MessageLoadingSkeleton sender={false} size="xl" />
    </>
  );
}

function MessageLoadingSkeleton({
  sender,
  size = "md",
}: MessageLoadingSkeletonProps) {
  const sizes = {
    sm: "h-8 w-[15%]",
    md: "h-16 w-[25%]",
    lg: "h-18 w-[45%]",
    xl: "h-20 w-[55%]",
  };
  const sizeClass = sizes[size];

  return (
    <div className={`flex items-end w-full gap-2 ${sender ? "flex-row-reverse" : ""}`}>
      {!sender && (
        <span className="py-1">
          <Skeleton className="size-6 rounded-full" />
        </span>
      )}
      <div
        className={"relative w-full" + ` ${sender && "flex flex-row-reverse"}`}
      >
        {!sender && (
          <div className="pb-1 ps-2">
            <Skeleton className="h-[14px] w-14 rounded" />
          </div>
        )}
        <Skeleton
          className={
            "rounded-3xl min-w-20 px-4 py-2" + ` ${sizeClass}`
          }
        ></Skeleton>
      </div>
    </div>
  );
}
