import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ref, get, set } from "firebase/database";
import { database } from "@/lib/firebase";
import { sendPasswordResetEmail, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { initializeApp, getApps } from "firebase/app";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Secondary Firebase app — creates new Auth users without signing out the admin
const getSecondaryAuth = () => {
  const name = "secondary-app";
  const existing = getApps().find((a) => a.name === name);
  if (existing) return getAuth(existing);
  const secondaryApp = initializeApp(
    {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    },
    name
  );
  return getAuth(secondaryApp);
};

const Technicians = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTech, setEditingTech] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  // form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [availableSiteIds, setAvailableSiteIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // ─── load data on mount ───────────────────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // load technicians
        const usersSnap = await get(ref(database, "users"));
        if (usersSnap.exists()) {
          const val = usersSnap.val();
          setTechnicians(
            Object.keys(val)
              .filter((k) => val[k]?.role === "technician")
              .map((k) => ({ id: k, ...val[k] }))
          );
        }

        // load available site IDs
        const srSnap = await get(ref(database, "sensor-readings"));
        if (srSnap.exists()) {
          const keys = Object.keys(srSnap.val()).filter((k) => k.startsWith("siteId:"));
          setAvailableSiteIds(keys.map((k) => k.replace("siteId:", "")));
        }
      } catch (err) {
        console.error("Error loading data:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // ─── helpers ──────────────────────────────────────────────────────────────
  const toggleSiteId = (id: string) =>
    setSelectedSiteIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  const refreshList = async () => {
    const snap = await get(ref(database, "users"));
    if (snap.exists()) {
      const val = snap.val();
      setTechnicians(
        Object.keys(val)
          .filter((k) => val[k]?.role === "technician")
          .map((k) => ({ id: k, ...val[k] }))
      );
    }
  };

  const openModal = () => {
    setName("");
    setEmail("");
    setSelectedSiteIds([]);
    setFormError(null);
    setIsAdding(true);
  };

  const openEditModal = (tech: any) => {
    setEditingTech(tech);
    setName(tech.name || "");
    setEmail(tech.email || "");
    setSelectedSiteIds(tech.siteIds || []);
    setFormError(null);
    setIsEditing(true);
  };

  const closeModal = () => {
    setIsAdding(false);
    setIsEditing(false);
    setEditingTech(null);
    setFormError(null);
  };

  // ─── save (add) ────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email.trim())) {
      setFormError("A valid email is required.");
      return;
    }

    setSaving(true);
    try {
      // 1. Check duplicate email
      const usersSnap = await get(ref(database, "users"));
      if (usersSnap.exists()) {
        const duplicate = Object.values(usersSnap.val()).some(
          (u: any) => u?.email?.toLowerCase() === email.trim().toLowerCase()
        );
        if (duplicate) {
          setFormError("A user with this email already exists.");
          setSaving(false);
          return;
        }
      }

      // 2. Create Firebase Auth user via secondary app (keeps admin signed in)
      const secondaryAuth = getSecondaryAuth();
      const tempPassword = Math.random().toString(36).slice(-10) + "Aa1!";
      const credential = await createUserWithEmailAndPassword(
        secondaryAuth,
        email.trim(),
        tempPassword
      );
      const newUid = credential.user.uid;
    
      // 3. Write users/{uid} record
      await set(ref(database, `users/${newUid}`), {
        uid: newUid,
        name: name.trim(),
        email: email.trim(),
        role: "technician",
        siteIds: selectedSiteIds,
        createdAt: new Date().toISOString(),
      });

      // 4. Send password reset email — same as "Forgot Password" flow
      await sendPasswordResetEmail(secondaryAuth, email.trim());
 
      await secondaryAuth.signOut();
      toast({
        title: "Technician added successfully",
      });

      await refreshList();
      closeModal();
    } catch (err: any) {
      console.error("Error adding technician:", err);
      if (err.code === "auth/email-already-in-use") {
        setFormError("A Firebase account already exists for this email.");
      } else {
        setFormError(err.message || "Something went wrong. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };
  // ─── save (edit) ───────────────────────────────────────────────────────────
  const handleEdit = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!editingTech) return;

    setSaving(true);
    try {
      // Update users/{uid} record (name and siteIds only)
      await set(ref(database, `users/${editingTech.id}`), {
        ...editingTech,
        name: name.trim(),
        siteIds: selectedSiteIds,
        updatedAt: new Date().toISOString(),
      });

      toast({
        title: "Technician updated",
        description: "Changes saved successfully.",
      });

      await refreshList();
      closeModal();
    } catch (err: any) {
      console.error("Error updating technician:", err);
      setFormError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen gradient-hero p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-display font-bold">Technicians</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(-1)}>
              Back
            </Button>
            <Button onClick={openModal}>Add Technician</Button>
          </div>
        </div>

        {/* List */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Technician List
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : technicians.length === 0 ? (
              <p className="text-muted-foreground">No data found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold">Name</TableHead>
                    <TableHead className="font-bold">Email</TableHead>
                    <TableHead className="font-bold">Site IDs</TableHead>
                    <TableHead className="font-bold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {technicians.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{t.email}</TableCell>
                      <TableCell>
                        {(t.siteIds || []).join(", ") || "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditModal(t)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Technician Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-card border-2 border-border/50 rounded-xl p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Add Technician</h3>
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium">Name</label>
              <input
                className="px-3 py-2 border border-border rounded bg-background text-foreground"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                className="px-3 py-2 border border-border rounded bg-background text-foreground"
                placeholder="technician@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <label className="text-sm font-semibold mt-1">
                Assign Site IDs
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-border rounded p-2 bg-background">
                {availableSiteIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground col-span-2">
                    No sites available
                  </p>
                ) : (
                  availableSiteIds.map((id) => (
                    <label
                      key={id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4"
                        checked={selectedSiteIds.includes(id)}
                        onChange={() => toggleSiteId(id)}
                      />
                      <span className="text-sm">{id}</span>
                    </label>
                  ))
                )}
              </div>

              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}

              <p className="text-xs text-muted-foreground">
                A password-set link (same as Forgot Password) will be sent to
                the technician automatically.
              </p>

              <div className="flex justify-end gap-2 mt-2">
                <Button
                  variant="outline"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={saving}>
                  {saving ? "Saving..." : "Save Technician"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Technician Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-card border-2 border-border/50 rounded-xl p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Edit Technician</h3>
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium">Name</label>
              <input
                className="px-3 py-2 border border-border rounded bg-background text-foreground"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <label className="text-sm font-medium">Email (read-only)</label>
              <input
                type="email"
                className="px-3 py-2 border border-border rounded bg-muted text-muted-foreground cursor-not-allowed"
                value={email}
                disabled
              />

              <label className="text-sm font-semibold mt-1">
                Assign Site IDs
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-border rounded p-2 bg-background">
                {availableSiteIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground col-span-2">
                    No sites available
                  </p>
                ) : (
                  availableSiteIds.map((id) => (
                    <label
                      key={id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4"
                        checked={selectedSiteIds.includes(id)}
                        onChange={() => toggleSiteId(id)}
                      />
                      <span className="text-sm">{id}</span>
                    </label>
                  ))
                )}
              </div>

              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}

              <div className="flex justify-end gap-2 mt-2">
                <Button
                  variant="outline"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={handleEdit} disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Technicians;
