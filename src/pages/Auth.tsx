import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "firebase/auth";

import { ref, get, set } from "firebase/database";
import { auth, database } from "@/lib/firebase";

const authSchema = z.object({
  email: z.string().trim().email({ message: "Invalid email address" }).max(255),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  fullName: z.string().trim().min(2, { message: "Full name is required" }).max(100).optional(),
  siteId: z.string().trim().min(3, { message: "Site ID must be at least 3 characters" }).max(50).optional(),
});

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [siteId, setSiteId] = useState("");

  const navigate = useNavigate();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validatedData = authSchema.parse({
        email,
        password,
        fullName: isLogin ? undefined : fullName,
        siteId: isLogin ? undefined : siteId,
      });

      // =======================
      // 🔐 LOGIN
      // =======================
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(
          auth,
          validatedData.email,
          validatedData.password
        );

        const uid = userCredential.user.uid;

        // Fetch user profile from Realtime DB
        const snapshot = await get(ref(database, `users/${uid}`));

        if (!snapshot.exists()) {
          toast({
            title: "Access denied",
            description: "User profile not found.",
            variant: "destructive",
          });
          return;
        }

        const userProfile = snapshot.val();
        const userSiteId = userProfile.siteId;

        toast({
          title: "Success",
          description: "Logged in successfully!",
        });

        // Navigate to dashboard - modal will show there if gateway names not set
        navigate("/");
      }

      // =======================
      // 📝 SIGNUP
      // =======================
      else {
        // Validate that siteId is provided
        if (!siteId || siteId.trim().length < 3) {
          toast({
            title: "Validation Error",
            description: "Site ID must be at least 3 characters",
            variant: "destructive",
          });
          return;
        }

        if (!fullName || fullName.trim().length < 2) {
          toast({
            title: "Validation Error",
            description: "Full name is required",
            variant: "destructive",
          });
          return;
        }

        const trimmedSiteId = siteId.trim();

        // ✅ Check if siteId exists in sensor-readings table
        const sensorReadingsSnapshot = await get(ref(database, `sensor-readings/siteId:${trimmedSiteId}`));
        
        if (!sensorReadingsSnapshot.exists()) {
          toast({
            title: "Invalid Site ID",
            description: `Site ID "${trimmedSiteId}" not found in our system. Please check and try again.`,
            variant: "destructive",
          });
          return;
        }

        // ✅ Check if siteId is already assigned to another user
        const usersSnapshot = await get(ref(database, `users`));
        
        if (usersSnapshot.exists()) {
          const usersData = usersSnapshot.val();
          const siteIdExists = Object.values(usersData).some(
            (user: any) => user.siteId === trimmedSiteId
          );

          if (siteIdExists) {
            toast({
              title: "Site Already Registered",
              description: `Site ID "${trimmedSiteId}" is already registered to another user.`,
              variant: "destructive",
            });
            return;
          }
        }

        // ✅ All validations passed - create user account
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          validatedData.email,
          validatedData.password
        );

        const uid = userCredential.user.uid;

        // Create user profile in DB
        await set(ref(database, `users/${uid}`), {
          uid: uid,
          email: validatedData.email,
          fullName: fullName.trim(),
          role: "customer",
          siteId: trimmedSiteId,
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
        });

        toast({
          title: "Success",
          description: "Account created successfully! Please login.",
        });

        setIsLogin(true);
        setEmail("");
        setPassword("");
        setFullName("");
        setSiteId("");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // =======================
  // 🔄 FORGOT PASSWORD
  // =======================
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate email
      const emailSchema = z.string().email({ message: "Invalid email address" });
      const validatedEmail = emailSchema.parse(email.trim());

      // Send password reset email
      await sendPasswordResetEmail(auth, validatedEmail);

      toast({
        title: "Email Sent!",
        description: "Check your inbox for password reset instructions.",
      });

      // Reset form and go back to login
      setEmail("");
      setIsForgotPassword(false);
      setIsLogin(true);
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
          description: error.message || "Failed to send reset email",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // =======================
  // 📧 FORGOT PASSWORD VIEW
  // =======================
  if (isForgotPassword) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md shadow-industrial-lg border-2 border-border/50">
          <CardHeader className="space-y-3 pb-6">
            <CardTitle className="text-3xl font-display font-bold text-center">
              Reset Password
            </CardTitle>
            <CardDescription className="text-center text-base">
              Enter your email to receive password reset instructions
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={255}
                  className="border-2 focus:border-primary h-11"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold shadow-industrial hover-glow mt-6"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <Button
                variant="link"
                className="p-0 h-auto font-semibold text-primary"
                onClick={() => {
                  setIsForgotPassword(false);
                  setEmail("");
                }}
              >
                ← Back to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // =======================
  // 🔐 LOGIN / SIGNUP VIEW
  // =======================
  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md shadow-industrial-lg border-2 border-border/50">
        <CardHeader className="space-y-3 pb-6">
          <CardTitle className="text-3xl font-display font-bold text-center">
            {isLogin ? "Welcome Back" : "Create Account"}
          </CardTitle>
          <CardDescription className="text-center text-base">
            {isLogin
              ? "Enter your credentials to access your dashboard"
              : "Join AcreLink to start monitoring your fields"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleAuth} className="space-y-5">
            {!isLogin && (
              <>
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-semibold">
                  Full Name
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={100}
                  className="border-2 focus:border-primary h-11"
                />
              </div>
               <div className="space-y-2">
                <Label htmlFor="siteId" className="text-sm font-semibold">
                  Site ID 
                </Label>
                <Input
                  id="siteId"
                  type="text"
                  placeholder="e.g., acrelink-farm-001"
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  required={!isLogin}
                  maxLength={50}
                  className="border-2 focus:border-primary h-11"
                />
                <p className="text-xs text-muted-foreground">
                  Provided at installation
                </p>
              </div>
              </>
              
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
                className="border-2 focus:border-primary h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="border-2 focus:border-primary h-11"
              />
            </div>

            {isLogin && (
              <div className="text-right -mt-2">
                <Button
                  type="button"
                  variant="link"
                  className="p-0 h-auto text-sm font-medium text-primary"
                  onClick={() => {
                    setIsForgotPassword(true);
                    setPassword("");
                  }}
                >
                  Forgot password?
                </Button>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold shadow-industrial hover-glow mt-6"
              disabled={loading}
            >
              {loading
                ? "Please wait..."
                : isLogin
                ? "Login to Dashboard"
                : "Create Account"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">
              {isLogin
                ? "Don't have an account? "
                : "Already have an account? "}
            </span>

            <Button
              variant="link"
              className="p-0 h-auto font-semibold text-primary"
              onClick={() => {
                setIsLogin(!isLogin);
                setEmail("");
                setPassword("");
                setFullName("");
                setSiteId("");
              }}
            >
              {isLogin ? "Sign Up" : "Login"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;