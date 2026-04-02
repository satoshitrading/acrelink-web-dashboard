import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { z } from "zod";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [email, setEmail] = useState("");
  const [validCode, setValidCode] = useState(false);

  const navigate = useNavigate();
  const { toast } = useToast();

  const oobCode = searchParams.get("oobCode");

  // Verify the reset code on page load
  useEffect(() => {
    const verifyCode = async () => {
      if (!oobCode) {
        toast({
          title: "Invalid Link",
          description: "Password reset link is invalid or expired.",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      try {
        // Verify the code and get the email
        const userEmail = await verifyPasswordResetCode(auth, oobCode);
        setEmail(userEmail);
        setValidCode(true);
      } catch (error: any) {
        toast({
          title: "Invalid or Expired Link",
          description: "This password reset link is no longer valid. Please request a new one.",
          variant: "destructive",
        });
        setTimeout(() => navigate("/auth"), 3000);
      } finally {
        setVerifying(false);
      }
    };

    verifyCode();
  }, [oobCode, navigate, toast]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate passwords
      const passwordSchema = z
        .string()
        .min(6, { message: "Password must be at least 6 characters" });

      passwordSchema.parse(newPassword);

      if (newPassword !== confirmPassword) {
        toast({
          title: "Passwords don't match",
          description: "Please make sure both passwords are the same.",
          variant: "destructive",
        });
        return;
      }

      if (!oobCode) {
        throw new Error("Invalid reset code");
      }

      // Reset the password
      await confirmPasswordReset(auth, oobCode, newPassword);

      toast({
        title: "Password Reset Successful!",
        description: "You can now login with your new password.",
      });

      // Redirect to login page after 2 seconds
      setTimeout(() => navigate("/auth"), 2000);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to reset password",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Show loading while verifying
  if (verifying) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md shadow-industrial-lg border-2 border-border/50">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
              <p className="mt-4 text-muted-foreground">Verifying reset link...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show form if code is valid
  if (!validCode) {
    return null;
  }

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md shadow-industrial-lg border-2 border-border/50">
        <CardHeader className="space-y-3 pb-6">
          <CardTitle className="text-3xl font-display font-bold text-center">
            Set New Password
          </CardTitle>
          <CardDescription className="text-center text-base">
            Enter a new password for {email}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-sm font-semibold">
                New Password
              </Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="border-2 focus:border-primary h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-semibold">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="border-2 focus:border-primary h-11"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold shadow-industrial hover-glow mt-6"
              disabled={loading}
            >
              {loading ? "Resetting..." : "Reset Password"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <Button
              variant="link"
              className="p-0 h-auto font-semibold text-primary"
              onClick={() => navigate("/auth")}
            >
              ← Back to Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
