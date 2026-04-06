import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ref, update } from "firebase/database";
import { database, auth } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { normalizeToE164 } from "@/lib/phoneE164";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SmsOptInModal({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [optIn, setOptIn] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSkip = () => {
    localStorage.setItem("acrelinkSmsPromptDismissed", "1");
    onOpenChange(false);
  };

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const normalized = normalizeToE164(phone);
    if (!normalized) {
      toast({
        title: "Invalid phone number",
        description:
          "Enter a valid mobile number (e.g. 5551234567, 15551234567, or +15551234567).",
        variant: "destructive",
      });
      return;
    }
    if (!optIn) {
      toast({
        title: "SMS opt-in required",
        description: "Check the box to receive SMS alerts, or choose Skip.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await update(ref(database, `users/${user.uid}`), {
        phone: normalized,
        smsOptIn: true,
        phoneUpdatedAt: new Date().toISOString(),
      });
      localStorage.setItem("acrelinkSmsPromptDismissed", "1");
      toast({
        title: "Phone saved",
        description: "You may receive moisture alerts by SMS when thresholds are crossed.",
      });
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save phone.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>SMS alerts (optional)</DialogTitle>
          <DialogDescription>
            Add a mobile number to receive text alerts when soil moisture drops
            below your thresholds. You can change this anytime in account
            settings later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="sms-phone">Mobile number</Label>
            <Input
              id="sms-phone"
              type="tel"
              autoComplete="tel"
              placeholder="+1 555 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="sms-opt-in"
              checked={optIn}
              onCheckedChange={(c) => setOptIn(c === true)}
            />
            <Label htmlFor="sms-opt-in" className="text-sm font-normal cursor-pointer">
              Send me SMS alerts for moisture issues
            </Label>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={handleSkip} disabled={saving}>
            Skip for now
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
