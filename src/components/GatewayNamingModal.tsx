import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useGatewayNames } from "@/hooks/use-gateway-names";

interface GatewayNamingModalProps {
  isOpen: boolean;
  gateways: string[];
  onSave: (gatewayNames: Record<string, string>) => void;
  onSkip: () => void;
}

export function GatewayNamingModal({
  isOpen,
  gateways,
  onSave,
  onSkip,
}: GatewayNamingModalProps) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(isOpen);
  const [validationError, setValidationError] = useState<string>("");
  const { saveGatewayNames } = useGatewayNames();

  // Sync open state with isOpen prop
  useEffect(() => {
    setOpen(isOpen);
  }, [isOpen, gateways]);

  // Initialize with saved names
  useEffect(() => {
    if (gateways.length > 0) {
      const saved = localStorage.getItem("gatewayNames");
      const existingNames = saved ? JSON.parse(saved) : {};
      const initialNames: Record<string, string> = {};
      gateways.forEach((id) => {
        initialNames[id] = existingNames[id] || "";
      });
      setNames(initialNames);
    }
  }, [gateways]);

  const handleNameChange = (gatewayId: string, newName: string) => {
    setNames((prev) => ({
      ...prev,
      [gatewayId]: newName,
    }));
    if (validationError) {
      setValidationError("");
    }
  };

  const handleSave = () => {
    const emptyFields = gateways.filter((id) => !names[id] || names[id].trim() === "");
    
    if (emptyFields.length > 0) {
      setValidationError("Please enter a name for all gateways before saving.");
      return;
    }

    const finalNames: Record<string, string> = {};
    Object.entries(names).forEach(([id, name]) => {
      finalNames[id] = name.trim();
    });
    saveGatewayNames(finalNames);
    setOpen(false);
    onSave(finalNames);
  };

  const handleSkip = () => {
    const defaultNames: Record<string, string> = {};
    gateways.forEach((id) => {
      defaultNames[id] = id;
    });
    saveGatewayNames(defaultNames);
    setOpen(false);
    onSkip();
  };

  if (!open) {
    return <></>;
  }

  return (
    <>
      {/* Overlay backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full overflow-auto border-2 border-border">
          <div className="p-6 border-b-2 border-border/50">
            <h2 className="text-2xl font-bold text-foreground">Name Your Gateways</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Give your gateways custom names to make them easier to identify.
            </p>
          </div>

          <div className="p-6 space-y-4">
            {gateways.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No gateways found. Click "Skip" to continue.</p>
            ) : (
              gateways.map((gatewayId) => (
                <div key={gatewayId} className="border-2 border-border rounded-lg p-4">
                  <label className="text-sm font-semibold text-foreground">
                    <span className="font-mono text-xs">{gatewayId}</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., North Field, Main Pump, etc."
                    value={names[gatewayId] || ""}
                    onChange={(e) => handleNameChange(gatewayId, e.target.value)}
                    className="w-full mt-2 px-3 py-2 border border-border rounded font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              ))
            )}
          </div>

          {validationError && (
            <div className="px-6 pb-4">
              <div className="bg-red-50 border-2 border-red-500 text-red-700 px-4 py-3 rounded flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium">{validationError}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end p-6 border-t-2 border-border/50">
            <button
              onClick={handleSkip}
              className="px-4 py-2 rounded border border-border hover:bg-accent transition-colors"
            >
              Skip for Now
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Save Names
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
