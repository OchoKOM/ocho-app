import { useState, useEffect } from "react";
import { useSession } from "../SessionProvider";
import { t } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { PrivacyValue, PrivacyType } from "@/lib/types";

export default function MessagePrivacyDialog() {
  const { user } = useSession();
  const [selectedValue, setSelectedValue] = useState<PrivacyValue>("EVERYONE");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const lang = t([
    "messagePrivacy",
    "public",
    "private",
    "followers",
    "everyone",
    "noOne",
    "save",
    "somethingWentWrong"
  ]);

  const options: { value: PrivacyValue; label: string }[] = [
    { value: "PUBLIC", label: lang.public },
    { value: "FOLLOWERS", label: lang.followers },
    { value: "PRIVATE", label: lang.private },
    { value: "EVERYONE", label: lang.everyone },
    { value: "NO_ONE", label: lang.noOne },
  ];

  useEffect(() => {
    const fetchCurrentSetting = async () => {
      try {
        const response = await fetch('/api/privacy');
        if (response.ok) {
          const settings = await response.json();
          const currentValue = settings.MESSAGE_PRIVACY as PrivacyValue;
          if (currentValue) {
            setSelectedValue(currentValue);
          }
        }
      } catch (err) {
        console.error('Error fetching privacy settings:', err);
      } finally {
        setIsFetching(false);
      }
    };

    fetchCurrentSetting();
  }, []);

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/privacy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: "MESSAGE_PRIVACY" as PrivacyType,
          value: selectedValue
        }),
      });

      if (response.ok) {
        setSuccess(true);
      } else {
        const data = await response.json();
        setError(data.error || lang.somethingWentWrong);
      }
    } catch (err) {
      setError(lang.somethingWentWrong);
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div className="flex flex-col items-center gap-5">
        <h4 className="text-center text-xl">{lang.messagePrivacy}</h4>
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <h4 className="text-center text-xl">{lang.messagePrivacy}</h4>

      <div className="flex flex-col gap-3 w-full">
        {options.map((option) => (
          <Button
            key={option.value}
            variant={selectedValue === option.value ? "default" : "outline"}
            onClick={() => setSelectedValue(option.value)}
            className="justify-start"
            disabled={isLoading}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>Privacy setting updated successfully</AlertDescription>
        </Alert>
      )}

      <Button onClick={handleSave} disabled={isLoading} className="w-full">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        {lang.save}
      </Button>
    </div>
  );
}
