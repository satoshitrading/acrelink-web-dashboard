import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { get, ref, update } from "firebase/database";
import { ArrowLeft, Loader2 } from "lucide-react";
import { auth, database } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { normalizeToE164 } from "@/lib/phoneE164";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardProvider } from "@/contexts/dashboard";
import { DashboardNav } from "@/components/dashboard/DashboardNav";

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState("");
  const [optIn, setOptIn] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const user = auth.currentUser;
      if (!user) {
        navigate("/auth");
        return;
      }

      try {
        const snap = await get(ref(database, `users/${user.uid}`));
        if (snap.exists()) {
          const data = snap.val() as Record<string, unknown>;
          setPhone(typeof data.phone === "string" ? data.phone : "");
          setOptIn(data.smsOptIn === true);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Could not load account settings.";
        toast({ title: "Error", description: msg, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate, toast]);

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) {
      navigate("/auth");
      return;
    }

    if (!optIn) {
      setSaving(true);
      try {
        await update(ref(database, `users/${user.uid}`), {
          smsOptIn: false,
          phoneUpdatedAt: new Date().toISOString(),
        });
        toast({
          title: "Settings saved",
          description: "SMS alerts are turned off for your account.",
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Could not save settings.";
        toast({ title: "Error", description: msg, variant: "destructive" });
      } finally {
        setSaving(false);
      }
      return;
    }

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

    setSaving(true);
    try {
      await update(ref(database, `users/${user.uid}`), {
        phone: normalized,
        smsOptIn: true,
        phoneUpdatedAt: new Date().toISOString(),
      });
      setPhone(normalized);
      localStorage.setItem("acrelinkSmsPromptDismissed", "1");
      toast({
        title: "Settings saved",
        description: "Your SMS alert preferences were updated.",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save settings.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardProvider>
      <div className="min-h-screen gradient-hero">
        <DashboardNav />
        <div className="px-6 py-8">
          <div className="mx-auto w-full max-w-3xl">
            <Button variant="ghost" className="mb-4" onClick={() => navigate("/")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>

            <Card className="border-2 border-border/50 shadow-industrial">
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
                <CardDescription>
                  Manage your phone number and SMS alert consent used for toll-free messaging compliance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {loading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading settings...
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="settings-phone">Mobile number</Label>
                      <Input
                        id="settings-phone"
                        type="tel"
                        autoComplete="tel"
                        placeholder="+1 555 123 4567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={saving}
                      />
                    </div>
                    <div className="flex items-start space-x-2">
                      <Checkbox
                        id="settings-opt-in"
                        checked={optIn}
                        onCheckedChange={(checked) => setOptIn(checked === true)}
                        disabled={saving}
                      />
                      <Label htmlFor="settings-opt-in" className="cursor-pointer text-sm font-normal leading-relaxed">
                        I agree to receive SMS alerts about moisture issues at the number above.
                      </Label>
                    </div>
                    <div className="flex justify-end">
                      <Button type="button" onClick={handleSave} disabled={saving}>
                        {saving ? "Saving..." : "Save Settings"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardProvider>
  );
};

export default Settings;
