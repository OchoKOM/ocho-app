// "use client"

import { Metadata } from "next";
import Messages from "./Messages";
import SetNavigation from "@/components/SetNavigation";

export const metadata: Metadata = {
  title: "Messages",
};

export default function Page() {
  return (
    <div className="relative max-h-screen h-dvh w-full overflow-hidden">
      <SetNavigation navPage="messages" />
      <Messages />
    </div>
  );
}
