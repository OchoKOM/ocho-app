"use client";

import { useEffect, useState } from "react";
import GoogleSignInButton from "./GoogleSignInButton";
import GithubSignInButton from "./GithubSignInButton";
import { t } from "@/context/LanguageContext";

export default function Support() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const [isSameOrigin, setIsSameOrigin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { unsupportedEnv } = t(['unsupportedEnv']);

  useEffect(() => {
    setIsLoading(false);
    if (baseUrl) {
      const currentUrl = window.location.origin;
      setIsSameOrigin(currentUrl === baseUrl);
    }
  }, [baseUrl]);

  return (
    <div className="flex w-full flex-col">
      <div className="flex w-full justify-center gap-2">
        <GoogleSignInButton supported={isSameOrigin && !isLoading} />
        <GithubSignInButton supported={isSameOrigin && !isLoading} />
      </div>
      {!isLoading && !isSameOrigin && (
        <span className="text-center text-sm italic text-destructive">
          {unsupportedEnv}
        </span>
      )}
    </div>
  );
}

