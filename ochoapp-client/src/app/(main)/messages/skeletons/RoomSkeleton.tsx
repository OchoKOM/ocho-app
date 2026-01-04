"use client"

import { Skeleton } from "@/components/ui/skeleton";

export default function RoomsLoadingSkeleton() {
  return (
    <ul className="relative w-full animate-pulse">
      <RoomSkeleton />
      <RoomSkeleton />
      <RoomSkeleton />
      <RoomSkeleton />
      <RoomSkeleton />
      <RoomSkeleton />
      <RoomSkeleton />
      <RoomSkeleton />
    </ul>
  );
}

export function RoomSkeleton() {
  return (
    <li className="w-full p-2">
      <div className="flex w-full items-center space-x-2">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="relative flex-1 space-y-1">
          <Skeleton className="h-4 w-[80%] max-w-32 rounded" />
          <Skeleton className="h-3 w-[60%] max-w-40 rounded" />
        </div>
      </div>
    </li>
  );
}
