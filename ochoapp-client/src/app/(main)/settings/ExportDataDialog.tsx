import { useState } from "react";
import { t } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, Download } from "lucide-react";

export default function ExportDataDialog() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const lang = t([
    'exportDataTitle',
    'exportDataDescription',
    'exportDataWarning',
    'exportDataSuccess',
    'exportDataError',
    'exportData'
  ]);

  const handleExport = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/users/export', {
        method: 'GET',
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'user-data.json';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setSuccess(true);
      } else {
        const data = await response.json();
        setError(data.error || lang.exportDataError);
      }
    } catch (err) {
      setError(lang.exportDataError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h4 className="text-xl font-semibold mb-2">{lang.exportDataTitle}</h4>
        <p className="text-sm text-muted-foreground">
          {lang.exportDataDescription}
        </p>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {lang.exportDataWarning}
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{lang.exportDataSuccess}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleExport}
        disabled={isLoading}
        className="w-full"
      >
        <Download className="w-4 h-4 mr-2" />
        {isLoading ? t('exporting') : lang.exportData}
      </Button>
    </div>
  );
}
