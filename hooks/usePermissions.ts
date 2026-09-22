import { useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { SystemRole } from "../types";

export function usePermissions(userId: string | undefined) {
  const [role, setRole] = useState<SystemRole>("operator");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchUserRole() {
      if (!userId) {
        if (!cancelled) { setRole("operator"); setLoading(false); }
        return;
      }
      try {
        const userRef = doc(db, "users", userId);
        const snap = await getDoc(userRef);
        if (!cancelled) {
          if (snap.exists()) {
            const raw = snap.data().role || "operator";
            // Normalize legacy role values
            if (raw === "ADMIN" || raw === "admin" || raw === "master") setRole("admin");
            else if (raw === "manager") setRole("manager");
            else if (raw === "vendedor" || raw === "operator" || raw === "FAMILY") setRole("operator");
            else setRole("operator");
          } else {
            setRole("operator");
          }
        }
      } catch {
        if (!cancelled) setRole("operator");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchUserRole();
    return () => { cancelled = true; };
  }, [userId]);

  const canAccess = (allowedRoles: SystemRole[]) => allowedRoles.includes(role);

  return { role, canAccess, loading };
}
